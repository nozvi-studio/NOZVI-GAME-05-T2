import { type AuthContext, type Client, Room, ServerError, matchMaker } from '@colyseus/core';
import {
  BALANCE,
  ChatMessageState,
  EmployeeState,
  JOIN_ERROR_STATUS,
  MSG,
  OfficeState,
  SERVER_MSG,
  officeLayout,
  normalizeOfficeCode,
  parseChatMessage,
  parseJoinOptions,
  parseTvCommand,
  parseTvTimeRequest,
  type ChatRateLimitedNotice,
  type TvRateLimitedNotice,
  type TvTimeReply,
  type JoinErrorCode,
  type JoinOptions,
} from '@office/protocol';
import { CommandRateLimiter } from '../commandRateLimiter';
import { JoinRateLimiter } from '../joinRateLimiter';
import { OfficeSim } from '../sim/activity';
import { appendChat, expireChat } from '../sim/chat';
import { startMovementLoop } from '../sim/movement';
import { TvSim } from '../sim/tv';

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
  /**
   * REQ-CHAT-002: how long a chat message lives. Tests and e2e shorten it (`CHAT_TTL_SECONDS`
   * in `main.ts`); the shipped value is `BALANCE.chat.ttlSeconds`.
   */
  chatTtlSeconds: BALANCE.chat.ttlSeconds as number,
  /** Server epoch-ms clock for TV and chat timestamps and their rate limits; tests replace it. */
  now: Date.now as () => number,
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
  /** REQ-TV-005: the only writer of `state.tv`. */
  readonly tv = new TvSim(this.state.tv, () => roomServices.now());
  private readonly tvLimiter = new CommandRateLimiter(
    BALANCE.tv.rateLimitCommands,
    BALANCE.tv.rateLimitWindowSeconds * 1000,
    () => roomServices.now(),
  );
  /** OQ-023 (T-1567): separate budget, so clock samples never use up TV commands. */
  private readonly timeLimiter = new CommandRateLimiter(
    BALANCE.tv.timeRequestsPerWindow,
    BALANCE.tv.rateLimitWindowSeconds * 1000,
    () => roomServices.now(),
  );
  /** REQ-CHAT-001: its own budget, separate from TV commands and clock samples. */
  private readonly chatLimiter = new CommandRateLimiter(
    BALANCE.chat.rateLimitMessages,
    BALANCE.chat.rateLimitWindowSeconds * 1000,
    () => roomServices.now(),
  );
  /** Source of chat message ids, unique within this room. */
  private chatSeq = 0;

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
    // REQ-TV-005, REQ-NFR-005: TV commands apply at once, in arrival order, after the
    // validator and the per-client budget. Invalid commands are ignored silently.
    this.onMessage(MSG.tv, (client, raw: unknown) => {
      const cmd = parseTvCommand(raw);
      if (cmd === null) return;
      const retryAfterMs = this.tvLimiter.tryUse(client.sessionId);
      if (retryAfterMs > 0) {
        const notice: TvRateLimitedNotice = { retryAfterMs };
        client.send(SERVER_MSG.tvRateLimited, notice);
        return;
      }
      this.tv.apply(client.sessionId, cmd);
    });
    // OQ-023 (T-1567): a client's clock sample on join. The reply carries the server epoch
    // ms at the moment it is sent. Invalid or over-budget requests are dropped silently
    // (no notice: a `tv_rate_limited` would hold the client's TV commands).
    this.onMessage(MSG.tvTime, (client, raw: unknown) => {
      const req = parseTvTimeRequest(raw);
      if (req === null || this.timeLimiter.tryUse(client.sessionId) > 0) return;
      const reply: TvTimeReply = { id: req.id, serverNow: roomServices.now() };
      client.send(SERVER_MSG.tvTime, reply);
    });
    // REQ-CHAT-001: validator, then the per-client budget, then append with the sender's
    // current name and the server clock. Invalid payloads are ignored silently. The text is
    // never logged.
    this.onMessage(MSG.chat, (client, raw: unknown) => {
      const msg = parseChatMessage(raw);
      if (msg === null) return;
      const employee = this.state.employees.get(client.sessionId);
      if (!employee) return;
      const retryAfterMs = this.chatLimiter.tryUse(client.sessionId);
      if (retryAfterMs > 0) {
        const notice: ChatRateLimitedNotice = { retryAfterMs };
        client.send(SERVER_MSG.chatRateLimited, notice);
        return;
      }
      const entry = new ChatMessageState();
      entry.id = String(++this.chatSeq);
      entry.sessionId = client.sessionId;
      entry.name = employee.name;
      entry.text = msg.text;
      entry.sentAt = roomServices.now();
      appendChat(this.state.chat, entry, BALANCE.chat.maxMessages);
    });
    startMovementLoop(
      (tick, delayMs) => this.setTimestep(tick, delayMs),
      () => {
        this.sim.tick(this.state.employees, officeLayout.colliders, this.clock.currentTime);
        // REQ-CHAT-002: expired messages leave the state, at most one tick late.
        expireChat(this.state.chat, roomServices.now(), roomServices.chatTtlSeconds * 1000);
      },
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

  /**
   * A consented leave, or the end of an unanswered reconnect window: remove at once. The
   * sender's chat messages stay until they expire; only the chat budget is forgotten.
   */
  override onLeave(client: Client): void {
    this.sim.remove(client.sessionId);
    this.tv.leave(client.sessionId);
    this.tvLimiter.forget(client.sessionId);
    this.timeLimiter.forget(client.sessionId);
    this.chatLimiter.forget(client.sessionId);
    this.state.employees.delete(client.sessionId);
  }
}
