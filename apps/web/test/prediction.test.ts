import { describe, expect, it, vi } from 'vitest';
import {
  BALANCE,
  FIXED_DT,
  MSG,
  applyInput,
  officeLayout,
  type InputMessage,
  type PlayerState,
} from '@office/protocol';
import {
  Predictor,
  bindPrediction,
  type InputSample,
  type PredictionRoom,
  type ServerSnapshot,
} from '../src/net';

const colliders = officeLayout.colliders;
const [sx, , sz] = officeLayout.spawn.position;
const spawn: PlayerState = { x: sx, z: sz, heading: (officeLayout.spawn.rotY * Math.PI) / 180 };
const still: InputSample = { forward: 0, right: 0, run: false, yaw: 0 };

/**
 * Server stand-in with the server's rules (T-1034): FIFO of accepted inputs, strictly
 * increasing seqs, one input applied per 50 ms tick through `applyInput`. `reject` lets a
 * test make the server drop chosen inputs.
 */
class SimServer {
  body: ServerSnapshot = { ...spawn, lastSeq: 0 };
  private readonly queue: InputMessage[] = [];
  private highest = 0;
  constructor(private readonly reject: (input: InputMessage) => boolean = () => false) {}
  receive(input: InputMessage): void {
    if (input.seq <= this.highest || this.reject(input)) return;
    this.highest = input.seq;
    this.queue.push(input);
  }
  tick(): void {
    const input = this.queue.shift();
    if (!input) return;
    this.body = { ...applyInput(this.body, input, colliders), lastSeq: input.seq };
  }
}

/** A scripted walk: north into the wall, then sliding along it, then standing still. */
function sampleAt(t: number): InputSample {
  if (t < 1.5) return { forward: 1, right: 0, run: true, yaw: Math.PI };
  if (t < 3) return { forward: 1, right: 0.6, run: false, yaw: Math.PI };
  return still;
}

/**
 * Runs client frames of `frameDt` against a `SimServer` with one-way `latency` seconds.
 * Messages are delivered in order after the latency; patches every 50 ms.
 */
function runNetworked(server: SimServer, seconds: number, frameDt: number, latency: number) {
  const predictor = new Predictor(spawn, colliders);
  const toServer: { at: number; input: InputMessage }[] = [];
  const toClient: { at: number; snap: ServerSnapshot }[] = [];
  const corrections: boolean[] = [];
  let now = 0;
  let nextTick = FIXED_DT;
  while (now < seconds) {
    now += frameDt;
    while (nextTick <= now) {
      while (toServer.length > 0 && toServer[0]!.at <= nextTick)
        server.receive(toServer.shift()!.input);
      server.tick();
      toClient.push({ at: nextTick + latency, snap: { ...server.body } });
      nextTick += FIXED_DT;
    }
    while (toClient.length > 0 && toClient[0]!.at <= now) {
      corrections.push(predictor.reconcile(toClient.shift()!.snap));
    }
    for (const input of predictor.advance(frameDt, sampleAt(now))) {
      toServer.push({ at: now + latency, input });
    }
  }
  return { predictor, corrections };
}

