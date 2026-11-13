import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { BALANCE, MSG, OFFICE_ROOM, PROTOCOL_VERSION, type OfficeState } from '@office/protocol';
import { createApp } from '../src/app';
import {
  DelayLine,
  installNetProfile,
  netProfileFromEnv,
  sampleDelay,
  type NetProfile,
} from '../src/netProfile';

const FIXED: NetProfile = { rttMs: 100, jitterMs: 0, lossPercent: 0, retransmitMs: 0 };

describe('netProfileFromEnv', () => {
  it('is off unless NET_PROFILE=test, and never in production', () => {
    expect(netProfileFromEnv({})).toBeNull();
    expect(netProfileFromEnv({ NET_PROFILE: '1' })).toBeNull();
    expect(netProfileFromEnv({ NET_PROFILE: 'test', NODE_ENV: 'production' })).toBeNull();
    const { rttMs, jitterMs, lossPercent, retransmitMs } = BALANCE.net.testProfile;
    expect(netProfileFromEnv({ NET_PROFILE: 'test' })).toEqual({
      rttMs,
      jitterMs,
      lossPercent,
      retransmitMs,
    });
  });
});

describe('sampleDelay', () => {
  const profile: NetProfile = { rttMs: 100, jitterMs: 20, lossPercent: 1, retransmitMs: 200 };

  it('spreads rtt +/- jitter and adds the retransmit delay to the lost share', () => {
    // random() is called for jitter, then for loss.
    expect(sampleDelay(profile, () => 0.5)).toBe(100);
    expect(sampleDelay(profile, () => 0.999)).toBeCloseTo(119.96);
    const seq = [0, 0.005];
    expect(sampleDelay(profile, () => seq.shift()!)).toBe(80 + 200);
  });

  it('hits about 1% of messages with a retransmit over many samples', () => {
    let seed = 7;
    const lcg = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
    const delays = Array.from({ length: 100_000 }, () => sampleDelay(profile, lcg));
    const spikes = delays.filter((d) => d >= 280).length / delays.length;
    expect(spikes).toBeGreaterThan(0.007);
    expect(spikes).toBeLessThan(0.013);
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(80);
  });
});

describe('DelayLine', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps send order and lets a delayed message hold back the ones behind it', () => {
    vi.useFakeTimers({ now: 0 });
    const out: string[] = [];
    // First message is "lost" (100 + 200 ms), the next two are on time.
    const randoms = [0.5, 0, 0.5, 0.5, 0.5, 0.5];
    const line = new DelayLine<string>(
      { ...FIXED, lossPercent: 1, retransmitMs: 200 },
      (m) => out.push(m),
      () => randoms.shift() ?? 0.5,
    );
    line.push('a');
    vi.advanceTimersByTime(10);
    line.push('b');
    line.push('c');
    vi.advanceTimersByTime(150);
    expect(out).toEqual([]);
    vi.advanceTimersByTime(140);
    expect(out).toEqual(['a', 'b', 'c']);
    expect(line.pending).toBe(0);
  });

  it('delivers on-time messages after rtt', () => {
    vi.useFakeTimers({ now: 0 });
    const out: number[] = [];
    const line = new DelayLine<number>(
      FIXED,
      (m) => out.push(m),
      () => 0.5,
    );
    line.push(1);
    vi.advanceTimersByTime(99);
    expect(out).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(out).toEqual([1]);
  });
});

describe('installNetProfile on a real server', () => {
  const { game, http } = createApp({ allowedOrigins: [] });
  let endpoint = '';
  let restore = () => {};
  let room: Room<unknown, OfficeState> | undefined;

  beforeAll(async () => {
    restore = installNetProfile({ ...FIXED, rttMs: 200 }, () => 0.5);
    await game.listen(0);
    endpoint = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await room?.leave(true).catch(() => undefined);
    restore();
    await game.gracefullyShutdown(false);
  });

  it('joins and acknowledges input only after the added delay', async () => {
    room = await new Client(endpoint).joinOrCreate<OfficeState>(OFFICE_ROOM, {
      name: 'Lag',
      officeCode: 'LAG-01',
      avatarId: 'men_suit',
      protocolVersion: PROTOCOL_VERSION,
    });
    const self = () => room!.state.employees.get(room!.sessionId);
    await vi.waitFor(() => expect(self()).toBeDefined());
    const sent = Date.now();
    room.send(MSG.input, { seq: 1, forward: 1, right: 0, run: false, yaw: 0 });
    await vi.waitFor(() => expect(self()?.lastSeq).toBe(1), { timeout: 2_000, interval: 5 });
    const ackMs = Date.now() - sent;
    // At least the 200 ms profile delay; a tick plus a patch interval adds up to ~100 ms.
    expect(ackMs).toBeGreaterThanOrEqual(195);
    expect(ackMs).toBeLessThan(600);
  });
});
