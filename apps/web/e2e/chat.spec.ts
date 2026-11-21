import { expect, test, type Browser, type Page } from '@playwright/test';

// T-1697 (REQ-CHAT-001 to 003): two pages in one office. The game server runs with
// CHAT_TTL_SECONDS=8 (playwright.config.ts), so expiry is checked in seconds, not a minute.

type ChatEntry = { id: string; sessionId: string; name: string; text: string; sentAt: number };
type Office = {
  getChat(): ChatEntry[];
  getChatInputFocused(): boolean;
  getBubble(name: string): string | null;
  getPlayer(): { x: number; z: number; heading: number };
  getActivity(): string;
  getEmote(): string;
  getRemotes(): { name: string }[];
};
type Win = { __office: Office };

const TTL_MS = 8_000;
const CODE = 'CHAT-E2E-01';

async function joinAs(browser: Browser, name: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  ).newPage();
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Office code').fill(CODE);
  await page.getByRole('button', { name: 'Join Office' }).click();
  await page.waitForFunction(
    () => 'getChat' in ((window as unknown as { __office?: object }).__office ?? {}),
  );
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 640, y: 360 } });
  return page;
}

const office = <T>(page: Page, fn: (o: Office) => T, ...args: unknown[]) =>
  page.evaluate(
    ([source, rest]) => {
      const o = (window as unknown as Win).__office;
      return new Function('o', 'args', `return (${source})(o, ...args)`)(o, rest);
    },
    [fn.toString(), args] as const,
  ) as Promise<T>;

const chatTexts = (page: Page) => office(page, (o) => o.getChat().map((m) => m.text));
const bubble = (page: Page, name: string) =>
  page.evaluate((n) => (window as unknown as Win).__office.getBubble(n), name);

test.describe.configure({ mode: 'serial' });

test('a message reaches both pages, shows bubbles, and both lose it after the TTL', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const alice = await joinAs(browser, 'Alice');
  const bob = await joinAs(browser, 'Bob');
  try {
    await expect
      .poll(() => office(bob, (o) => o.getRemotes().map((r) => r.name)))
      .toContain('Alice');

    // Enter with the game focused opens the input; Enter sends and returns focus.
    await alice.keyboard.press('Enter');
    await expect.poll(() => office(alice, (o) => o.getChatInputFocused())).toBe(true);
    const text = 'Chào cả văn phòng <b>!</b>';
    await alice.keyboard.type(text);
    await alice.keyboard.press('Enter');
    const sentAt = Date.now();
    await expect.poll(() => office(alice, (o) => o.getChatInputFocused())).toBe(false);

    await expect.poll(() => chatTexts(alice)).toEqual([text]);
    await expect.poll(() => chatTexts(bob)).toEqual([text]);
    const [entry] = await office(bob, (o) => o.getChat());
    expect(entry!.name).toBe('Alice');
    // Rendered as text: the markup is visible literally, never parsed.
    await expect(bob.getByTestId('chat-message-text')).toHaveText(text);
    await expect(bob.getByTestId('chat-messages').locator('b')).toHaveCount(0);

    // REQ-CHAT-003: the bubble above the sender, on both pages.
    await expect.poll(() => bubble(bob, 'Alice')).toBe(text);
    await expect.poll(() => bubble(alice, 'Alice')).toBe(text);

    // REQ-CHAT-002: gone from both pages once the server TTL passes.
    await expect
      .poll(() => Promise.all([chatTexts(alice), chatTexts(bob)]), { timeout: TTL_MS + 10_000 })
      .toEqual([[], []]);
    expect(Date.now() - sentAt).toBeGreaterThanOrEqual(TTL_MS - 1_000);
    await expect(bob.getByTestId('chat-message')).toHaveCount(0);
    await expect.poll(() => bubble(bob, 'Alice')).toBeNull();
    // REQ-CHAT-002: nothing about chat in browser storage.
    const stored = await alice.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(stored).not.toContain('văn phòng');
  } finally {
    await alice.context().close();
    await bob.context().close();
  }
});

test('typing W A S D E F G in the chat input does not move or act; Esc closes it', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const alice = await joinAs(browser, 'Typist');
  try {
    const before = await office(alice, (o) => o.getPlayer());
    await alice.keyboard.press('Enter');
    await expect.poll(() => office(alice, (o) => o.getChatInputFocused())).toBe(true);
    for (const key of ['w', 'a', 's', 'd', 'e', 'f', 'g']) {
      await alice.keyboard.down(key);
      await alice.waitForTimeout(150);
      await alice.keyboard.up(key);
    }
    await alice.waitForTimeout(500);
    const after = await office(alice, (o) => o.getPlayer());
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.01);
    expect(await office(alice, (o) => o.getActivity())).toBe('idle');
    expect(await office(alice, (o) => o.getEmote())).toBe('');
    await expect(alice.getByTestId('chat-input')).toHaveValue('wasdefg');

    await alice.keyboard.press('Escape');
    await expect.poll(() => office(alice, (o) => o.getChatInputFocused())).toBe(false);
    // Back in the game: W walks again.
    await alice.keyboard.down('w');
    await expect
      .poll(async () => {
        const p = await office(alice, (o) => o.getPlayer());
        return Math.hypot(p.x - before.x, p.z - before.z);
      })
      .toBeGreaterThan(0.2);
    await alice.keyboard.up('w');
  } finally {
    await alice.context().close();
  }
});

test('over the limit the sender sees the notice and the extra message reaches nobody', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const alice = await joinAs(browser, 'Chatty');
  try {
    const input = alice.getByTestId('chat-input');
    // Six sends back to back, well inside the 10 s window even on slow software-WebGL frames;
    // waiting for each to arrive could stretch them past the window on a loaded machine.
    for (let i = 1; i <= 6; i++) {
      await input.fill(`msg ${i}`);
      await alice.getByTestId('chat-send').click();
    }
    // The sixth is refused: the sender sees the notice, the first five arrive, the sixth never.
    await expect(alice.getByTestId('chat-rate-limited')).toBeVisible();
    await expect.poll(() => chatTexts(alice)).toContain('msg 5');
    await alice.waitForTimeout(1_000);
    expect(await chatTexts(alice)).not.toContain('msg 6');
  } finally {
    await alice.context().close();
  }
});
