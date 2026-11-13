import { describe, expect, it } from 'vitest';
import { BALANCE } from '@office/protocol';
import {
  ReconnectMachine,
  sessionTokenStore,
  type AttemptResult,
  type ReconnectClock,
  type ReconnectState,
} from '../src/net';

/** Controlled clock: timers run only when `advance` passes their due time. */
class FakeClock implements ReconnectClock {
  time = 0;
  private timers: { at: number; callback: () => void; id: number }[] = [];
  private nextId = 1;
  now = () => this.time;
  setTimeout = (callback: () => void, ms: number) => {
    const id = this.nextId++;
    this.timers.push({ at: this.time + ms, callback, id });
    return id;
  };
  clearTimeout = (handle: unknown) => {
    this.timers = this.timers.filter((t) => t.id !== handle);
  };
  get pending(): number {
    return this.timers.length;
  }
  /** Advances to `ms` later, firing due timers in order and letting attempts settle. */
  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    for (;;) {
      const due = this.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.time = due.at;
      due.callback();
      await flush();
    }
    this.time = end;
    await flush();
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function setup(
  results: AttemptResult[] = [],
  windowSeconds: number = BALANCE.net.reconnectSeconds,
) {
  const clock = new FakeClock();
  const attempts: number[] = [];
  const machine = new ReconnectMachine({
    clock,
    windowSeconds,
    attempt: async () => {
      attempts.push(clock.now());
      return results.shift() ?? 'retry';
    },
  });
  const states: ReconnectState[] = [];
  machine.subscribe((s) => states.push(s));
  return { clock, machine, attempts, states };
}

describe('ReconnectMachine', () => {
  it('uses the balance defaults: 1, 2, 4, 8 s backoff in a 20 s window', () => {
    expect(BALANCE.net.backoffSeconds).toEqual([1, 2, 4, 8]);
    expect(BALANCE.net.reconnectSeconds).toBe(20);
  });

  it('retries after 1, 2, 4 and 8 s, then expires and offers Rejoin', async () => {
    const { clock, machine, attempts } = setup();
    expect(machine.state).toEqual({ status: 'connected' });
    machine.drop();
    expect(machine.state).toEqual({ status: 'reconnecting', attempt: 1, retryAt: 1000 });

    await clock.advance(999);
    expect(attempts).toEqual([]);
    await clock.advance(1);
    expect(attempts).toEqual([1000]);
    expect(machine.state).toEqual({ status: 'reconnecting', attempt: 2, retryAt: 3000 });

    await clock.advance(2000);
    expect(attempts).toEqual([1000, 3000]);
    expect(machine.state).toEqual({ status: 'reconnecting', attempt: 3, retryAt: 7000 });

    await clock.advance(4000);
    expect(attempts).toEqual([1000, 3000, 7000]);
    expect(machine.state).toEqual({ status: 'reconnecting', attempt: 4, retryAt: 15000 });

    await clock.advance(8000);
    expect(attempts).toEqual([1000, 3000, 7000, 15000]);
    // Gaps between attempts follow the backoff: 1, 2, 4, 8 s.
    expect(attempts.map((t, i) => t - (attempts[i - 1] ?? 0))).toEqual([1000, 2000, 4000, 8000]);
    expect(machine.state).toEqual({ status: 'expired' });

    // Nothing else is scheduled after expiry.
    await clock.advance(60_000);
    expect(attempts).toHaveLength(4);
    expect(clock.pending).toBe(0);
  });

  it('reports an attempt in flight with retryAt null', async () => {
    const clock = new FakeClock();
    let finish!: (r: AttemptResult) => void;
    const machine = new ReconnectMachine({
      clock,
      attempt: () => new Promise((r) => (finish = r)),
    });
    machine.drop();
    await clock.advance(1000);
    expect(machine.state).toEqual({ status: 'reconnecting', attempt: 1, retryAt: null });
    finish('reconnected');
    await flush();
    expect(machine.state).toEqual({ status: 'connected' });
  });

  it('returns to connected when an attempt succeeds and stops retrying', async () => {
    const { clock, machine, attempts } = setup(['retry', 'reconnected']);
    machine.drop();
    await clock.advance(3000);
    expect(attempts).toEqual([1000, 3000]);
    expect(machine.state).toEqual({ status: 'connected' });
    await clock.advance(60_000);
    expect(attempts).toHaveLength(2);
  });

  it('counts a rejected attempt as a retry', async () => {
    const clock = new FakeClock();
    let calls = 0;
    const machine = new ReconnectMachine({
      clock,
      attempt: async () => {
        calls++;
        throw new Error('boom');
      },
    });
    machine.drop();
    await clock.advance(1000);
    expect(calls).toBe(1);
    expect(machine.state).toMatchObject({ status: 'reconnecting', attempt: 2 });
  });

  it('expires at once when the server says the reservation is gone', async () => {
    const { clock, machine, attempts } = setup(['expired']);
    machine.drop();
    await clock.advance(1000);
    expect(attempts).toEqual([1000]);
    expect(machine.state).toEqual({ status: 'expired' });
  });

  it('never schedules an attempt after the reservation window', async () => {
    // 1 + 2 + 4 = 7 s fit in a 10 s window; the 8 s step would land at 15 s.
    const { clock, machine, attempts } = setup([], 10);
    machine.drop();
    await clock.advance(7000);
    expect(attempts).toEqual([1000, 3000, 7000]);
    expect(machine.state).toEqual({ status: 'expired' });
  });

  it('lose() offers Rejoin at once and reset() cancels a running backoff', async () => {
    const { clock, machine, attempts, states } = setup();
    machine.lose();
    expect(machine.state).toEqual({ status: 'expired' });
    machine.reset();
    machine.drop();
    machine.reset();
    await clock.advance(30_000);
    expect(attempts).toEqual([]);
    expect(states.map((s) => s.status)).toEqual([
      'expired',
      'connected',
      'reconnecting',
      'connected',
    ]);
  });

  it('ignores a result that arrives after reset', async () => {
    const clock = new FakeClock();
    let finish!: (r: AttemptResult) => void;
    const machine = new ReconnectMachine({
      clock,
      attempt: () => new Promise((r) => (finish = r)),
    });
    machine.drop();
    await clock.advance(1000);
    machine.reset();
    finish('expired');
    await flush();
    expect(machine.state).toEqual({ status: 'connected' });
  });

  it('ignores drop() unless connected', async () => {
    const { clock, machine, attempts } = setup();
    machine.drop();
    await clock.advance(500);
    machine.drop();
    await clock.advance(500);
    expect(attempts).toEqual([1000]);
  });
});

describe('sessionTokenStore', () => {
  it('saves, loads and clears the token', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    const store = sessionTokenStore(() => storage);
    expect(store.load()).toBeNull();
    expect(store.save('ROOM:abc')).toBe(true);
    expect(store.load()).toBe('ROOM:abc');
    store.clear();
    expect(store.load()).toBeNull();
  });

  it('tolerates missing or throwing storage', () => {
    const missing = sessionTokenStore(() => null);
    expect(missing.save('x')).toBe(false);
    expect(missing.load()).toBeNull();
    expect(() => missing.clear()).not.toThrow();
    const fail = () => {
      throw new Error('SecurityError');
    };
    const throwing = sessionTokenStore(() => ({ getItem: fail, setItem: fail, removeItem: fail }));
    expect(throwing.save('x')).toBe(false);
    expect(throwing.load()).toBeNull();
    expect(() => throwing.clear()).not.toThrow();
  });
});
