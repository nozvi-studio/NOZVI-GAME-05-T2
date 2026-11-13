import type { Page } from '@playwright/test';

type Pose = { x: number; z: number; heading: number };
type OfficeHook = {
  getPlayer(): Pose;
  getActivity(): string;
  setCameraYaw(yaw: number): void;
};

/** Completes the join form and waits until the game's dev hook is installed. */
export async function join(page: Page, name = 'Tester', code = 'TEST-01') {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Office code').fill(code);
  await page.getByRole('button', { name: 'Join Office' }).click();
  await page.waitForFunction(
    () => 'getPlayer' in ((window as unknown as { __office?: object }).__office ?? {}),
  );
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 640, y: 360 } });
}

export const player = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: OfficeHook }).__office.getPlayer());

export const activity = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: OfficeHook }).__office.getActivity());

/**
 * Walks the local player through `waypoints` with the W key, turning the camera toward each
 * one. Unlike the dev teleport this goes through prediction and the server, so the server
 * sees the player where the page shows it (sitting needs the server to agree on range).
 * The final heading is the direction of the last leg.
 */
export async function walkTo(page: Page, waypoints: [number, number][], tolerance = 0.15) {
  for (const [tx, tz] of waypoints) {
    for (let attempt = 0; ; attempt++) {
      const p = await player(page);
      const d = Math.hypot(tx - p.x, tz - p.z);
      if (d < tolerance) break;
      if (attempt >= 60)
        throw new Error(`walkTo stuck at ${JSON.stringify(p)} short of ${tx}, ${tz}`);
      const yaw = Math.atan2(tx - p.x, tz - p.z);
      await page.evaluate(
        (y) => (window as unknown as { __office: OfficeHook }).__office.setCameraYaw(y),
        yaw,
      );
      // Walk speed is 2 m/s; hold for a fraction of the remaining distance (slow software
      // WebGL frames move less), then re-aim.
      await page.keyboard.down('w');
      await page.waitForTimeout(Math.min(400, Math.max(40, d * 350)));
      await page.keyboard.up('w');
    }
  }
}

/**
 * Ends at (x, z) facing `heading`: backs off 1 m along the heading first, so the last leg
 * is long enough to finish turning (corrections on short legs leave arbitrary headings).
 */
export async function approach(page: Page, x: number, z: number, heading: number) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await walkTo(page, [[x - Math.sin(heading), z - Math.cos(heading)]]);
    await walkTo(page, [[x, z]], 0.35);
    // Let late server patches land (a reconciliation can still turn or nudge the player).
    await page.waitForTimeout(400);
    const p = await player(page);
    const turn = Math.abs(Math.atan2(Math.sin(p.heading - heading), Math.cos(p.heading - heading)));
    if (turn < 0.5 && Math.hypot(p.x - x, p.z - z) < 0.45) return;
  }
  throw new Error(`approach failed: ${JSON.stringify(await player(page))}`);
}

/** From spawn into the aisle west of the east desk pods; then `atDesk` faces ws_7's chair. */
export const TO_DESK: [number, number][] = [[0, -2.5]];
export const atDesk = (page: Page) => approach(page, 0, 2.1, 0);
/** From the aisle's south end (0, 0) toward the coffee machine; `atCoffee` faces it. */
export const TO_COFFEE: [number, number][] = [
  [0, -2.4],
  [1.5, -2.4],
];
export const atCoffee = (page: Page) => approach(page, 2.3, -3.2, (3 * Math.PI) / 4);
/** From the coffee machine toward the sofa; `atSofa` faces it. */
export const COFFEE_TO_SOFA: [number, number][] = [[0, -2.3]];
export const atSofa = (page: Page) => approach(page, -1.1, -2.3, -Math.PI / 2);
