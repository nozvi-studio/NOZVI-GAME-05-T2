import { describe, expect, it } from 'vitest';
import { BALANCE, FIXED_DT, officeLayout, type InputMessage } from '@office/protocol';
import { OfficeSim, seatSpots, type ActivityBody } from '../src/sim/activity';

const colliders = officeLayout.colliders;
const spots = seatSpots();
const DESK = 'ws_1_seat';
const DESK_2 = 'ws_3_seat'; // shares the stand point of ws_1
const SOFA = 'sofa_seat_1';
const deskSpot = spots.get(DESK)!;
const sofaSpot = spots.get(SOFA)!;

function body(x: number, z: number, heading = 0): ActivityBody {
  return { x, z, heading, activity: 'idle', lastSeq: 0, seatId: '' };
}
/** A body standing on a seat's interaction point (in range of it). */
const near = (seatId: string) => {
  const [x, , z] = spots.get(seatId)!.standPoint;
  return body(x, z);
};
const coffee = officeLayout.interactables.find((i) => i.type === 'coffee_machine')!;
const water = officeLayout.interactables.find((i) => i.type === 'water_dispenser')!;

function setup(entries: Record<string, ActivityBody>) {
  const sim = new OfficeSim();
  const bodies = new Map(Object.entries(entries));
  for (const id of bodies.keys()) sim.add(id);
  let now = 0;
  return {
    sim,
    bodies,
    get: (id: string) => bodies.get(id)!,
    /** Runs one tick at `now`, then advances the controlled clock by one step. */
    tick: () => {
      sim.tick(bodies, colliders, now);
      now += 1000 * FIXED_DT;
    },
    at: (ms: number) => sim.tick(bodies, colliders, (now = ms)),
  };
}

const input = (seq: number, extra: Partial<InputMessage> = {}): InputMessage => ({
  seq,
  forward: 0,
  right: 0,
  run: false,
  yaw: 0,
  ...extra,
});

describe('seat layout', () => {
  it('resolves 8 desk seats and 2 sofa seats with their range targets', () => {
    expect([...spots.values()].filter((s) => s.kind === 'desk')).toHaveLength(8);
    expect([...spots.values()].filter((s) => s.kind === 'sofa')).toHaveLength(2);
    expect(deskSpot.target.type).toBe('chair');
    expect(sofaSpot.target.type).toBe('sofa');
  });
});

