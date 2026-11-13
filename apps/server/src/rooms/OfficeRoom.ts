import { type AuthContext, type Client, Room, ServerError, matchMaker } from '@colyseus/core';
import {
  BALANCE,
  EmployeeState,
  JOIN_ERROR_STATUS,
  MSG,
  OfficeState,
  officeLayout,
  normalizeOfficeCode,
  parseJoinOptions,
  type JoinErrorCode,
  type JoinOptions,
} from '@office/protocol';
import { JoinRateLimiter } from '../joinRateLimiter';
import { OfficeSim } from '../sim/activity';
import { startMovementLoop } from '../sim/movement';

export function joinError(code: JoinErrorCode): ServerError {
  return new ServerError(JOIN_ERROR_STATUS[code], code);
}

/** Shared by every OfficeRoom in this process; replaced in tests to control the clock. */
export const roomServices = {
  joinLimiter: new JoinRateLimiter(BALANCE.net.joinsPerMinutePerIp),
  /**
   * How long an unexpectedly dropped employee and its seat are held. Tests shorten it;
   * the shipped value is `BALANCE.net.reconnectSeconds`.
   */
  reconnectSeconds: BALANCE.net.reconnectSeconds as number,
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
  /**
   * REQ-NET-002, REQ-NET-003, REQ-INT-002: the only path by which a client changes its
   * employee (position, activity, seat). One `SeatRegistry` per room lives inside it.
   */
  readonly sim = new OfficeSim();

  override onCreate(options: { officeCode?: unknown }): void {
    const code =
      typeof options.officeCode === 'string' ? normalizeOfficeCode(options.officeCode) : null;
    if (code === null) throw joinError('invalid_identity');
    // A full room is locked, so the matchmaker tries to create a second room for the
    // same code. The room id is the code, so refuse instead of creating an overflow room.
    if (matchMaker.getLocalRoomById(code)) throw joinError('room_full');
    this.roomId = code;
    this.patchRate = BALANCE.net.patchMs;
    // A client can only queue inputs and intents for its own employee; no message sets
    // state directly. Both are applied in the tick, in the order the client sent them.
    this.onMessage(MSG.input, (client, raw: unknown) => {
      this.sim.input(client.sessionId, raw);
    });
    this.onMessage(MSG.intent, (client, raw: unknown) => {
      this.sim.intent(client.sessionId, raw);
    });
    startMovementLoop(
      (tick, delayMs) => this.setTimestep(tick, delayMs),
      () => this.sim.tick(this.state.employees, officeLayout.colliders, this.clock.currentTime),
    );
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
    this.sim.add(client.sessionId, employee.lastSeq);
  }

  /**
   * REQ-NET-005: an unexpected drop (any close code except a consented leave) keeps the
   * employee and its seat for `reconnectSeconds`, marked `connected = false`. Queued inputs
   * and intents are discarded so the held avatar stands still. If the window expires the
   * framework calls `onLeave`, which removes both.
   */
  override onDrop(client: Client): void {
    const employee = this.state.employees.get(client.sessionId);
    if (!employee) return;
    employee.connected = false;
    this.sim.suspend(client.sessionId, employee.lastSeq);
    // Expiry is handled through onLeave; the rejection itself needs no handler here.
    this.allowReconnection(client, roomServices.reconnectSeconds).catch(() => undefined);
  }

  /** The same session is back within the window: the client receives the full state. */
  override onReconnect(client: Client): void {
    const employee = this.state.employees.get(client.sessionId);
    if (employee) employee.connected = true;
  }

  /** A consented leave, or the end of an unanswered reconnect window: remove at once. */
  override onLeave(client: Client): void {
    this.sim.remove(client.sessionId);
    this.state.employees.delete(client.sessionId);
  }
}
