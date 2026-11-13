import { expect, test, type Page } from '@playwright/test';
import { E2E_WIRE, employeeNames, joinBot, leaveAll, type BotRoom } from './bots';
import { join } from './helpers';

const bots: BotRoom[] = [];
test.afterEach(() => leaveAll(bots));

async function fillForm(page: Page, name: string, code: string) {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Office code').fill(code);
}

/** The game has not started: no canvas host, and the join form is still shown. */
async function expectGameClosed(page: Page) {
  await expect(page.getByTestId('join')).toBeVisible();
  await expect(page.getByTestId('game-host')).toHaveCount(0);
}

test('server state has the employee after join and drops it after the door exit', async ({
  page,
}) => {
  const observer = await joinBot('CONN-02', 'Observer');
  bots.push(observer);
  await join(page, 'Linh', 'CONN-02');
  await expect.poll(() => employeeNames(observer).sort()).toEqual(['Linh', 'Observer']);

  // Walk out through the main door (same pose as the core flow spec).
  await page.evaluate('window.__office.teleport(-0.4, -3, Math.PI)');
  await page.keyboard.press('e');
  await expect(page.getByTestId('join')).toBeVisible();
  await expect.poll(() => employeeNames(observer)).toEqual(['Observer']);
});

test('server unreachable: game stays closed until Retry succeeds', async ({ page }) => {
  // Simulate the server being down by failing the matchmaker request.
  await page.route('**/matchmake/**', (route) => route.abort('connectionrefused'));
  await fillForm(page, 'Retry', 'CONN-01');
  await page.getByRole('button', { name: 'Join Office' }).click();
  await expect(page.getByRole('alert')).toContainText('Cannot reach the office server');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expectGameClosed(page);

  // Still down: a retry fails again and the game stays closed.
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('alert')).toContainText('Cannot reach the office server');
  await expectGameClosed(page);

  await page.unroute('**/matchmake/**');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('game-host')).toBeVisible();
  await page.waitForFunction(
    () => 'getPlayer' in ((window as unknown as { __office?: object }).__office ?? {}),
  );
});

test('a full room shows the room-full message', async ({ page }) => {
  for (let i = 0; i < E2E_WIRE.maxClients; i++) bots.push(await joinBot('FULL-E2E', `Bot${i}`));
  await fillForm(page, 'Late', 'FULL-E2E');
  await page.getByRole('button', { name: 'Join Office' }).click();
  await expect(page.getByRole('alert')).toContainText('This office is full');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expectGameClosed(page);
  expect(employeeNames(bots[0]!)).not.toContain('Late');
});
