import { describe, expect, it } from 'vitest';
import { moveCircle, resolveCircle } from '../src/collision';
import { officeLayout } from '../src/layout/layout';
import type { Aabb, Vec2 } from '../src/layout/layout';

const wall = { x: 0, z: 0, w: 1, d: 1 }; // spans -0.5..0.5
const r = 0.3;

describe('collision', () => {
  it('leaves a free circle untouched', () => {
    expect(resolveCircle({ x: 2, z: 0 }, r, [wall])).toEqual({ x: 2, z: 0 });
  });
  it('pushes an overlapping circle out to the surface', () => {
    const p = resolveCircle({ x: 0.6, z: 0 }, r, [wall]);
    expect(p.x).toBeCloseTo(0.8, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });
  it('does not tunnel through a box on a large step', () => {
    const p = moveCircle({ x: -2, z: 0 }, { x: 4, z: 0 }, r, [wall]);
    expect(p.x).toBeLessThanOrEqual(-0.8 + 1e-6);
  });
  it('slides along a face when moving obliquely', () => {
    // Plan used z: -1, which hits the box corner at (-0.5, -0.5) instead of the
    // face; see 'rounds a box corner' below. z: -0.5 keeps the whole path on the face.
    const p = moveCircle({ x: -0.8, z: -0.5 }, { x: 0.5, z: 1 }, r, [wall]);
    expect(p.x).toBeCloseTo(-0.8, 3);
    expect(p.z).toBeGreaterThan(-0.1);
  });
  it('is deterministic for identical inputs', () => {
    const a = moveCircle({ x: -0.8, z: -1 }, { x: 0.5, z: 1 }, r, [wall]);
    const b = moveCircle({ x: -0.8, z: -1 }, { x: 0.5, z: 1 }, r, [wall]);
    expect(a).toEqual(b);
  });
  it('keeps the player inside the office walls', () => {
    const { x, z } = { x: officeLayout.spawn.position[0], z: officeLayout.spawn.position[2] };
    const p = moveCircle({ x, z }, { x: 0, z: -20 }, r, officeLayout.colliders);
    expect(p.z).toBeGreaterThan(-officeLayout.room.depth / 2);
  });
});

// Penetration depth of a circle into a box (0 when not overlapping).
function penetration(p: Vec2, radius: number, b: Aabb): number {
  const cx = Math.min(Math.max(p.x, b.x - b.w / 2), b.x + b.w / 2);
  const cz = Math.min(Math.max(p.z, b.z - b.d / 2), b.z + b.d / 2);
  return Math.max(0, radius - Math.hypot(p.x - cx, p.z - cz));
}

function maxPenetration(p: Vec2, radius: number, boxes: readonly Aabb[]): number {
  let m = 0;
  for (const b of boxes) m = Math.max(m, penetration(p, radius, b));
  return m;
}

// Small deterministic PRNG so property tests are reproducible.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const TOL = 1e-5;

describe('collision properties', () => {
  it('never ends inside a collider for random free starts and deltas', () => {
    const boxes: Aabb[] = [
      wall,
      { x: 2, z: 1, w: 0.1, d: 3 },
      { x: -2, z: -1.5, w: 2, d: 0.1 },
      { x: 1.2, z: -1.5, w: 0.6, d: 0.6 },
      { x: 1.7, z: -1.5, w: 0.6, d: 0.6 }, // flush seam with previous box
    ];
    const rand = rng(42);
    let checked = 0;
    for (let i = 0; i < 2000; i++) {
      const from = { x: (rand() - 0.5) * 8, z: (rand() - 0.5) * 8 };
      if (maxPenetration(from, r, boxes) > 0) continue;
      const delta = { x: (rand() - 0.5) * 6, z: (rand() - 0.5) * 6 };
      const p = moveCircle(from, delta, r, boxes);
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
      expect(maxPenetration(p, r, boxes)).toBeLessThan(TOL);
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('never ends inside when wedged into a gap narrower than the circle', () => {
    // Two boxes 0.4 m apart: a 0.6 m circle cannot fit between them.
    const boxes: Aabb[] = [
      { x: -0.7, z: 0, w: 1, d: 1 },
      { x: 0.7, z: 0, w: 1, d: 1 },
    ];
    for (const dx of [-0.05, 0, 0.03, 0.1]) {
      const p = moveCircle({ x: dx, z: -2 }, { x: 0, z: 3 }, r, boxes);
      expect(maxPenetration(p, r, boxes)).toBeLessThan(TOL);
    }
  });

  it('preserves the tangential component when sliding along a wall', () => {
    const longWall: Aabb = { x: 0, z: 0, w: 10, d: 0.2 }; // face at z = -0.1
    const from = { x: -2, z: -0.4 }; // touching the face
    const p = moveCircle(from, { x: 1.5, z: 1 }, r, [longWall]);
    expect(p.x).toBeCloseTo(-0.5, 5);
    expect(p.z).toBeCloseTo(-0.4, 5);
  });

  it('does not snag on the seam between flush boxes while sliding', () => {
    const tiles: Aabb[] = [];
    for (let i = 0; i < 6; i++) tiles.push({ x: -2.5 + i, z: 0, w: 1, d: 0.2 });
    const p = moveCircle({ x: -2.2, z: -0.4 }, { x: 4, z: 0.5 }, r, tiles);
    expect(p.x).toBeCloseTo(1.8, 4);
    expect(p.z).toBeCloseTo(-0.4, 4);
  });

  it('does not tunnel through a 0.1 m-thin box with a step larger than the radius', () => {
    const thin: Aabb = { x: 0, z: 0, w: 0.1, d: 40 };
    for (const step of [0.31, 0.5, 1, 3, 10]) {
      const p = moveCircle({ x: -0.5, z: 0.3 }, { x: step, z: 0 }, r, [thin]);
      expect(p.x).toBeLessThanOrEqual(-0.35 + 1e-5);
      const q = moveCircle({ x: 0.5, z: -0.7 }, { x: -step, z: step * 0.3 }, r, [thin]);
      expect(q.x).toBeGreaterThanOrEqual(0.35 - 1e-5);
    }
  });

  it('rounds a box corner without penetrating or gaining distance', () => {
    // Continuous-limit result is about (-0.8, -0.32): the corner absorbs most of
    // the motion, so a circle starting at z = -1 cannot slide past z = -0.1.
    const from = { x: -0.8, z: -1 };
    const delta = { x: 0.5, z: 1 };
    const p = moveCircle(from, delta, r, [wall]);
    expect(maxPenetration(p, r, [wall])).toBeLessThan(TOL);
    expect(p.x).toBeCloseTo(-0.8, 3);
    expect(p.z).toBeGreaterThan(-0.5);
    expect(p.z).toBeLessThan(-0.1);
    expect(Math.hypot(p.x - from.x, p.z - from.z)).toBeLessThanOrEqual(
      Math.hypot(delta.x, delta.z),
    );
  });

  it('truncates absurdly long deltas instead of hanging or tunnelling', () => {
    const thin: Aabb = { x: 0, z: 0, w: 0.1, d: 1e12 };
    const p = moveCircle({ x: -0.5, z: 0 }, { x: 1e9, z: 1e9 }, r, [thin]);
    expect(p.x).toBeLessThanOrEqual(-0.35 + 1e-5);
    expect(Number.isFinite(p.z)).toBe(true);
  });

  it('rejects a non-positive radius', () => {
    expect(() => moveCircle({ x: 0, z: 0 }, { x: 1, z: 0 }, 0, [])).toThrow(RangeError);
  });

  it('returns the start for zero-length or non-finite deltas', () => {
    expect(moveCircle({ x: 2, z: 0 }, { x: 0, z: 0 }, r, [wall])).toEqual({ x: 2, z: 0 });
    expect(moveCircle({ x: 2, z: 0 }, { x: Number.NaN, z: 0 }, r, [wall])).toEqual({ x: 2, z: 0 });
    expect(moveCircle({ x: 2, z: 0 }, { x: Infinity, z: 0 }, r, [wall])).toEqual({ x: 2, z: 0 });
  });

  it('keeps random walks from spawn inside the office and out of furniture', () => {
    const boxes = officeLayout.colliders;
    const halfW = officeLayout.room.width / 2;
    const halfD = officeLayout.room.depth / 2;
    const rand = rng(7);
    let p: Vec2 = { x: officeLayout.spawn.position[0], z: officeLayout.spawn.position[2] };
    expect(maxPenetration(p, r, boxes)).toBe(0);
    for (let i = 0; i < 5000; i++) {
      const a = rand() * Math.PI * 2;
      const len = rand() * 1.2;
      p = moveCircle(p, { x: Math.sin(a) * len, z: Math.cos(a) * len }, r, boxes);
      expect(Math.abs(p.x)).toBeLessThan(halfW - r + TOL);
      expect(Math.abs(p.z)).toBeLessThan(halfD - r + TOL);
      expect(maxPenetration(p, r, boxes)).toBeLessThan(TOL);
    }
  });
});
