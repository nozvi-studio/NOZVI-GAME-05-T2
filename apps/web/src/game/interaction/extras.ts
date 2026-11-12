import { BALANCE, nextActivity, officeLayout, type Interactable } from '@office/protocol';
import type { InteractionController, PlayerLike } from './InteractionController';

export type ActionResult = { timer: number; message?: string };

// REQ-INT-003/004: timed breaks, sofa rest and cabinet feedback.
export function handleAction(
  t: Interactable,
  player: PlayerLike,
  c: InteractionController,
): ActionResult {
  if (t.type === 'coffee_machine' || t.type === 'water_dispenser') {
    const activity = nextActivity(player.activity, { type: 'drink' });
    if (activity === player.activity) return { timer: 0 };
    player.setActivity(activity);
    return { timer: BALANCE.activity.drinkSeconds };
  }
  if (t.type === 'sofa') {
    for (const seat of officeLayout.sofaSeats) if (c.sitOn(seat, 'sofa')) break;
    return { timer: 0 };
  }
  if (t.type === 'storage_cabinet') return { timer: 0, message: 'Cabinet opened' };
  return { timer: 0 };
}
