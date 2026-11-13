import { Client, type Room } from '@colyseus/sdk';
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

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';
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

/**
 * REQ-UI-002, REQ-NET-008: one Colyseus connection to the office room. `join` resolves
 * with the room handle or rejects with a `ConnectionError`; `leave` is a consented leave.
 */
export class Connection {
  private statusValue: ConnectionStatus = 'idle';
  private errorValue: ConnectionError | null = null;
  private roomValue: OfficeRoomHandle | null = null;
  private attempt = 0;
  private readonly listeners = new Set<(status: ConnectionStatus) => void>();

  constructor(
    private readonly endpoint: string,
    private readonly createClient: (endpoint: string) => JoinClient = (url) =>
      new Client(url) as unknown as JoinClient,
    private readonly timeoutMs = JOIN_TIMEOUT_MS,
  ) {}

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

  async join(identity: Identity): Promise<OfficeRoomHandle> {
    if (this.statusValue === 'connecting') throw new Error('join already in progress');
    if (this.roomValue) await this.leave();
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
      this.roomValue = room;
      room.onLeave(() => {
        if (this.roomValue !== room) return;
        this.roomValue = null;
        this.errorValue = new ConnectionError('unreachable');
        this.setStatus('error');
      });
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

  /** Consented leave; safe to call in any state. */
  async leave(): Promise<void> {
    const room = this.roomValue;
    this.attempt++;
    this.roomValue = null;
    this.errorValue = null;
    this.setStatus('idle');
    if (room) await room.leave(true).catch(() => undefined);
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.statusValue) return;
    this.statusValue = status;
    for (const listener of this.listeners) listener(status);
  }
}
