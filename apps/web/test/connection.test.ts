import { describe, expect, it, vi } from 'vitest';
import { MatchMakeError, ServerError } from '@colyseus/sdk';
import { OFFICE_ROOM, PROTOCOL_VERSION } from '@office/protocol';
import {
  Connection,
  ConnectionError,
  DEFAULT_SERVER_URL,
  serverUrl,
  toConnectionError,
  type ConnectionStatus,
  type JoinClient,
  type OfficeRoomHandle,
} from '../src/net';

const identity = { name: 'An', officeCode: 'TEST-01', avatarId: 'men_suit' } as const;

function fakeRoom() {
  let leaveCb: ((code: number) => void) | undefined;
  const room = {
    leave: vi.fn(async () => 1000),
    onLeave: (cb: (code: number) => void) => {
      leaveCb = cb;
    },
    drop: (code = 1006) => leaveCb?.(code),
  };
  return room as typeof room & OfficeRoomHandle;
}

function setup(joinOrCreate: JoinClient['joinOrCreate'], timeoutMs = 1000) {
  const client = { joinOrCreate: vi.fn(joinOrCreate) };
  const connection = new Connection('http://test', () => client, timeoutMs);
  const statuses: ConnectionStatus[] = [];
  connection.onStatus((s) => statuses.push(s));
  return { client, connection, statuses };
}

describe('toConnectionError', () => {
  it.each(['room_full', 'invalid_identity', 'version_mismatch', 'rate_limited'] as const)(
    'maps a %s rejection by message, whatever the numeric code',
    (code) => {
      expect(toConnectionError(new MatchMakeError(code, 4101)).code).toBe(code);
      expect(toConnectionError(new MatchMakeError(code, 500)).code).toBe(code);
    },
  );

  it('maps network failures to unreachable', () => {
    // Node fetch: the code is the errno string; browsers: a TypeError with no code.
    expect(
      toConnectionError(new MatchMakeError('fetch failed', 'ECONNREFUSED' as never)).code,
    ).toBe('unreachable');
    expect(toConnectionError(new MatchMakeError('Failed to fetch', undefined as never)).code).toBe(
      'unreachable',
    );
    expect(toConnectionError(new TypeError('Failed to fetch')).code).toBe('unreachable');
    expect(toConnectionError(new ServerError(1006, 'abnormal closure')).code).toBe('unreachable');
    expect(toConnectionError(new MatchMakeError('Bad Gateway', 502)).code).toBe('unreachable');
  });

  it('maps anything else to unknown', () => {
    expect(toConnectionError(new MatchMakeError('boom', 500)).code).toBe('unknown');
    expect(toConnectionError('nope').code).toBe('unknown');
    expect(toConnectionError(null).code).toBe('unknown');
  });

  it('passes a ConnectionError through', () => {
    const err = new ConnectionError('room_full');
    expect(toConnectionError(err)).toBe(err);
  });
});

describe('serverUrl', () => {
  it('uses VITE_SERVER_URL when set and the local default otherwise', () => {
    expect(serverUrl({ VITE_SERVER_URL: 'https://office.example' })).toBe('https://office.example');
    expect(serverUrl({ VITE_SERVER_URL: '  ' })).toBe(DEFAULT_SERVER_URL);
    expect(serverUrl({})).toBe(DEFAULT_SERVER_URL);
  });
});

describe('Connection', () => {
  it('goes idle → connecting → connected and sends the protocol version', async () => {
    const room = fakeRoom();
    const { client, connection, statuses } = setup(async () => room);
    expect(connection.status).toBe('idle');
    const joined = connection.join(identity);
    expect(connection.status).toBe('connecting');
    await expect(joined).resolves.toBe(room);
    expect(connection.status).toBe('connected');
    expect(connection.room).toBe(room);
    expect(statuses).toEqual(['connecting', 'connected']);
    expect(client.joinOrCreate).toHaveBeenCalledWith(
      OFFICE_ROOM,
      { ...identity, protocolVersion: PROTOCOL_VERSION },
      expect.anything(),
    );
  });

  it('goes to error with a typed code on rejection, and a retry can succeed', async () => {
    const room = fakeRoom();
    let fail = true;
    const { connection, statuses } = setup(async () => {
      if (fail) throw new MatchMakeError('room_full', 500);
      return room;
    });
    await expect(connection.join(identity)).rejects.toMatchObject({ code: 'room_full' });
    expect(connection.status).toBe('error');
    expect(connection.error?.code).toBe('room_full');
    expect(connection.room).toBeNull();
    fail = false;
    await connection.join(identity);
    expect(connection.status).toBe('connected');
    expect(connection.error).toBeNull();
    expect(statuses).toEqual(['connecting', 'error', 'connecting', 'connected']);
  });

  it('leave() is consented and returns to idle', async () => {
    const room = fakeRoom();
    const { connection, statuses } = setup(async () => room);
    await connection.join(identity);
    await connection.leave();
    expect(room.leave).toHaveBeenCalledWith(true);
    expect(connection.status).toBe('idle');
    expect(connection.room).toBeNull();
    // The room's own leave event after a consented leave does not flag an error.
    room.drop(1000);
    expect(statuses).toEqual(['connecting', 'connected', 'idle']);
  });

  it('reports an unexpected room leave as an unreachable error', async () => {
    const room = fakeRoom();
    const { connection } = setup(async () => room);
    await connection.join(identity);
    room.drop();
    expect(connection.status).toBe('error');
    expect(connection.error?.code).toBe('unreachable');
    expect(connection.room).toBeNull();
  });

  it('times out as unreachable and leaves a room that arrives late', async () => {
    vi.useFakeTimers();
    try {
      const room = fakeRoom();
      let resolve!: (r: OfficeRoomHandle) => void;
      const { connection } = setup(() => new Promise((r) => (resolve = r)), 500);
      const joined = connection.join(identity);
      const assertion = expect(joined).rejects.toMatchObject({ code: 'unreachable' });
      await vi.advanceTimersByTimeAsync(500);
      await assertion;
      expect(connection.status).toBe('error');
      resolve(room);
      await vi.advanceTimersByTimeAsync(0);
      expect(room.leave).toHaveBeenCalledWith(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leave() during connecting drops the late room and stays idle', async () => {
    const room = fakeRoom();
    let resolve!: (r: OfficeRoomHandle) => void;
    const { connection } = setup(() => new Promise((r) => (resolve = r)));
    const joined = connection.join(identity);
    await connection.leave();
    resolve(room);
    await expect(joined).rejects.toBeInstanceOf(ConnectionError);
    expect(room.leave).toHaveBeenCalledWith(true);
    expect(connection.status).toBe('idle');
    expect(connection.room).toBeNull();
  });

  it('rejects a second join while one is in progress', async () => {
    const { connection } = setup(() => new Promise(() => undefined));
    void connection.join(identity).catch(() => undefined);
    await expect(connection.join(identity)).rejects.toThrow('in progress');
  });
});
