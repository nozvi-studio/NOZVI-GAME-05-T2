import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BALANCE,
  FIXED_DT,
  applyInput,
  officeLayout,
  type InputMessage,
  type PlayerState,
} from '@office/protocol';
import { MovementSim, TICK_MS, startMovementLoop, type MovementBody } from '../src/sim/movement';

const colliders = officeLayout.colliders;
const r = BALANCE.movement.capsuleRadius;
const TOL = 1e-6;
const ID = 'a';

function body(x: number, z: number, heading = 0): MovementBody {
  return { x, z, heading, activity: 'idle', lastSeq: 0 };
}

function setup(start: MovementBody, queueMax?: number) {
  const sim = new MovementSim(queueMax);
  sim.add(ID, start.lastSeq);
  const bodies = new Map([[ID, start]]);
  return { sim, bodies, tick: () => sim.tick(bodies, colliders) };
}

/** yaw 0 walks +z, yaw PI walks -z (see `desiredVelocity`). */
const input = (seq: number, extra: Partial<InputMessage> = {}): InputMessage => ({
  seq,
  forward: 1,
  right: 0,
  run: false,
  yaw: 0,
  ...extra,
});

/** Feeds one input and runs one tick, the way a well-behaved client paces itself. */
function walk(s: ReturnType<typeof setup>, inputs: InputMessage[]): void {
  for (const i of inputs) {
    expect(s.sim.enqueue(ID, i)).toBe(true);
    s.tick();
  }
}

const seqs = (from: number, n: number, extra: Partial<InputMessage> = {}) =>
  Array.from({ length: n }, (_, k) => input(from + k, extra));

afterEach(() => {
  vi.useRealTimers();
});

describe('MovementSim collisions (criterion 1)', () => {
  it('stops at the north wall when walking -z from spawn', () => {
    const [x, , z] = officeLayout.spawn.position;
    const s = setup(body(x, z));
    walk(s, seqs(1, 60, { yaw: Math.PI }));
    const wallInner = -4.7; // wall_north_west spans z -4.8..-4.7
    // The solver keeps a 1e-6 skin, so the stop is at the contact point within 1e-5.
    expect(s.bodies.get(ID)!.z).toBeGreaterThanOrEqual(wallInner + r);
    expect(s.bodies.get(ID)!.z).toBeCloseTo(wallInner + r, 5);
    const stopped = s.bodies.get(ID)!.z;
    walk(s, seqs(61, 20, { yaw: Math.PI }));
    expect(s.bodies.get(ID)!.z).toBe(stopped);
  });

  it('stops at a desk collider', () => {
    // ws_2 desk spans z 0.6..1.8 at x -2.7.
    const s = setup(body(-2.7, 0));
    walk(s, seqs(1, 40, { yaw: 0 }));
    expect(s.bodies.get(ID)!.z).toBeLessThanOrEqual(0.6 - r);
    expect(s.bodies.get(ID)!.z).toBeCloseTo(0.6 - r, 5);
    expect(s.bodies.get(ID)!.x).toBeCloseTo(-2.7, 6);
  });

  it('never leaves the room bounds on a long random walk', () => {
    const [x, , z] = officeLayout.spawn.position;
    const s = setup(body(x, z));
    const halfW = officeLayout.room.width / 2;
    const halfD = officeLayout.room.depth / 2;
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let seq = 1; seq <= 3000; seq++) {
      walk(s, [
        input(seq, {
          forward: rand() * 2 - 1,
          right: rand() * 2 - 1,
          run: rand() < 0.5,
          yaw: rand() * Math.PI * 2,
        }),
      ]);
      const b = s.bodies.get(ID)!;
      expect(Math.abs(b.x)).toBeLessThan(halfW - r + TOL);
      expect(Math.abs(b.z)).toBeLessThan(halfD - r + TOL);
    }
  });
});

describe('MovementSim queue cap (criterion 2)', () => {
  it('advances no further than 20 ticks of walking when 200 inputs arrive in one second', () => {
    vi.useFakeTimers();
    const s = setup(body(-1.2, -3));
    startMovementLoop((cb, ms) => setInterval(cb, ms), s.tick);
    // 200 inputs spread over 1 s (one every 5 ms), heading +z through open floor.
    let seq = 0;
    const flood = setInterval(() => s.sim.enqueue(ID, input(++seq)), 5);
    vi.advanceTimersByTime(1000);
    clearInterval(flood);
    expect(seq).toBe(200);
    const b = s.bodies.get(ID)!;
    const ticks = 1000 / TICK_MS;
    expect(ticks).toBe(20);
    const maxDistance = ticks * BALANCE.movement.walkSpeed * FIXED_DT;
    expect(Math.hypot(b.x + 1.2, b.z + 3)).toBeLessThanOrEqual(maxDistance + TOL);
    expect(b.lastSeq).toBeLessThanOrEqual(seq);
    expect(s.sim.queued(ID)).toBeLessThanOrEqual(BALANCE.net.inputQueueMax);
  });

  it('drops inputs beyond the cap and consumes one input per tick', () => {
    const s = setup(body(-1.2, -3));
    const accepted = seqs(1, 200).map((i) => s.sim.enqueue(ID, i));
    expect(accepted.filter(Boolean)).toHaveLength(BALANCE.net.inputQueueMax);
    s.tick();
    expect(s.bodies.get(ID)!.lastSeq).toBe(1);
    expect(s.sim.queued(ID)).toBe(BALANCE.net.inputQueueMax - 1);
  });
});

