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
  /** Interval used for that re-stamped rest snapshot. */
  patchMs: number;
};

const DEFAULTS: InterpolationOptions = {
  capacity: 32,
  maxGapMs: BALANCE.net.patchMs * 2,
  patchMs: BALANCE.net.patchMs,
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

  push(snapshot: Snapshot): void {
    const s = { ...snapshot };
    const last = this.snaps.at(-1);
    if (last && s.t <= last.t) {
      // Same or earlier receive time (two patches in one frame): the newer pose wins.
      this.snaps[this.snaps.length - 1] = { ...s, t: last.t };
      return;
    }
    if (last && s.t - last.t > this.options.maxGapMs) {
      this.snaps.push({ ...last, t: s.t - this.options.patchMs });
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

/** The time remote avatars are drawn at for a given local clock reading. */
export function renderTime(now: number): number {
  return now - BALANCE.net.interpolationDelayMs;
}

function pose(s: Snapshot): Pose {
  return { x: s.x, z: s.z, heading: wrapAngle(s.heading) };
}
