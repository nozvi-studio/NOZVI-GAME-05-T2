import { expect, test, type Browser, type Page } from '@playwright/test';
import type { Room } from '@colyseus/sdk';
// Type-only: Playwright's loader cannot import the protocol entry at runtime (see bots.ts).
import type { AvatarId, InputMessage, MSG, OfficeState } from '@office/protocol';
import { joinBot } from './bots';

const INPUT = 'input' satisfies typeof MSG.input;
const CODE = 'REMOTE-01';

type Remote = {
  sessionId: string;
  name: string;
  avatarId: string;
  x: number;
  z: number;
  heading: number;
  activity: string;
  model: 'avatar' | 'capsule';
};
type Office = { getRemotes(): Remote[]; getRemoteCount(): number };

const remotes = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: Office }).__office.getRemotes());

async function joinAs(browser: Browser, name: string, code: string, avatar: AvatarId) {
  // Separate contexts: each page keeps its own stored identity draft.
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Office code').fill(code);
  await page.getByLabel(avatar === 'men_suit' ? 'Suit (men)' : 'Suit (women)').check();
  await page.getByRole('button', { name: 'Join Office' }).click();
  await page.waitForFunction(
    () => 'getRemotes' in ((window as unknown as { __office?: object }).__office ?? {}),
  );
  return page;
}

/** Waits until the page draws exactly `names` as remote avatars with loaded models. */
async function expectRemotes(page: Page, names: string[]) {
  await expect
    .poll(
      async () =>
        (await remotes(page))
          .filter((r) => r.model === 'avatar')
          .map((r) => r.name)
          .sort(),
      { timeout: 30_000 },
    )
    .toEqual([...names].sort());
}

const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// This file uses four joins (three pages and one headless SDK bot). The bot drives movement because the browser client only starts
// sending inputs with prediction (T-1037).
test.describe.configure({ mode: 'serial' });

let alice: Page;
let bob: Page;

test.beforeAll(async ({ browser }) => {
  // Two joins with software WebGL (shader compilation on first frames) exceed the default.
  test.setTimeout(120_000);
  alice = await joinAs(browser, 'Alice', CODE, 'men_suit');
  bob = await joinAs(browser, 'Bảo & Co', CODE, 'women_suit');
});

test.afterAll(async () => {
  await alice?.context().close();
  await bob?.context().close();
});

test('pages on the same code see each other with name and model; another code sees neither', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await expectRemotes(alice, ['Bảo & Co']);
  await expectRemotes(bob, ['Alice']);
  expect((await remotes(alice))[0]!.avatarId).toBe('women_suit');
  expect((await remotes(bob))[0]!.avatarId).toBe('men_suit');
  // The replicated name is shown as text (& stays literal).
  await expect(alice.getByText('Bảo & Co', { exact: true })).toBeVisible();
  await expect(bob.getByText('Alice', { exact: true })).toBeVisible();

  const carol = await joinAs(browser, 'Carol', 'REMOTE-02', 'men_suit');
  try {
    await carol.waitForTimeout(1_500);
    expect(await remotes(carol)).toEqual([]);
    expect((await remotes(alice)).map((r) => r.name)).toEqual(['Bảo & Co']);
  } finally {
    await carol.context().close();
  }
});

test('a remote employee walks smoothly with walking animation, faces its heading, then idles and leaves', async () => {
  test.setTimeout(120_000);
  const bot = (await joinBot(CODE, 'Walker')) as unknown as Room<unknown, OfficeState>;
  // The room state is decoded through schema reflection; wait for the first state.
  await expect.poll(() => bot.state.employees?.get(bot.sessionId) !== undefined).toBe(true);
  try {
    await expectRemotes(alice, ['Bảo & Co', 'Walker']);
    const walker = async () => (await remotes(alice)).find((r) => r.name === 'Walker')!;
    const start = await walker();

    // Sample the drawn position every animation frame while the bot walks.
    await alice.evaluate(() => {
      const w = window as unknown as { __office: Office; __trace: number[][]; __stop?: boolean };
      w.__trace = [];
      w.__stop = false;
      const tick = () => {
        const r = w.__office.getRemotes().find((e) => e.name === 'Walker');
        if (r) w.__trace.push([r.x, r.z, r.activity === 'walking' ? 1 : 0, performance.now()]);
        if (!w.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Walk the way the bot faces at spawn (into the room).
    const yaw = bot.state.employees.get(bot.sessionId)!.heading;
    // Like the real client, the bot sends one input per 50 ms step; zero axes mean stop.
    let seq = 0;
    let forward = 1;
    const send = setInterval(() => {
      const input: InputMessage = { seq: ++seq, forward, right: 0, run: false, yaw };
      bot.send(INPUT, input);
    }, 50);
    try {
      await expect.poll(async () => (await walker()).activity, { timeout: 10_000 }).toBe('walking');
      await alice.waitForTimeout(1_500);
      forward = 0;
      await expect.poll(async () => (await walker()).activity, { timeout: 10_000 }).toBe('idle');
    } finally {
      clearInterval(send);
    }
    const trace = await alice.evaluate(() => {
      const w = window as unknown as { __trace: number[][]; __stop?: boolean };
      w.__stop = true;
      return w.__trace;
    });

    const end = await walker();
    const self = bot.state.employees.get(bot.sessionId)!;
    // The remote ends where the server put the bot, facing the same way.
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(0.5);
    expect(Math.hypot(end.x - self.x, end.z - self.z)).toBeLessThan(0.01);
    expect(angleDiff(end.heading, self.heading)).toBeLessThan(0.01);
    // Smooth: many distinct intermediate positions, and between any two drawn frames the
    // avatar never moves faster than walking speed allows (software WebGL frame times vary,
    // so compare distance with elapsed time, not per frame). 2 m/s walk plus 50% margin.
    const moving = trace.filter(
      (p, i) => i > 0 && (p[0] !== trace[i - 1]![0] || p[1] !== trace[i - 1]![1]),
    );
    expect(moving.length).toBeGreaterThanOrEqual(5);
    const maxSpeed = Math.max(
      ...trace.slice(1).map((p, i) => {
        const q = trace[i]!;
        return Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!) / Math.max((p[3]! - q[3]!) / 1000, 1e-3);
      }),
    );
    expect(maxSpeed).toBeLessThan(3);
    expect(trace.some((p) => p[2] === 1)).toBe(true);
  } finally {
    await bot.leave(true);
  }
  await expectRemotes(alice, ['Bảo & Co']);
  await expect(alice.getByText('Walker', { exact: true })).toHaveCount(0);

  // A page leaving removes its avatar and nameplate on the other page.
  await bob.context().close();
  await expect.poll(async () => (await remotes(alice)).length, { timeout: 15_000 }).toBe(0);
  await expect(alice.getByText('Bảo & Co', { exact: true })).toHaveCount(0);
});
