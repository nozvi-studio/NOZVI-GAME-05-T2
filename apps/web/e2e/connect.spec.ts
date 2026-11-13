import { expect, test } from '@playwright/test';

test('shows server unreachable, then joins on retry', async ({ page }) => {
  // Simulate the server being down by failing the matchmaker request.
  await page.route('**/matchmake/**', (route) => route.abort('connectionrefused'));
  await page.goto('/');
  await page.getByLabel('Your name').fill('Retry');
  await page.getByLabel('Office code').fill('CONN-01');
  await page.getByRole('button', { name: 'Join Office' }).click();
  await expect(page.getByRole('alert')).toContainText('Cannot reach the office server');
  await expect(page.getByRole('button', { name: 'Join Office' })).toBeEnabled();

  await page.unroute('**/matchmake/**');
  await page.getByRole('button', { name: 'Join Office' }).click();
  await expect(page.getByTestId('game-host')).toBeVisible();
  await page.waitForFunction(
    () => 'getPlayer' in ((window as unknown as { __office?: object }).__office ?? {}),
  );
});
