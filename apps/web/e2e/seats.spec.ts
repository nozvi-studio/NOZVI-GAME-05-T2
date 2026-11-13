import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  COFFEE_TO_SOFA,
  TO_COFFEE,
  TO_DESK,
  activity,
  atCoffee,
  atDesk,
  atSofa,
  player,
  walkTo,
} from './helpers';

// T-1039: seats and activities are owned by the server and replicated to every page.

type Remote = {
  name: string;
  x: number;
  z: number;
  heading: number;
  activity: string;
  seatId: string;
  model: 'avatar' | 'capsule';
};
type Office = {
  getRemotes(): Remote[];
  getActivity(): string;
};
type Trace = [string, number][];
type Win = { __office: Office; __trace?: Trace; __stopTrace?: boolean };

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

/** How `observer` currently draws the remote employee called `name`. */
const remote = (observer: Page, name: string) =>
  observer.evaluate(
    (n) => (window as unknown as Win).__office.getRemotes().find((r) => r.name === n) ?? null,
    name,
  );

const prompt = (page: Page) => page.getByTestId('prompt').first();

/**
 * Records every change of an activity on each animation frame with `Date.now()`: the local
 * activity when `name` is null, otherwise the remote avatar called `name`.
 */
async function startTrace(page: Page, name: string | null) {
  await page.evaluate((n) => {
    const w = window as unknown as Win;
    const trace: Trace = [];
    w.__trace = trace;
    w.__stopTrace = false;
    const tick = () => {
      const a =
        n === null
          ? w.__office.getActivity()
          : (w.__office.getRemotes().find((r) => r.name === n)?.activity ?? 'gone');
      if (trace.at(-1)?.[0] !== a) trace.push([a, Date.now()]);
      if (!w.__stopTrace) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, name);
}

async function stopTrace(page: Page): Promise<Trace> {
  return page.evaluate(() => {
    const w = window as unknown as Win;
    w.__stopTrace = true;
    return w.__trace ?? [];
  });
}

/** When `activity` ended in a trace (the first change away from it after it started). */
function endOf(trace: Trace, activityName: string): number {
  const start = trace.findIndex(([a]) => a === activityName);
  expect(start, `trace ${JSON.stringify(trace)} has ${activityName}`).toBeGreaterThanOrEqual(0);
  const end = trace.slice(start).find(([a]) => a !== activityName);
  expect(end, `${activityName} ended`).toBeDefined();
  return end![1];
}

test.describe.configure({ mode: 'serial' });

let ana: Page;
let ben: Page;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  ana = await joinAs(browser, 'Ana', 'SEATS-01');
  ben = await joinAs(browser, 'Ben', 'SEATS-01');
  await expect
    .poll(async () => (await remote(ana, 'Ben'))?.model, { timeout: 30_000 })
    .toBe('avatar');
  await expect
    .poll(async () => (await remote(ben, 'Ana'))?.model, { timeout: 30_000 })
    .toBe('avatar');
});

test.afterAll(async () => {
  await ana?.context().close();
  await ben?.context().close();
});

test('a seat, work and stand are seen remotely; a held desk shows Desk taken', async () => {
  test.setTimeout(150_000);
  await walkTo(ana, TO_DESK);
  await atDesk(ana);
  await walkTo(ben, TO_DESK);
  await atDesk(ben);
  await expect(prompt(ana)).toHaveText('E — Sit');
  await expect(prompt(ben)).toHaveText('E — Sit');

  await ana.keyboard.press('e');
  await expect.poll(() => activity(ana)).toBe('sitting');
  // Ben sees Ana seated on ws_7's seat socket, with the sitting animation.
  await expect.poll(async () => (await remote(ben, 'Ana'))?.activity).toBe('sitting');
  const seated = (await remote(ben, 'Ana'))!;
  expect(seated.seatId).toBe('ws_7_seat');
  expect([seated.x, seated.z]).toEqual([0.66, 3.72]);
  expect(seated.heading).toBeCloseTo(Math.PI / 2, 5);
  await expect(prompt(ben)).toHaveText('Desk taken');
  await ben.screenshot({ path: 'test-results/seats-remote-seated.png' });
  // Pressing E on a held desk changes nothing.
  await ben.keyboard.press('e');
  await ben.waitForTimeout(500);
  expect(await activity(ben)).toBe('idle');

  await ana.keyboard.press('e');
  await expect.poll(async () => (await remote(ben, 'Ana'))?.activity).toBe('working');
  await expect(ben.getByTestId('game-host').getByText('Working', { exact: true })).toBeVisible();

  await ana.keyboard.down('w');
  await expect.poll(async () => (await remote(ben, 'Ana'))?.seatId).toBe('');
  await ana.keyboard.up('w');
  await expect.poll(async () => (await remote(ben, 'Ana'))?.activity).toBe('idle');
  await expect(ben.getByTestId('game-host').getByText('Working', { exact: true })).toHaveCount(0);
  const stood = (await remote(ben, 'Ana'))!;
  expect(Math.hypot(stood.x - 0.66, stood.z - 3.72)).toBeGreaterThan(0.5);
  await expect(prompt(ben)).toHaveText('E — Sit');
});

