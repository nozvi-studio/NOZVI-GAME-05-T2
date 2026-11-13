import { expect, test, type Page } from '@playwright/test';
import { join } from './helpers';

type P = { x: number; z: number; heading: number };
type Office = {
  getPlayer(): P;
  getCameraYaw(): number;
  setPose(p: { x: number; z: number; heading: number }): void;
};
const getPlayer = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: Office }).__office.getPlayer());
const getYaw = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: Office }).__office.getCameraYaw());

/** Resolves after `n` rendered frames. */
const frames = (page: Page, n: number) =>
  page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const tick = () => (--count <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );

/**
 * Holds `key` until the player has moved `distance` m along the unit `axis` (x, z), then
 * releases it. Waits on movement, not wall-clock time: software WebGL renders few and uneven
 * frames, and the game only samples input per frame. Returns the signed displacement along
 * the axis, so a wrong direction fails the assertion instead of timing out silently.
 */
async function holdUntilMoved(
  page: Page,
  key: string,
  axis: { x: number; z: number },
  distance: number,
  timeout = 15_000,
) {
  const a = await getPlayer(page);
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(
      ({ a, axis, distance }) => {
        const b = (window as unknown as { __office: Office }).__office.getPlayer();
        return (b.x - a.x) * axis.x + (b.z - a.z) * axis.z >= distance;
      },
      { a, axis, distance },
      { polling: 'raf', timeout },
    );
  } catch {
    // Fall through: the assertion below reports how far the player actually moved.
  } finally {
    await page.keyboard.up(key);
  }
  const b = await getPlayer(page);
  return (b.x - a.x) * axis.x + (b.z - a.z) * axis.z;
}

/**
 * Holds `key` until the player's position stops changing for `stableFrames` consecutive
 * frames (for example, blocked by a wall), then releases it.
 */
async function holdUntilStopped(page: Page, key: string, stableFrames = 10, timeout = 20_000) {
  await page.keyboard.down(key);
  try {
    await page.evaluate(
      ({ stableFrames, timeout }) =>
        new Promise<void>((resolve, reject) => {
          const office = (window as unknown as { __office: Office }).__office;
          const deadline = performance.now() + timeout;
          let last = office.getPlayer();
          let still = 0;
          const tick = () => {
            const p = office.getPlayer();
            still = Math.hypot(p.x - last.x, p.z - last.z) < 1e-4 ? still + 1 : 0;
            last = p;
            if (still >= stableFrames) return resolve();
            if (performance.now() > deadline) return reject(new Error('player never stopped'));
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      { stableFrames, timeout },
    );
  } finally {
    await page.keyboard.up(key);
  }
}

// One join for the whole file: joining and the first software-WebGL frames (shader
// compilation) dominate the run time, so the walk checks share a single page in order.
test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await join(page);
  // Let the first slow frames pass before measuring movement.
  await frames(page, 2);
});

test.afterAll(async () => {
  await page?.close();
});

test('renders the office canvas', async () => {
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/walk-start.png' });
});

test('W, S, A and D move in their camera-relative directions', async () => {
  const yaw = await getYaw(page);
  const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const back = { x: -fwd.x, z: -fwd.z };
  const right = { x: -Math.cos(yaw), z: Math.sin(yaw) };
  const left = { x: -right.x, z: -right.z };
  // W then S, D then A: each pair returns near the spawn, so no move runs into furniture.
  for (const [key, axis] of [
    ['w', fwd],
    ['s', back],
    ['d', right],
    ['a', left],
  ] as const) {
    expect(await holdUntilMoved(page, key, axis, 0.5), `key ${key}`).toBeGreaterThanOrEqual(0.5);
  }
});

test('walls stop the player', async () => {
  // Back the player into the north wall (inner face z = -4.7, capsule radius 0.3) from 0.9 m
  // away, starting from a fixed pose so earlier moves do not matter.
  await page.evaluate(() =>
    (window as unknown as { __office: Office }).__office.setPose({ x: -0.4, z: -3.8, heading: 0 }),
  );
  await holdUntilStopped(page, 's');
  const p = await getPlayer(page);
  expect(p.z).toBeGreaterThan(-4.8 + 0.3 - 0.01);
  expect(p.z).toBeLessThan(-4.7 + 0.3 + 0.05);
  await page.screenshot({ path: 'test-results/walk-wall.png' });
});
