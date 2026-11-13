import { isAvatarId, normalizeOfficeCode, validateName, type AvatarId } from '../identity';
import { officeLayout } from '../layout/layout';
import { PROTOCOL_VERSION } from '../version';

/** Client to server message names. */
export const MSG = { input: 'input', intent: 'intent' } as const;

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

export const INTENT_TYPES = ['sit', 'stand', 'toggleWork', 'drink', 'wave'] as const;
export type IntentType = (typeof INTENT_TYPES)[number];
export type IntentMessage = { type: 'sit'; seatId: string } | { type: Exclude<IntentType, 'sit'> };

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
  const { type, seatId } = raw;
  if (typeof type !== 'string' || !(INTENT_TYPES as readonly string[]).includes(type)) return null;
  if (type === 'sit') {
    return typeof seatId === 'string' && seatIds.has(seatId) ? { type, seatId } : null;
  }
  if (seatId !== undefined) return null;
  return { type: type as Exclude<IntentType, 'sit'> };
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
