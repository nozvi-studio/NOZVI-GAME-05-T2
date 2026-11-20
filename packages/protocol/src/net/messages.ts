import { BALANCE } from '../balance';
import { isEmoteId, type EmoteId } from '../activity';
import { isAvatarId, normalizeOfficeCode, validateName, type AvatarId } from '../identity';
import { officeLayout } from '../layout/layout';
import { PROTOCOL_VERSION } from '../version';

/** Client to server message names. */
export const MSG = {
  input: 'input',
  intent: 'intent',
  tv: 'tv',
  tvTime: 'tv_time',
  chat: 'chat',
} as const;

/** Server to client message names. */
export const SERVER_MSG = {
  tvRateLimited: 'tv_rate_limited',
  tvTime: 'tv_time',
  chatRateLimited: 'chat_rate_limited',
} as const;
/** REQ-NFR-005: payload of `tv_rate_limited`; the command was dropped without effect. */
export type TvRateLimitedNotice = { retryAfterMs: number };

/** REQ-CHAT-001: client to server `chat`. */
export type ChatMessage = { text: string };
/** REQ-CHAT-001: payload of `chat_rate_limited`; the message was dropped and reached nobody. */
export type ChatRateLimitedNotice = { retryAfterMs: number };

/**
 * OQ-023 (T-1567): client to server `tv_time`, a request for one server clock sample.
 * `id` is echoed so the client matches the reply to its outstanding request.
 */
export type TvTimeRequest = { id: number };
/** OQ-023 (T-1567): server to client `tv_time`, the server epoch ms when it answered. */
export type TvTimeReply = { id: number; serverNow: number };

/** Largest sequence number (stored as uint32 in `EmployeeState.lastSeq`). */
export const MAX_SEQ = 0xffff_ffff;

export type InputMessage = {
  seq: number;
  /** -1..1, camera-relative. */
  forward: number;
  /** -1..1, camera-relative. */
  right: number;
  run: boolean;
  /** Camera yaw in radians. */
  yaw: number;
};

/**
 * `brew` (REQ-INT-003) starts the coffee routine at the coffee machine. `emote`
 * (REQ-AVATAR-004) plays one emote from the fixed `EMOTES` list; `wave` is the Phase 2
 * wave (activity `waving`), kept until the client switches to the `wave` emote (T-1222).
 */
export const INTENT_TYPES = [
  'sit',
  'stand',
  'toggleWork',
  'drink',
  'wave',
  'brew',
  'emote',
] as const;
export type IntentType = (typeof INTENT_TYPES)[number];
export type IntentMessage =
  | { type: 'sit'; seatId: string }
  | { type: 'emote'; emote: EmoteId }
  | { type: Exclude<IntentType, 'sit' | 'emote'> };

export type JoinOptions = {
  name: string;
  officeCode: string;
  avatarId: AvatarId;
  protocolVersion: number;
};

export const JOIN_ERRORS = [
  'room_full',
  'invalid_identity',
  'version_mismatch',
  'rate_limited',
] as const;
export type JoinErrorCode = (typeof JOIN_ERRORS)[number];
/**
 * Numeric codes the server attaches to a rejected join (`ServerError.code`). The error
 * message is always the `JoinErrorCode` string; clients must match on the message,
 * because a rejection raised while creating the room reaches the client as HTTP 500.
 */
export const JOIN_ERROR_STATUS: Readonly<Record<JoinErrorCode, number>> = {
  room_full: 4101,
  invalid_identity: 4102,
  version_mismatch: 4103,
  rate_limited: 4104,
};
export function isJoinErrorCode(v: unknown): v is JoinErrorCode {
  return typeof v === 'string' && (JOIN_ERRORS as readonly string[]).includes(v);
}
/** Colyseus room name registered by the server. */
export const OFFICE_ROOM = 'office';