test('two employees pressing E on one free desk: exactly one sits, no stuck state', async () => {
  test.setTimeout(150_000);
  // Ben is still in the aisle facing ws_7; Ana comes back from the stand point.
  await walkTo(ana, [[0, 3]]);
  await atDesk(ana);
  await atDesk(ben);
  await expect(prompt(ana)).toHaveText('E — Sit');
  await expect(prompt(ben)).toHaveText('E — Sit');
  await Promise.all([ana.keyboard.press('e'), ben.keyboard.press('e')]);
  await expect
    .poll(async () => [await activity(ana), await activity(ben)].sort())
    .toEqual(['idle', 'sitting']);
  await ana.waitForTimeout(1_000);
  const winner = (await activity(ana)) === 'sitting' ? ana : ben;
  const loser = winner === ana ? ben : ana;
  expect(await activity(winner)).toBe('sitting');
  await expect.poll(() => activity(loser)).toBe('idle');
  await expect(prompt(loser)).toHaveText('Desk taken');
  // The loser is not stuck: it walks away freely.
  const before = await player(loser);
  await walkTo(loser, [
    [0, 2.1],
    [0, 0],
  ]);
  const after = await player(loser);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(1);
  await expect.poll(() => activity(loser)).toBe('idle');
  // The winner stands up and the desk is free again.
  await winner.keyboard.down('w');
  await expect.poll(() => activity(winner)).not.toBe('sitting');
  await winner.keyboard.up('w');
});

test('coffee break, wave and sofa rest are seen remotely and end together', async () => {
  test.setTimeout(180_000);
  // Ana starts in or near the desk aisle.
  await walkTo(ana, [[0, 2.1], [0, 0], ...TO_COFFEE]);
  await atCoffee(ana);
  await expect(prompt(ana)).toHaveText('E — Take a break');

  await startTrace(ana, null);
  await startTrace(ben, 'Ana');
  await ana.keyboard.press('e');
  await expect.poll(async () => (await remote(ben, 'Ana'))?.activity).toBe('drinking');
  await expect(ben.getByTestId('game-host').getByText('Break', { exact: true })).toBeVisible();
  await expect.poll(() => activity(ana), { timeout: 10_000 }).toBe('idle');
  await expect.poll(async () => (await remote(ben, 'Ana'))?.activity).toBe('idle');
  const drinkA = endOf(await stopTrace(ana), 'drinking');
  const drinkB = endOf(await stopTrace(ben), 'drinking');
  expect(Math.abs(drinkA - drinkB)).toBeLessThan(500);

  await startTrace(ana, null);
  await startTrace(ben, 'Ana');
  await ana.keyboard.press('g');
  await expect.poll(async () => (await remote(ben, 'Ana'))?.activity).toBe('waving');
  await expect.poll(() => activity(ana), { timeout: 10_000 }).toBe('idle');
  await expect.poll(async () => (await remote(ben, 'Ana'))?.activity).toBe('idle');
  const waveA = endOf(await stopTrace(ana), 'waving');
  const waveB = endOf(await stopTrace(ben), 'waving');
  expect(Math.abs(waveA - waveB)).toBeLessThan(500);

  await walkTo(ana, COFFEE_TO_SOFA);
  await atSofa(ana);
  await expect(prompt(ana)).toHaveText('E — Rest');
  await ana.keyboard.press('e');
  await expect.poll(() => activity(ana)).toBe('resting');
  await expect.poll(async () => (await remote(ben, 'Ana'))?.activity).toBe('resting');
  expect((await remote(ben, 'Ana'))!.seatId).toMatch(/^sofa_seat_/);
  await expect(ben.getByTestId('game-host').getByText('Resting', { exact: true })).toBeVisible();
  await ana.keyboard.down('w');
  await expect.poll(async () => (await remote(ben, 'Ana'))?.seatId).toBe('');
  await ana.keyboard.up('w');
  await expect.poll(() => activity(ana)).not.toBe('resting');
  await expect.poll(async () => (await remote(ben, 'Ana'))?.activity).toBe('idle');
});
