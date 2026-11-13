import { expect, test, type Browser, type Page } from '@playwright/test';
// Type-only: Playwright's loader cannot import the protocol entry at runtime (see bots.ts).
import type { Room } from '@colyseus/sdk';
import type { InputMessage, MSG, OfficeState } from '@office/protocol';
import { joinBot, leaveAll, type BotRoom } from './bots';

const INPUT = 'input' satisfies typeof MSG.input;
const CODE = 'LIST-01';
// Passes name validation (no < or >) but would turn into markup if injected as HTML.
const MARKUP_NAME = '&lt;b&gt;Eve';

type Office = { getBoardText(): string; getRemoteCount(): number };

async function joinAs(browser: Browser, name: string) {
  // Separate contexts: each page keeps its own stored identity draft.
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Office code').fill(CODE);
  await page.getByRole('button', { name: 'Join Office' }).click();
  await page.waitForFunction(
    () => 'getBoardText' in ((window as unknown as { __office?: object }).__office ?? {}),
  );
  return page;
}

const panel = (page: Page) => page.getByRole('region', { name: 'Online employees' });
const boardText = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: Office }).__office.getBoardText());
const renders = (page: Page) =>
  page.evaluate(() => (window as unknown as { __officeListRenders?: number }).__officeListRenders);

/** Waits until the panel lists exactly `names` (sorted) and the board shows their count. */
async function expectListed(page: Page, names: string[]) {
  await expect
    .poll(
      async () =>
        (await panel(page).getByTestId('employee-name').allTextContents())
          .map((n) => n.replace(/ \(you\)$/, ''))
          .sort(),
      {
        timeout: 15_000,
      },
    )
    .toEqual([...names].sort());
  await expect.poll(() => boardText(page)).toBe(`Online: ${names.length}`);
}

test.describe.configure({ mode: 'serial' });

let alice: Page;
let eve: Page;
const bots: BotRoom[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  alice = await joinAs(browser, 'Alice');
  eve = await joinAs(browser, MARKUP_NAME);
});

test.afterAll(async () => {
  await leaveAll(bots);
  await alice?.context().close();
  await eve?.context().close();
});

test('three clients: each panel lists all three with labels and the board shows 3', async () => {
  test.setTimeout(60_000);
  const bot = await joinBot(CODE, 'Bot');
  bots.push(bot);
  for (const page of [alice, eve]) {
    await expectListed(page, ['Alice', MARKUP_NAME, 'Bot']);
    await expect(panel(page).getByTestId('employee-label')).toHaveText([
      'Online',
      'Online',
      'Online',
    ]);
  }
  // The local player is listed first and marked.
  await expect(panel(alice).getByRole('listitem').first()).toHaveText(/^Alice \(you\)/);
  await expect(panel(eve).getByRole('listitem').first()).toContainText(`${MARKUP_NAME} (you)`);
  // The markup-like name is literal text, not an element.
  await expect(panel(alice).getByText(MARKUP_NAME, { exact: true })).toBeVisible();
  await expect(panel(alice).locator('b')).toHaveCount(0);
});

test('a walking remote does not re-render the panel', async () => {
  test.setTimeout(60_000);
  const bot = bots[0]!;
  await expect
    .poll(() =>
      alice.evaluate(() => (window as unknown as { __office: Office }).__office.getRemoteCount()),
    )
    .toBe(2);
  const before = await renders(alice);
  expect(before).toBeGreaterThan(0);
  const state = bot as unknown as Room<unknown, OfficeState>;
  const position = () => {
    const self = state.state.employees.get(bot.sessionId)!;
    return { x: self.x, z: self.z };
  };
  const start = position();
  let seq = 0;
  const send = setInterval(() => {
    const input: InputMessage = { seq: ++seq, forward: 1, right: 0, run: false, yaw: 0 };
    bot.send(INPUT, input);
  }, 50);
  try {
    await alice.waitForTimeout(1_500);
  } finally {
    clearInterval(send);
  }
  // The bot really moved (many position patches reached the page) ...
  const end = position();
  expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(0.5);
  // ... but idle -> walking keeps the "Online" label, so nothing in the list changed.
  expect(await renders(alice)).toBe(before);
});

test('leaving removes the entry and lowers the count without a reload', async () => {
  test.setTimeout(60_000);
  await leaveAll(bots);
  await expectListed(alice, ['Alice', MARKUP_NAME]);
  await expectListed(eve, ['Alice', MARKUP_NAME]);
  await eve.context().close();
  await expectListed(alice, ['Alice']);
});
