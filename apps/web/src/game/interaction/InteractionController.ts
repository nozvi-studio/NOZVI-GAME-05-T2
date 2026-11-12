import {
  findInteractionTarget,
  isSeated,
  nextActivity,
  officeLayout,
  type Activity,
  type Interactable,
  type PlayerState,
  type SeatRegistry,
  type Vec3,
} from '@office/protocol';

export type Prompt = { text: string; available: boolean } | null;
type Seat = { id: string; position: Vec3; rotY: number; interactionPoint: Vec3 };
export interface PlayerLike {
  state: PlayerState;
  activity: Activity;
  setActivity(a: Activity): void;
  seatAt(s: { position: Vec3; rotY: number }): void;
  standAt(p: Vec3): void;
}

const LABELS: Record<string, string> = {
  main_door: 'E — Leave office',
  coffee_machine: 'E — Take a break',
  water_dispenser: 'E — Take a break',
  sofa: 'E — Rest',
  storage_cabinet: 'E — Open cabinet',
};
const TARGETS = officeLayout.interactables.filter((i) => i.type !== 'computer' && i.type !== 'TV');

function deskSeat(target: Interactable): Seat | null {
  const ws = officeLayout.workstations.find((w) => w.id === target.workstationId);
  return ws ? { ...ws.seat, interactionPoint: ws.interactionPoint } : null;
}

export class InteractionController {
  private seat: Seat | null = null;

  constructor(
    private readonly player: PlayerLike,
    private readonly seats: SeatRegistry,
    private readonly ownerId: string,
    private readonly hooks: { onExit(): void; onAction?(target: Interactable): void },
  ) {}

  private target(): Interactable | null {
    return findInteractionTarget(this.player.state, TARGETS);
  }

  currentPrompt(): Prompt {
    const a = this.player.activity;
    if (a === 'sitting') return { text: 'E — Start working · WASD — Stand up', available: true };
    if (a === 'working') return { text: 'E — Stop working · WASD — Stand up', available: true };
    if (a === 'resting') return { text: 'WASD — Stand up', available: true };
    const t = this.target();
    if (!t) return null;
    if (t.type === 'chair') {
      const seat = deskSeat(t);
      if (!seat) return null;
      return this.seats.occupant(seat.id)
        ? { text: 'Desk taken', available: false }
        : { text: 'E — Sit', available: true };
    }
    const label = LABELS[t.type];
    return label ? { text: label, available: true } : null;
  }

  // REQ-INT-001/002/005: target interactions, exclusive desk seating and office exit.
  press(): void {
    const a = this.player.activity;
    if (a === 'sitting' || a === 'working') {
      this.player.setActivity(nextActivity(a, { type: 'toggleWork' }));
      return;
    }
    if (isSeated(a)) return;
    const t = this.target();
    if (!t) return;
    if (t.type === 'chair') {
      const seat = deskSeat(t);
      if (!seat || !this.seats.claim(seat.id, this.ownerId)) return;
      this.seat = seat;
      this.player.seatAt(seat);
      this.player.setActivity(nextActivity(a, { type: 'sit', kind: 'desk' }));
      return;
    }
    if (t.type === 'main_door') {
      this.hooks.onExit();
      return;
    }
    this.hooks.onAction?.(t);
  }

  /** Called by Task 7 to seat the player on a sofa socket. */
  sitOn(seat: Seat, kind: 'desk' | 'sofa'): boolean {
    if (!this.seats.claim(seat.id, this.ownerId)) return false;
    this.seat = seat;
    this.player.seatAt(seat);
    this.player.setActivity(nextActivity(this.player.activity, { type: 'sit', kind }));
    return true;
  }

  onMoveIntent(): void {
    if (!isSeated(this.player.activity) || !this.seat) return;
    this.seats.release(this.ownerId);
    this.player.standAt(this.seat.interactionPoint);
    this.seat = null;
    this.player.setActivity(nextActivity(this.player.activity, { type: 'stand' }));
  }
}
