import { Client, type Room } from '@colyseus/sdk';
import {
  ReconnectMachine,
  sessionTokenStore,
  type ReconnectClock,
  type ReconnectState,
  type TokenStore,
} from './reconnect';
import {
  OFFICE_ROOM,
  OfficeState,
  PROTOCOL_VERSION,
  isJoinErrorCode,
  type AvatarId,
  type JoinErrorCode,
  type JoinOptions,
} from '@office/protocol';

/** Local default for development; deployments set `VITE_SERVER_URL`. */
export const DEFAULT_SERVER_URL = 'http://localhost:2567';
/** A join that has not settled after this long is reported as `unreachable`. */
export const JOIN_TIMEOUT_MS = 10_000;
/** One reconnect attempt that has not settled after this long counts as a failed attempt. */
export const RECONNECT_ATTEMPT_TIMEOUT_MS = 4_000;

/**
 * `reconnecting`: an unexpected drop, the client is retrying with its reconnection token.
 * `lost`: retries are used up or the reservation expired; the UI offers Rejoin.
 */
export type ConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'lost' | 'error';
export type ConnectionErrorCode = JoinErrorCode | 'unreachable' | 'unknown';
export type Identity = { name: string; officeCode: string; avatarId: AvatarId };
export type OfficeRoomHandle = Room<unknown, OfficeState>;

export class ConnectionError extends Error {
  constructor(
    readonly code: ConnectionErrorCode,
    readonly cause?: unknown,
  ) {
    super(code);
    this.name = 'ConnectionError';
  }
}

/** The part of the SDK client the wrapper uses; tests substitute a fake. */
export type JoinClient = {
  joinOrCreate(
    roomName: string,
    options: JoinOptions,
    rootSchema: typeof OfficeState,
  ): Promise<OfficeRoomHandle>;
  reconnect(reconnectionToken: string, rootSchema: typeof OfficeState): Promise<OfficeRoomHandle>;
};

/** Server URL from `VITE_SERVER_URL`, falling back to the local default. */
export function serverUrl(env: { VITE_SERVER_URL?: string | undefined }): string {
  const url = env.VITE_SERVER_URL?.trim();
  return url ? url : DEFAULT_SERVER_URL;
}

/** WebSocket close codes (1000-1015) and gateway failures mean the server was not reached. */
function isTransportCode(code: unknown): boolean {
  if (typeof code !== 'number') return true;
  return (code >= 1000 && code <= 1015) || code === 502 || code === 503 || code === 504;
}

/**
 * Maps an SDK join failure to a typed error. The server's rejection message is the join
 * error code (a rejection from room creation arrives as HTTP 500), so match on the message.
 * Fetch failures carry no numeric code (`ECONNREFUSED` in Node, none in browsers).
 */
export function toConnectionError(err: unknown): ConnectionError {
  if (err instanceof ConnectionError) return err;
  const e = (typeof err === 'object' && err !== null ? err : {}) as {
    message?: unknown;
    code?: unknown;
  };
  if (isJoinErrorCode(e.message)) return new ConnectionError(e.message, err);
  if (err instanceof TypeError || (err instanceof Error && isTransportCode(e.code))) {
    return new ConnectionError('unreachable', err);
  }
  return new ConnectionError('unknown', err);
}

export type ConnectionOptions = {
  /** Where the reconnection token is kept; defaults to `sessionStorage`. */
  tokens?: TokenStore;
  /** Clock of the reconnect backoff; tests pass a controlled one. */
  clock?: ReconnectClock;
  backoffSeconds?: readonly number[];
  windowSeconds?: number;
  attemptTimeoutMs?: number;
};

type ReconnectResult = 'reconnected' | 'retry' | 'expired';

