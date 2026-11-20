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
  SERVER_MSG,
  officeLayout,
  readTv,
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

describe('OfficeRoom coffee routine (REQ-INT-003)', () => {
  const machine = officeLayout.interactables.find((i) => i.type === 'coffee_machine')!;

  /** Test setup only: puts an employee at the coffee machine on the server. */
  function placeAtMachine(code: string, sessionId: string): void {
    const e = local(code).state.employees.get(sessionId)!;
    e.x = machine.interactionPoint[0];
    e.z = machine.interactionPoint[2];
  }
  /** Test setup only: runs the activity timers as if their time were up (no 4 s waits). */
  function finishTimers(code: string): void {
    const room = local(code);
    room.sim.activity.expire(room.state.employees, Number.MAX_SAFE_INTEGER);
  }

  it('replicates brewing, item and sips to a second client; three sips empty the cup', async () => {
    const a = (await join('coffee-01')) as Room<OfficeState>;
    const b = (await join('coffee-01', { name: 'Bao' })) as Room<OfficeState>;
    const server = () => local('COFFEE-01').state.employees.get(a.sessionId)!;
    const seen = () => b.state.employees?.get(a.sessionId);
    await waitFor(() => seen() !== undefined);
    expect(seen()).toMatchObject({ item: '', sips: 0 });

    placeAtMachine('COFFEE-01', a.sessionId);
    a.send(MSG.intent, { type: 'brew' });
    await waitFor(() => seen()?.activity === 'brewing');
    expect(local('COFFEE-01').sim.activity.machineBusy).toBe(true);

    // A second employee at the busy machine is refused.
    placeAtMachine('COFFEE-01', b.sessionId);
    b.send(MSG.intent, { type: 'brew' });
    await new Promise((r) => setTimeout(r, 4 * (1000 / BALANCE.net.tickHz)));
    expect(local('COFFEE-01').state.employees.get(b.sessionId)!.activity).toBe('idle');

    finishTimers('COFFEE-01');
    await waitFor(() => seen()?.item === 'coffee');
    expect(seen()).toMatchObject({ activity: 'idle', item: 'coffee', sips: BALANCE.coffee.sips });

    for (const left of [2, 1, 0]) {
      a.send(MSG.intent, { type: 'drink' });
      await waitFor(() => server().activity === 'drinking');
      finishTimers('COFFEE-01');
      await waitFor(() => seen()?.sips === left && seen()?.activity === 'idle');
    }
    expect(seen()).toMatchObject({ item: '', sips: 0 });
  });

  it('frees the machine when the brewing client leaves', async () => {
    const a = (await join('coffee-02')) as Room<OfficeState>;
    const b = (await join('coffee-02', { name: 'Bao' })) as Room<OfficeState>;
    placeAtMachine('COFFEE-02', a.sessionId);
    placeAtMachine('COFFEE-02', b.sessionId);
    a.send(MSG.intent, { type: 'brew' });
    const employees = local('COFFEE-02').state.employees;
    await waitFor(() => employees.get(a.sessionId)?.activity === 'brewing');
    await a.leave(true);
    await waitFor(() => !local('COFFEE-02').sim.activity.machineBusy);
    b.send(MSG.intent, { type: 'brew' });
    await waitFor(() => employees.get(b.sessionId)?.activity === 'brewing');
  });
});

