import { WebSocketClient } from '@colyseus/ws-transport';
import { BALANCE } from '@office/protocol';

/**
 * REQ-NET-004 dev-only network test profile: delays and jitters every outgoing server
 * message (state patches, replies, errors) to approximate the test network.
 *
 * Colyseus' own `applySimulatedLatency` / `COLYSEUS_LATENCY` adds one fixed delay to both
 * directions and has no jitter or loss, so it is not used. The uplink is not delayed here;
 * the downlink carries the whole round trip, which gives the client the same input-to-ack
 * time. WebSocket runs on TCP, so "loss" is modelled as a retransmission delay that also
 * holds back every later message on that socket (head-of-line blocking), never as a gap.
 */
export type NetProfile = {
  rttMs: number;
  jitterMs: number;
  lossPercent: number;
  retransmitMs: number;
};

/**
 * Reads the profile from the environment. Off unless `NET_PROFILE=test`; never on when
 * `NODE_ENV=production`.
 */
export function netProfileFromEnv(env: NodeJS.ProcessEnv): NetProfile | null {
  if (env.NET_PROFILE !== 'test') return null;
  if (env.NODE_ENV === 'production') return null;
  const { rttMs, jitterMs, lossPercent, retransmitMs } = BALANCE.net.testProfile;
  return { rttMs, jitterMs, lossPercent, retransmitMs };
}

/** Delay of one message before ordering is applied: rtt +/- jitter, plus a retransmit. */
export function sampleDelay(profile: NetProfile, random: () => number): number {
  const jitter = (random() * 2 - 1) * profile.jitterMs;
  const lost = random() * 100 < profile.lossPercent;
  return Math.max(0, profile.rttMs + jitter) + (lost ? profile.retransmitMs : 0);
}

/**
 * One socket's outgoing queue. Messages leave in the order they were sent, each no earlier
 * than its own sampled delay, so a delayed message also delays the ones behind it.
 */
export class DelayLine<T> {
  private readonly queue: { at: number; item: T }[] = [];
  private lastAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly profile: NetProfile,
    private readonly deliver: (item: T) => void,
    private readonly random: () => number = Math.random,
  ) {}

  get pending(): number {
    return this.queue.length;
  }

  push(item: T): void {
    const at = Math.max(Date.now() + sampleDelay(this.profile, this.random), this.lastAt);
    this.lastAt = at;
    this.queue.push({ at, item });
    if (this.timer === null) this.arm();
  }

  private arm(): void {
    const head = this.queue[0];
    if (!head) return;
    this.timer = setTimeout(() => this.drain(), Math.max(0, head.at - Date.now()));
  }

  private drain(): void {
    this.timer = null;
    const now = Date.now();
    while (this.queue.length > 0 && this.queue[0]!.at <= now)
      this.deliver(this.queue.shift()!.item);
    this.arm();
  }
}

type RawArgs = Parameters<WebSocketClient['raw']>;

/**
 * Routes every `WebSocketClient.raw` send through a per-socket `DelayLine`. Returns a
 * function that restores the original send (queued messages still drain).
 */
export function installNetProfile(profile: NetProfile, random: () => number = Math.random) {
  const proto = WebSocketClient.prototype;
  const original = proto.raw;
  const lines = new WeakMap<WebSocketClient, DelayLine<RawArgs>>();
  proto.raw = function (this: WebSocketClient, data, options, cb) {
    let line = lines.get(this);
    if (!line) {
      line = new DelayLine<RawArgs>(profile, (args) => original.apply(this, args), random);
      lines.set(this, line);
    }
    // The encoder reuses its buffer; keep a copy of the bytes as they are now.
    line.push([Uint8Array.from(data), options, cb]);
  };
  return () => {
    proto.raw = original;
  };
}
