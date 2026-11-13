import { BALANCE } from '../balance';
import type { Aabb } from '../layout/layout';
import { stepPlayer, type PlayerState } from '../movement';
import type { InputMessage } from './messages';

/** Fixed simulation step in seconds (50 ms at 20 Hz). */
export const FIXED_DT = 1 / BALANCE.net.tickHz;

/**
 * REQ-NET-003: one input = one fixed step. Client prediction and server authority both
 * call this, so identical input traces give bit-identical positions on both sides.
 */
export function applyInput(
  state: PlayerState,
  input: Pick<InputMessage, 'forward' | 'right' | 'run' | 'yaw'>,
  colliders: readonly Aabb[],
): PlayerState {
  return stepPlayer(
    state,
    { forward: input.forward, right: input.right, run: input.run },
    input.yaw,
    FIXED_DT,
    colliders,
  );
}
