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
