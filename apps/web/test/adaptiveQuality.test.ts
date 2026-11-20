import { describe, expect, it } from 'vitest';
import { BALANCE } from '@office/protocol';
import { FrameRateGovernor, initialPixelRatio } from '../src/game/adaptiveQuality';
import { ShadowRefresh } from '../src/game/lighting';

const config = {
  targetFps: 45,
  settleSeconds: 1,
  sampleSeconds: 1,
  pixelRatioStep: 0.25,
  minPixelRatio: 1,
};

/** Feeds `seconds` of frames at `fps`; returns every step the governor asked for. */
function run(governor: FrameRateGovernor, fps: number, seconds: number) {
  const steps = [];
  for (let i = 0; i < Math.round(fps * seconds); i++) {
    const step = governor.frame(1 / fps);
    if (step) steps.push(step);
  }
  return steps;
}

describe('FrameRateGovernor (FPS pass 2026-11-20)', () => {
  it('keeps full quality while the frame rate holds the target', () => {
    const governor = new FrameRateGovernor(1.5, true, config);
    expect(run(governor, 60, 30)).toEqual([]);
  });

  it('ignores slow frames while settling after start', () => {
    const governor = new FrameRateGovernor(1.5, true, config);
    expect(run(governor, 10, 0.9)).toEqual([]);
  });

  it('lowers the pixel ratio step by step to the floor, then turns shadows off, then stops', () => {
    const governor = new FrameRateGovernor(1.5, true, config);
    expect(run(governor, 20, 60)).toEqual([
      { kind: 'pixelRatio', ratio: 1.25 },
      { kind: 'pixelRatio', ratio: 1 },
      { kind: 'shadowsOff' },
    ]);
    expect(governor.exhausted).toBe(true);
  });

  it('waits a settle period after each step before judging again', () => {
    const governor = new FrameRateGovernor(2, true, config);
    // settle 1 s + sample 1 s -> first step at 2 s; the next needs another settle + sample.
    expect(run(governor, 20, 2.1)).toHaveLength(1);
    expect(run(governor, 20, 1.5)).toHaveLength(0);
    expect(run(governor, 20, 0.6)).toHaveLength(1);
  });

  it('goes straight to shadows when the pixel ratio is already at the floor', () => {
    const governor = new FrameRateGovernor(1, true, config);
    expect(run(governor, 20, 10)).toEqual([{ kind: 'shadowsOff' }]);
  });

  it('never steps back up once the frame rate recovers', () => {
    const governor = new FrameRateGovernor(1.5, true, config);
    expect(run(governor, 20, 2.1)).toEqual([{ kind: 'pixelRatio', ratio: 1.25 }]);
    expect(run(governor, 120, 30)).toEqual([]);
  });

  it('reads its defaults from BALANCE.rendering.adaptive', () => {
    const a = BALANCE.rendering.adaptive;
    expect(a.minPixelRatio).toBe(1);
    expect(a.targetFps).toBeGreaterThanOrEqual(30);
    expect(a.pixelRatioStep).toBeGreaterThan(0);
  });
});

describe('initialPixelRatio', () => {
  it('caps the device pixel ratio at BALANCE.rendering.maxPixelRatio', () => {
    expect(BALANCE.rendering.maxPixelRatio).toBeLessThan(2);
    expect(initialPixelRatio(3)).toBe(BALANCE.rendering.maxPixelRatio);
    expect(initialPixelRatio(2, 1.5)).toBe(1.5);
    expect(initialPixelRatio(1, 1.5)).toBe(1);
    expect(initialPixelRatio(0, 1.5)).toBe(1);
  });
});

describe('ShadowRefresh (FPS pass 2026-11-20)', () => {
  it('redraws on the first frame, then only once per interval', () => {
    const refresh = new ShadowRefresh(0.5);
    const frames = Array.from({ length: 60 }, () => refresh.tick(1 / 60, false));
    expect(frames[0]).toBe(true);
    // 60 frames = 1 s: the first frame plus one redraw per 0.5 s.
    expect(frames.filter(Boolean).length).toBe(2);
  });

  it('redraws every frame while something swings', () => {
    const refresh = new ShadowRefresh(0.5);
    refresh.tick(1 / 60, false);
    expect(Array.from({ length: 10 }, () => refresh.tick(1 / 60, true))).toEqual(
      Array(10).fill(true),
    );
  });

  it('defaults to BALANCE.rendering.shadow.refreshSeconds', () => {
    const refresh = new ShadowRefresh();
    expect(refresh.tick(0, false)).toBe(true);
    expect(refresh.tick(BALANCE.rendering.shadow.refreshSeconds / 2, false)).toBe(false);
    expect(refresh.tick(BALANCE.rendering.shadow.refreshSeconds, false)).toBe(true);
  });
});