describe('MovementSim input validation (criterion 3)', () => {
  it.each([
    ['NaN axis', { ...input(5), forward: Number.NaN }],
    ['out-of-range axis', { ...input(5), right: 1.5 }],
    ['infinite yaw', { ...input(5), yaw: Infinity }],
    ['non-integer seq', { ...input(5), seq: 5.5 }],
    ['negative seq', { ...input(5), seq: -1 }],
    ['missing run', { seq: 5, forward: 1, right: 0, yaw: 0 }],
    ['string payload', 'go'],
    ['null payload', null],
  ])('ignores %s', (_label, raw) => {
    const s = setup(body(-1.2, -3, 0.5));
    const before = { ...s.bodies.get(ID)! };
    expect(s.sim.enqueue(ID, raw)).toBe(false);
    s.tick();
    expect(s.bodies.get(ID)).toEqual(before);
  });

  it('ignores replayed and decreasing seqs, and seq 0', () => {
    const s = setup(body(-1.2, -3));
    expect(s.sim.enqueue(ID, input(0))).toBe(false);
    walk(s, [input(5)]);
    const after = { ...s.bodies.get(ID)! };
    expect(s.sim.enqueue(ID, input(5))).toBe(false);
    expect(s.sim.enqueue(ID, input(3))).toBe(false);
    s.tick();
    expect(s.bodies.get(ID)).toEqual(after);
    // A seq still queued also blocks replays of itself.
    expect(s.sim.enqueue(ID, input(9))).toBe(true);
    expect(s.sim.enqueue(ID, input(9))).toBe(false);
    expect(s.sim.enqueue(ID, input(7))).toBe(false);
  });

  it('ignores inputs for unknown or removed clients', () => {
    const s = setup(body(-1.2, -3));
    expect(s.sim.enqueue('other', input(1))).toBe(false);
    s.sim.remove(ID);
    expect(s.sim.enqueue(ID, input(1))).toBe(false);
  });
});

describe('MovementSim lastSeq and determinism (criteria 4 and 5)', () => {
  it('writes the seq of the last applied input, including after gaps', () => {
    const s = setup(body(-1.2, -3));
    walk(s, [input(1), input(2), input(7)]);
    expect(s.bodies.get(ID)!.lastSeq).toBe(7);
    s.sim.enqueue(ID, input(8));
    s.sim.enqueue(ID, input(9));
    s.tick();
    expect(s.bodies.get(ID)!.lastSeq).toBe(8);
    s.tick();
    expect(s.bodies.get(ID)!.lastSeq).toBe(9);
    s.tick(); // empty queue leaves lastSeq unchanged
    expect(s.bodies.get(ID)!.lastSeq).toBe(9);
  });

  it('matches applyInput exactly for the same input trace', () => {
    const [x, , z] = officeLayout.spawn.position;
    const trace = [
      ...seqs(1, 30, { yaw: Math.PI }),
      ...seqs(31, 25, { yaw: Math.PI / 2, run: true }),
      ...seqs(56, 40, { forward: 0.3, right: -0.8, yaw: 1.1 }),
      ...seqs(96, 10, { forward: 0, right: 0 }),
      ...seqs(106, 60, { yaw: -0.4, run: true }),
    ];
    const s = setup(body(x, z, 1.5));
    let direct: PlayerState = { x, z, heading: 1.5 };
    for (const i of trace) {
      s.sim.enqueue(ID, i);
      s.tick();
      direct = applyInput(direct, i, colliders);
      const b = s.bodies.get(ID)!;
      expect({ x: b.x, z: b.z, heading: b.heading }).toEqual(direct);
    }
  });

  it('ticks every 50 ms on a controlled clock', () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    startMovementLoop((cb, ms) => setInterval(cb, ms), tick);
    expect(TICK_MS).toBe(50);
    vi.advanceTimersByTime(49);
    expect(tick).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(950);
    expect(tick).toHaveBeenCalledTimes(20);
  });
});

describe('MovementSim activity', () => {
  it('walks while moving or pushing into a wall and idles on a zero input', () => {
    const s = setup(body(-1.2, -3));
    walk(s, [input(1)]);
    expect(s.bodies.get(ID)!.activity).toBe('walking');
    walk(s, [input(2, { forward: 0 })]);
    expect(s.bodies.get(ID)!.activity).toBe('idle');
    const wall = setup(body(-1.2, -4.4));
    walk(wall, [input(1, { yaw: Math.PI })]);
    expect(wall.bodies.get(ID)!.activity).toBe('walking');
  });

  it('never overrides a seated activity', () => {
    const start = body(-1.2, -3);
    start.activity = 'working';
    const s = setup(start);
    walk(s, [input(1), input(2, { forward: 0 })]);
    expect(s.bodies.get(ID)!.activity).toBe('working');
  });
});
