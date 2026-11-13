import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { Room as ServerRoom, matchMaker } from '@colyseus/core';
import {
  JOIN_ERROR_STATUS,
  MSG,
  OFFICE_ROOM,
  PROTOCOL_VERSION,
  BALANCE,
  officeLayout,
  type EmployeeState,
  type OfficeState,
} from '@office/protocol';
import { createApp } from '../src/app';
import { JoinRateLimiter } from '../src/joinRateLimiter';
import { roomServices, type OfficeRoom } from '../src/rooms/OfficeRoom';

const { game, http } = createApp({ allowedOrigins: [] });
let endpoint = '';
let clock = 0;
const joined: Room[] = [];

beforeAll(async () => {
  await game.listen(0);
  endpoint = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await game.gracefullyShutdown(false);
});
beforeEach(async () => {
  await Promise.all(joined.splice(0).map((r) => r.leave(true).catch(() => undefined)));
  clock += 120_000;
  roomServices.joinLimiter = new JoinRateLimiter(1000, () => clock);
});

const opts = (officeCode: string, extra: Record<string, unknown> = {}) => ({
  name: 'An',
  officeCode,
  avatarId: 'men_suit',
  protocolVersion: PROTOCOL_VERSION,
  ...extra,
});

async function join(officeCode: string, extra: Record<string, unknown> = {}): Promise<Room> {
  const room = await new Client(endpoint).joinOrCreate(OFFICE_ROOM, opts(officeCode, extra));
  joined.push(room);
  return room;
}

async function joinError(officeCode: string, extra: Record<string, unknown> = {}) {
  try {
    await join(officeCode, extra);
  } catch (e) {
    return e as { code: number; message: string };
  }
  throw new Error('join unexpectedly succeeded');
}

/** In-process room instance for a normalized office code. */
function local(code: string): OfficeRoom {
  const room = matchMaker.getLocalRoomById(code) as OfficeRoom | undefined;
  if (!room) throw new Error(`no room ${code}`);
  return room;
}

async function roomsFor(code: string) {
  return (await matchMaker.query({ name: OFFICE_ROOM })).filter((r) => r.roomId === code);
}

