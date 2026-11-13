import { expect, test, type Page } from '@playwright/test';
import { E2E_WIRE, joinBot, leaveAll, walkBot, type BotRoom } from './bots';
import { join } from './helpers';

/**
 * REQ-NET-004 manual soak under the test network profile. Skipped unless NET_PROFILE=test,
 * which the game server started by Playwright inherits (see `apps/server/src/netProfile.ts`):
 *
 *   NET_PROFILE=test pnpm --filter @office/web e2e e2e/netProfile.spec.ts --trace off
 *
 * One browser observes nine walking bots for `NET_PROFILE_MINUTES` (default: the balance
 * run length) while its own player walks a few steps every 20 s. The page counts frames
 * where an avatar moves faster than a run would allow (a visible jump); one bot records
 * patch inter-arrival gaps (TCP retransmits show up as gaps, not lost patches).
 */
const minutes = Number(process.env.NET_PROFILE_MINUTES ?? E2E_WIRE.netProfileMinutes);
const CODE = 'SOAK-E2E';
const WALK_SPEED = 2;

test.skip(process.env.NET_PROFILE !== 'test', 'manual soak: set NET_PROFILE=test');

type Pose = { x: number; z: number };
type Office = {
  getPlayer(): Pose;
  getRemotes(): ({ sessionId: string } & Pose)[];
  setCameraYaw(yaw: number): void;
  getDrawCalls(): { total: number; main: number; shadow: number };
};
type Soak = {
  frames: number;
  elapsedMs: number;
  samples: number;
  jumps: number;
  maxSpeed: number;
  maxStep: number;
  localJumps: number;
  localMaxSpeed: number;
  longestFrameMs: number;
};

/** Starts a per-frame sampler in the page; results accumulate in `window.__soak`. */
function startSampler(page: Page, jumpSpeed: number) {
  return page.evaluate((jumpSpeed) => {
    const w = window as unknown as { __office: Office; __soak: Soak };
    const soak: Soak = {
      frames: 0,
      elapsedMs: 0,
      samples: 0,
      jumps: 0,
      maxSpeed: 0,
      maxStep: 0,
      localJumps: 0,
      localMaxSpeed: 0,
      longestFrameMs: 0,
    };
    w.__soak = soak;
    const start = performance.now();
    let last = start;
    let prev = new Map<string, Pose>();
    let prevLocal = w.__office.getPlayer();
    const frame = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      soak.frames++;
      soak.elapsedMs = now - start;
      soak.longestFrameMs = Math.max(soak.longestFrameMs, dt * 1000);
      const next = new Map<string, Pose>();
      for (const r of w.__office.getRemotes()) {
        next.set(r.sessionId, { x: r.x, z: r.z });
        const p = prev.get(r.sessionId);
        if (!p || dt <= 0) continue;
        const step = Math.hypot(r.x - p.x, r.z - p.z);
        const speed = step / dt;
        soak.samples++;
        soak.maxSpeed = Math.max(soak.maxSpeed, speed);
        soak.maxStep = Math.max(soak.maxStep, step);
        if (speed > jumpSpeed && step > 0.1) soak.jumps++;
      }
      prev = next;
      const local = w.__office.getPlayer();
      if (dt > 0) {
        const step = Math.hypot(local.x - prevLocal.x, local.z - prevLocal.z);
        soak.localMaxSpeed = Math.max(soak.localMaxSpeed, step / dt);
        if (step / dt > jumpSpeed && step > 0.1) soak.localJumps++;
      }
      prevLocal = local;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, jumpSpeed);
}

test('ten clients under the delayed-patch profile', async ({ page }) => {
  test.setTimeout(minutes * 60_000 + 180_000);
  await join(page, 'Observer', CODE);
  const bots: BotRoom[] = [];
  const stops: (() => void)[] = [];
  try {
    for (let i = 0; i < E2E_WIRE.maxClients - 1; i++) {
      const bot = await joinBot(CODE, `Bot${i + 1}`);
      bots.push(bot);
      stops.push(walkBot(bot, i));
    }
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __office: Office }).__office.getRemotes().length,
          ),
        { timeout: 30_000 },
      )
      .toBe(9);

    // Patch gaps as one bot receives them.
    const gaps: number[] = [];
    let lastPatch = 0;
    bots[0]!.onStateChange(() => {
      const now = Date.now();
      if (lastPatch > 0) gaps.push(now - lastPatch);
      lastPatch = now;
    });

    // A walking employee moves at most 2 m/s; 1.5x that in one frame is a visible jump.
    await startSampler(page, WALK_SPEED * 1.5);
    const end = Date.now() + minutes * 60_000;
    for (let leg = 0; Date.now() < end; leg++) {
      await page.evaluate(
        (yaw) => (window as unknown as { __office: Office }).__office.setCameraYaw(yaw),
        (leg % 4) * (Math.PI / 2),
      );
      await page.keyboard.down('w');
      await page.waitForTimeout(1_000);
      await page.keyboard.up('w');
      await page.waitForTimeout(Math.min(19_000, Math.max(0, end - Date.now())));
    }

    const soak = await page.evaluate(() => (window as unknown as { __soak: Soak }).__soak);
    const draw = await page.evaluate(() =>
      (window as unknown as { __office: Office }).__office.getDrawCalls(),
    );
    const sorted = [...gaps].sort((a, b) => a - b);
    const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    const report = {
      minutes,
      fps: Number(((soak.frames * 1000) / soak.elapsedMs).toFixed(1)),
      longestFrameMs: Math.round(soak.longestFrameMs),
      remoteSamples: soak.samples,
      remoteJumps: soak.jumps,
      remoteMaxSpeed: Number(soak.maxSpeed.toFixed(2)),
      remoteMaxStep: Number(soak.maxStep.toFixed(3)),
      localJumps: soak.localJumps,
      localMaxSpeed: Number(soak.localMaxSpeed.toFixed(2)),
      patches: gaps.length + 1,
      patchGapMs: { p50: pct(0.5), p99: pct(0.99), max: sorted.at(-1) },
      patchGapsOver150Ms: gaps.filter((g) => g > 150).length,
      drawCalls: draw,
    };
    const note = JSON.stringify(report);
    test.info().annotations.push({ type: 'net-profile', description: note });
    console.log(`net profile soak: ${note}`);
    expect(soak.samples).toBeGreaterThan(0);
  } finally {
    stops.forEach((stop) => stop());
    await leaveAll(bots);
  }
});
