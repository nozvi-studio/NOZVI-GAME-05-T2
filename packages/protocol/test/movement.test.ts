import { describe, expect, it } from 'vitest';
import { desiredVelocity, stepPlayer } from '../src/movement';
import { BALANCE } from '../src/balance';
import { officeLayout } from '../src/layout/layout';
import type { PlayerState } from '../src/movement';

const none = { forward: 0, right: 0, run: false };

describe('movement', () => {
  it('W moves along the camera forward at walk speed', () => {
    const v = desiredVelocity({ ...none, forward: 1 }, 0);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(BALANCE.movement.walkSpeed);
  });
  it('D moves to camera right (yaw 0 -> -X)', () => {
    const v = desiredVelocity({ ...none, right: 1 }, 0);
    expect(v.x).toBeCloseTo(-BALANCE.movement.walkSpeed);
  });
  it('is camera-relative (yaw 90deg, W -> +X)', () => {
    const v = desiredVelocity({ ...none, forward: 1 }, Math.PI / 2);
    expect(v.x).toBeCloseTo(BALANCE.movement.walkSpeed);
    expect(v.z).toBeCloseTo(0);
  });
  it('normalizes diagonals', () => {
    const v = desiredVelocity({ forward: 1, right: 1, run: false }, 0.3);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(BALANCE.movement.walkSpeed);
  });
  it('runs at run speed', () => {
    const v = desiredVelocity({ forward: 1, right: 0, run: true }, 0);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(BALANCE.movement.runSpeed);
  });
  it('steps position and turns heading toward travel', () => {
    const s = stepPlayer({ x: 0, z: 0, heading: 0 }, { ...none, forward: 1 }, Math.PI / 2, 0.5, []);
    expect(s.x).toBeCloseTo(1.0);
    expect(s.heading).toBeGreaterThan(0);
  });
  it('keeps heading when idle', () => {
    const s = stepPlayer({ x: 0, z: 0, heading: 1 }, none, 0, 0.1, []);
    expect(s).toEqual({ x: 0, z: 0, heading: 1 });
  });
  it('is blocked by colliders', () => {
    const s = stepPlayer({ x: 0, z: 0, heading: 0 }, { ...none, forward: 1 }, 0, 1, [
      { x: 0, z: 1, w: 4, d: 0.2 },
    ]);
    expect(s.z).toBeLessThanOrEqual(0.6 + 1e-6);
  });
});

describe('movement robustness', () => {
  it('returns zero velocity for no input even when running', () => {
    const v = desiredVelocity({ forward: 0, right: 0, run: true }, 1.2);
    expect(v).toEqual({ x: 0, z: 0 });
  });

  it('treats non-finite axes as no input', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(desiredVelocity({ forward: bad, right: 0, run: false }, 0)).toEqual({ x: 0, z: 0 });
      expect(desiredVelocity({ forward: 1, right: bad, run: false }, 0)).toEqual({ x: 0, z: 0 });
    }
    expect(desiredVelocity({ ...none, forward: 1 }, Number.NaN)).toEqual({ x: 0, z: 0 });
  });

  it('ignores non-positive or non-finite dt', () => {
    const start = { x: 0, z: 0, heading: 0.5 };
    for (const dt of [0, -0.1, Number.NaN, Infinity]) {
      expect(stepPlayer(start, { ...none, forward: 1 }, 0, dt, [])).toEqual(start);
    }
  });

  it('turns heading at most turnRate * dt per step and settles on travel direction', () => {
    const dt = 0.01;
    let s: PlayerState = { x: 0, z: 0, heading: 0 };
    s = stepPlayer(s, { ...none, forward: 1 }, Math.PI / 2, dt, []);
    expect(s.heading).toBeCloseTo(BALANCE.movement.turnRate * dt, 9);
    for (let i = 0; i < 100; i++) s = stepPlayer(s, { ...none, forward: 1 }, Math.PI / 2, dt, []);
    expect(s.heading).toBeCloseTo(Math.PI / 2, 9);
  });

  it('stays inside the office and out of furniture when walking from spawn', () => {
    const r = BALANCE.movement.capsuleRadius;
    const halfW = officeLayout.room.width / 2;
    const halfD = officeLayout.room.depth / 2;
    let s: PlayerState = {
      x: officeLayout.spawn.position[0],
      z: officeLayout.spawn.position[2],
      heading: 0,
    };
    let seed = 99;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const axis = () => Math.floor(rand() * 3) - 1;
    for (let block = 0; block < 300; block++) {
      const input = { forward: axis(), right: axis(), run: rand() < 0.5 };
      const yaw = rand() * Math.PI * 2;
      for (let t = 0; t < 30; t++) {
        s = stepPlayer(s, input, yaw, 1 / 60, officeLayout.colliders);
        expect(Math.abs(s.x)).toBeLessThan(halfW - r + 1e-5);
        expect(Math.abs(s.z)).toBeLessThan(halfD - r + 1e-5);
        for (const b of officeLayout.colliders) {
          const cx = Math.min(Math.max(s.x, b.x - b.w / 2), b.x + b.w / 2);
          const cz = Math.min(Math.max(s.z, b.z - b.d / 2), b.z + b.d / 2);
          expect(Math.hypot(s.x - cx, s.z - cz)).toBeGreaterThan(r - 1e-5);
        }
      }
    }
  });
});
