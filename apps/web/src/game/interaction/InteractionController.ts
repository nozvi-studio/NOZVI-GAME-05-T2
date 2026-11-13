import {
  findInteractionTarget,
  isSeated,
  nextActivity,
  officeLayout,
  type Activity,
  type IntentMessage,
  type Interactable,
  type PlayerState,
} from '@office/protocol';
import type { SeatOccupancy } from '../../net/occupancy';

export type Prompt = { text: string; available: boolean } | null;
export interface PlayerLike {
  state: PlayerState;
  activity: Activity;
}
export type InteractionHooks = {
  onExit(): void;
  /** Sends an activity request to the server; the result arrives in room state. */
  sendIntent(intent: IntentMessage): void;
  onAction?(target: Interactable): void;
};

const LABELS: Record<string, string> = {
  main_door: 'E — Leave office',
  coffee_machine: 'E — Take a break',
  water_dispenser: 'E — Take a break',
  sofa: 'E — Rest',
  storage_cabinet: 'E — Open cabinet',
};
const TARGETS = officeLayout.interactables.filter((i) => i.type !== 'computer' && i.type !== 'TV');

function deskSeatId(target: Interactable): string | null {
  return officeLayout.workstations.find((w) => w.id === target.workstationId)?.seat.id ?? null;
}

/**
 * REQ-INT-001/002/005: interaction targeting and prompts. Seats are not owned here: occupancy
 * comes from room state, and E / G only send intents. Seat pose and activity change when the
 * server state confirms them (no optimistic sit), see `Player.applyServer`.
 */
export class InteractionController {
  constructor(
    private readonly player: PlayerLike,
    private readonly seats: SeatOccupancy,
    private readonly ownerId: string,
    private readonly hooks: InteractionHooks,
  ) {}

  private target(): Interactable | null {
    return findInteractionTarget(this.player.state, TARGETS);
  }

  /** True when no other employee holds the seat. */
  seatFree(seatId: string): boolean {
    const holder = this.seats.occupant(seatId);
    return holder === null || holder === this.ownerId;
  }

  currentPrompt(): Prompt {
    const a = this.player.activity;
    if (a === 'sitting') return { text: 'E — Start working · WASD — Stand up', available: true };
    if (a === 'working') return { text: 'E — Stop working · WASD — Stand up', available: true };
    if (a === 'resting') return { text: 'WASD — Stand up', available: true };
    const t = this.target();
    if (!t) return null;
    if (t.type === 'chair') {
      const seatId = deskSeatId(t);
      if (!seatId) return null;
      return this.seatFree(seatId)
        ? { text: 'E — Sit', available: true }
        : { text: 'Desk taken', available: false };
    }
    const label = LABELS[t.type];
    return label ? { text: label, available: true } : null;
  }

  press(): void {
    const a = this.player.activity;
    if (a === 'sitting' || a === 'working') {
      this.hooks.sendIntent({ type: 'toggleWork' });
      return;
    }
    if (isSeated(a)) return;
    const t = this.target();
    if (!t) return;
    if (t.type === 'chair') {
      const seatId = deskSeatId(t);
      if (seatId) this.requestSeat(seatId, 'desk');
      return;
    }
    if (t.type === 'main_door') {
      this.hooks.onExit();
      return;
    }
    this.hooks.onAction?.(t);
  }

  /** G: asks to wave when the current activity allows it. */
  wave(): void {
    const a = this.player.activity;
    if (nextActivity(a, { type: 'wave' }) !== a) this.hooks.sendIntent({ type: 'wave' });
  }

  /**
   * Sends `sit` for a free seat when the player can enter the seated activity. Returns
   * whether the intent was sent; the server still decides (range, contested seat).
   */
  requestSeat(seatId: string, kind: 'desk' | 'sofa'): boolean {
    const a = this.player.activity;
    if (nextActivity(a, { type: 'sit', kind }) === a) return false;
    if (!this.seatFree(seatId)) return false;
    this.hooks.sendIntent({ type: 'sit', seatId });
    return true;
  }

  /** Sends an intent other than `sit` (e.g. a break from `handleAction`). */
  request(intent: IntentMessage): void {
    this.hooks.sendIntent(intent);
  }
}
