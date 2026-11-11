import { BALANCE } from './balance';
import type { Interactable } from './layout/layout';
import type { PlayerState } from './movement';

export function findInteractionTarget(
  player: PlayerState,
  candidates: readonly Interactable[],
  coneDeg: number = BALANCE.interaction.facingConeDeg,
): Interactable | null {
  const half = ((coneDeg / 2) * Math.PI) / 180;
  const fx = Math.sin(player.heading),
    fz = Math.cos(player.heading);
  let best: Interactable | null = null;
  let bestAngle = Infinity;
  for (const c of candidates) {
    const [ix, , iz] = c.interactionPoint;
    if (Math.hypot(ix - player.x, iz - player.z) > c.interactionRange) continue;
    const dx = c.position[0] - player.x,
      dz = c.position[2] - player.z;
    const len = Math.hypot(dx, dz);
    const angle = len < 1e-6 ? 0 : Math.acos(Math.min(1, Math.max(-1, (dx * fx + dz * fz) / len)));
    if (angle <= half && angle < bestAngle) {
      best = c;
      bestAngle = angle;
    }
  }
  return best;
}
