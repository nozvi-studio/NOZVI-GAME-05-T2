import { describe, expect, it, vi } from 'vitest';
import {
  SeatRegistry,
  type Activity,
  type IntentMessage,
  type PlayerState,
} from '@office/protocol';
import { InteractionController } from '../src/game/interaction/InteractionController';
import { roomOccupancy, type SeatOccupancy } from '../src/net/occupancy';

function fakePlayer(state: PlayerState, activity: Activity = 'idle') {
  return { state, activity };
}

function setup(state: PlayerState, seats: SeatOccupancy = new SeatRegistry()) {
  const p = fakePlayer(state);
  const sent: IntentMessage[] = [];
  const onExit = vi.fn();
  const c = new InteractionController(p, seats, 'me', {
    onExit,
    sendIntent: (i) => sent.push(i),
  });
  return { p, c, sent, onExit, seats };
}

describe('InteractionController', () => {
  it('sends sit for the faced free desk and changes nothing until the server confirms', () => {
    const { p, c, sent } = setup({ x: 0.66, z: 2.46, heading: Math.PI });
    expect(c.currentPrompt()?.text).toBe('E — Sit');
    c.press();
    expect(sent).toEqual([{ type: 'sit', seatId: 'ws_5_seat' }]);
    // No optimistic sit: activity and position are untouched.
    expect(p.activity).toBe('idle');
    expect(p.state).toEqual({ x: 0.66, z: 2.46, heading: Math.PI });
  });

  it('toggles work through intents while the server reports the player seated', () => {
    const { p, c, sent } = setup({ x: 0.66, z: 1.2, heading: Math.PI / 2 });
    p.activity = 'sitting';
    expect(c.currentPrompt()?.text).toBe('E — Start working · WASD — Stand up');
    c.press();
    p.activity = 'working';
    expect(c.currentPrompt()?.text).toBe('E — Stop working · WASD — Stand up');
    c.press();
    expect(sent).toEqual([{ type: 'toggleWork' }, { type: 'toggleWork' }]);
    p.activity = 'resting';
    expect(c.currentPrompt()?.text).toBe('WASD — Stand up');
    c.press();
    expect(sent).toHaveLength(2);
  });

  it('shows a desk held by another employee as taken and sends nothing', () => {
    const seats = new SeatRegistry();
    seats.claim('ws_5_seat', 'other');
    const { p, c, sent } = setup({ x: 0.66, z: 2.46, heading: Math.PI }, seats);
    expect(c.currentPrompt()).toEqual({ text: 'Desk taken', available: false });
    c.press();
    expect(sent).toEqual([]);
    expect(p.activity).toBe('idle');
  });

  it('reads desk occupancy from replicated room state', () => {
    const employees = new Map([
      ['me', { seatId: '' }],
      ['other', { seatId: '' }],
    ]);
    const occupancy = roomOccupancy({ state: { employees } });
    const { c } = setup({ x: 0.66, z: 2.46, heading: Math.PI }, occupancy);
    expect(c.currentPrompt()?.text).toBe('E — Sit');
    employees.get('other')!.seatId = 'ws_5_seat';
    expect(occupancy.occupant('ws_5_seat')).toBe('other');
    expect(c.currentPrompt()).toEqual({ text: 'Desk taken', available: false });
    employees.get('other')!.seatId = '';
    expect(c.currentPrompt()?.text).toBe('E — Sit');
    // The local player's own seat is never "taken".
    employees.get('me')!.seatId = 'ws_5_seat';
    expect(c.seatFree('ws_5_seat')).toBe(true);
    expect(roomOccupancy({}).occupant('ws_5_seat')).toBeNull();
  });

  it('does not send sit while the activity forbids it', () => {
    const { p, c, sent } = setup({ x: 0.66, z: 2.46, heading: Math.PI });
    p.activity = 'drinking';
    c.press();
    expect(sent).toEqual([]);
  });

  it('sends wave only when the activity allows it', () => {
    const { p, c, sent } = setup({ x: 0, z: 0, heading: 0 });
    c.wave();
    expect(sent).toEqual([{ type: 'wave' }]);
    p.activity = 'sitting';
    c.wave();
    expect(sent).toHaveLength(1);
  });

  it('leaves through the main door locally', () => {
    const { c, onExit, sent } = setup({ x: -0.46, z: -3.8, heading: Math.PI });
    expect(c.currentPrompt()).toEqual({ text: 'E — Leave office', available: true });
    c.press();
    expect(onExit).toHaveBeenCalledOnce();
    expect(sent).toEqual([]);
  });
});
