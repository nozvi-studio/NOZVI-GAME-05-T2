import { BALANCE } from '@office/protocol';

/**
 * REQ-NET-005, REQ-NET-006: the client's own reconnect path after an unexpected drop.
 *
 * `connected -> reconnecting (attempts after 1, 2, 4, 8 s) -> expired`. Each delay in
 * `backoffSeconds` is waited before one attempt; a failed attempt waits the next delay.
 * After the last failed attempt, an attempt the server refuses for good (reservation gone),
 * or an attempt that would fall after the `windowSeconds` reservation, the state is
 * `expired` and the UI offers Rejoin. The SDK's own auto-reconnect is not used: it refuses
 * to run in the first 5 s of a room's uptime (DECISIONS, proof-of-concept results).
 *
 * Plain TypeScript with an injectable clock, so tests drive it without real time.
 */
export type ReconnectState =
  | { readonly status: 'connected' }
  /** `retryAt` is the clock time of the next attempt, or null while one is in flight. */
  | { readonly status: 'reconnecting'; readonly attempt: number; readonly retryAt: number | null }
  | { readonly status: 'expired' };

/** What one attempt achieved: back in, try again later, or the reservation is gone. */
export type AttemptResult = 'reconnected' | 'retry' | 'expired';

export type ReconnectClock = {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export const systemClock: ReconnectClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type ReconnectOptions = {
  /** Runs one reconnect attempt; a rejection counts as `retry`. */
  attempt: () => Promise<AttemptResult>;
  backoffSeconds?: readonly number[];
  windowSeconds?: number;
  clock?: ReconnectClock;
};

export class ReconnectMachine {
  private stateValue: ReconnectState = { status: 'connected' };
  private timer: unknown = undefined;
  private deadline = 0;
  /** Bumped on every transition out of a run, so a late attempt result is ignored. */
  private run = 0;
  private readonly listeners = new Set<(state: ReconnectState) => void>();
  private readonly attempt: () => Promise<AttemptResult>;
  private readonly backoff: readonly number[];
  private readonly windowMs: number;
  private readonly clock: ReconnectClock;

  constructor(options: ReconnectOptions) {
    this.attempt = options.attempt;
    this.backoff = options.backoffSeconds ?? BALANCE.net.backoffSeconds;
    this.windowMs = (options.windowSeconds ?? BALANCE.net.reconnectSeconds) * 1000;
    this.clock = options.clock ?? systemClock;
  }

  get state(): ReconnectState {
    return this.stateValue;
  }

  /** Subscribes to state changes; returns the unsubscribe function. */
  subscribe(listener: (state: ReconnectState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The connection dropped unexpectedly: start the backoff. Ignored unless connected. */
  drop(): void {
    if (this.stateValue.status !== 'connected') return;
    this.run++;
    this.deadline = this.clock.now() + this.windowMs;
    this.schedule(0);
  }

  /** Nothing to reconnect with (e.g. no stored token): offer Rejoin at once. */
  lose(): void {
    this.cancel();
    this.set({ status: 'expired' });
  }

  /** Back to `connected` (a reconnect or rejoin succeeded elsewhere, or a consented leave). */
  reset(): void {
    this.cancel();
    this.set({ status: 'connected' });
  }

  private schedule(index: number): void {
    const delaySeconds = this.backoff[index];
    if (delaySeconds === undefined) return this.lose();
    const retryAt = this.clock.now() + delaySeconds * 1000;
    if (retryAt > this.deadline) return this.lose();
    const run = this.run;
    this.set({ status: 'reconnecting', attempt: index + 1, retryAt });
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      if (run === this.run) void this.fire(index, run);
    }, delaySeconds * 1000);
  }

  private async fire(index: number, run: number): Promise<void> {
    this.set({ status: 'reconnecting', attempt: index + 1, retryAt: null });
    let result: AttemptResult;
    try {
      result = await this.attempt();
    } catch {
      result = 'retry';
    }
    if (run !== this.run) return;
    if (result === 'reconnected') this.reset();
    else if (result === 'expired') this.lose();
    else this.schedule(index + 1);
  }

  private cancel(): void {
    this.run++;
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private set(state: ReconnectState): void {
    this.stateValue = state;
    for (const listener of [...this.listeners]) listener(state);
  }
}

const TOKEN_KEY = 'office.reconnectionToken';

/** Where the reconnection token lives between a drop and the reconnect (ARCHITECTURE §5). */
export type TokenStore = {
  /** Returns false when storage is unavailable. */
  save(token: string): boolean;
  load(): string | null;
  clear(): void;
};

export function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Token store over `sessionStorage` (per tab); every access tolerates missing storage. */
export function sessionTokenStore(
  storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = safeSessionStorage,
): TokenStore {
  return {
    save(token) {
      try {
        const s = storage();
        if (!s) return false;
        s.setItem(TOKEN_KEY, token);
        return true;
      } catch {
        return false;
      }
    },
    load() {
      try {
        return storage()?.getItem(TOKEN_KEY) ?? null;
      } catch {
        return null;
      }
    },
    clear() {
      try {
        storage()?.removeItem(TOKEN_KEY);
      } catch {
        /* storage unavailable: nothing stored */
      }
    },
  };
}
