import {
  BALANCE,
  FIXED_DT,
  applyInput,
  stepPlayer,
  type Aabb,
  type InputMessage,
  type PlayerState,
} from '@office/protocol';

/** One sampled input without its sequence number. */
export type InputSample = Omit<InputMessage, 'seq'>;

/** The replicated fields of the local employee that reconciliation reads. */
export type ServerSnapshot = { x: number; z: number; heading: number; lastSeq: number };

export type PredictorOptions = {
  /** Fixed step in seconds; defaults to `FIXED_DT` (50 ms). */
  stepSeconds?: number;
  /** Replayed positions closer than this (m) to the prediction are not corrected. */
  epsilon?: number;
  /** A correction is blended into the presented position over this many seconds. */
  blendSeconds?: number;
  /** Hard cap on inputs produced in any window of one second. */
  maxPerSecond?: number;
};

/**
 * REQ-NET-003, REQ-NET-004: fixed-step client prediction and reconciliation for the local
 * player, free of Three.js and sockets so it runs under a controlled clock in tests.
 *
 * - `advance` accumulates frame time; every fixed step it applies one sampled input with the
 *   shared `applyInput` (the server's exact step), buffers it as pending and emits it. Seqs
 *   start at 1 (the server's `lastSeq` starts at 0) and strictly increase.
 * - `present` renders a throwaway partial step for the time left in the accumulator, so the
 *   avatar reacts on the same frame, plus any correction still being blended out.
 * - `reconcile` resets to the server state, drops inputs up to `lastSeq` and replays the rest.
 *   A replay within `epsilon` of the prediction changes nothing.
 *
 * Send rate: steps follow the frame clock, so on average there are `1 / stepSeconds` per
 * second; a sliding window additionally defers a step that would make more than
 * `maxPerSecond` inputs in one second (frames that batch several steps cannot exceed it).
 */
export class Predictor {
  /** Called once per produced input; the room binding sends it. */
  onInput: ((input: InputMessage) => void) | undefined;

  private fixed: PlayerState;
  private readonly pendingInputs: InputMessage[] = [];
  private nextSeq = 1;
  private accumulator = 0;
  private clock = 0;
  /** Clock times of the most recent `maxPerSecond` inputs, oldest first. */
  private readonly recentSends: number[] = [];
  private offset = { x: 0, z: 0 };
  private blendLeft = 0;
  private detachedValue = false;
  private readonly step: number;
  private readonly epsilon: number;
  private readonly blendSeconds: number;
  private readonly maxPerSecond: number;

  constructor(
    start: PlayerState,
    private readonly colliders: readonly Aabb[],
    options: PredictorOptions = {},
  ) {
    this.fixed = { ...start };
    this.step = options.stepSeconds ?? FIXED_DT;
    this.epsilon = options.epsilon ?? BALANCE.net.reconcileEpsilon;
    this.blendSeconds = options.blendSeconds ?? BALANCE.net.correctionBlendSeconds;
    this.maxPerSecond = options.maxPerSecond ?? BALANCE.net.tickHz;
  }

  /** The last fixed-step state (what the server is expected to compute). */
  get state(): PlayerState {
    return { ...this.fixed };
  }

  /** Inputs sent but not yet acknowledged by the server's `lastSeq`. */
  get pending(): readonly InputMessage[] {
    return this.pendingInputs;
  }

  /** True after a dev teleport: server patches are ignored (see `detach`). */
  get detached(): boolean {
    return this.detachedValue;
  }

  /** Advances the clock by `dt` seconds and runs every due fixed step with `sample`. */
  advance(dt: number, sample: InputSample): InputMessage[] {
    if (!(dt > 0) || !Number.isFinite(dt)) return [];
    this.clock += dt;
    // Never build a backlog beyond a few steps (e.g. while the rate cap defers steps).
    this.accumulator = Math.min(this.accumulator + dt, 3 * this.step);
    this.blendLeft = Math.max(0, this.blendLeft - dt);
    const produced: InputMessage[] = [];
    while (this.accumulator >= this.step && this.underRateCap()) {
      this.accumulator -= this.step;
      const input: InputMessage = { seq: this.nextSeq++, ...sample };
      this.fixed = applyInput(this.fixed, input, this.colliders);
      if (!this.detachedValue) this.pendingInputs.push(input);
      this.recentSends.push(this.clock);
      if (this.recentSends.length > this.maxPerSecond) this.recentSends.shift();
      produced.push(input);
      this.onInput?.(input);
    }
    return produced;
  }

  /** The state to render this frame: fixed state + partial step + blended correction. */
  present(sample: InputSample): PlayerState {
    const partial =
      this.accumulator > 0
        ? stepPlayer(this.fixed, sample, sample.yaw, this.accumulator, this.colliders)
        : this.fixed;
    const k = this.blendSeconds > 0 ? this.blendLeft / this.blendSeconds : 0;
    return {
      x: partial.x + this.offset.x * k,
      z: partial.z + this.offset.z * k,
      heading: partial.heading,
    };
  }

  /**
   * Applies an authoritative snapshot. Returns true when the replayed position differs from
   * the prediction by at least `epsilon` (a correction, blended in by `present`).
   */
  reconcile(server: ServerSnapshot): boolean {
    if (this.detachedValue) return false;
    while (this.pendingInputs.length > 0 && this.pendingInputs[0]!.seq <= server.lastSeq) {
      this.pendingInputs.shift();
    }
    let replayed: PlayerState = { x: server.x, z: server.z, heading: server.heading };
    for (const input of this.pendingInputs) replayed = applyInput(replayed, input, this.colliders);
    const dx = this.fixed.x - replayed.x;
    const dz = this.fixed.z - replayed.z;
    if (Math.hypot(dx, dz) < this.epsilon) return false;
    // Keep the rendered position continuous: the old error still on screen plus the jump.
    const k = this.blendSeconds > 0 ? this.blendLeft / this.blendSeconds : 0;
    this.offset = { x: dx + this.offset.x * k, z: dz + this.offset.z * k };
    this.blendLeft = this.blendSeconds;
    this.fixed = replayed;
    return true;
  }

  /** Moves the fixed state locally (seat sockets) without a blend; reconciliation continues. */
  reset(state: PlayerState): void {
    this.fixed = { ...state };
    this.offset = { x: 0, z: 0 };
    this.blendLeft = 0;
  }

  /**
   * Dev and test teleport: the server has no teleport, so from now on server patches are
   * ignored and the local player is simulated on its own (inputs are still sent).
   */
  detach(state: PlayerState): void {
    this.reset(state);
    this.detachedValue = true;
    this.pendingInputs.length = 0;
  }

  private underRateCap(): boolean {
    if (this.recentSends.length < this.maxPerSecond) return true;
    return this.clock - this.recentSends[0]! >= 1;
  }
}