describe('OfficeRoom', () => {
  it('puts codes that normalize equal in one room and other codes elsewhere', async () => {
    const a = await join('test-01');
    const b = await join('TEST-01');
    const c = await join('other-02');
    expect(a.roomId).toBe('TEST-01');
    expect(b.roomId).toBe('TEST-01');
    expect(c.roomId).toBe('OTHER-02');
    const room = local('TEST-01');
    expect(room.state.employees.size).toBe(2);
  });

  it('creates the employee at the entrance spawn with the joined identity', async () => {
    const a = await join('spawn-01', { name: '  Bình ' });
    const room = local('SPAWN-01');
    const e = room.state.employees.get(a.sessionId)!;
    expect(e.name).toBe('Bình');
    expect(e.avatarId).toBe('men_suit');
    expect([e.x, e.z]).toEqual([-1.2, -3.24]);
    expect(e.heading).toBeCloseTo((270 * Math.PI) / 180);
    expect(e.activity).toBe('idle');
  });

  it('rejects the 11th join with room_full and keeps one room for the code', async () => {
    for (let i = 0; i < BALANCE.net.maxClients; i++) await join('full-01', { name: `P${i}` });
    const err = await joinError('full-01', { name: 'Late' });
    // Thrown from onCreate, so the matchmaker HTTP route keeps the message but not the code.
    expect(err.message).toBe('room_full');
    expect(await roomsFor('FULL-01')).toHaveLength(1);
    expect(local('FULL-01').state.employees.size).toBe(10);
  });

  it.each([
    ['invalid name', { name: '<b>x</b>' }, 'invalid_identity'],
    ['unknown avatar', { avatarId: 'robot' }, 'invalid_identity'],
    ['wrong protocol version', { protocolVersion: 1 }, 'version_mismatch'],
  ] as const)('rejects %s with a typed error and adds nothing', async (_l, extra, code) => {
    await join('valid-01');
    const err = await joinError('valid-01', extra);
    expect(err.message).toBe(code);
    expect(err.code).toBe(JOIN_ERROR_STATUS[code]);
    expect(local('VALID-01').state.employees.size).toBe(1);
  });

  it('rejects an invalid office code without creating a room', async () => {
    const before = (await matchMaker.query({ name: OFFICE_ROOM })).length;
    const err = await joinError('a b');
    expect(err.message).toBe('invalid_identity');
    expect((await matchMaker.query({ name: OFFICE_ROOM })).length).toBe(before);
  });

  it('rejects the 11th join from one address within a minute with rate_limited', async () => {
    roomServices.joinLimiter = new JoinRateLimiter(BALANCE.net.joinsPerMinutePerIp, () => clock);
    // Leave after each join so capacity never interferes.
    for (let i = 0; i < BALANCE.net.joinsPerMinutePerIp; i++) {
      const r = await join('rate-01');
      await r.leave(true);
    }
    const err = await joinError('rate-01');
    expect(err.message).toBe('rate_limited');
    clock += 60_000;
    await expect(join('rate-01')).resolves.toBeDefined();
  });

  it('removes the employee on leave', async () => {
    const a = await join('leave-01');
    await join('leave-01');
    await a.leave(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(local('LEAVE-01').state.employees.size).toBe(1);
  });

  it('keeps GET /health on the same port', async () => {
    const res = await fetch(`${endpoint}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('OfficeRoom movement', () => {
  it('runs the movement loop on a 50 ms timestep', async () => {
    const spy = vi.spyOn(ServerRoom.prototype, 'setTimestep');
    try {
      await join('tick-01');
      expect(spy).toHaveBeenCalledWith(expect.any(Function), 1000 / BALANCE.net.tickHz);
      expect(1000 / BALANCE.net.tickHz).toBe(50);
    } finally {
      spy.mockRestore();
    }
  });

  it('replicates the position, lastSeq and activity produced by client inputs', async () => {
    const a = (await join('move-01')) as Room<OfficeState>;
    const b = (await join('move-01', { name: 'Bao' })) as Room<OfficeState>;
    const seen = (room: Room<OfficeState>): EmployeeState | undefined =>
      room.state?.employees?.get(a.sessionId);
    await waitFor(() => seen(b) !== undefined);
    const startZ = seen(b)!.z;
    // yaw 0 walks +z from the entrance spawn.
    for (let seq = 1; seq <= 5; seq++) {
      a.send(MSG.input, { seq, forward: 1, right: 0, run: false, yaw: 0 });
    }
    await waitFor(() => seen(b)?.lastSeq === 5);
    const e = seen(b)!;
    expect(e.z).toBeCloseTo(startZ + 5 * BALANCE.movement.walkSpeed * (1 / BALANCE.net.tickHz), 9);
    expect(e.activity).toBe('walking');
    expect(local('MOVE-01').state.employees.get(b.sessionId)!.lastSeq).toBe(0);

    // A malformed input and a replayed seq change nothing.
    a.send(MSG.input, { seq: 6, forward: Number.NaN, right: 0, run: false, yaw: 0 });
    a.send(MSG.input, { seq: 5, forward: 1, right: 0, run: false, yaw: 0 });
    a.send(MSG.input, { seq: 7, forward: 0, right: 0, run: false, yaw: 0 });
    await waitFor(() => seen(b)?.lastSeq === 7);
    expect(seen(b)!.z).toBe(e.z);
    expect(seen(b)!.activity).toBe('idle');
  });
});

describe('OfficeRoom activity and seats', () => {
  const DESK = 'ws_1_seat';
  const ws1 = officeLayout.workstations.find((w) => w.seat.id === DESK)!;

  /** Test setup only: puts an employee next to the ws_1 desk on the server. */
  function placeAtDesk(code: string, sessionId: string): void {
    const e = local(code).state.employees.get(sessionId)!;
    e.x = ws1.interactionPoint[0];
    e.z = ws1.interactionPoint[2];
  }

  async function settle(): Promise<void> {
    await new Promise((r) => setTimeout(r, 4 * (1000 / BALANCE.net.tickHz)));
  }

  it('gives a contested desk to exactly one of two clients and frees it on leave', async () => {
    const a = (await join('seat-01')) as Room<OfficeState>;
    const b = (await join('seat-01', { name: 'Bao' })) as Room<OfficeState>;
    placeAtDesk('SEAT-01', a.sessionId);
    placeAtDesk('SEAT-01', b.sessionId);
    a.send(MSG.intent, { type: 'sit', seatId: DESK });
    b.send(MSG.intent, { type: 'sit', seatId: DESK });
    const employees = local('SEAT-01').state.employees;
    await waitFor(() => [...employees.values()].some((e) => e.seatId === DESK));
    await settle();
    const seated = [...employees.values()].filter((e) => e.seatId === DESK);
    expect(seated).toHaveLength(1);
    expect(seated[0]!.activity).toBe('sitting');
    const [winner, loser] = employees.get(a.sessionId)!.seatId === DESK ? [a, b] : [b, a];
    expect(employees.get(loser.sessionId)).toMatchObject({ seatId: '', activity: 'idle' });

    // The other client sees the seat and activity replicated.
    await waitFor(() => loser.state.employees?.get(winner.sessionId)?.seatId === DESK);

    // toggleWork from the occupant works; from the loser it changes nothing.
    winner.send(MSG.intent, { type: 'toggleWork' });
    loser.send(MSG.intent, { type: 'toggleWork' });
    await waitFor(() => employees.get(winner.sessionId)?.activity === 'working');
    await settle();
    expect(employees.get(loser.sessionId)!.activity).toBe('idle');

    // Leaving frees the desk for the other client.
    await winner.leave(true);
    loser.send(MSG.intent, { type: 'sit', seatId: DESK });
    await waitFor(() => employees.get(loser.sessionId)?.seatId === DESK);
  });

  it('stands a seated employee up when a movement input arrives', async () => {
    const a = (await join('stand-01')) as Room<OfficeState>;
    placeAtDesk('STAND-01', a.sessionId);
    a.send(MSG.intent, { type: 'sit', seatId: DESK });
    const e = () => local('STAND-01').state.employees.get(a.sessionId)!;
    await waitFor(() => e().seatId === DESK);
    a.send(MSG.input, { seq: 1, forward: 1, right: 0, run: false, yaw: 0 });
    await waitFor(() => e().lastSeq === 1);
    expect(e()).toMatchObject({ seatId: '', activity: 'walking' });
    expect(e().x).toBeCloseTo(ws1.interactionPoint[0], 9);
    expect(local('STAND-01').sim.activity.seats.occupant(DESK)).toBeNull();
  });

  it('ignores a sit from outside the interaction range or for an unknown seat', async () => {
    const a = (await join('far-01')) as Room<OfficeState>;
    a.send(MSG.intent, { type: 'sit', seatId: DESK });
    a.send(MSG.intent, { type: 'sit', seatId: 'nope' });
    await settle();
    expect(local('FAR-01').state.employees.get(a.sessionId)).toMatchObject({
      seatId: '',
      activity: 'idle',
    });
    expect(local('FAR-01').sim.activity.seats.occupant(DESK)).toBeNull();
  });
});

describe('OfficeRoom disconnect and reconnect', () => {
  const DESK = 'ws_1_seat';
  const ws1 = officeLayout.workstations.find((w) => w.seat.id === DESK)!;
  const shipped = roomServices.reconnectSeconds;

  afterAll(() => {
    roomServices.reconnectSeconds = shipped;
  });

  /** Closes the socket without consent; the SDK's own auto-reconnect is switched off. */
  async function drop(room: Room): Promise<void> {
    room.reconnection.enabled = false;
    await room.leave(false);
  }

  async function seatAt(code: string, room: Room<OfficeState>): Promise<void> {
    const e = local(code).state.employees.get(room.sessionId)!;
    e.x = ws1.interactionPoint[0];
    e.z = ws1.interactionPoint[2];
    room.send(MSG.intent, { type: 'sit', seatId: DESK });
    await waitFor(() => e.seatId === DESK);
  }

  async function reconnect(token: string): Promise<Room<OfficeState>> {
    const room = (await new Client(endpoint).reconnect(token)) as Room<OfficeState>;
    joined.push(room);
    return room;
  }

  it('ships a 20 s window', () => {
    expect(shipped).toBe(BALANCE.net.reconnectSeconds);
    expect(BALANCE.net.reconnectSeconds).toBe(20);
  });

  it('holds a dropped employee and its seat, then restores the same session with full state', async () => {
    roomServices.reconnectSeconds = 5;
    const a = (await join('drop-01')) as Room<OfficeState>;
    const b = (await join('drop-01', { name: 'Bao' })) as Room<OfficeState>;
    await seatAt('DROP-01', a);
    const room = local('DROP-01');
    const held = room.state.employees.get(a.sessionId)!;
    const token = a.reconnectionToken;

    // Dropped within the first seconds of the room: the SDK would refuse to auto-reconnect.
    await drop(a);
    await waitFor(() => b.state.employees?.get(a.sessionId)?.connected === false);
    expect(room.state.employees.size).toBe(2);
    expect(held).toMatchObject({ seatId: DESK, activity: 'sitting', connected: false });
    expect(room.sim.activity.seats.occupant(DESK)).toBe(a.sessionId);

    const back = await reconnect(token);
    expect(back.sessionId).toBe(a.sessionId);
    await waitFor(() => back.state.employees?.get(b.sessionId) !== undefined);
    expect(back.state.employees.size).toBe(2);
    expect(back.state.employees.get(a.sessionId)).toMatchObject({
      seatId: DESK,
      activity: 'sitting',
      connected: true,
      x: held.x,
      z: held.z,
    });
    await waitFor(() => b.state.employees?.get(a.sessionId)?.connected === true);
    expect(room.state.employees.size).toBe(2);

    // Input seqs keep counting after the reconnect.
    back.send(MSG.input, { seq: held.lastSeq + 1, forward: 1, right: 0, run: false, yaw: 0 });
    await waitFor(() => held.lastSeq === 1 && held.activity === 'walking');
    expect(room.sim.activity.seats.occupant(DESK)).toBeNull();
  });

  it('discards inputs queued before the drop so the held avatar stands still', async () => {
    const a = (await join('still-01')) as Room<OfficeState>;
    const room = local('STILL-01');
    room.sim.input(a.sessionId, { seq: 1, forward: 1, right: 0, run: false, yaw: 0 });
    room.sim.input(a.sessionId, { seq: 2, forward: 1, right: 0, run: false, yaw: 0 });
    room.sim.suspend(a.sessionId, 0);
    expect(room.sim.movement.queued(a.sessionId)).toBe(0);
    // A later seq is accepted again after the reconnect.
    expect(room.sim.input(a.sessionId, { seq: 3, forward: 0, right: 0, run: false, yaw: 0 })).toBe(
      true,
    );
  });

  it('removes the employee, its list entry and its seat when the window expires', async () => {
    roomServices.reconnectSeconds = 0.3;
    const a = (await join('expire-01')) as Room<OfficeState>;
    const b = (await join('expire-01', { name: 'Bao' })) as Room<OfficeState>;
    await seatAt('EXPIRE-01', a);
    const room = local('EXPIRE-01');
    const token = a.reconnectionToken;
    await drop(a);
    await waitFor(() => room.state.employees.get(a.sessionId)?.connected === false);
    await waitFor(() => !room.state.employees.has(a.sessionId), 3000);
    await waitFor(() => b.state.employees?.get(a.sessionId) === undefined);
    expect(room.sim.activity.seats.occupant(DESK)).toBeNull();
    await expect(reconnect(token)).rejects.toBeDefined();
    expect(room.state.employees.size).toBe(1);
  });

  it('removes the employee and frees its seat at once on a consented leave', async () => {
    roomServices.reconnectSeconds = 20;
    const a = (await join('bye-01')) as Room<OfficeState>;
    const b = (await join('bye-01', { name: 'Bao' })) as Room<OfficeState>;
    await seatAt('BYE-01', a);
    const room = local('BYE-01');
    await a.leave(true);
    await waitFor(() => !room.state.employees.has(a.sessionId), 500);
    expect(room.sim.activity.seats.occupant(DESK)).toBeNull();
    await waitFor(() => b.state.employees?.get(a.sessionId) === undefined, 500);
  });
});