describe('Predictor reconciliation', () => {
  it('replays to the server position with no correction when the server agrees', () => {
    const server = new SimServer();
    const { predictor, corrections } = runNetworked(server, 5, 1 / 60, 0.08);
    expect(corrections.length).toBeGreaterThan(50);
    expect(corrections.every((c) => !c)).toBe(true);
    // Walking north hit the wall: the trace exercised the collision solver.
    expect(predictor.state.z).toBeLessThan(spawn.z - 1);
    // Standing still for two seconds: everything sent has been acknowledged.
    predictor.reconcile(server.body);
    expect(predictor.pending.every((i) => i.seq > server.body.lastSeq)).toBe(true);
    let replayed: PlayerState = server.body;
    for (const input of predictor.pending) replayed = applyInput(replayed, input, colliders);
    expect(predictor.state).toEqual({ x: replayed.x, z: replayed.z, heading: replayed.heading });
    expect(predictor.state.x).toBe(server.body.x);
    expect(predictor.state.z).toBe(server.body.z);
  });

  it('converges to the server position when the server rejects inputs', () => {
    // While sliding along the wall the server drops inputs 35 to 44 (e.g. a full queue).
    const server = new SimServer((input) => input.seq >= 35 && input.seq <= 44);
    const { predictor, corrections } = runNetworked(server, 5, 1 / 60, 0.08);
    expect(corrections.some((c) => c)).toBe(true);
    predictor.reconcile(server.body);
    expect(predictor.pending.every((i) => i.seq > server.body.lastSeq)).toBe(true);
    expect(predictor.state.x).toBe(server.body.x);
    expect(predictor.state.z).toBe(server.body.z);
    // After the blend time the presented position is the corrected one.
    predictor.advance(BALANCE.net.correctionBlendSeconds, still);
    const shown = predictor.present(still);
    expect(shown.x).toBeCloseTo(server.body.x, 9);
    expect(shown.z).toBeCloseTo(server.body.z, 9);
  });

  it('keeps only unacknowledged inputs and blends a forced correction', () => {
    const predictor = new Predictor(spawn, colliders);
    const walk: InputSample = { forward: 1, right: 0, run: false, yaw: 0 };
    for (let i = 0; i < 6; i++) predictor.advance(FIXED_DT, walk);
    expect(predictor.pending.map((i) => i.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    const before = predictor.present(walk);
    // The server applied seq 1..3 but reports the player 1 m to the west of the prediction.
    let server: PlayerState = spawn;
    for (const input of predictor.pending.slice(0, 3))
      server = applyInput(server, input, colliders);
    const snap = { ...server, x: server.x - 1, lastSeq: 3 };
    expect(predictor.reconcile(snap)).toBe(true);
    expect(predictor.pending.map((i) => i.seq)).toEqual([4, 5, 6]);
    let expected: PlayerState = snap;
    for (const input of predictor.pending) expected = applyInput(expected, input, colliders);
    expect(predictor.state.x).toBe(expected.x);
    // No snap on the correction frame, then a blend over `correctionBlendSeconds`.
    expect(predictor.present(walk).x).toBeCloseTo(before.x, 9);
    predictor.advance(BALANCE.net.correctionBlendSeconds / 2, still);
    const mid = predictor.present(still).x;
    expect(mid).toBeLessThan(before.x - 0.2);
    expect(mid).toBeGreaterThan(expected.x + 0.2);
    predictor.advance(BALANCE.net.correctionBlendSeconds, still);
    expect(predictor.present(still).x).toBeCloseTo(predictor.state.x, 9);
  });

  it('changes nothing when the replay is within epsilon', () => {
    const predictor = new Predictor(spawn, colliders);
    predictor.advance(FIXED_DT * 2, { forward: 1, right: 0, run: false, yaw: 0 });
    const state = predictor.state;
    const half = BALANCE.net.reconcileEpsilon / 2;
    expect(predictor.reconcile({ ...state, x: state.x + half, lastSeq: 2 })).toBe(false);
    expect(predictor.state).toEqual(state);
    expect(predictor.pending).toHaveLength(0);
  });

  it('resyncs to the server position after a resumed session, without a blend (T-1051)', () => {
    const predictor = new Predictor(spawn, colliders);
    const walk: InputSample = { forward: 1, right: 0, run: false, yaw: 0 };
    // Inputs produced while the connection was down never reached the server.
    for (let i = 0; i < 8; i++) predictor.advance(FIXED_DT, walk);
    expect(predictor.pending).toHaveLength(8);
    predictor.resync();
    expect(predictor.pending).toHaveLength(0);
    const server = { ...spawn, x: spawn.x + 0.5, lastSeq: 2 };
    expect(predictor.reconcile(server)).toBe(true);
    expect(predictor.state).toEqual({ x: server.x, z: server.z, heading: server.heading });
    expect(predictor.present(still)).toEqual(predictor.state);
    // Seqs keep counting up, so the server (highest accepted = lastSeq) accepts them.
    const [next] = predictor.advance(FIXED_DT, still);
    expect(next!.seq).toBe(9);
    // Later patches reconcile as usual again.
    expect(predictor.reconcile({ ...server, lastSeq: 9 })).toBe(false);
  });

  it('ignores server patches after a dev teleport', () => {
    const predictor = new Predictor(spawn, colliders);
    predictor.advance(FIXED_DT, still);
    predictor.detach({ x: -0.4, z: -3.8, heading: 0 });
    expect(predictor.reconcile({ ...spawn, lastSeq: 1 })).toBe(false);
    expect(predictor.state).toEqual({ x: -0.4, z: -3.8, heading: 0 });
    expect(predictor.detached).toBe(true);
  });
});

describe('Predictor fixed step and presentation', () => {
  it('applies exactly the shared applyInput per step', () => {
    const predictor = new Predictor(spawn, colliders);
    const sample: InputSample = { forward: 1, right: -0.5, run: true, yaw: 0.7 };
    const sent = predictor.advance(FIXED_DT * 3 + 0.01, sample);
    expect(sent.map((i) => i.seq)).toEqual([1, 2, 3]);
    let expected: PlayerState = spawn;
    for (const input of sent) expected = applyInput(expected, input, colliders);
    expect(predictor.state).toEqual(expected);
  });

  it('presents a partial step that keeps the rendered position continuous', () => {
    const predictor = new Predictor(spawn, colliders);
    // Slide along the north wall: diagonal input against it at 144 Hz frames.
    const slide: InputSample = { forward: 1, right: 0.6, run: true, yaw: Math.PI };
    const speed = BALANCE.movement.runSpeed;
    let last = predictor.present(slide);
    for (let i = 0; i < 144 * 4; i++) {
      predictor.advance(1 / 144, slide);
      const shown = predictor.present(slide);
      expect(Math.hypot(shown.x - last.x, shown.z - last.z)).toBeLessThanOrEqual(
        speed / 144 + 1e-9,
      );
      last = shown;
    }
    // Standing still: the presented state never moves.
    predictor.advance(FIXED_DT, still);
    const rest = predictor.present(still);
    for (let i = 0; i < 60; i++) {
      predictor.advance(1 / 60, still);
      expect(predictor.present(still)).toEqual(rest);
    }
  });
});

describe('Predictor send rate', () => {
  /** Deterministic pseudo-random frame times (mulberry32). */
  function jitter(seed: number) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const patterns: Record<string, (i: number) => number> = {
    '60 Hz': () => 1 / 60,
    '144 Hz': () => 1 / 144,
    '10 Hz (two steps per frame)': () => 1 / 10,
    'batched frames': (i) => (i % 3 === 2 ? 0.099 : 0.001),
    jitter: (() => {
      const r = jitter(42);
      return () => 0.001 + r() * 0.099;
    })(),
  };

  for (const [name, frame] of Object.entries(patterns)) {
    it(`produces at most 20 inputs in any one second with increasing seq (${name})`, () => {
      const predictor = new Predictor(spawn, colliders);
      const times: number[] = [];
      const seqs: number[] = [];
      let clock = 0;
      for (let i = 0; clock < 30; i++) {
        const dt = frame(i);
        clock += dt;
        for (const input of predictor.advance(dt, still)) {
          times.push(clock);
          seqs.push(input.seq);
        }
      }
      expect(seqs[0]).toBe(1);
      for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBe(seqs[i - 1]! + 1);
      let worst = 0;
      for (let i = 0; i < times.length; i++) {
        let n = 0;
        while (i + n < times.length && times[i + n]! < times[i]! + 1) n++;
        worst = Math.max(worst, n);
      }
      expect(worst).toBeLessThanOrEqual(BALANCE.net.tickHz);
      // The cap does not starve the client: close to 20 inputs per second on average.
      expect(times.length / clock).toBeGreaterThan(BALANCE.net.tickHz * 0.95);
    });
  }
});

describe('Predictor seating (T-1039)', () => {
  const socket: PlayerState = { x: 0.66, z: 1.2, heading: Math.PI / 2 };
  const standPoint = { x: 0.66, z: 2.46 };

  it('pauses on the seat, still sends inputs, and resumes from the server with no correction', () => {
    const predictor = new Predictor(spawn, colliders);
    // The server seated the player; inputs up to seq 0 are applied.
    predictor.seat(socket);
    expect(predictor.seated).toBe(true);
    const sent: InputMessage[] = [];
    const walk: InputSample = { forward: 1, right: 0, run: false, yaw: 0 };
    for (let i = 0; i < 4; i++) sent.push(...predictor.advance(FIXED_DT, still));
    for (let i = 0; i < 6; i++) sent.push(...predictor.advance(FIXED_DT, walk));
    expect(sent.map((i) => i.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Seated: moving inputs do not move the seat pose, partial steps neither.
    predictor.advance(FIXED_DT / 2, walk);
    expect(predictor.present(walk)).toEqual(socket);
    // A patch while still seated only acknowledges.
    expect(predictor.reconcile({ ...socket, lastSeq: 4 })).toBe(false);
    expect(predictor.pending.map((i) => i.seq)).toEqual([5, 6, 7, 8, 9, 10]);
    // Server rules (apps/server sim): a still input while seated only advances lastSeq; the
    // first moving input stands the body up at the stand point, then applies the step.
    let body: ServerSnapshot = { ...socket, lastSeq: 4 };
    let seated = true;
    for (const input of sent.slice(4, 7)) {
      if (seated && (input.forward !== 0 || input.right !== 0)) {
        seated = false;
        body = { ...body, ...standPoint };
      }
      body = seated
        ? { ...body, lastSeq: input.seq }
        : { ...applyInput(body, input, colliders), lastSeq: input.seq };
    }
    predictor.unseat(body);
    expect(predictor.seated).toBe(false);
    // Inputs 8..10 were replayed from the server position.
    let expected: PlayerState = body;
    for (const input of sent.slice(7)) expected = applyInput(expected, input, colliders);
    expect(predictor.state).toEqual({ x: expected.x, z: expected.z, heading: expected.heading });
    // The jump off the seat is not blended, and later patches need no correction.
    expect(predictor.present(still)).toEqual(predictor.state);
    for (const input of sent.slice(7))
      body = { ...applyInput(body, input, colliders), lastSeq: input.seq };
    expect(predictor.reconcile(body)).toBe(false);
    expect(predictor.state.x).toBe(body.x);
    expect(predictor.state.z).toBe(body.z);
  });
});

describe('bindPrediction', () => {
  function fakeRoom() {
    const listeners = new Set<(state: unknown) => void>();
    const onStateChange = Object.assign(
      (cb: (state: unknown) => void) => {
        listeners.add(cb);
      },
      { remove: (cb: (state: unknown) => void) => listeners.delete(cb) },
    );
    const room = { sessionId: 'me', send: vi.fn(), onStateChange };
    const patch = (employees: Record<string, ServerSnapshot>) => {
      const state = { employees: new Map(Object.entries(employees)) };
      for (const cb of listeners) cb(state);
    };
    return { room: room as unknown as PredictionRoom & typeof room, patch, listeners };
  }

  it('sends every produced input and reconciles against the local employee only', () => {
    const { room, patch, listeners } = fakeRoom();
    const predictor = new Predictor(spawn, colliders);
    const unbind = bindPrediction(room, predictor);
    const walk: InputSample = { forward: 1, right: 0, run: false, yaw: 0 };
    predictor.advance(FIXED_DT * 2, walk);
    expect(room.send).toHaveBeenCalledTimes(2);
    expect(room.send).toHaveBeenCalledWith(MSG.input, { seq: 1, ...walk });
    const reconcile = vi.spyOn(predictor, 'reconcile');
    patch({ other: { ...spawn, x: 0, lastSeq: 9 } });
    expect(reconcile).not.toHaveBeenCalled();
    patch({ me: { ...spawn, lastSeq: 0 }, other: { ...spawn, lastSeq: 9 } });
    expect(reconcile).toHaveBeenCalledWith({ ...spawn, lastSeq: 0 });
    expect(predictor.pending).toHaveLength(2);
    unbind();
    expect(listeners.size).toBe(0);
    predictor.advance(FIXED_DT, walk);
    expect(room.send).toHaveBeenCalledTimes(2);
  });
});