/**
 * REQ-UI-002, REQ-NET-008: one Colyseus connection to the office room. `join` resolves
 * with the room handle or rejects with a `ConnectionError`; `leave` is a consented leave.
 *
 * REQ-NET-005, REQ-NET-006: any other end of the room is an unexpected drop. The SDK's own
 * auto-reconnect is switched off (it refuses in the first 5 s of uptime); instead the
 * `reconnection` machine retries with the token kept in `sessionStorage` after 1, 2, 4 and
 * 8 s (status `reconnecting`), then gives up (status `lost`) and the UI offers `rejoin`.
 * Without a stored token (storage unavailable) a drop goes straight to `lost`. A resumed
 * session is a new room handle for the same `sessionId`, announced through `onRoom`.
 */
export class Connection {
  private statusValue: ConnectionStatus = 'idle';
  private errorValue: ConnectionError | null = null;
  private roomValue: OfficeRoomHandle | null = null;
  private identityValue: Identity | null = null;
  /** In-memory copy of the last token, so Rejoin can resume even without storage. */
  private lastToken: string | null = null;
  /** Bumped by join and leave; a join or reconnect started before is stale. */
  private attempt = 0;
  private readonly listeners = new Set<(status: ConnectionStatus) => void>();
  private readonly roomListeners = new Set<(room: OfficeRoomHandle) => void>();
  private readonly tokens: TokenStore;
  private readonly attemptTimeoutMs: number;
  readonly reconnection: ReconnectMachine;

  constructor(
    private readonly endpoint: string,
    private readonly createClient: (endpoint: string) => JoinClient = (url) =>
      new Client(url) as unknown as JoinClient,
    private readonly timeoutMs = JOIN_TIMEOUT_MS,
    options: ConnectionOptions = {},
  ) {
    this.tokens = options.tokens ?? sessionTokenStore();
    this.attemptTimeoutMs = options.attemptTimeoutMs ?? RECONNECT_ATTEMPT_TIMEOUT_MS;
    this.reconnection = new ReconnectMachine({
      attempt: () => this.tryReconnect(),
      ...(options.backoffSeconds ? { backoffSeconds: options.backoffSeconds } : {}),
      ...(options.windowSeconds !== undefined ? { windowSeconds: options.windowSeconds } : {}),
      ...(options.clock ? { clock: options.clock } : {}),
    });
    this.reconnection.subscribe((state: ReconnectState) => {
      if (state.status === 'reconnecting') this.setStatus('reconnecting');
      else if (state.status === 'expired') this.setStatus('lost');
    });
  }

  get status(): ConnectionStatus {
    return this.statusValue;
  }
  get error(): ConnectionError | null {
    return this.errorValue;
  }
  get room(): OfficeRoomHandle | null {
    return this.roomValue;
  }

  /** Subscribes to status changes; returns the unsubscribe function. */
  onStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Subscribes to resumed sessions (same `sessionId`, new room handle). */
  onRoom(listener: (room: OfficeRoomHandle) => void): () => void {
    this.roomListeners.add(listener);
    return () => this.roomListeners.delete(listener);
  }

  async join(identity: Identity): Promise<OfficeRoomHandle> {
    if (this.statusValue === 'connecting') throw new Error('join already in progress');
    if (this.roomValue) await this.leave();
    this.reconnection.reset();
    this.identityValue = identity;
    return this.joinFresh(identity);
  }

  /**
   * The Rejoin action after `lost`: resumes the held session while the server still has it
   * (so the person never appears twice), otherwise joins afresh with the same name, code
   * and avatar. A fresh join has a new `sessionId`; a resumed one is also sent to `onRoom`.
   */
  async rejoin(): Promise<OfficeRoomHandle> {
    const identity = this.identityValue;
    if (!identity) throw new Error('nothing to rejoin');
    if (this.statusValue === 'connecting') throw new Error('join already in progress');
    this.reconnection.reset();
    const token = this.tokens.load() ?? this.lastToken;
    if (token !== null) {
      this.errorValue = null;
      this.setStatus('connecting');
      const result = await this.reconnectWith(token);
      if (result === 'reconnected' && this.roomValue) return this.roomValue;
      if (result === 'retry') {
        this.errorValue = new ConnectionError('unreachable');
        this.setStatus('lost');
        throw this.errorValue;
      }
    }
    this.tokens.clear();
    this.lastToken = null;
    return this.joinFresh(identity);
  }

