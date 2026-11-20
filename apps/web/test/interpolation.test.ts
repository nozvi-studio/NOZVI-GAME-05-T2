import { describe, expect, it } from 'vitest';
import { BALANCE } from '@office/protocol';
import {
  InterpolationBuffer,
  lerpAngle,
  renderTime,
  wrapAngle,
  InterpolationDelay,
} from '../src/net/interpolation';

/** Controlled clock: snapshots arrive every patch with x = t / 100 (1 m per 100 ms). */
function trace(buffer: InterpolationBuffer, from: number, to: number, heading = 0) {
  for (let t = from; t <= to; t += BALANCE.net.patchMs) {
    buffer.push({ t, x: t / 100, z: -t / 200, heading });
  }
}

describe('InterpolationBuffer (REQ-NET-004)', () => {
  it('renders 100 ms in the past by default', () => {
    expect(BALANCE.net.interpolationDelayMs).toBe(100);
    expect(renderTime(1_000)).toBe(900);
  });

  it('samples the pose that corresponds to now minus 100 ms on a timestamped trace', () => {
    const buffer = new InterpolationBuffer();
    trace(buffer, 0, 1_000);
    for (const now of [150, 375, 512.5, 800, 1_000]) {
      const pose = buffer.sample(renderTime(now))!;
      const t = now - 100;
      expect(pose.x).toBeCloseTo(t / 100, 9);
      expect(pose.z).toBeCloseTo(-t / 200, 9);
    }
  });

  it('turns heading along the shortest arc across the +-PI seam', () => {
    const buffer = new InterpolationBuffer();
    const a = Math.PI - 0.1;
    const b = -Math.PI + 0.1; // 0.2 rad further counterclockwise, not 2PI - 0.2 back.
    buffer.push({ t: 0, x: 0, z: 0, heading: a });
    buffer.push({ t: 50, x: 0, z: 0, heading: b });
    const mid = buffer.sample(25)!.heading;
    expect(Math.abs(wrapAngle(mid - Math.PI))).toBeLessThan(1e-9);
    const quarter = buffer.sample(12.5)!.heading;
    expect(quarter).toBeCloseTo(Math.PI - 0.05, 9);
    const late = buffer.sample(37.5)!.heading;
    expect(late).toBeCloseTo(-Math.PI + 0.05, 9);
  });

  it('lerpAngle and wrapAngle stay in (-PI, PI]', () => {
    expect(lerpAngle(0.1, -0.1, 0.5)).toBeCloseTo(0, 12);
    expect(lerpAngle(-3, 3, 0.5)).toBeCloseTo(Math.PI, 9);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(7)).toBeCloseTo(7 - 2 * Math.PI, 12);
  });

  it('returns null when nothing was received', () => {
    expect(new InterpolationBuffer().sample(0)).toBeNull();
  });

  it('holds the last snapshot when the buffer runs dry (no extrapolation)', () => {
    const buffer = new InterpolationBuffer();
    trace(buffer, 0, 500);
    const held = { x: 5, z: -2.5, heading: 0 };
    expect(buffer.sample(renderTime(700))).toEqual(held);
    expect(buffer.sample(renderTime(5_000))).toEqual(held);
    expect(buffer.size).toBe(1);
  });

  it('holds the first snapshot before the buffer has covered the render time', () => {
    const buffer = new InterpolationBuffer();
    buffer.push({ t: 1_000, x: 3, z: 4, heading: 1 });
    expect(buffer.sample(renderTime(1_050))).toEqual({ x: 3, z: 4, heading: 1 });
  });

  it('starts from rest over one patch after a stationary gap instead of across the gap', () => {
    const buffer = new InterpolationBuffer();
    buffer.push({ t: 0, x: 0, z: 0, heading: 0 });
    // Standing still: no patches for 10 s, then movement resumes.
    buffer.push({ t: 10_000, x: 0.2, z: 0, heading: 0 });
    buffer.push({ t: 10_050, x: 0.4, z: 0, heading: 0 });
    expect(buffer.sample(renderTime(10_050))!.x).toBeCloseTo(0, 9); // t = 9950: still at rest
    expect(buffer.sample(renderTime(10_075))!.x).toBeCloseTo(0.1, 9); // halfway through patch
    expect(buffer.sample(renderTime(10_125))!.x).toBeCloseTo(0.3, 9);
  });

  it('T-1377: spaces bunched patches one patch apart, so the drawn speed stays at walking speed', () => {
    const buffer = new InterpolationBuffer();
    // 2 m/s walk: 0.1 m per 50 ms patch. A slow frame delivers three patches 2 ms apart; the
    // 100 ms lead lets all three keep 50 ms spacing (stamped 52, 102, 152).
    buffer.push({ t: 0, x: 0, z: 0, heading: 0 });
    for (let i = 1; i <= 3; i++) buffer.push({ t: 50 + i * 2, x: 0.1 * i, z: 0, heading: 0 });
    const xs = Array.from({ length: 21 }, (_, i) => buffer.sample(i * 10)!.x);
    // Every 10 ms of render time moves at most about 0.02 m (2 m/s), never a whole patch.
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!).toBeLessThanOrEqual(0.0201);
    }
    expect(xs.at(-1)).toBeCloseTo(0.3, 9);
  });

  it('T-1377: never stamps more than maxLeadMs ahead of the receive time', () => {
    const buffer = new InterpolationBuffer({ maxLeadMs: 100 });
    buffer.push({ t: 0, x: 0, z: 0, heading: 0 });
    // Ten patches arrive at once (t = 10): stamps 50, 100, then the 10 + 100 cap; the rest
    // replace the newest pose at the cap.
    for (let i = 1; i <= 10; i++) buffer.push({ t: 10, x: i, z: 0, heading: 0 });
    expect(buffer.size).toBe(4);
    expect(buffer.sample(100)!.x).toBe(2);
    expect(buffer.sample(110)!.x).toBe(10);
    expect(buffer.sample(500)!.x).toBe(10);
  });

  it('lets a same-time snapshot replace the newest pose once no lead is left, and drops stale history', () => {
    const buffer = new InterpolationBuffer({ capacity: 4, maxLeadMs: 0 });
    buffer.push({ t: 0, x: 0, z: 0, heading: 0 });
    buffer.push({ t: 50, x: 1, z: 0, heading: 0 });
    buffer.push({ t: 50, x: 2, z: 0, heading: 0 });
    expect(buffer.size).toBe(2);
    expect(buffer.sample(50)!.x).toBe(2);
    trace(buffer, 100, 1_000);
    expect(buffer.size).toBe(4);
    buffer.sample(960);
    expect(buffer.size).toBeLessThanOrEqual(2);
  });
});

