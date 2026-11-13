import { createServer, type Server as HttpServer } from 'node:http';
import { Server, createEndpoint, createRouter, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { OFFICE_ROOM, normalizeOfficeCode } from '@office/protocol';
import { OfficeRoom } from './rooms/OfficeRoom';

export type AppOptions = {
  /** Browser origins allowed to call the matchmaker; empty = reflect any origin (local dev). */
  allowedOrigins: readonly string[];
};

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

const health = createEndpoint('/health', { method: 'GET' }, async () =>
  Response.json({ status: 'ok' }),
);

/** One HTTP server: `GET /health`, the Colyseus matchmaker routes and the WebSocket upgrade. */
export function createApp(options: AppOptions): { http: HttpServer; game: Server } {
  matchMaker.controller.getCorsHeaders = (headers: Headers) => {
    const origin = headers.get('origin');
    if (options.allowedOrigins.length === 0)
      return { 'Access-Control-Allow-Origin': origin ?? '*' };
    return origin !== null && options.allowedOrigins.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
      : {};
  };

  const http = createServer();
  const game = new Server({ transport: new WebSocketTransport({ server: http }), greet: false });
  game.router = createRouter({ health });
  const handler = game.define(OFFICE_ROOM, OfficeRoom).filterBy(['officeCode']);
  // Match rooms on the normalized code, so 'test-01' and 'TEST-01' share one room.
  const rawFilter = handler.getFilterOptions.bind(handler);
  handler.getFilterOptions = (clientOptions: unknown) => {
    const filter = rawFilter(clientOptions) as { officeCode?: unknown };
    if (typeof filter.officeCode === 'string') {
      filter.officeCode = normalizeOfficeCode(filter.officeCode) ?? filter.officeCode;
    }
    return filter;
  };
  return { http, game };
}
