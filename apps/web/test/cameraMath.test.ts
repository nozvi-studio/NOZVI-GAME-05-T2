import { describe, expect, it } from 'vitest';
import { BALANCE } from '@office/protocol';
import { clampPitch, damp, orbitOffset, resolveDistance } from '../src/game/cameraMath';

const C = BALANCE.camera;
const deg = Math.PI / 180;

describe('cameraMath', () => {
  it('clamps pitch to configured range', () => {
    expect(clampPitch(0)).toBeCloseTo(C.minPitchDeg * deg);
    expect(clampPitch(Math.PI / 2)).toBeCloseTo(C.maxPitchDeg * deg);
  });
  it('places the camera behind the look direction', () => {
    const o = orbitOffset(0, 0, 4);
    expect(o.z).toBeCloseTo(-4);
    expect(o.x).toBeCloseTo(0);
  });
  it('raises the camera with pitch', () => {
    expect(orbitOffset(0, 30 * deg, 4).y).toBeCloseTo(2);
  });
  it('pulls in when occluded but never below min distance', () => {
    expect(resolveDistance(4, null)).toBe(4);
    expect(resolveDistance(4, 2)).toBeCloseTo(2 - C.occlusionPadding);
    expect(resolveDistance(4, 0.3)).toBe(C.minDistance);
  });
  it('damps toward the target and converges', () => {
    let v = 0;
    for (let i = 0; i < 120; i++) v = damp(v, 1, C.stiffness, 1 / 60);
    expect(v).toBeCloseTo(1, 3);
    expect(damp(0, 1, C.stiffness, 1 / 60)).toBeGreaterThan(0);
    expect(damp(0, 1, C.stiffness, 1 / 60)).toBeLessThan(1);
  });
});
