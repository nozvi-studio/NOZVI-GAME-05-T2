import { afterEach, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createHealthServer } from '../src/health';

let close: (() => void) | undefined;
afterEach(() => close?.());

it('answers GET /health with ok', async () => {
  const server = createHealthServer();
  await new Promise<void>((r) => server.listen(0, r));
  close = () => server.close();
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok' });
});

it('returns 404 for other paths', async () => {
  const server = createHealthServer();
  await new Promise<void>((r) => server.listen(0, r));
  close = () => server.close();
  const { port } = server.address() as AddressInfo;
  expect((await fetch(`http://127.0.0.1:${port}/nope`)).status).toBe(404);
});
