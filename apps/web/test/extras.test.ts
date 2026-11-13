import { expect, it, vi } from 'vitest';
import {
  BALANCE,
  SeatRegistry,
  officeLayout,
  type Activity,
  type PlayerState,
  type Vec3,
} from '@office/protocol';
import { InteractionController } from '../src/game/interaction/InteractionController';
import { handleAction } from '../src/game/interaction/extras';
import { Game } from '../src/game/Game';
import { Player } from '../src/game/player';

function fake(state: PlayerState) {
  return {
    state,
    activity: 'idle' as Activity,
    setActivity(a: Activity) {
      this.activity = a;
    },
    seatAt(s: { position: Vec3; rotY: number }) {
      this.state = { x: s.position[0], z: s.position[2], heading: (s.rotY * Math.PI) / 180 };
    },
    standAt(p: Vec3) {
      this.state = { ...this.state, x: p[0], z: p[2] };
    },
  };
}

it.each(['coffee_machine', 'water_dispenser'])('%s starts a timed break', (type) => {
  const p = fake({ x: 2.35, z: -2.75, heading: Math.PI });
  const t = officeLayout.interactables.find((i) => i.type === type)!;
  const c = new InteractionController(p, new SeatRegistry(), 'me', { onExit: vi.fn() });
  const r = handleAction(t, p, c);
  expect(p.activity).toBe('drinking');
  expect(r.timer).toBeCloseTo(BALANCE.activity.drinkSeconds);
});

it.each(['waving', 'drinking', 'resting'] as const)(
  'a rejected drink during %s does not replace the action timer',
  (activity) => {
    const p = fake({ x: 2.35, z: -2.75, heading: Math.PI });
    p.activity = activity;
    const c = new InteractionController(p, new SeatRegistry(), 'me', { onExit: vi.fn() });
    const r = handleAction(
      officeLayout.interactables.find((i) => i.id === 'coffee_machine')!,
      p,
      c,
    );
    expect(r.timer).toBe(0);
    expect(p.activity).toBe(activity);
  },
);

it('sofa seats the player on the first free sofa seat and releases it on movement', () => {
  const p = fake({ x: -1.2, z: -1.4, heading: -Math.PI / 2 });
  const seats = new SeatRegistry();
  seats.claim('sofa_seat_1', 'other');
  const c = new InteractionController(p, seats, 'me', { onExit: vi.fn() });
  handleAction(
    officeLayout.interactables.find((i) => i.id === 'sofa')!,
    p,
    c,
  );
  expect(p.activity).toBe('resting');
  expect(seats.seatOf('me')).toBe('sofa_seat_2');
  const seat = officeLayout.sofaSeats[1]!;
  expect(p.state.heading).toBe((seat.rotY * Math.PI) / 180);
  c.onMoveIntent();
  expect(p.activity).toBe('idle');
  expect(seats.seatOf('me')).toBeNull();
  expect([p.state.x, p.state.z]).toEqual([seat.interactionPoint[0], seat.interactionPoint[2]]);
});

it('leaves the player standing when all sofa seats are occupied', () => {
  const p = fake({ x: -1.2, z: -1.4, heading: -Math.PI / 2 });
  const seats = new SeatRegistry();
  for (const seat of officeLayout.sofaSeats) seats.claim(seat.id, seat.id);
  const c = new InteractionController(p, seats, 'me', { onExit: vi.fn() });
  handleAction(
    officeLayout.interactables.find((i) => i.id === 'sofa')!,
    p,
    c,
  );
  expect(p.activity).toBe('idle');
  expect(seats.seatOf('me')).toBeNull();
});

it('does not claim a sofa seat when the activity transition is rejected', () => {
  const p = fake({ x: -1.2, z: -1.4, heading: -Math.PI / 2 });
  p.activity = 'drinking';
  const seats = new SeatRegistry();
  const c = new InteractionController(p, seats, 'me', { onExit: vi.fn() });
  expect(c.sitOn(officeLayout.sofaSeats[0]!, 'sofa')).toBe(false);
  expect(seats.seatOf('me')).toBeNull();
  expect(p.activity).toBe('drinking');
});

it('routes E at the coffee machine through the action hook', () => {
  const p = fake({ x: 2.35, z: -2.75, heading: Math.PI });
  const onAction = vi.fn();
  const c = new InteractionController(p, new SeatRegistry(), 'me', { onExit: vi.fn(), onAction });
  c.press();
  expect(onAction).toHaveBeenCalledWith(
    officeLayout.interactables.find((i) => i.id === 'coffee_machine'),
  );
});

it('opening the cabinet returns feedback without changing activity', () => {
  const p = fake({ x: 0, z: 0, heading: 0 });
  const c = new InteractionController(p, new SeatRegistry(), 'me', { onExit: vi.fn() });
  const r = handleAction(
    officeLayout.interactables.find((i) => i.type === 'storage_cabinet')!,
    p,
    c,
  );
  expect(r).toEqual({ timer: 0, message: 'Cabinet opened' });
  expect(p.activity).toBe('idle');
});

function frameLoop(activity: Activity, duration: number) {
  const player = new Player();
  player.setActivity(activity);
  const input = { forward: 0, right: 0, run: false };
  let frame = () => {};
  // Exercise the real game loop without creating a WebGL renderer or browser DOM.
  const game = {
    player,
    actionTimer: duration,
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

it.each([
  ['drinking', BALANCE.activity.drinkSeconds],
  ['waving', BALANCE.activity.waveSeconds],
] as const)('finishes %s after its configured duration', (activity, duration) => {
  const { player, tick } = frameLoop(activity, duration);
  for (let elapsed = 0.1; elapsed < duration - 0.05; elapsed += 0.1) tick();
  expect(player.activity).toBe(activity);
  tick();
  tick();
  expect(player.activity).toBe('idle');
});

it.each([
  ['drinking', BALANCE.activity.drinkSeconds],
  ['waving', BALANCE.activity.waveSeconds],
] as const)('movement cancels %s and expiry does not interrupt walking', (activity, duration) => {
  const { player, input, tick } = frameLoop(activity, duration);
  input.forward = 1;
  tick();
  expect(player.activity).toBe('walking');
  for (let elapsed = 0; elapsed < duration + 0.1; elapsed += 0.1) tick();
  expect(player.activity).toBe('walking');
});
