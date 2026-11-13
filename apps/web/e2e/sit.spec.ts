import { expect, test } from '@playwright/test';
import { TO_DESK, activity, atDesk, join, player, walkTo } from './helpers';

// Evaluated in the browser as plain JS: no TypeScript casts inside these strings.
const hook = 'window.__office';

test('core flow: join, sit at desk, work, stand, leave', async ({ page }) => {
  test.setTimeout(90_000);
  await join(page, 'Khánh', 'SIT-01');
  await expect(page.getByText('Khánh', { exact: true })).toBeVisible();
  // Walk (not teleport): the server must see the player in range of the chair.
  await walkTo(page, TO_DESK);
  await atDesk(page);
  await expect(page.getByTestId('prompt')).toHaveText('E — Sit');
  await page.keyboard.press('e');
  // The seat is confirmed by the server (no optimistic sit).
  await expect.poll(() => activity(page)).toBe('sitting');
  const seated = await player(page);
  expect(seated.x).toBeCloseTo(0.66, 5);
  expect(seated.z).toBeCloseTo(3.72, 5);
  await page.screenshot({ path: 'test-results/core-seated.png' });
  await page.keyboard.press('e');
  await expect.poll(() => activity(page)).toBe('working');
  await expect(page.getByTestId('game-host').getByText('Working', { exact: true })).toBeVisible();
  await page.keyboard.down('w');
  await expect.poll(() => activity(page)).not.toBe('working');
  await page.keyboard.up('w');
  // Standing up puts the player at the seat's interaction point, then movement resumes.
  await expect.poll(() => activity(page)).toBe('idle');
  const stood = await player(page);
  expect(Math.hypot(stood.x - 0.66, stood.z - 3.72)).toBeGreaterThan(0.5);
  // The door exit stays local.
  await page.evaluate(`(${hook}).teleport(-0.4, -3, Math.PI)`);
  await page.keyboard.press('e');
  await expect(page.getByTestId('join')).toBeVisible();
});

test('rejects an invalid office code', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your name').fill('A');
  await page.getByLabel('Office code').fill('ab');
  await page.getByRole('button', { name: 'Join Office' }).click();
  await expect(page.getByRole('alert')).toContainText('Office code');
});
