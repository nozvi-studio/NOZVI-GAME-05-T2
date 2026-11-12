import { describe, expect, it, vi } from 'vitest';
import {
  SeatRegistry,
  officeLayout,
  type Activity,
  type PlayerState,
  type Vec3,
} from '@office/protocol';
import { InteractionController } from '../src/game/interaction/InteractionController';

function fakePlayer(state: PlayerState) {
  return {
    state,
    activity: 'idle' as Activity,
    seatedAt: null as Vec3 | null,
    setActivity(a: Activity) {
      this.activity = a;
    },
    seatAt(s: { position: Vec3; rotY: number }) {
      this.seatedAt = s.position;
      this.state = { x: s.position[0], z: s.position[2], heading: (s.rotY * Math.PI) / 180 };
    },
    standAt(p: Vec3) {
      this.seatedAt = null;
      this.state = { ...this.state, x: p[0], z: p[2] };
    },
  };
}

describe('InteractionController', () => {
  it('sits at the faced free desk, toggles work and stands', () => {
    const seats = new SeatRegistry();
    const p = fakePlayer({ x: 0.4, z: 2.05, heading: Math.PI });
    const c = new InteractionController(p, seats, 'me', { onExit: vi.fn() });
    expect(c.currentPrompt()?.text).toBe('E — Sit');
    c.press();
    expect(p.activity).toBe('sitting');
    expect(p.seatedAt).toEqual(
      officeLayout.workstations.find((w) => w.id === 'ws_5')!.seat.position,
    );
    expect(seats.occupant('ws_5_seat')).toBe('me');
    expect(c.currentPrompt()?.text).toBe('E — Start working · WASD — Stand up');
    c.press();
    expect(p.activity).toBe('working');
    expect(c.currentPrompt()?.text).toBe('E — Stop working · WASD — Stand up');
    c.press();
    expect(p.activity).toBe('sitting');
    c.press();
    c.onMoveIntent();
    expect(p.activity).toBe('idle');
    expect([p.state.x, p.state.z]).toEqual([0.4, 2.05]);
    expect(seats.occupant('ws_5_seat')).toBeNull();
    expect(c.currentPrompt()?.text).toBe('E — Sit');
  });
  it('refuses a taken desk', () => {
    const seats = new SeatRegistry();
    seats.claim('ws_5_seat', 'other');
    const p = fakePlayer({ x: 0.4, z: 2.05, heading: Math.PI });
    const c = new InteractionController(p, seats, 'me', { onExit: vi.fn() });
    expect(c.currentPrompt()).toEqual({ text: 'Desk taken', available: false });
    c.press();
    expect(p.activity).toBe('idle');
    expect(seats.occupant('ws_5_seat')).toBe('other');
  });
  it('leaves through the main door', () => {
    const onExit = vi.fn();
    const p = fakePlayer({ x: -0.4, z: -3, heading: Math.PI });
    const c = new InteractionController(p, new SeatRegistry(), 'me', { onExit });
    expect(c.currentPrompt()).toEqual({ text: 'E — Leave office', available: true });
    c.press();
    expect(onExit).toHaveBeenCalledOnce();
  });
});
