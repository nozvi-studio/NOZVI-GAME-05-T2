import { BALANCE } from '@office/protocol';

/** The `BALANCE.rendering.adaptive` values the governor reads (widened for tests). */
export type AdaptiveConfig = {
  /** Frame rate the `high` render quality tries to hold. */
  targetFps: number;
  /** Seconds ignored after start or after a step down (loading, shader compiles). */
  settleSeconds: number;
  /** Length of one frame-rate sample window. */
  sampleSeconds: number;
  /** Pixel ratio removed per step down, and the floor. */
  pixelRatioStep: number;
  minPixelRatio: number;
};

/** The quality steps a governor can take, cheapest visual loss first. */
export type QualityStep = { kind: 'pixelRatio'; ratio: number } | { kind: 'shadowsOff' };

/**
 * FPS pass 2026-11-20 (owner: `high` fell below 30 FPS on every machine): watches the frame
 * rate of `high` quality and steps it down when a sample window averages below the target,
 * first the pixel ratio (`pixelRatioStep` at a time down to `minPixelRatio`), then the sun's
 * shadow map. It never steps back up, so it cannot oscillate; a reload starts again at full
 * quality. Pure: the game applies the returned step.
 */
export class FrameRateGovernor {
  private settle: number;
  private elapsed = 0;
  private frames = 0;
  private shadows: boolean;

  constructor(
    private pixelRatio: number,
    shadows: boolean,
    private readonly config: AdaptiveConfig = BALANCE.rendering.adaptive,
  ) {
    this.shadows = shadows;
    this.settle = config.settleSeconds;
  }

  /** True once nothing is left to lower. */
  get exhausted(): boolean {
    return this.pixelRatio <= this.config.minPixelRatio && !this.shadows;
  }

  /** Feeds one frame of `dt` seconds; returns a step to apply, or null. */
  frame(dt: number): QualityStep | null {
    if (this.exhausted) return null;
    if (this.settle > 0) {
      this.settle -= dt;
      return null;
    }
    this.elapsed += dt;
    this.frames += 1;
    if (this.elapsed < this.config.sampleSeconds) return null;
    const fps = this.frames / this.elapsed;
    this.elapsed = 0;
    this.frames = 0;
    if (fps >= this.config.targetFps) return null;
    this.settle = this.config.settleSeconds;
    if (this.pixelRatio > this.config.minPixelRatio) {
      const next = Math.max(
        this.config.minPixelRatio,
        this.pixelRatio - this.config.pixelRatioStep,
      );
      this.pixelRatio = Math.round(next * 100) / 100;
      return { kind: 'pixelRatio', ratio: this.pixelRatio };
    }
    this.shadows = false;
    return { kind: 'shadowsOff' };
  }
}

/** Starting pixel ratio: the device's, capped by `BALANCE.rendering.maxPixelRatio`. */
export function initialPixelRatio(
  devicePixelRatio: number,
  max: number = BALANCE.rendering.maxPixelRatio,
): number {
  return Math.min(devicePixelRatio || 1, max);
}
