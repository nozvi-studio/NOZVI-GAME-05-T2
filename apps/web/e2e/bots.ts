import { Client, type Room } from '@colyseus/sdk';
import { SERVER_URL } from './ports';

/**
 * Wire constants for the Node side of the specs. Playwright's loader cannot import
 * `@office/protocol` (its layout JSON import needs an import attribute), so they are copied
 * here; `test/e2eBots.test.ts` fails if they drift from the protocol package.
 */
export const E2E_WIRE = { room: 'office', protocolVersion: 2, maxClients: 10 } as const;

type Employee = { name: string };
export type BotRoom = Room<unknown, { employees: Map<string, Employee> }>;

/** Headless SDK client joined to the e2e game server (state decoded by reflection). */
export function joinBot(officeCode: string, name: string): Promise<BotRoom> {
  return new Client(SERVER_URL).joinOrCreate(E2E_WIRE.room, {
    name,
    officeCode,
    avatarId: 'men_suit',
    protocolVersion: E2E_WIRE.protocolVersion,
  });
}

/** Employee names in the room state as this bot currently sees it. */
export function employeeNames(room: BotRoom): string[] {
  const employees = room.state?.employees;
  return employees ? [...employees.values()].map((e) => e.name) : [];
}

export async function leaveAll(rooms: BotRoom[]): Promise<void> {
  await Promise.all(rooms.splice(0).map((r) => r.leave(true).catch(() => undefined)));
}