describe('sit (criteria 1 and 2)', () => {
  it('seats a nearby idle employee on the socket position and rotation', () => {
    const s = setup({ a: near(DESK) });
    expect(s.sim.intent('a', { type: 'sit', seatId: DESK })).toBe(true);
    s.tick();
    const a = s.get('a');
    expect(a).toMatchObject({ seatId: DESK, activity: 'sitting' });
    expect([a.x, a.z]).toEqual([deskSpot.position[0], deskSpot.position[2]]);
    expect(a.heading).toBeCloseTo((deskSpot.rotY * Math.PI) / 180);
    expect(s.sim.activity.seats.occupant(DESK)).toBe('a');
  });

  it('seats a sofa request with the resting activity', () => {
    const s = setup({ a: near(SOFA) });
    s.sim.intent('a', { type: 'sit', seatId: SOFA });
    s.tick();
    expect(s.get('a')).toMatchObject({ seatId: SOFA, activity: 'resting' });
  });

  it('gives a desk contested in the same tick to exactly one employee', () => {
    const s = setup({ a: near(DESK), b: near(DESK) });
    const before = { ...s.get('b') };
    s.sim.intent('a', { type: 'sit', seatId: DESK });
    s.sim.intent('b', { type: 'sit', seatId: DESK });
    s.tick();
    expect(s.get('a')).toMatchObject({ seatId: DESK, activity: 'sitting' });
    expect(s.get('b')).toEqual(before);
    expect(s.sim.activity.seats.occupant(DESK)).toBe('a');
    expect(s.sim.activity.seats.seatOf('b')).toBeNull();
  });

  it('ignores a sit from outside the interaction range', () => {
    const [x, , z] = officeLayout.spawn.position;
    const s = setup({ a: body(x, z) });
    const before = { ...s.get('a') };
    s.sim.intent('a', { type: 'sit', seatId: DESK });
    s.tick();
    expect(s.get('a')).toEqual(before);
    expect(s.sim.activity.seats.occupant(DESK)).toBeNull();
  });

  it('rejects an unknown seat id and malformed intents at the queue', () => {
    const s = setup({ a: near(DESK) });
    const before = { ...s.get('a') };
    expect(s.sim.intent('a', { type: 'sit', seatId: 'ws_99_seat' })).toBe(false);
    expect(s.sim.intent('a', { type: 'sit' })).toBe(false);
    expect(s.sim.intent('a', { type: 'teleport' })).toBe(false);
    expect(s.sim.intent('a', null)).toBe(false);
    expect(s.sim.intent('nobody', { type: 'wave' })).toBe(false);
    s.tick();
    expect(s.get('a')).toEqual(before);
  });

  it('ignores a sit while already seated', () => {
    const s = setup({ a: near(DESK) });
    s.sim.intent('a', { type: 'sit', seatId: DESK });
    s.tick();
    const seated = { ...s.get('a') };
    s.sim.intent('a', { type: 'sit', seatId: DESK_2 });
    s.tick();
    expect(s.get('a')).toEqual(seated);
    expect(s.sim.activity.seats.occupant(DESK_2)).toBeNull();
  });

  it('ignores a sit while drinking', () => {
    const [x, , z] = coffee.interactionPoint;
    const s = setup({ a: body(x, z) });
    s.sim.intent('a', { type: 'drink' });
    s.tick();
    // Move the drinking body next to the desk so only the activity rule can reject the sit.
    const a = s.get('a');
    a.x = deskSpot.standPoint[0];
    a.z = deskSpot.standPoint[2];
    s.sim.intent('a', { type: 'sit', seatId: DESK });
    s.tick();
    expect(s.get('a')).toMatchObject({ activity: 'drinking', seatId: '' });
  });

  it('judges a sit after the inputs the client sent before it', () => {
    // 2.05 m east of the stand point: out of range now, in range after one 0.1 m step west.
    const [px, , pz] = deskSpot.standPoint;
    const s = setup({ a: body(px + 2.05, pz) });
    expect(s.sim.input('a', input(1, { forward: 1, yaw: -Math.PI / 2 }))).toBe(true);
    s.sim.intent('a', { type: 'sit', seatId: DESK });
    s.tick();
    expect(s.get('a')).toMatchObject({ seatId: DESK, activity: 'sitting', lastSeq: 1 });
  });

  it('drops intents past the per-client queue cap', () => {
    const s = setup({ a: near(DESK) });
    s.sim.input('a', input(1));
    for (let i = 0; i < BALANCE.net.intentQueueMax; i++) {
      expect(s.sim.intent('a', { type: 'wave' })).toBe(true);
    }
    expect(s.sim.intent('a', { type: 'wave' })).toBe(false);
  });
});

describe('toggleWork (criterion 3)', () => {
  it('switches sitting and working for a desk occupant', () => {
    const s = setup({ a: near(DESK) });
    s.sim.intent('a', { type: 'sit', seatId: DESK });
    s.sim.intent('a', { type: 'toggleWork' });
    s.tick();
    expect(s.get('a').activity).toBe('working');
    s.sim.intent('a', { type: 'toggleWork' });
    s.tick();
    expect(s.get('a')).toMatchObject({ activity: 'sitting', seatId: DESK });
  });

  it('does nothing for a standing employee or a sofa occupant', () => {
    const s = setup({ a: near(DESK), b: near(SOFA) });
    s.sim.intent('a', { type: 'toggleWork' });
    s.sim.intent('b', { type: 'sit', seatId: SOFA });
    s.sim.intent('b', { type: 'toggleWork' });
    s.tick();
    expect(s.get('a').activity).toBe('idle');
    expect(s.get('b').activity).toBe('resting');
  });
});

