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
  type ReconnectClock,
  type TokenStore,
} from '../src/net';

const identity = { name: 'An', officeCode: 'TEST-01', avatarId: 'men_suit' } as const;

let rooms = 0;
function fakeRoom(sessionId = 'S1') {
  let leaveCb: ((code: number) => void) | undefined;
  const room = {
    sessionId,
    reconnectionToken: `TEST-01:token${++rooms}`,
    reconnection: { enabled: true },
    leave: vi.fn(async () => 1000),
    onLeave: (cb: (code: number) => void) => {
      leaveCb = cb;
    },
    drop: (code = 1006) => leaveCb?.(code),
  };
  return room as typeof room & OfficeRoomHandle;
}

function memoryTokens(available = true): TokenStore & { value: string | null } {
  return {
    value: null,
    save(token) {
      if (available) this.value = token;
      return available;
    },
    load() {
      return this.value;
    },
    clear() {
      this.value = null;
    },
  };
}

function setup(
  joinOrCreate: JoinClient['joinOrCreate'],
  timeoutMs = 1000,
  options: {
    reconnect?: JoinClient['reconnect'];
    tokens?: TokenStore;
    clock?: ReconnectClock;
  } = {},
) {
  const client = {
    joinOrCreate: vi.fn(joinOrCreate),
    reconnect: vi.fn(
      options.reconnect ?? (async () => Promise.reject(new MatchMakeError('expired', 4212))),
    ),
  };
  const tokens = options.tokens ?? memoryTokens();
  const connection = new Connection('http://test', () => client, timeoutMs, {
    tokens,
    ...(options.clock ? { clock: options.clock } : {}),
  });
  const statuses: ConnectionStatus[] = [];
  connection.onStatus((s) => statuses.push(s));
  return { client, connection, statuses, tokens };
}

/** Controlled clock for the reconnect backoff. */
function fakeClock(): ReconnectClock & { advance(ms: number): Promise<void> } {
  let time = 0;
  let timers: { at: number; cb: () => void }[] = [];
  return {
    now: () => time,
    setTimeout: (cb, ms) => {
      const t = { at: time + ms, cb };
      timers.push(t);
      return t;
    },
    clearTimeout: (h) => {
      timers = timers.filter((t) => t !== h);
    },
    async advance(ms) {
      const end = time + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        time = due.at;
        due.cb();
        for (let i = 0; i < 10; i++) await Promise.resolve();
      }
      time = end;
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
  };
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

  it('keeps the token, disables SDK auto-reconnect and clears the token on leave', async () => {
    const room = fakeRoom();
    const tokens = memoryTokens();
    const { connection } = setup(async () => room, 1000, { tokens });
    await connection.join(identity);
    expect(room.reconnection.enabled).toBe(false);
    expect(tokens.value).toBe(room.reconnectionToken);
    await connection.leave();
    expect(tokens.value).toBeNull();
  });

  it('reports an unexpected room leave as reconnecting, then resumes the same session', async () => {
    const clock = fakeClock();
    const room = fakeRoom();
    const back = fakeRoom();
    let up = false;
    const { connection, client, statuses } = setup(async () => room, 1000, {
      clock,
      reconnect: async () => {
        if (!up) throw new TypeError('Failed to fetch');
        return back;
      },
    });
    const resumed: OfficeRoomHandle[] = [];
    connection.onRoom((r) => resumed.push(r));
    await connection.join(identity);
    room.drop();
    expect(connection.status).toBe('reconnecting');
    expect(connection.error?.code).toBe('unreachable');
    expect(connection.room).toBeNull();
    await clock.advance(1000);
    expect(client.reconnect).toHaveBeenCalledWith(room.reconnectionToken, expect.anything());
    expect(connection.status).toBe('reconnecting');
    up = true;
    await clock.advance(2000);
    expect(connection.status).toBe('connected');
    expect(connection.room).toBe(back);
    expect(connection.error).toBeNull();
    expect(resumed).toEqual([back]);
    expect(statuses).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);
    // A second drop starts a new backoff with the new token.
    back.drop();
    expect(connection.status).toBe('reconnecting');
  });

  it('gives up after the 1/2/4/8 s attempts and goes lost', async () => {
    const clock = fakeClock();
    const room = fakeRoom();
    const { connection, client } = setup(async () => room, 1000, {
      clock,
      reconnect: async () => Promise.reject(new TypeError('Failed to fetch')),
    });
    await connection.join(identity);
    room.drop();
    await clock.advance(15_000);
    expect(client.reconnect).toHaveBeenCalledTimes(4);
    expect(connection.status).toBe('lost');
  });

  it('goes lost at once when the server refuses the token', async () => {
    const clock = fakeClock();
    const room = fakeRoom();
    const { connection, client } = setup(async () => room, 1000, { clock });
    await connection.join(identity);
    room.drop();
    await clock.advance(1000);
    expect(client.reconnect).toHaveBeenCalledTimes(1);
    expect(connection.status).toBe('lost');
  });

  it('goes straight to lost without storage, and Rejoin still resumes the held session', async () => {
    const room = fakeRoom();
    const back = fakeRoom();
    const { connection, client } = setup(async () => room, 1000, {
      tokens: memoryTokens(false),
      reconnect: async () => back,
    });
    await connection.join(identity);
    room.drop();
    expect(connection.status).toBe('lost');
    expect(client.reconnect).not.toHaveBeenCalled();
    await expect(connection.rejoin()).resolves.toBe(back);
    expect(client.reconnect).toHaveBeenCalledWith(room.reconnectionToken, expect.anything());
    expect(client.joinOrCreate).toHaveBeenCalledTimes(1);
    expect(connection.status).toBe('connected');
  });

  it('Rejoin joins afresh with the same identity once the reservation is gone', async () => {
    const clock = fakeClock();
    const room = fakeRoom();
    const fresh = fakeRoom('S2');
    let next: OfficeRoomHandle = room;
    const { connection, client } = setup(async () => next, 1000, { clock });
    await connection.join(identity);
    room.drop();
    await clock.advance(1000);
    expect(connection.status).toBe('lost');
    next = fresh;
    await expect(connection.rejoin()).resolves.toBe(fresh);
    expect(client.joinOrCreate).toHaveBeenCalledTimes(2);
    expect(client.joinOrCreate).toHaveBeenLastCalledWith(
      OFFICE_ROOM,
      { ...identity, protocolVersion: PROTOCOL_VERSION },
      expect.anything(),
    );
    expect(connection.status).toBe('connected');
  });

  it('Rejoin stays lost while the server is unreachable', async () => {
    const room = fakeRoom();
    const { connection, client } = setup(async () => room, 1000, {
      tokens: memoryTokens(false),
      reconnect: async () => Promise.reject(new TypeError('Failed to fetch')),
    });
    await connection.join(identity);
    room.drop();
    await expect(connection.rejoin()).rejects.toMatchObject({ code: 'unreachable' });
    expect(connection.status).toBe('lost');
    expect(client.joinOrCreate).toHaveBeenCalledTimes(1);
  });

  it('a consented leave during the backoff stops retrying', async () => {
    const clock = fakeClock();
    const room = fakeRoom();
    const { connection, client } = setup(async () => room, 1000, { clock });
    await connection.join(identity);
    room.drop();
    await connection.leave();
    await clock.advance(30_000);
    expect(client.reconnect).not.toHaveBeenCalled();
    expect(connection.status).toBe('idle');
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
