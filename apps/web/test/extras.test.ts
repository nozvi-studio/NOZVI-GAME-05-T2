import { expect, it, vi } from 'vitest';
import {
  SeatRegistry,
  officeLayout,
  type Activity,
  type IntentMessage,
  type PlayerState,
} from '@office/protocol';
import { InteractionController } from '../src/game/interaction/InteractionController';
import { handleAction } from '../src/game/interaction/extras';
import { Game } from '../src/game/Game';
import { Player } from '../src/game/player';

function setup(state: PlayerState, seats = new SeatRegistry(), onAction = vi.fn()) {
  const p = { state, activity: 'idle' as Activity };
  const sent: IntentMessage[] = [];
  const c = new InteractionController(p, seats, 'me', {
    onExit: vi.fn(),
    sendIntent: (i) => sent.push(i),
    onAction,
  });
  return { p, c, sent, onAction };
}

const target = (id: string) => officeLayout.interactables.find((i) => i.id === id)!;

it.each(['coffee_machine', 'water_dispenser'])('%s sends a drink intent', (id) => {
  const { p, c, sent } = setup({ x: 2.35, z: -2.75, heading: Math.PI });
  expect(handleAction(target(id), p, c)).toEqual({});
  expect(sent).toEqual([{ type: 'drink' }]);
  // The server starts and ends the break.
  expect(p.activity).toBe('idle');
});

it.each(['waving', 'drinking', 'resting'] as const)('does not send drink during %s', (activity) => {
  const { p, c, sent } = setup({ x: 2.35, z: -2.75, heading: Math.PI });
  p.activity = activity;
  handleAction(target('coffee_machine'), p, c);
  expect(sent).toEqual([]);
});

it('sofa requests the first sofa seat no other employee holds', () => {
  const seats = new SeatRegistry();
  seats.claim('sofa_seat_1', 'other');
  const { p, c, sent } = setup({ x: -1.2, z: -1.4, heading: -Math.PI / 2 }, seats);
  handleAction(target('sofa'), p, c);
  expect(sent).toEqual([{ type: 'sit', seatId: 'sofa_seat_2' }]);
  expect(p.activity).toBe('idle');
});

it('sends nothing when all sofa seats are occupied', () => {
  const seats = new SeatRegistry();
  for (const seat of officeLayout.sofaSeats) seats.claim(seat.id, seat.id);
  const { p, c, sent } = setup({ x: -1.2, z: -1.4, heading: -Math.PI / 2 }, seats);
  handleAction(target('sofa'), p, c);
  expect(sent).toEqual([]);
});

it('does not request a sofa seat when the activity transition is rejected', () => {
  const { p, c, sent } = setup({ x: -1.2, z: -1.4, heading: -Math.PI / 2 });
  p.activity = 'drinking';
  expect(c.requestSeat(officeLayout.sofaSeats[0]!.id, 'sofa')).toBe(false);
  expect(sent).toEqual([]);
});

it('routes E at the coffee machine through the action hook', () => {
  const { c, onAction } = setup({ x: 2.35, z: -2.75, heading: Math.PI });
  c.press();
  expect(onAction).toHaveBeenCalledWith(target('coffee_machine'));
});

it('opening the cabinet returns local feedback and sends nothing', () => {
  const { p, c, sent } = setup({ x: 0, z: 0, heading: 0 });
  expect(handleAction(target('storage_cabinet'), p, c)).toEqual({ message: 'Cabinet opened' });
  expect(sent).toEqual([]);
  expect(p.activity).toBe('idle');
});

function frameLoop() {
  const player = new Player();
  const input = { forward: 0, right: 0, run: false };
  let frame = () => {};
  // Exercise the real game loop without creating a WebGL renderer or browser DOM.
  const game = {
    player,
    timer: { update() {}, getDelta: () => 0.1 },
    input: { read: () => input },
    controller: { currentPrompt: () => null },
    rig: { yaw: 0, update() {}, distanceToFocus: 4 },
    identity: { name: 'Test' },
    nameplate: { set() {} },
    remotes: { update() {} },
    renderer: { setAnimationLoop: (callback: () => void) => (frame = callback), render() {} },
    labelRenderer: { render() {} },
  };
  Game.prototype.start.call(game as unknown as Game);
  return { player, input, tick: () => frame() };
}

it.each(['drinking', 'waving'] as const)(
  '%s lasts until the server ends it; movement shows walking at once',
  (activity) => {
    const { player, input, tick } = frameLoop();
    const self = { ...player.state, lastSeq: 0, seatId: '' };
    player.applyServer({ ...self, activity });
    for (let i = 0; i < 60; i++) tick();
    expect(player.activity).toBe(activity);
    player.applyServer({ ...self, activity: 'idle' });
    tick();
    expect(player.activity).toBe('idle');
    player.applyServer({ ...self, activity });
    input.forward = 1;
    tick();
    expect(player.activity).toBe('walking');
  },
);
