import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/** Answers `GET /health`; returns false for any other request. */
export function handleHealth(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== 'GET' || req.url !== '/health') return false;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok' }));
  return true;
}

export function createHealthServer(): Server {
  return createServer((req, res) => {
    if (!handleHealth(req, res)) res.writeHead(404).end();
  });
}
