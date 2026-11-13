import { describe, expect, it } from 'vitest';
import { BALANCE } from '@office/protocol';
import { InterpolationBuffer, lerpAngle, renderTime, wrapAngle } from '../src/net/interpolation';

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

  it('lets a same-time snapshot replace the newest pose and drops stale history', () => {
    const buffer = new InterpolationBuffer({ capacity: 4 });
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
