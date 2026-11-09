import type { Aabb, Vec2 } from './layout/layout';

const EPS = 1e-6;
const MAX_ITERATIONS = 16;
// Upper bound on substeps per moveCircle call. Longer deltas are truncated to
// MAX_SUBSTEPS * r / 2 (about 38 m for r = 0.3) instead of hanging or tunnelling.
const MAX_SUBSTEPS = 256;

type Push = { depth: number; x: number; z: number };

// Penetration of the circle into one box and the position that resolves it.
function pushOut(x: number, z: number, r: number, b: Aabb): Push | null {
  const minX = b.x - b.w / 2,
    maxX = b.x + b.w / 2;
  const minZ = b.z - b.d / 2,
    maxZ = b.z + b.d / 2;
  const cx = Math.min(Math.max(x, minX), maxX);
  const cz = Math.min(Math.max(z, minZ), maxZ);
  const dx = x - cx,
    dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r - EPS) return null;
  if (d2 > EPS * EPS) {
    const d = Math.sqrt(d2);
    const push = (r - d + EPS) / d;
    return { depth: r - d, x: x + dx * push, z: z + dz * push };
  }
  const left = x - minX + r,
    right = maxX - x + r;
  const north = z - minZ + r,
    south = maxZ - z + r;
  const m = Math.min(left, right, north, south);
  if (m === left) return { depth: m, x: x - left, z };
  if (m === right) return { depth: m, x: x + right, z };
  if (m === north) return { depth: m, x, z: z - north };
  return { depth: m, x, z: z + south };
}

// Resolves the deepest overlap first so flush seams between boxes never inject
// a sideways push from a neighbouring box corner. `ok` is false when overlaps
// remain after MAX_ITERATIONS (e.g. wedged into a gap narrower than 2r).
function resolve(p: Vec2, r: number, boxes: readonly Aabb[]): { p: Vec2; ok: boolean } {
  let { x, z } = p;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let best: Push | null = null;
    for (const b of boxes) {
      const push = pushOut(x, z, r, b);
      if (push && (!best || push.depth > best.depth)) best = push;
    }
    if (!best) return { p: { x, z }, ok: true };
    x = best.x;
    z = best.z;
  }
  const ok = boxes.every((b) => pushOut(x, z, r, b) === null);
  return { p: { x, z }, ok };
}

export function resolveCircle(p: Vec2, r: number, boxes: readonly Aabb[]): Vec2 {
  return resolve(p, r, boxes).p;
}

export function moveCircle(from: Vec2, delta: Vec2, r: number, boxes: readonly Aabb[]): Vec2 {
  if (!(r > 0) || !Number.isFinite(r)) throw new RangeError(`invalid radius: ${r}`);
  const len = Math.hypot(delta.x, delta.z);
  let p: Vec2 = { x: from.x, z: from.z };
  if (!Number.isFinite(len) || len === 0) return p;
  const maxStep = r * 0.5;
  const scale = Math.min(1, (MAX_SUBSTEPS * maxStep) / len);
  const steps = Math.max(1, Math.ceil((len * scale) / maxStep));
  const sx = (delta.x * scale) / steps,
    sz = (delta.z * scale) / steps;
  for (let i = 0; i < steps; i++) {
    const next = resolve({ x: p.x + sx, z: p.z + sz }, r, boxes);
    // Never accept a substep that leaves the circle overlapping a collider.
    if (next.ok) p = next.p;
  }
  return p;
}