  /** Consented leave; safe to call in any state. */
  async leave(): Promise<void> {
    const room = this.roomValue;
    this.attempt++;
    this.roomValue = null;
    this.errorValue = null;
    this.reconnection.reset();
    this.tokens.clear();
    this.lastToken = null;
    this.setStatus('idle');
    if (room) await room.leave(true).catch(() => undefined);
  }

  private async joinFresh(identity: Identity): Promise<OfficeRoomHandle> {
    const attempt = ++this.attempt;
    this.errorValue = null;
    this.setStatus('connecting');
    const options: JoinOptions = { ...identity, protocolVersion: PROTOCOL_VERSION };
    const pending = Promise.resolve().then(() =>
      this.createClient(this.endpoint).joinOrCreate(OFFICE_ROOM, options, OfficeState),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ConnectionError('unreachable')), this.timeoutMs);
    });
    try {
      const room = await Promise.race([pending, timeout]);
      if (attempt !== this.attempt) {
        // leave() was called while connecting: drop the late room.
        void room.leave(true).catch(() => undefined);
        throw new ConnectionError('unknown');
      }
      this.adopt(room);
      this.setStatus('connected');
      return room;
    } catch (err) {
      // A room that arrives after the timeout is left at once so it holds no seat.
      pending.then((late) => late.leave(true)).catch(() => undefined);
      const error = toConnectionError(err);
      if (attempt === this.attempt) {
        this.errorValue = error;
        this.setStatus('error');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Takes ownership of a joined or resumed room and watches it for an unexpected end. */
  private adopt(room: OfficeRoomHandle): void {
    this.roomValue = room;
    this.errorValue = null;
    this.reconnection.reset();
    // The client runs its own retry path (see the class comment).
    if (room.reconnection) room.reconnection.enabled = false;
    this.lastToken = room.reconnectionToken || null;
    if (this.lastToken) this.tokens.save(this.lastToken);
    room.onLeave(() => {
      if (this.roomValue !== room) return;
      this.roomValue = null;
      this.errorValue = new ConnectionError('unreachable');
      if (this.tokens.load() !== null) this.reconnection.drop();
      else this.reconnection.lose();
    });
  }

  /** One attempt of the backoff, with the token from storage. */
  private async tryReconnect(): Promise<ReconnectResult> {
    const token = this.tokens.load();
    return token === null ? 'expired' : this.reconnectWith(token);
  }

  /**
   * One reconnect with `token`. An unreachable server (or no answer in time) is worth a
   * retry; any refusal from the server means the reservation is gone. A room that arrives
   * after the timeout is still adopted if nothing else happened meanwhile.
   */
  private async reconnectWith(token: string): Promise<ReconnectResult> {
    const attempt = this.attempt;
    const pending = Promise.resolve().then(() =>
      this.createClient(this.endpoint).reconnect(token, OfficeState),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.attemptTimeoutMs);
    });
    try {
      const room = await Promise.race([pending, timeout]);
      if (room === 'timeout') {
        pending.then((late) => this.resume(late, attempt)).catch(() => undefined);
        return 'retry';
      }
      return this.resume(room, attempt) ? 'reconnected' : 'expired';
    } catch (err) {
      return toConnectionError(err).code === 'unreachable' ? 'retry' : 'expired';
    } finally {
      clearTimeout(timer);
    }
  }

  /** Adopts a resumed room unless a leave or another room came first (then leaves it). */
  private resume(room: OfficeRoomHandle, attempt: number): boolean {
    if (attempt !== this.attempt || this.roomValue !== null) {
      void room.leave(true).catch(() => undefined);
      return false;
    }
    this.adopt(room);
    this.setStatus('connected');
    for (const listener of [...this.roomListeners]) listener(room);
    return true;
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.statusValue) return;
    this.statusValue = status;
    for (const listener of [...this.listeners]) listener(status);
  }
}
