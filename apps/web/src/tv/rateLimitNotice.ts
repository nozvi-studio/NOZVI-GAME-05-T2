/** The panel text while the server refuses TV commands (REQ-NFR-005, T-1568). */
export function rateLimitMessage(seconds: number): string {
  return `Too many TV commands, try again in ${seconds} s.`;
}

/** What the TV panel reads: the current message and change notifications. */
export type TvNoticeSource = {
  message(): string | null;
  subscribe(listener: () => void): () => void;
};

export type Timers = {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

const DEFAULT_TIMERS: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * T-1568: a server rate-limit notice as a short-lived panel message. `show` starts (or
 * extends) the block; the message counts down in whole seconds and clears itself after
 * `retryAfterMs`. `format` words the message (T-1695 reuses this class for chat).
 */
export class RateLimitNotice implements TvNoticeSource {
  private until = 0;
  private timer: unknown = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly timers: Timers = DEFAULT_TIMERS,
    private readonly format: (seconds: number) => string = rateLimitMessage,
  ) {}

  show(retryAfterMs: number): void {
    const wait = Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 0;
    this.until = this.now() + wait;
    this.cancel();
    this.timer = this.timers.set(() => {
      this.timer = null;
      this.until = 0;
      this.emit();
    }, wait);
    this.emit();
  }

  message(): string | null {
    const left = this.until - this.now();
    return left > 0 ? this.format(Math.ceil(left / 1000)) : null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.cancel();
    this.listeners.clear();
  }

  private cancel(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

/** T-1568: the `tv_rate_limited` notice; the binding still drops commands until it clears. */
export class TvRateLimitNotice extends RateLimitNotice {}
