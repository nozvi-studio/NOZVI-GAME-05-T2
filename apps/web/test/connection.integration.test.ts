import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { BALANCE } from '@office/protocol';
import { Connection, type Identity } from '../src/net';

/**
 * The wrapper against the real game server, started as a child process exactly as e2e
 * does (no offline mode). The server's join rate limit is 10 per minute per address and
 * this file uses exactly that budget: invalid codes are refused before the limiter runs,
 * and the 11th join is refused as room_full when the full room's code is re-created.
 */
const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
let server: ChildProcess | undefined;
let endpoint = '';
const connections: Connection[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) throw new Error('game server exited during startup');
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('game server did not become healthy');
}

function connect(identity: Partial<Identity> = {}, url = endpoint) {
  const connection = new Connection(url, undefined, 5000);
  connections.push(connection);
  return connection.join({ name: 'An', officeCode: 'INT-01', avatarId: 'men_suit', ...identity });
}

beforeAll(async () => {
  const port = await freePort();
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/main.ts'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  endpoint = `http://127.0.0.1:${port}`;
  await waitForHealth(endpoint, 20_000);
}, 30_000);

afterAll(async () => {
  await Promise.all(connections.map((c) => c.leave()));
  server?.kill('SIGTERM');
});

describe('Connection against the game server', () => {
  it('rejects an invalid office code with invalid_identity', async () => {
    await expect(connect({ officeCode: 'x!' })).rejects.toMatchObject({
      code: 'invalid_identity',
    });
    expect(connections.at(-1)!.status).toBe('error');
  });

  it('reports a closed port as unreachable', async () => {
    const closed = `http://127.0.0.1:${await freePort()}`;
    await expect(connect({}, closed)).rejects.toMatchObject({ code: 'unreachable' });
  });

  it('joins, then refuses the 11th employee with room_full', async () => {
    const first = await connect({ name: 'P0' });
    expect(first.roomId).toBe('INT-01');
    expect(connections.at(-1)!.status).toBe('connected');
    for (let i = 1; i < BALANCE.net.maxClients; i++) await connect({ name: `P${i}` });
    await expect(connect({ name: 'Late' })).rejects.toMatchObject({ code: 'room_full' });
  }, 20_000);

  it('leaves the room on a consented leave', async () => {
    const connection = connections.find((c) => c.status === 'connected')!;
    const room = connection.room!;
    await connection.leave();
    expect(connection.status).toBe('idle');
    expect(room.connection.isOpen).toBe(false);
  });
});
