import { describe, expect, it } from 'vitest';
import { BALANCE } from '@office/protocol';
import {
  ceilingPitch,
  clampPitch,
  damp,
  fadeOpacity,
  orbitOffset,
  resolveDistance,
} from '../src/game/cameraMath';

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
  it('lowers pitch so the camera stays below the ceiling', () => {
    const maxY = 2.7 - C.ceilingClearance;
    const p = ceilingPitch(30 * deg, 4, C.targetHeight, maxY);
    expect(p).toBeLessThan(30 * deg);
    expect(C.targetHeight + orbitOffset(0, p, 4).y).toBeCloseTo(maxY);
    for (const d of [1, 2.5, 4, 6])
      for (const pitchDeg of [C.minPitchDeg, 25, C.maxPitchDeg]) {
        const q = ceilingPitch(pitchDeg * deg, d, C.targetHeight, maxY);
        expect(C.targetHeight + orbitOffset(0, q, d).y).toBeLessThanOrEqual(maxY + 1e-9);
      }
  });
  it('keeps pitch unchanged when there is headroom', () => {
    expect(ceilingPitch(20 * deg, 2, C.targetHeight, 2.55)).toBeCloseTo(20 * deg);
    expect(ceilingPitch(20 * deg, 0, C.targetHeight, 2.55)).toBeCloseTo(20 * deg);
  });
  it('fades the player only when the camera is close', () => {
    expect(fadeOpacity(C.distance)).toBe(1);
    expect(fadeOpacity(C.fadeStartDistance)).toBe(1);
    expect(fadeOpacity(C.fadeEndDistance)).toBeCloseTo(C.fadeMinOpacity);
    expect(fadeOpacity(0)).toBeCloseTo(C.fadeMinOpacity);
    const mid = fadeOpacity((C.fadeStartDistance + C.fadeEndDistance) / 2);
    expect(mid).toBeGreaterThan(C.fadeMinOpacity);
    expect(mid).toBeLessThan(1);
  });
});
