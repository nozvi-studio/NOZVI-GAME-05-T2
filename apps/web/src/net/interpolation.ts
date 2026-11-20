import { BALANCE } from '@office/protocol';

/** A replicated pose; `heading` is in radians. */
export type Pose = { x: number; z: number; heading: number };
/** A pose stamped with the local receive time in milliseconds. */
export type Snapshot = Pose & { t: number };

const TAU = Math.PI * 2;

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  const r = (((a + Math.PI) % TAU) + TAU) % TAU;
  return r === 0 ? Math.PI : r - Math.PI;
}

/** Turns from `a` toward `b` by fraction `f` along the shortest arc. */
export function lerpAngle(a: number, b: number, f: number): number {
  return wrapAngle(a + wrapAngle(b - a) * f);
}

export type InterpolationOptions = {
  /** Snapshots kept at most; older ones are dropped first. */
  capacity: number;
  /**
   * A snapshot arriving more than this long after the previous one (the employee stood still,
   * so no patch changed it) first re-stamps the previous pose one patch earlier, so movement
   * starts from rest over one patch instead of being stretched across the idle gap.
   */
  maxGapMs: number;
  /** Interval used for that re-stamped rest snapshot, and the spacing kept between snapshots. */
  patchMs: number;
  /**
   * T-1377: how far a snapshot's stamp may run ahead of its receive time to keep `patchMs`
   * spacing. Patches that arrive bunched (a slow frame held the socket messages) would
   * otherwise be stamped a few ms apart, and the avatar would cover a 50 ms step in that time.
   */
  maxLeadMs: number;
};

const DEFAULTS: InterpolationOptions = {
  capacity: 32,
  maxGapMs: BALANCE.net.patchMs * 2,
  patchMs: BALANCE.net.patchMs,
  maxLeadMs: BALANCE.net.interpolationDelayMs,
};

/**
 * REQ-NET-004: per-employee buffer of timestamped snapshots. Remote avatars are drawn at
 * `now - BALANCE.net.interpolationDelayMs` (see `renderTime`), interpolating linearly between
 * the two surrounding snapshots and turning heading along the shortest arc. When the render
 * time passes the newest snapshot the buffer has run dry and the last pose is held; there is
 * no extrapolation.
 */
export class InterpolationBuffer {
  private readonly snaps: Snapshot[] = [];
  private readonly options: InterpolationOptions;

  constructor(options: Partial<InterpolationOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  get size(): number {
    return this.snaps.length;
  }

  /** Drops every snapshot and starts again from `snapshot` (a jump that must not be blended). */
  reset(snapshot: Snapshot): void {
    this.snaps.length = 0;
    this.snaps.push({ ...snapshot });
  }

  /** `maxLeadMs` overrides the option, e.g. with the current adaptive delay (T-1377). */
  push(snapshot: Snapshot, maxLeadMs: number = this.options.maxLeadMs): void {
    const s = { ...snapshot };
    const last = this.snaps.at(-1);
    const { patchMs, maxGapMs } = this.options;
    if (last && s.t - last.t > maxGapMs) {
      this.snaps.push({ ...last, t: s.t - patchMs });
    } else if (last) {
      // T-1377: stamp patches at least one patch apart (each carries one server tick of
      // movement), running at most `maxLeadMs` ahead of the receive time. Bunched arrivals
      // keep their real spacing, so the drawn speed never exceeds the walking speed.
      s.t = Math.max(s.t, Math.min(last.t + patchMs, snapshot.t + maxLeadMs));
      if (s.t <= last.t) {
        // No room left within the lead: the newer pose replaces the newest one.
        this.snaps[this.snaps.length - 1] = { ...s, t: last.t };
        return;
      }
    }
    this.snaps.push(s);
    while (this.snaps.length > this.options.capacity) this.snaps.shift();
  }

  /** The interpolated pose at `renderTime` (ms), or null when nothing was received yet. */
  sample(renderTime: number): Pose | null {
    const first = this.snaps[0];
    const last = this.snaps.at(-1);
    if (!first || !last) return null;
    if (renderTime <= first.t) return pose(first);
    if (renderTime >= last.t) {
      // Dry buffer: hold the newest pose and keep only it.
      this.snaps.splice(0, this.snaps.length - 1);
      return pose(last);
    }
    let i = 0;
    while (this.snaps[i + 1]!.t <= renderTime) i++;
    // Snapshots before the lower bound can never be sampled again.
    if (i > 0) this.snaps.splice(0, i);
    const a = this.snaps[0]!;
    const b = this.snaps[1]!;
    const f = (renderTime - a.t) / (b.t - a.t);
    return {
      x: a.x + (b.x - a.x) * f,
      z: a.z + (b.z - a.z) * f,
      heading: lerpAngle(a.heading, b.heading, f),
    };
  }
}

export type DelayOptions = {
  baseMs: number;
  maxMs: number;
  patchMs: number;
  slew: number;
  window: number;
};

const DELAY_DEFAULTS: DelayOptions = {
  baseMs: BALANCE.net.interpolationDelayMs,
  maxMs: BALANCE.net.interpolationDelayMaxMs,
  patchMs: BALANCE.net.patchMs,
  slew: BALANCE.net.interpolationDelaySlew,
  window: BALANCE.net.interpolationDelayWindow,
};

/**
 * T-1377: interpolation delay that follows the frame time. Socket messages are only handled
 * between frames, so with frames slower than the base delay a patch is stamped up to a frame
 * late and the render time overtakes the newest snapshot: the avatar holds, then jumps. The
 * target is one patch plus the slowest of the last `window` frames, between `baseMs` and
 * `maxMs`; the delay moves toward it by at most `slew` ms per ms of frame time. At 60 FPS
 * the target is below the base, so nothing changes on normal machines.
 */
export class InterpolationDelay {
  private readonly options: DelayOptions;
  private readonly frames: number[] = [];
  private current: number;
  private last: number | null = null;

  constructor(options: Partial<DelayOptions> = {}) {
    this.options = { ...DELAY_DEFAULTS, ...options };
    this.current = this.options.baseMs;
  }

  /** The delay in ms after the frame at clock reading `now` (ms). */
  update(now: number): number {
    const { baseMs, maxMs, patchMs, slew, window } = this.options;
    const frameMs = this.last === null ? 0 : Math.max(0, now - this.last);
    this.last = now;
    if (frameMs === 0) return this.current;
    this.frames.push(frameMs);
    if (this.frames.length > window) this.frames.shift();
    const target = Math.min(maxMs, Math.max(baseMs, patchMs + Math.max(...this.frames)));
    const step = slew * frameMs;
    this.current += Math.max(-step, Math.min(step, target - this.current));
    return this.current;
  }
}

/** The time remote avatars are drawn at for a given local clock reading. */
export function renderTime(
  now: number,
  delayMs: number = BALANCE.net.interpolationDelayMs,
): number {
  return now - delayMs;
}

function pose(s: Snapshot): Pose {
  return { x: s.x, z: s.z, heading: wrapAngle(s.heading) };
}
