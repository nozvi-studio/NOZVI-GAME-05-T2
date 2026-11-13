import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * REQ-NET-005, REQ-NET-006: an unexpected drop (the page goes offline) keeps the employee
 * for 20 s with a "Reconnecting…" marker for others; the page retries after 1, 2, 4, 8 s
 * and resumes the same employee, or offers Rejoin. This file uses three joins.
 */
type Remote = { sessionId: string; name: string; connected: boolean; status: string };
type Pose = { x: number; z: number; heading: number };
type Office = { getRemotes(): Remote[]; getPlayer(): Pose };

const remotes = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: Office }).__office.getRemotes());
const pose = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: Office }).__office.getPlayer());
const banner = (page: Page) => page.getByTestId('connection-banner');
const panel = (page: Page) => page.getByRole('region', { name: 'Online employees' });

async function joinAs(browser: Browser, name: string, code: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Office code').fill(code);
  await page.getByRole('button', { name: 'Join Office' }).click();
  await page.waitForFunction(
    () => 'getRemotes' in ((window as unknown as { __office?: object }).__office ?? {}),
  );
  return page;
}

/** What `page` draws for the remote named `name`, or undefined. */
async function remote(page: Page, name: string): Promise<Remote | undefined> {
  return (await remotes(page)).find((r) => r.name === name);
}

/** The panel row label for `name` on `page`, or null when not listed. */
async function rowLabel(page: Page, name: string): Promise<string | null> {
  const row = panel(page).getByRole('listitem').filter({ hasText: name });
  if ((await row.count()) === 0) return null;
  return row.getByTestId('employee-label').textContent();
}

test.describe.configure({ mode: 'serial' });

let alice: Page;
let bob: Page;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  alice = await joinAs(browser, 'Alice', 'RECON-E2E');
  bob = await joinAs(browser, 'Bob', 'RECON-E2E');
  await expect.poll(() => remote(alice, 'Bob'), { timeout: 30_000 }).toBeDefined();
  await expect.poll(() => remote(bob, 'Alice'), { timeout: 30_000 }).toBeDefined();
});

test.afterAll(async () => {
  await alice?.context().close();
  await bob?.context().close();
});

test('a dropped page shows a reconnecting marker to others and resumes the same employee', async () => {
  test.setTimeout(90_000);
  const before = await remote(alice, 'Bob');
  const bobPose = await pose(bob);

  await bob.context().setOffline(true);
  await expect(banner(bob)).toContainText(/Reconnecting… retry in \d s/);
  // Others keep the avatar and the list entry, marked as reconnecting.
  await expect
    .poll(async () => (await remote(alice, 'Bob'))?.status, { timeout: 10_000 })
    .toBe('Reconnecting…');
  expect((await remote(alice, 'Bob'))!.connected).toBe(false);
  await expect.poll(() => rowLabel(alice, 'Bob')).toBe('Reconnecting…');

  await bob.context().setOffline(false);
  // The next backoff attempt succeeds: the banner goes and Bob is back for Alice. Software
  // WebGL in two pages can stall the page for seconds, hence the generous timeouts.
  await expect(banner(bob)).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(async () => (await remote(alice, 'Bob'))?.status, { timeout: 10_000 })
    .toBe('Online');
  await expect.poll(() => rowLabel(alice, 'Bob')).toBe('Online');
  // Same employee (session), no duplicate, at the same place.
  const after = (await remotes(alice)).filter((r) => r.name === 'Bob');
  expect(after).toHaveLength(1);
  expect(after[0]!.sessionId).toBe(before!.sessionId);
  const resumed = await pose(bob);
  expect(Math.hypot(resumed.x - bobPose.x, resumed.z - bobPose.z)).toBeLessThan(0.05);
  // The resumed page rebuilt the remote avatars from the full state.
  await expect
    .poll(async () => (await remotes(bob)).map((r) => r.name), { timeout: 15_000 })
    .toEqual(['Alice']);
});

test('after the backoff the page offers Rejoin; after 20 s others drop the employee; Rejoin joins again', async () => {
  test.setTimeout(120_000);
  const before = await remote(alice, 'Bob');
  await bob.context().setOffline(true);
  // 1 + 2 + 4 + 8 s of failed attempts, then Rejoin. Software WebGL in two pages can stall
  // the page's timers for seconds, so allow well beyond the nominal 15 s.
  await expect(banner(bob)).toContainText('Connection lost', { timeout: 45_000 });
  await expect(bob.getByRole('button', { name: 'Rejoin' })).toBeVisible();
  // The 20 s reservation then expires: avatar, nameplate and list entry go for Alice.
  await expect.poll(() => remote(alice, 'Bob'), { timeout: 20_000 }).toBeUndefined();
  await expect.poll(() => rowLabel(alice, 'Bob')).toBeNull();
  await expect(alice.getByTestId('game-host').getByText('Bob', { exact: true })).toHaveCount(0);

  await bob.context().setOffline(false);
  await bob.getByRole('button', { name: 'Rejoin' }).click();
  // A fresh join builds a new game (scene, avatars) with software WebGL: allow time.
  await expect(banner(bob)).toHaveCount(0, { timeout: 60_000 });
  await bob.waitForFunction(
    () => 'getRemotes' in ((window as unknown as { __office?: object }).__office ?? {}),
  );
  // A fresh join with the same name: exactly one Bob, connected, with a new session.
  await expect
    .poll(async () => (await remotes(alice)).filter((r) => r.name === 'Bob').length, {
      timeout: 15_000,
    })
    .toBe(1);
  const again = (await remote(alice, 'Bob'))!;
  expect(again.connected).toBe(true);
  expect(again.sessionId).not.toBe(before!.sessionId);
  await expect
    .poll(async () => (await remotes(bob)).map((r) => r.name), { timeout: 30_000 })
    .toEqual(['Alice']);
  await bob.screenshot({ path: 'test-results/reconnect-rejoined.png' });
});
