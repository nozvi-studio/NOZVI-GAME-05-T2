import { expect, test, type Page } from '@playwright/test';

type P = { x: number; z: number; heading: number };
const getPlayer = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: { getPlayer(): P } }).__office.getPlayer());
const getYaw = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __office: { getCameraYaw(): number } }).__office.getCameraYaw(),
  );

async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(
    () => 'getPlayer' in ((window as unknown as { __office?: object }).__office ?? {}),
  );
  await page.locator('canvas').click({ position: { x: 640, y: 360 } });
});

test('renders the office canvas', async ({ page }) => {
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/walk-start.png' });
});

test('W moves along the camera forward', async ({ page }) => {
  const a = await getPlayer(page);
  const yaw = await getYaw(page);
  await hold(page, 'w', 600);
  const b = await getPlayer(page);
  const along = (b.x - a.x) * Math.sin(yaw) + (b.z - a.z) * Math.cos(yaw);
  expect(along).toBeGreaterThan(0.5);
});

test('S, A and D move in their camera-relative directions', async ({ page }) => {
  const yaw = await getYaw(page);
  const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const right = { x: -Math.cos(yaw), z: Math.sin(yaw) };
  for (const [key, axis, sign] of [
    ['s', fwd, -1],
    ['d', right, 1],
    ['a', right, -1],
  ] as const) {
    const a = await getPlayer(page);
    await hold(page, key, 400);
    const b = await getPlayer(page);
    expect(((b.x - a.x) * axis.x + (b.z - a.z) * axis.z) * sign).toBeGreaterThan(0.3);
  }
});

test('walls stop the player', async ({ page }) => {
  await hold(page, 's', 4000);
  const p = await getPlayer(page);
  expect(p.z).toBeGreaterThan(-4 + 0.3 - 0.01);
  await page.screenshot({ path: 'test-results/walk-wall.png' });
});