describe('InterpolationDelay (T-1377)', () => {
  const opts = { baseMs: 100, maxMs: 400, patchMs: 50, slew: 0.2, window: 30 };

  /** Advances `frames` frames of `frameMs` each; returns the delay after the last. */
  function run(delay: InterpolationDelay, clock: { now: number }, frameMs: number, frames: number) {
    let d = 0;
    for (let i = 0; i < frames; i++) {
      clock.now += frameMs;
      d = delay.update(clock.now);
    }
    return d;
  }

  it('stays at the base delay at 60 FPS', () => {
    const delay = new InterpolationDelay(opts);
    const clock = { now: 0 };
    expect(delay.update(0)).toBe(100);
    expect(run(delay, clock, 1000 / 60, 600)).toBe(100);
  });

  it('grows to one patch plus the slowest recent frame when frames are slower than the delay', () => {
    const delay = new InterpolationDelay(opts);
    const clock = { now: 0 };
    delay.update(0);
    // 200 ms frames: target 250 ms, reached at 0.2 ms per ms of frame time (40 ms per frame).
    expect(run(delay, clock, 200, 2)).toBeCloseTo(180, 9);
    expect(run(delay, clock, 200, 10)).toBeCloseTo(250, 9);
  });

  it('caps the delay and shrinks back slowly once frames are fast again', () => {
    const delay = new InterpolationDelay(opts);
    const clock = { now: 0 };
    delay.update(0);
    expect(run(delay, clock, 1000, 10)).toBe(400);
    // The 1 s frames leave the 30-frame window after 30 fast frames, then the delay slews down.
    const after = run(delay, clock, 1000 / 60, 40);
    expect(after).toBeLessThan(400);
    expect(after).toBeGreaterThan(100);
    expect(run(delay, clock, 1000 / 60, 600)).toBe(100);
  });

  it('changes by at most slew x frame time per frame, so remotes never jump', () => {
    const delay = new InterpolationDelay(opts);
    const clock = { now: 0 };
    let prev = delay.update(0);
    for (const frameMs of [16, 300, 16, 16, 500, 16, 16, 16]) {
      clock.now += frameMs;
      const d = delay.update(clock.now);
      expect(Math.abs(d - prev)).toBeLessThanOrEqual(0.2 * frameMs + 1e-9);
      prev = d;
    }
  });
});
