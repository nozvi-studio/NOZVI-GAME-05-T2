import {
  BALANCE,
  applyInput,
  nextActivity,
  parseInput,
  type Aabb,
  type Activity,
  type InputMessage,
} from '@office/protocol';

/** Fixed simulation interval in milliseconds (50 ms at 20 Hz). */
export const TICK_MS = 1000 / BALANCE.net.tickHz;

/** The replicated fields the movement simulation reads and writes (`EmployeeState` fits). */
export type MovementBody = {
  x: number;
  z: number;
  heading: number;
  activity: string;
  lastSeq: number;
};

type Queue = { inputs: InputMessage[]; highestSeq: number };

/**
 * REQ-NET-002, REQ-NET-003: authoritative fixed-step movement, free of sockets and timers.
 *
 * Queue policy: each client has a FIFO capped at `BALANCE.net.inputQueueMax`; inputs that
 * arrive while it is full are dropped. Each tick consumes at most ONE input per client, so
 * a client advances at most one 50 ms step per tick no matter how fast it sends; flooding
 * only fills the queue. An input is accepted only if its seq is greater than every seq
 * already accepted (applied or queued) for that client, so replayed and decreasing seqs
 * are ignored. The first accepted seq must exceed the body's `lastSeq` (0 on join).
 *
 * Activity changes only when an input is applied: `move` if the step changed the position
 * or the input had a nonzero axis, otherwise `stop`; `nextActivity` keeps seated states.
 */
export class MovementSim {
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly queueMax: number = BALANCE.net.inputQueueMax) {}

  /** Starts tracking a client; `lastSeq` is the seq already applied for its body. */
  add(id: string, lastSeq = 0): void {
    this.queues.set(id, { inputs: [], highestSeq: lastSeq });
  }

  remove(id: string): void {
    this.queues.delete(id);
  }

  /** Validates and queues a raw `input` payload; returns whether it was accepted. */
  enqueue(id: string, raw: unknown): boolean {
    const queue = this.queues.get(id);
    if (!queue) return false;
    const input = parseInput(raw);
    if (input === null || input.seq <= queue.highestSeq) return false;
    if (queue.inputs.length >= this.queueMax) return false;
    queue.inputs.push(input);
    queue.highestSeq = input.seq;
    return true;
  }

  /** Number of inputs waiting for a client (for tests and diagnostics). */
  queued(id: string): number {
    return this.queues.get(id)?.inputs.length ?? 0;
  }

  /** Advances every tracked body by at most one queued input. */
  tick(bodies: { get(id: string): MovementBody | undefined }, colliders: readonly Aabb[]): void {
    for (const [id, queue] of this.queues) {
      const body = bodies.get(id);
      const input = queue.inputs.shift();
      if (!body || !input) continue;
      stepBody(body, input, colliders);
    }
  }
}

/** Applies one input to a body in place, exactly as `applyInput` would. */
export function stepBody(
  body: MovementBody,
  input: InputMessage,
  colliders: readonly Aabb[],
): void {
  const next = applyInput(body, input, colliders);
  const moved = next.x !== body.x || next.z !== body.z || input.forward !== 0 || input.right !== 0;
  body.x = next.x;
  body.z = next.z;
  body.heading = next.heading;
  body.lastSeq = input.seq;
  body.activity = nextActivity(body.activity as Activity, { type: moved ? 'move' : 'stop' });
}

/**
 * Runs `tick` every `TICK_MS` through the given scheduler (the room passes its own
 * timestep; tests pass fake timers), so the interval is checkable on a controlled clock.
 */
export function startMovementLoop(
  schedule: (callback: () => void, delayMs: number) => void,
  tick: () => void,
): void {
  schedule(tick, TICK_MS);
}