/** Every seat id in the office layout: desk seats and sofa seats. */
export const SEAT_IDS: ReadonlySet<string> = new Set([
  ...officeLayout.workstations.map((w) => w.seat.id),
  ...officeLayout.sofaSeats.map((s) => s.id),
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isAxis(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 1;
}

/** REQ-NFR-004: returns a clean copy of a valid `input` payload, or null. */
export function parseInput(raw: unknown): InputMessage | null {
  if (!isRecord(raw)) return null;
  const { seq, forward, right, run, yaw } = raw;
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0 || seq > MAX_SEQ) return null;
  if (!isAxis(forward) || !isAxis(right)) return null;
  if (typeof run !== 'boolean') return null;
  if (typeof yaw !== 'number' || !Number.isFinite(yaw)) return null;
  return { seq, forward, right, run, yaw };
}

/** REQ-NFR-004: returns a clean copy of a valid `intent` payload, or null. */
export function parseIntent(
  raw: unknown,
  seatIds: ReadonlySet<string> = SEAT_IDS,
): IntentMessage | null {
  if (!isRecord(raw)) return null;
  const { type, seatId, emote } = raw;
  if (typeof type !== 'string' || !(INTENT_TYPES as readonly string[]).includes(type)) return null;
  if (type === 'sit') {
    const ok = typeof seatId === 'string' && seatIds.has(seatId) && emote === undefined;
    return ok ? { type, seatId } : null;
  }
  if (seatId !== undefined) return null;
  if (type === 'emote') return isEmoteId(emote) ? { type, emote } : null;
  if (emote !== undefined) return null;
  return { type: type as Exclude<IntentType, 'sit' | 'emote'> };
}

export type JoinResult = { ok: true; value: JoinOptions } | { ok: false; error: JoinErrorCode };

/** Validates join options; the office code comes back normalized and the name trimmed. */
export function parseJoinOptions(raw: unknown): JoinResult {
  if (!isRecord(raw)) return { ok: false, error: 'invalid_identity' };
  if (raw.protocolVersion !== PROTOCOL_VERSION) return { ok: false, error: 'version_mismatch' };
  const name = typeof raw.name === 'string' ? validateName(raw.name) : null;
  const officeCode =
    typeof raw.officeCode === 'string' ? normalizeOfficeCode(raw.officeCode) : null;
  if (name === null || officeCode === null || !isAvatarId(raw.avatarId)) {
    return { ok: false, error: 'invalid_identity' };
  }
  return {
    ok: true,
    value: { name, officeCode, avatarId: raw.avatarId, protocolVersion: PROTOCOL_VERSION },
  };
}

export const TV_COMMAND_TYPES = ['load', 'play', 'pause', 'seek', 'stop'] as const;
export type TvCommandType = (typeof TV_COMMAND_TYPES)[number];
/** REQ-TV-005: client to server `tv` message. A local close sends nothing. */
export type TvCommand =
  | { type: 'load'; videoId: string }
  | { type: 'seek'; time: number }
  | { type: Exclude<TvCommandType, 'load' | 'seek'> };

/** YouTube video ids are 11 characters of `[A-Za-z0-9_-]`. */
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
export function isYouTubeId(v: unknown): v is string {
  return typeof v === 'string' && YOUTUBE_ID_PATTERN.test(v);
}

/** REQ-NFR-004, REQ-TV-005: returns a clean copy of a valid `tv` payload, or null. */
export function parseTvCommand(raw: unknown): TvCommand | null {
  if (!isRecord(raw)) return null;
  const { type, videoId, time } = raw;
  if (typeof type !== 'string' || !(TV_COMMAND_TYPES as readonly string[]).includes(type)) {
    return null;
  }
  if (type === 'load') {
    return isYouTubeId(videoId) && time === undefined ? { type, videoId } : null;
  }
  if (type === 'seek') {
    const ok = typeof time === 'number' && Number.isFinite(time) && time >= 0;
    return ok && videoId === undefined ? { type, time } : null;
  }
  if (videoId !== undefined || time !== undefined) return null;
  return { type: type as Exclude<TvCommandType, 'load' | 'seek'> };
}

const isId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_SEQ;

/** REQ-NFR-004, OQ-023: returns a clean copy of a valid `tv_time` request, or null. */
export function parseTvTimeRequest(raw: unknown): TvTimeRequest | null {
  if (!isRecord(raw)) return null;
  return isId(raw.id) ? { id: raw.id } : null;
}

/** OQ-023: returns a clean copy of a valid `tv_time` reply (client side), or null. */
export function parseTvTimeReply(raw: unknown): TvTimeReply | null {
  if (!isRecord(raw)) return null;
  const { id, serverNow } = raw;
  if (!isId(id) || typeof serverNow !== 'number' || !Number.isFinite(serverNow)) return null;
  return serverNow > 0 ? { id, serverNow } : null;
}

/** Control characters (C0, DEL, C1) are removed from chat text before it is counted. */
const CHAT_CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * REQ-CHAT-001: returns a clean copy of a valid `chat` payload, or null. The text is
 * stripped of control characters and trimmed, then must hold 1 to `maxLength` visible
 * characters (code points, the same counting as names, OQ-026). Extra fields are dropped.
 */
export function parseChatMessage(
  raw: unknown,
  maxLength: number = BALANCE.chat.maxLength,
): ChatMessage | null {
  if (!isRecord(raw) || typeof raw.text !== 'string') return null;
  const text = raw.text.replace(CHAT_CONTROL, '').trim();
  const length = Array.from(text).length;
  return length >= 1 && length <= maxLength ? { text } : null;
}