describe('OfficeRoom emotes (REQ-AVATAR-004)', () => {
  const DESK = 'ws_1_seat';
  const ws1 = officeLayout.workstations.find((w) => w.seat.id === DESK)!;
  /** Test setup only: ends running emotes as if their time were up (no multi-second waits). */
  function finishTimers(code: string): void {
    const room = local(code);
    room.sim.activity.expire(room.state.employees, Number.MAX_SAFE_INTEGER);
  }

  it('replicates a standing emote and its end to a second client; bad ids change nothing', async () => {
    const a = (await join('emote-01')) as Room<OfficeState>;
    const b = (await join('emote-01', { name: 'Bao' })) as Room<OfficeState>;
    const seen = () => b.state.employees?.get(a.sessionId);
    await waitFor(() => seen() !== undefined);
    expect(seen()).toMatchObject({ activity: 'idle', emote: '' });

    a.send(MSG.intent, { type: 'emote', emote: 'cry' });
    a.send(MSG.intent, { type: 'emote', emote: 'dance' });
    await waitFor(() => seen()?.emote === 'dance');
    expect(seen()).toMatchObject({ activity: 'idle', emote: 'dance' });

    finishTimers('EMOTE-01');
    await waitFor(() => seen()?.emote === '');
    expect(seen()!.activity).toBe('idle');
  });

  it('replicates a seated emote while working; the employee stays working on the seat', async () => {
    const a = (await join('emote-02')) as Room<OfficeState>;
    const b = (await join('emote-02', { name: 'Bao' })) as Room<OfficeState>;
    const server = local('EMOTE-02').state.employees.get(a.sessionId)!;
    server.x = ws1.interactionPoint[0];
    server.z = ws1.interactionPoint[2];
    const seen = () => b.state.employees?.get(a.sessionId);
    a.send(MSG.intent, { type: 'sit', seatId: DESK });
    a.send(MSG.intent, { type: 'toggleWork' });
    await waitFor(() => seen()?.activity === 'working');

    a.send(MSG.intent, { type: 'emote', emote: 'think' });
    await waitFor(() => seen()?.emote === 'think');
    expect(seen()).toMatchObject({ activity: 'working', seatId: DESK });

    finishTimers('EMOTE-02');
    await waitFor(() => seen()?.emote === '');
    expect(seen()).toMatchObject({ activity: 'working', seatId: DESK });
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

describe('OfficeRoom shared TV (REQ-TV-004, REQ-TV-005, REQ-NFR-005)', () => {
  const VIDEO = 'dQw4w9WgXcQ';
  const shippedNow = roomServices.now;
  let tvNow = 1_794_000_000_000;

  beforeEach(() => {
    tvNow += 60_000;
    roomServices.now = () => tvNow;
  });
  afterAll(() => {
    roomServices.now = shippedNow;
  });

  it('starts idle and replicates a load and play from A to B', async () => {
    const a = (await join('tv-01')) as Room<OfficeState>;
    const b = (await join('tv-01', { name: 'Bao' })) as Room<OfficeState>;
    await waitFor(() => b.state.tv !== undefined);
    expect(readTv(b.state.tv)).toMatchObject({ videoId: null, status: 'idle' });

    a.send(MSG.tv, { type: 'load', videoId: VIDEO });
    await waitFor(() => b.state.tv?.videoId === VIDEO);
    expect(readTv(b.state.tv)).toEqual({
      videoId: VIDEO,
      provider: 'youtube',
      status: 'playing',
      currentTime: 0,
      updatedAt: tvNow,
      controllerSessionId: a.sessionId,
    });

    a.send(MSG.tv, { type: 'pause' });
    await waitFor(() => b.state.tv?.status === 'paused');
    tvNow += 2000;
    a.send(MSG.tv, { type: 'play' });
    await waitFor(() => b.state.tv?.status === 'playing');
    expect(readTv(b.state.tv)).toMatchObject({
      status: 'playing',
      currentTime: 0,
      updatedAt: tvNow,
      controllerSessionId: a.sessionId,
    });
    // B can control too.
    b.send(MSG.tv, { type: 'seek', time: 12.5 });
    await waitFor(() => a.state.tv?.currentTime === 12.5);
    expect(a.state.tv.controllerSessionId).toBe(b.sessionId);
  });

  it('refuses the 6th command within 10 s with tv_rate_limited and ignores invalid ones', async () => {
    const a = (await join('tv-02')) as Room<OfficeState>;
    const notices: unknown[] = [];
    a.onMessage(SERVER_MSG.tvRateLimited, (n: unknown) => notices.push(n));
    const room = local('TV-02');

    a.send(MSG.tv, { type: 'seek', time: -1 });
    a.send(MSG.tv, { type: 'load', videoId: 'bad' });
    a.send(MSG.tv, { type: 'rewind' });
    a.send(MSG.tv, { type: 'load', videoId: VIDEO });
    await waitFor(() => room.state.tv.videoId === VIDEO);
    for (let i = 1; i <= 4; i++) a.send(MSG.tv, { type: 'seek', time: i });
    await waitFor(() => room.state.tv.currentTime === 4);
    const before = readTv(room.state.tv);

    tvNow += 9_999;
    a.send(MSG.tv, { type: 'stop' });
    await waitFor(() => notices.length === 1);
    expect(notices[0]).toEqual({ retryAfterMs: 1 });
    expect(readTv(room.state.tv)).toEqual(before);

    // Once the window slides past the first command, one more is allowed.
    tvNow += 1;
    a.send(MSG.tv, { type: 'stop' });
    await waitFor(() => room.state.tv.status === 'idle');
    expect(notices).toHaveLength(1);
  });

  it('answers tv_time with the server clock; invalid and over-budget requests get no reply (T-1567)', async () => {
    const a = (await join('tv-04')) as Room<OfficeState>;
    const replies: unknown[] = [];
    const notices: unknown[] = [];
    a.onMessage(SERVER_MSG.tvTime, (r: unknown) => replies.push(r));
    a.onMessage(SERVER_MSG.tvRateLimited, (n: unknown) => notices.push(n));

    a.send(MSG.tvTime, { id: -1 });
    a.send(MSG.tvTime, { id: 'x' });
    a.send(MSG.tvTime, {});
    a.send(MSG.tvTime, { id: 1 });
    await waitFor(() => replies.length === 1);
    expect(replies[0]).toEqual({ id: 1, serverNow: tvNow });

    for (let id = 2; id <= BALANCE.tv.timeRequestsPerWindow + 1; id++) {
      a.send(MSG.tvTime, { id });
    }
    await waitFor(() => replies.length === BALANCE.tv.timeRequestsPerWindow);
    // A TV command afterwards is answered normally: the budgets are separate.
    a.send(MSG.tv, { type: 'load', videoId: VIDEO });
    await waitFor(() => a.state.tv?.videoId === VIDEO);
    expect(replies.map((r) => (r as { id: number }).id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(notices).toEqual([]);

    // The window slides: one more sample is answered.
    tvNow += BALANCE.tv.rateLimitWindowSeconds * 1000;
    a.send(MSG.tvTime, { id: 99 });
    await waitFor(() => replies.length === BALANCE.tv.timeRequestsPerWindow + 1);
    expect(replies.at(-1)).toEqual({ id: 99, serverNow: tvNow });
  });

  it('keeps playback for others with controllerSessionId null when the controller leaves', async () => {
    const a = (await join('tv-03')) as Room<OfficeState>;
    const b = (await join('tv-03', { name: 'Bao' })) as Room<OfficeState>;
    a.send(MSG.tv, { type: 'load', videoId: VIDEO });
    await waitFor(() => b.state.tv?.controllerSessionId === a.sessionId);
    await a.leave(true);
    await waitFor(() => readTv(b.state.tv).controllerSessionId === null);
    expect(readTv(b.state.tv)).toMatchObject({ videoId: VIDEO, status: 'playing' });
  });
});

describe('OfficeRoom chat (REQ-CHAT-001, REQ-CHAT-002)', () => {
  const VIDEO = 'dQw4w9WgXcQ';
  const shippedNow = roomServices.now;
  const shippedTtl = roomServices.chatTtlSeconds;
  let chatNow = 1_795_000_000_000;
  let barrierId = 0;

  beforeEach(() => {
    chatNow += 600_000;
    roomServices.now = () => chatNow;
    roomServices.chatTtlSeconds = shippedTtl;
  });
  afterAll(() => {
    roomServices.now = shippedNow;
    roomServices.chatTtlSeconds = shippedTtl;
  });

  /** Waits until the server has handled every message this client sent before. */
  async function barrier(room: Room): Promise<void> {
    const id = ++barrierId;
    let answered = false;
    const off = room.onMessage(SERVER_MSG.tvTime, (r: { id: number }) => {
      if (r.id === id) answered = true;
    });
    room.send(MSG.tvTime, { id });
    await waitFor(() => answered);
    off();
  }

  async function settle(): Promise<void> {
    await new Promise((r) => setTimeout(r, 4 * (1000 / BALANCE.net.tickHz)));
  }

  it('ships a 60 s TTL', () => {
    expect(shippedTtl).toBe(BALANCE.chat.ttlSeconds);
    expect(BALANCE.chat.ttlSeconds).toBe(60);
  });

  it('appends a valid message with server fields; client B decodes it', async () => {
    const a = (await join('chat-01', { name: 'An' })) as Room<OfficeState>;
    const b = (await join('chat-01', { name: 'Bao' })) as Room<OfficeState>;
    a.send(MSG.chat, { text: '  hello\u0007 office  ', extra: 1 });
    await waitFor(() => b.state.chat?.length === 1);
    const seen = b.state.chat.at(0)!;
    expect({
      id: seen.id,
      sessionId: seen.sessionId,
      name: seen.name,
      text: seen.text,
      sentAt: seen.sentAt,
    }).toEqual({
      id: '1',
      sessionId: a.sessionId,
      name: 'An',
      text: 'hello office',
      sentAt: chatNow,
    });

    b.send(MSG.chat, { text: 'hi' });
    await waitFor(() => a.state.chat?.length === 2);
    expect(a.state.chat.at(1)!.id).toBe('2');
    expect(a.state.chat.at(1)!.name).toBe('Bao');
  });

  it('ignores invalid payloads and senders without an employee', async () => {
    const a = (await join('chat-02')) as Room<OfficeState>;
    const room = local('CHAT-02');
    const notices: unknown[] = [];
    a.onMessage(SERVER_MSG.chatRateLimited, (n: unknown) => notices.push(n));
    for (const raw of [
      null,
      'hi',
      {},
      { text: 5 },
      { text: '   ' },
      { text: '\u0000\u0001' },
      { text: 'x'.repeat(BALANCE.chat.maxLength + 1) },
    ]) {
      a.send(MSG.chat, raw);
    }
    await barrier(a);
    expect(room.state.chat.length).toBe(0);
    expect(notices).toEqual([]);

    // Test setup only: the session has no employee any more.
    room.state.employees.delete(a.sessionId);
    a.send(MSG.chat, { text: 'ghost' });
    await barrier(a);
    expect(room.state.chat.length).toBe(0);
  });

  it('refuses the 6th message within 10 s with chat_rate_limited, then allows one more', async () => {
    const a = (await join('chat-03')) as Room<OfficeState>;
    const room = local('CHAT-03');
    const notices: unknown[] = [];
    a.onMessage(SERVER_MSG.chatRateLimited, (n: unknown) => notices.push(n));
    for (let i = 1; i <= BALANCE.chat.rateLimitMessages; i++) a.send(MSG.chat, { text: `m${i}` });
    await waitFor(() => room.state.chat.length === 5);
    const before = room.state.chat.map((m) => m.id);

    chatNow += BALANCE.chat.rateLimitWindowSeconds * 1000 - 1;
    a.send(MSG.chat, { text: 'too many' });
    await waitFor(() => notices.length === 1);
    expect(notices[0]).toEqual({ retryAfterMs: 1 });
    expect(room.state.chat.map((m) => m.id)).toEqual(before);

    chatNow += 1;
    a.send(MSG.chat, { text: 'again' });
    await waitFor(() => room.state.chat.length === 6);
    expect(room.state.chat.at(5)!.text).toBe('again');
    expect(notices).toHaveLength(1);
  });

  it('keeps the chat budget separate from TV commands', async () => {
    const a = (await join('chat-04')) as Room<OfficeState>;
    const room = local('CHAT-04');
    const tvNotices: unknown[] = [];
    const chatNotices: unknown[] = [];
    a.onMessage(SERVER_MSG.tvRateLimited, (n: unknown) => tvNotices.push(n));
    a.onMessage(SERVER_MSG.chatRateLimited, (n: unknown) => chatNotices.push(n));

    // TV budget used up: chat still goes through.
    a.send(MSG.tv, { type: 'load', videoId: VIDEO });
    for (let i = 1; i <= BALANCE.tv.rateLimitCommands; i++)
      a.send(MSG.tv, { type: 'seek', time: i });
    await waitFor(() => tvNotices.length === 1);
    for (let i = 1; i <= BALANCE.chat.rateLimitMessages; i++) a.send(MSG.chat, { text: `m${i}` });
    await waitFor(() => room.state.chat.length === BALANCE.chat.rateLimitMessages);
    expect(chatNotices).toEqual([]);

    // Chat budget used up: once the TV window slides, TV commands go through again.
    a.send(MSG.chat, { text: 'over' });
    await waitFor(() => chatNotices.length === 1);
    chatNow += BALANCE.tv.rateLimitWindowSeconds * 1000;
    a.send(MSG.tv, { type: 'stop' });
    await waitFor(() => room.state.tv.status === 'idle');
    expect(tvNotices).toHaveLength(1);
  });

  it('keeps a message at 59.9 s and removes it at 60.05 s for every client', async () => {
    const a = (await join('chat-05')) as Room<OfficeState>;
    const b = (await join('chat-05', { name: 'Bao' })) as Room<OfficeState>;
    const room = local('CHAT-05');
    const sentAt = chatNow;
    a.send(MSG.chat, { text: 'short lived' });
    await waitFor(() => b.state.chat?.length === 1);

    chatNow = sentAt + 59_900;
    await settle();
    expect(room.state.chat.length).toBe(1);
    expect(b.state.chat.length).toBe(1);

    chatNow = sentAt + 60_050;
    await waitFor(() => room.state.chat.length === 0, 4 * (1000 / BALANCE.net.tickHz));
    await waitFor(() => b.state.chat.length === 0);
  });

  it('drops the oldest message when the 51st arrives', async () => {
    roomServices.chatTtlSeconds = 3600;
    const a = (await join('chat-06')) as Room<OfficeState>;
    const room = local('CHAT-06');
    const step = (BALANCE.chat.rateLimitWindowSeconds * 1000) / BALANCE.chat.rateLimitMessages;
    for (let i = 1; i <= BALANCE.chat.maxMessages + 1; i++) {
      a.send(MSG.chat, { text: `m${i}` });
      await barrier(a);
      chatNow += step;
    }
    expect(room.state.chat.length).toBe(BALANCE.chat.maxMessages);
    expect(room.state.chat.at(0)!.text).toBe('m2');
    expect(room.state.chat.at(-1)!.text).toBe(`m${BALANCE.chat.maxMessages + 1}`);
    expect(room.state.chat.at(-1)!.id).toBe(String(BALANCE.chat.maxMessages + 1));
  });

  it('keeps a sender’s messages after they leave', async () => {
    const a = (await join('chat-07')) as Room<OfficeState>;
    const b = (await join('chat-07', { name: 'Bao' })) as Room<OfficeState>;
    a.send(MSG.chat, { text: 'bye' });
    await waitFor(() => b.state.chat?.length === 1);
    await a.leave(true);
    await waitFor(() => local('CHAT-07').state.employees.size === 1);
    await settle();
    expect(b.state.chat.length).toBe(1);
    expect(b.state.chat.at(0)!.sessionId).toBe(a.sessionId);
  });

  it('gives a late joiner the live messages and removes them at the same moment', async () => {
    const a = (await join('chat-09')) as Room<OfficeState>;
    const sentAt = chatNow;
    a.send(MSG.chat, { text: 'before you came' });
    await waitFor(() => a.state.chat?.length === 1);
    chatNow = sentAt + 30_000;
    const late = (await join('chat-09', { name: 'Late' })) as Room<OfficeState>;
    await waitFor(() => late.state.chat?.length === 1);
    expect(late.state.chat.at(0)!.text).toBe('before you came');
    expect(late.state.chat.at(0)!.sentAt).toBe(sentAt);
    chatNow = sentAt + BALANCE.chat.ttlSeconds * 1000;
    await waitFor(() => late.state.chat.length === 0 && a.state.chat.length === 0);
  });

  it('uses the injected TTL', async () => {
    roomServices.chatTtlSeconds = 5;
    const a = (await join('chat-08')) as Room<OfficeState>;
    const room = local('CHAT-08');
    const sentAt = chatNow;
    a.send(MSG.chat, { text: 'quick' });
    await waitFor(() => room.state.chat.length === 1);
    chatNow = sentAt + 4_999;
    await settle();
    expect(room.state.chat.length).toBe(1);
    chatNow = sentAt + 5_000;
    await waitFor(() => room.state.chat.length === 0);
  });
});
