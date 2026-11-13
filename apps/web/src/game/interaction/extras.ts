import { nextActivity, officeLayout, type Interactable } from '@office/protocol';
import type { InteractionController, PlayerLike } from './InteractionController';

export type ActionResult = { message?: string };

/**
 * REQ-INT-003/004: breaks, sofa rest and cabinet feedback. Breaks and sofa rest are sent as
 * intents (the server runs the break timers); cabinet feedback stays local.
 */
export function handleAction(
  t: Interactable,
  player: PlayerLike,
  c: InteractionController,
): ActionResult {
  if (t.type === 'coffee_machine' || t.type === 'water_dispenser') {
    if (nextActivity(player.activity, { type: 'drink' }) !== player.activity) {
      c.request({ type: 'drink' });
    }
    return {};
  }
  if (t.type === 'sofa') {
    for (const seat of officeLayout.sofaSeats) if (c.requestSeat(seat.id, 'sofa')) break;
    return {};
  }
  if (t.type === 'storage_cabinet') return { message: 'Cabinet opened' };
  return {};
}
