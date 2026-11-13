import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OfficeState } from '@office/protocol';
import { Connection, type Identity, type TokenStore } from '../src/net';
import { startGameServer } from './gameServer';

/**
 * REQ-NET-005, REQ-NET-006: the client's own reconnect path against the real server.
 * Drops happen within the first seconds of the room's uptime, where the SDK's automatic
 * reconnection would refuse to run (DECISIONS, proof-of-concept results).
 */
let server: Awaited<ReturnType<typeof startGameServer>> | undefined;
const connections: Connection[] = [];

function memoryTokens(available = true): TokenStore {
  let value: string | null = null;
  return {
    save: (token) => {
      if (available) value = token;
      return available;
    },
    load: () => value,
    clear: () => {
      value = null;
    },
  };
}

async function connect(name: string, officeCode: string, tokens = memoryTokens()) {
  const connection = new Connection(server!.endpoint, undefined, 5000, { tokens });
  connections.push(connection);
  const identity: Identity = { name, officeCode, avatarId: 'men_suit' };
  await connection.join(identity);
  return connection;
}

/** Closes the socket without consent, as a network failure would. */
function drop(connection: Connection): void {
  connection.room!.connection.close();
}

function employees(connection: Connection) {
  return (connection.room!.state as OfficeState).employees;
}

async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 20));
  }
}

beforeAll(async () => {
  server = await startGameServer();
}, 30_000);

afterAll(async () => {
  await Promise.all(connections.map((c) => c.leave()));
  server?.stop();
});

describe('Connection reconnect against the game server', () => {
  it('retries after a drop in the first seconds and resumes the same employee', async () => {
    const a = await connect('An', 'RECON-01');
    const b = await connect('Bao', 'RECON-01');
    const sessionId = a.room!.sessionId;
    await waitFor(() => employees(b).size === 2);
    const resumed: string[] = [];
    a.onRoom((room) => resumed.push(room.sessionId));

    drop(a);
    await waitFor(() => a.status === 'reconnecting');
    await waitFor(() => employees(b).get(sessionId)?.connected === false);
    expect(employees(b).size).toBe(2);

    await waitFor(() => a.status === 'connected', 4000);
    expect(a.room!.sessionId).toBe(sessionId);
    expect(resumed).toEqual([sessionId]);
    // Full state on the resumed handle, and the employee is back for everybody.
    await waitFor(() => employees(a).size === 2);
    await waitFor(() => employees(b).get(sessionId)?.connected === true);
    expect(employees(b).size).toBe(2);
  }, 15_000);

  it('without storage goes straight to lost, and Rejoin resumes without a duplicate', async () => {
    const a = await connect('An', 'RECON-02', memoryTokens(false));
    const b = await connect('Bao', 'RECON-02');
    const sessionId = a.room!.sessionId;
    await waitFor(() => employees(b).size === 2);

    drop(a);
    await waitFor(() => a.status === 'lost');
    await waitFor(() => employees(b).get(sessionId)?.connected === false);

    const room = await a.rejoin();
    expect(room.sessionId).toBe(sessionId);
    expect(a.status).toBe('connected');
    await waitFor(() => employees(b).get(sessionId)?.connected === true);
    expect(employees(b).size).toBe(2);
  }, 15_000);

  it('a consented leave removes the employee for others at once', async () => {
    const a = await connect('An', 'RECON-03');
    const b = await connect('Bao', 'RECON-03');
    const sessionId = a.room!.sessionId;
    await waitFor(() => employees(b).size === 2);
    await a.leave();
    await waitFor(() => !employees(b).has(sessionId), 1000);
  });
});
