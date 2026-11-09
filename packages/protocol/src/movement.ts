import { BALANCE } from './balance';
import { moveCircle } from './collision';
import type { Aabb, Vec2 } from './layout/layout';

export type MoveInput = { forward: number; right: number; run: boolean };
export type PlayerState = { x: number; z: number; heading: number };

export function desiredVelocity(input: MoveInput, cameraYaw: number): Vec2 {
  const fx = Math.sin(cameraYaw),
    fz = Math.cos(cameraYaw);
  const rx = -Math.cos(cameraYaw),
    rz = Math.sin(cameraYaw);
  const x = fx * input.forward + rx * input.right;
  const z = fz * input.forward + rz * input.right;
  const len = Math.hypot(x, z);
  // `!(len >= ...)` also rejects NaN; untrusted (server-side) input must never yield NaN.
  if (!(len >= 1e-9) || !Number.isFinite(len)) return { x: 0, z: 0 };
  const speed = input.run ? BALANCE.movement.runSpeed : BALANCE.movement.walkSpeed;
  return { x: (x / len) * speed, z: (z / len) * speed };
}

function turnToward(current: number, target: number, maxStep: number): number {
  let diff = target - current;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

export function stepPlayer(
  state: PlayerState,
  input: MoveInput,
  cameraYaw: number,
  dt: number,
  colliders: readonly Aabb[],
): PlayerState {
  if (!(dt > 0) || !Number.isFinite(dt)) return state;
  const v = desiredVelocity(input, cameraYaw);
  if (v.x === 0 && v.z === 0) return state;
  const p = moveCircle(
    state,
    { x: v.x * dt, z: v.z * dt },
    BALANCE.movement.capsuleRadius,
    colliders,
  );
  const heading = turnToward(state.heading, Math.atan2(v.x, v.z), BALANCE.movement.turnRate * dt);
  return { x: p.x, z: p.z, heading };
}
