import { BALANCE } from '@office/protocol';

const C = BALANCE.camera;
const deg = Math.PI / 180;

export function clampPitch(rad: number): number {
  return Math.min(Math.max(rad, C.minPitchDeg * deg), C.maxPitchDeg * deg);
}

export function orbitOffset(yaw: number, pitch: number, distance: number) {
  const horizontal = Math.cos(pitch) * distance;
  return {
    x: -Math.sin(yaw) * horizontal,
    y: Math.sin(pitch) * distance,
    z: -Math.cos(yaw) * horizontal,
  };
}

export function resolveDistance(desired: number, hitDistance: number | null): number {
  const d = hitDistance === null ? desired : Math.min(desired, hitDistance - C.occlusionPadding);
  return Math.max(d, C.minDistance);
}

export function damp(current: number, target: number, stiffness: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-stiffness * dt));
}

/**
 * Lowers the orbit pitch so a camera `distance` from a focus at `focusY` stays at or below
 * `maxY`. The ceiling wins over the configured minimum pitch.
 */
export function ceilingPitch(
  pitch: number,
  distance: number,
  focusY: number,
  maxY: number,
): number {
  if (distance <= 0) return pitch;
  const s = Math.min(Math.max((maxY - focusY) / distance, -1), 1);
  return Math.min(pitch, Math.asin(s));
}

/** Player mesh opacity for a camera-to-focus distance (1 = opaque). */
export function fadeOpacity(distance: number): number {
  const t = (distance - C.fadeEndDistance) / (C.fadeStartDistance - C.fadeEndDistance);
  const k = Math.min(Math.max(t, 0), 1);
  return C.fadeMinOpacity + (1 - C.fadeMinOpacity) * k;
}
