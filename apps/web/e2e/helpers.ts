import type { Page } from '@playwright/test';

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
