import { type AuthContext, type Client, Room, ServerError, matchMaker } from '@colyseus/core';
import {
  BALANCE,
  EmployeeState,
  JOIN_ERROR_STATUS,
  OfficeState,
  officeLayout,
  normalizeOfficeCode,
  parseJoinOptions,
  type JoinErrorCode,
  type JoinOptions,
} from '@office/protocol';
import { JoinRateLimiter } from '../joinRateLimiter';

export function joinError(code: JoinErrorCode): ServerError {
  return new ServerError(JOIN_ERROR_STATUS[code], code);
}

/** Shared by every OfficeRoom in this process; replaced in tests to control the clock. */
export const roomServices = {
  joinLimiter: new JoinRateLimiter(BALANCE.net.joinsPerMinutePerIp),
};

/**
 * Socket address of the joining client. Proxy headers are ignored until Phase 5
 * (plan §6 item 5), so a spoofed X-Forwarded-For cannot dodge the join limit.
 */
function socketAddress(context: AuthContext | undefined): string {
  const req = context?.req as { socket?: { remoteAddress?: string } } | undefined;
  return req?.socket?.remoteAddress ?? 'unknown';
}

/**
 * REQ-NET-001, REQ-UI-002: one room per normalized office code (the room id is the code),
 * at most `BALANCE.net.maxClients` employees; the next join is rejected with `room_full`.
 */
export class OfficeRoom extends Room<{ state: OfficeState }> {
  override maxClients = BALANCE.net.maxClients;
  override state = new OfficeState();

  override onCreate(options: { officeCode?: unknown }): void {
    const code =
      typeof options.officeCode === 'string' ? normalizeOfficeCode(options.officeCode) : null;
    if (code === null) throw joinError('invalid_identity');
    // A full room is locked, so the matchmaker tries to create a second room for the
    // same code. The room id is the code, so refuse instead of creating an overflow room.
    if (matchMaker.getLocalRoomById(code)) throw joinError('room_full');
    this.roomId = code;
    this.patchRate = BALANCE.net.patchMs;
  }

  override onAuth(_client: Client, options: unknown, context: AuthContext): JoinOptions {
    if (!roomServices.joinLimiter.tryJoin(socketAddress(context))) throw joinError('rate_limited');
    const parsed = parseJoinOptions(options);
    if (!parsed.ok) throw joinError(parsed.error);
    if (parsed.value.officeCode !== this.roomId) throw joinError('invalid_identity');
    return parsed.value;
  }

  override onJoin(client: Client, _options: unknown, auth: JoinOptions): void {
    const [x, , z] = officeLayout.spawn.position;
    const employee = new EmployeeState();
    employee.name = auth.name;
    employee.avatarId = auth.avatarId;
    employee.x = x;
    employee.z = z;
    employee.heading = (officeLayout.spawn.rotY * Math.PI) / 180;
    this.state.employees.set(client.sessionId, employee);
  }

  override onLeave(client: Client): void {
    // The 20 s reconnect window arrives with T-1051; until then any leave removes at once.
    this.state.employees.delete(client.sessionId);
  }
}
