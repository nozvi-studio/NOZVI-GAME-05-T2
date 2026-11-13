import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

/** Test helper: the real game server as a child process, started exactly as e2e does. */
const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(server: ChildProcess, url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error('game server exited during startup');
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('game server did not become healthy');
}

/** Starts the server on a free port and resolves once `/health` answers. */
export async function startGameServer(
  env: Record<string, string> = {},
): Promise<{ endpoint: string; stop(): void }> {
  const port = await freePort();
  const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/main.ts'], {
    cwd: serverDir,
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: 'ignore',
  });
  const endpoint = `http://127.0.0.1:${port}`;
  await waitForHealth(server, endpoint, 20_000);
  return { endpoint, stop: () => void server.kill('SIGTERM') };
}
