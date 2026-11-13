/**
 * REQ-NFR-005: sliding one-minute window of join attempts per client address.
 * The clock is injectable so tests control time.
 */
export class JoinRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limitPerMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records an attempt; returns false when the address already used its budget. */
  tryJoin(address: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(address) ?? []).filter((at) => t - at < 60_000);
    if (recent.length >= this.limitPerMinute) {
      this.hits.set(address, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(address, recent);
    return true;
  }

  /** Drops addresses with no attempt in the last minute (call occasionally to bound memory). */
  prune(): void {
    const t = this.now();
    for (const [address, list] of this.hits) {
      if (list.every((at) => t - at >= 60_000)) this.hits.delete(address);
    }
  }
}
