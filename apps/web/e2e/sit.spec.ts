import { expect, test } from '@playwright/test';
import { join } from './helpers';

// Evaluated in the browser as plain JS: no TypeScript casts inside these strings.
const hook = 'window.__office';

test('core flow: join, sit at desk, work, stand, leave', async ({ page }) => {
  await join(page, 'Khánh');
  await expect(page.getByText('Khánh', { exact: true })).toBeVisible();
  await page.evaluate(`(${hook}).teleport(0.4, 2.05, Math.PI)`);
  await expect(page.getByTestId('prompt')).toHaveText('E — Sit');
  await page.keyboard.press('e');
  await page.waitForTimeout(2000);
  expect(await page.evaluate(`(${hook}).getActivity()`)).toBe('sitting');
  await page.screenshot({ path: 'test-results/core-seated.png' });
  await page.keyboard.press('e');
  expect(await page.evaluate(`(${hook}).getActivity()`)).toBe('working');
  await expect(page.getByText('Working', { exact: true })).toBeVisible();
  await page.keyboard.down('w');
  await page.waitForTimeout(200);
  await page.keyboard.up('w');
  expect(await page.evaluate(`(${hook}).getActivity()`)).not.toBe('working');
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