describe('standing up (criterion 4)', () => {
  it('keeps the seated pose for a zero-axis input and only advances lastSeq', () => {
    const s = setup({ a: near(DESK) });
    s.sim.intent('a', { type: 'sit', seatId: DESK });
    s.tick();
    const seated = { ...s.get('a') };
    s.sim.input('a', input(1, { yaw: 1.3 }));
    s.tick();
    expect(s.get('a')).toEqual({ ...seated, lastSeq: 1 });
  });

  it('stands up at the interaction point, frees the seat and walks on movement input', () => {
    const s = setup({ a: near(DESK), b: near(DESK) });
    s.sim.intent('a', { type: 'sit', seatId: DESK });
    s.tick();
    s.sim.intent('a', { type: 'toggleWork' });
    s.tick();
    expect(s.get('a').activity).toBe('working');
    // yaw 0 walks +z, away from the desk row, along the aisle.
    s.sim.input('a', input(1, { forward: 1 }));
    s.tick();
    const a = s.get('a');
    expect(a).toMatchObject({ activity: 'walking', seatId: '', lastSeq: 1 });
    expect(a.x).toBeCloseTo(deskSpot.standPoint[0], 9);
    expect(a.z).toBeCloseTo(deskSpot.standPoint[2] + BALANCE.movement.walkSpeed * FIXED_DT, 9);
    expect(s.sim.activity.seats.occupant(DESK)).toBeNull();
    // The freed desk can be taken by someone else.
    s.sim.intent('b', { type: 'sit', seatId: DESK });
    s.tick();
    expect(s.get('b').seatId).toBe(DESK);
  });

  it('stands up to idle at the interaction point on a stand intent', () => {
    const s = setup({ a: near(SOFA) });
    s.sim.intent('a', { type: 'sit', seatId: SOFA });
    s.tick();
    s.sim.intent('a', { type: 'stand' });
    s.tick();
    const a = s.get('a');
    expect(a).toMatchObject({ activity: 'idle', seatId: '' });
    expect([a.x, a.z]).toEqual([sofaSpot.standPoint[0], sofaSpot.standPoint[2]]);
    expect(s.sim.activity.seats.occupant(SOFA)).toBeNull();
  });

  it('ignores stand while not seated', () => {
    const s = setup({ a: near(DESK) });
    const before = { ...s.get('a') };
    s.sim.intent('a', { type: 'stand' });
    s.tick();
    expect(s.get('a')).toEqual(before);
  });
});

describe('timed breaks and leaving (criterion 5)', () => {
  const drinkMs = BALANCE.activity.drinkSeconds * 1000;
  const waveMs = BALANCE.activity.waveSeconds * 1000;

  it.each([
    ['coffee machine', coffee],
    ['water dispenser', water],
  ])('drinking at the %s returns to idle after drinkSeconds', (_l, target) => {
    const [x, , z] = target.interactionPoint;
    const s = setup({ a: body(x, z) });
    s.sim.intent('a', { type: 'drink' });
    s.at(1000);
    expect(s.get('a').activity).toBe('drinking');
    s.at(1000 + drinkMs - 1);
    expect(s.get('a').activity).toBe('drinking');
    s.at(1000 + drinkMs);
    expect(s.get('a').activity).toBe('idle');
  });

  it('ignores drink away from the pantry', () => {
    const s = setup({ a: near(DESK) });
    s.sim.intent('a', { type: 'drink' });
    s.tick();
    expect(s.get('a').activity).toBe('idle');
  });

  it('waving returns to idle after waveSeconds', () => {
    const s = setup({ a: near(DESK) });
    s.sim.intent('a', { type: 'wave' });
    s.at(0);
    expect(s.get('a').activity).toBe('waving');
    s.at(waveMs - 1);
    expect(s.get('a').activity).toBe('waving');
    s.at(waveMs);
    expect(s.get('a').activity).toBe('idle');
  });

  it('cancels a break on movement and a stale timer never ends a later break early', () => {
    const [x, , z] = coffee.interactionPoint;
    const s = setup({ a: body(x, z) });
    s.sim.intent('a', { type: 'drink' });
    s.at(0);
    s.sim.input('a', input(1, { forward: 1 }));
    s.at(50);
    expect(s.get('a').activity).toBe('walking');
    s.sim.input('a', input(2));
    // Start the wave so the cancelled drink's end time falls inside it.
    const waveAt = drinkMs - waveMs / 2;
    s.sim.intent('a', { type: 'wave' });
    s.at(waveAt);
    expect(s.get('a').activity).toBe('waving');
    s.at(drinkMs);
    expect(s.get('a').activity).toBe('waving');
    s.at(waveAt + waveMs);
    expect(s.get('a').activity).toBe('idle');
  });

  it('ignores drink and wave while seated', () => {
    const s = setup({ a: near(DESK) });
    s.sim.intent('a', { type: 'sit', seatId: DESK });
    s.sim.intent('a', { type: 'wave' });
    s.tick();
    expect(s.get('a').activity).toBe('sitting');
  });

  it('frees the seat when a client leaves', () => {
    const s = setup({ a: near(DESK), b: near(DESK) });
    s.sim.intent('a', { type: 'sit', seatId: DESK });
    s.tick();
    s.sim.remove('a');
    s.bodies.delete('a');
    expect(s.sim.activity.seats.occupant(DESK)).toBeNull();
    s.sim.intent('b', { type: 'sit', seatId: DESK });
    s.tick();
    expect(s.get('b').seatId).toBe(DESK);
  });
});
