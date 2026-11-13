import { describe, expect, it } from 'vitest';
import { FIXED_DT, applyInput } from '../../src/net/fixedStep';
import { BALANCE } from '../../src/balance';
import { officeLayout } from '../../src/layout/layout';
import type { PlayerState } from '../../src/movement';
import type { InputMessage } from '../../src/net/messages';

/** Deterministic pseudo-random trace (mulberry32) that walks into walls and furniture. */
function trace(n: number, seed: number): InputMessage[] {
  let a = seed;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: n }, (_, seq) => ({
    seq,
    forward: [-1, 0, 1][Math.floor(rnd() * 3)]!,
    right: [-1, 0, 1][Math.floor(rnd() * 3)]!,
    run: rnd() < 0.5,
    yaw: (rnd() - 0.5) * 2 * Math.PI,
  }));
}

function run(inputs: InputMessage[]): PlayerState[] {
  const [x, , z] = officeLayout.spawn.position;
  let s: PlayerState = { x, z, heading: officeLayout.spawn.rotY };
  return inputs.map((i) => (s = applyInput(s, i, officeLayout.colliders)));
}

describe('applyInput', () => {
  it('uses a fixed step of 1 / tickHz', () => {
    expect(FIXED_DT).toBe(1 / BALANCE.net.tickHz);
    const s = applyInput(
      { x: 0, z: 0, heading: 0 },
      { forward: 1, right: 0, run: false, yaw: 0 },
      [],
    );
    expect(s.z).toBeCloseTo(BALANCE.movement.walkSpeed * FIXED_DT, 12);
  });
  it('is bit-identical across two runs of the same 200-input trace', () => {
    const inputs = trace(200, 1234);
    const a = run(inputs);
    const b = run(structuredClone(inputs));
    for (let i = 0; i < a.length; i++) {
      expect(Object.is(a[i]!.x, b[i]!.x) && Object.is(a[i]!.z, b[i]!.z)).toBe(true);
      expect(Object.is(a[i]!.heading, b[i]!.heading)).toBe(true);
    }
    // The trace actually moves the player (not a vacuous comparison).
    const last = a.at(-1)!;
    const [sx, , sz] = officeLayout.spawn.position;
    expect(Math.hypot(last.x - sx, last.z - sz)).toBeGreaterThan(0.5);
  });
});
