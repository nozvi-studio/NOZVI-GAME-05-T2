import { schema, t, type SchemaType } from '@colyseus/schema';

/**
 * Replicated employee. Built with `schema()` instead of decorators so the same module
 * compiles under tsx (server) and Vite (web) without legacy decorator settings.
 * Positions are float64 so reconciliation compares exactly what the server computed.
 */
export const EmployeeState = schema(
  {
    name: t.string(),
    avatarId: t.string(),
    x: t.float64(),
    z: t.float64(),
    heading: t.float64(),
    /** An `Activity` value from `activity.ts`. */
    activity: t.string().default('idle'),
    /** REQ-INT-003: an `Item` value from `activity.ts`; empty string for an empty hand. */
    item: t.string().default(''),
    /** Sips left in the held coffee; 0 when the hand is empty. */
    sips: t.uint8().default(0),
    /**
     * REQ-AVATAR-004: the running `EmoteId` from `activity.ts`, or empty string. A layer over
     * `activity`, which keeps its value while the emote plays.
     */
    emote: t.string().default(''),
    /** Empty string when not seated. */
    seatId: t.string().default(''),
    /** False while the server holds the slot for a reconnect. */
    connected: t.boolean().default(true),
    /** Last input sequence number the server applied for this employee. */
    lastSeq: t.uint32().default(0),
  },
  'EmployeeState',
);
export type EmployeeState = SchemaType<typeof EmployeeState>;

/** The only video provider in Phase 4 (REQ-TV-007 keeps the field for later providers). */
export const TV_PROVIDERS = ['youtube'] as const;
export type TvProvider = (typeof TV_PROVIDERS)[number];
export const TV_STATUSES = ['idle', 'playing', 'paused'] as const;
export type TvStatus = (typeof TV_STATUSES)[number];

/**
 * `t.string()` has no nullable variant. The server writes `null`; Colyseus sends that as a
 * field delete, so a decoded field reads `undefined`. Clients read through `readTv`.
 */
const NULL_STRING = null as unknown as string;

/**
 * REQ-TV-004: the shared wall TV. Times are float64 so every client derives the same
 * playback position. `currentTime` is seconds of video time at `updatedAt`, and
 * `updatedAt` is server epoch milliseconds (DECISIONS: TV timing convention).
 */
export const SharedTVState = schema(
  {
    /** Null when the TV is idle. */
    videoId: t.string().default(NULL_STRING),
    /** A `TvProvider` value. */
    provider: t.string().default('youtube'),
    /** A `TvStatus` value. */
    status: t.string().default('idle'),
    currentTime: t.float64().default(0),
    updatedAt: t.float64().default(0),
    /** Session that sent the last command; null when idle or after that session left. */
    controllerSessionId: t.string().default(NULL_STRING),
  },
  'SharedTVState',
);
export type SharedTVState = Omit<
  SchemaType<typeof SharedTVState>,
  'videoId' | 'controllerSessionId'
> & { videoId: string | null; controllerSessionId: string | null };

/** Plain snapshot of the TV with `null` for absent ids and narrowed enum fields. */
export type TvSnapshot = {
  videoId: string | null;
  provider: TvProvider;
  status: TvStatus;
  currentTime: number;
  updatedAt: number;
  controllerSessionId: string | null;
};

/** REQ-TV-004: normalizes server or decoded TV state (undefined ids become null). */
export function readTv(tv: {
  videoId?: string | null;
  provider: string;
  status: string;
  currentTime: number;
  updatedAt: number;
  controllerSessionId?: string | null;
}): TvSnapshot {
  const status = (TV_STATUSES as readonly string[]).includes(tv.status)
    ? (tv.status as TvStatus)
    : 'idle';
  // T-1568: read the decoded provider; an unknown value falls back to the only provider.
  const provider = (TV_PROVIDERS as readonly string[]).includes(tv.provider)
    ? (tv.provider as TvProvider)
    : TV_PROVIDERS[0];
  return {
    videoId: tv.videoId ?? null,
    provider,
    status,
    currentTime: tv.currentTime,
    updatedAt: tv.updatedAt,
    controllerSessionId: tv.controllerSessionId ?? null,
  };
}

/**
 * REQ-CHAT-001/002 (Phase 4.2): one chat message, written only by the server. `sentAt` is
 * the server epoch ms when it accepted the message; the room tick removes the entry
 * `BALANCE.chat.ttlSeconds` later.
 */
export const ChatMessageState = schema(
  {
    id: t.string(),
    sessionId: t.string(),
    name: t.string(),
    text: t.string(),
    sentAt: t.float64(),
  },
  'ChatMessageState',
);
export type ChatMessageState = SchemaType<typeof ChatMessageState>;

/** Room state; employees are keyed by Colyseus sessionId. `chat` is oldest first. */
export const OfficeState = schema(
  {
    employees: t.map(EmployeeState),
    tv: SharedTVState,
    chat: t.array(ChatMessageState),
  },
  'OfficeState',
);
export type OfficeState = SchemaType<typeof OfficeState>;
