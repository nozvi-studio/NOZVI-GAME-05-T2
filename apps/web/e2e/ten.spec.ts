import { expect, test, type Page } from '@playwright/test';
import { E2E_WIRE, joinBot, leaveAll, walkBot, type BotRoom } from './bots';
import { join } from './helpers';

// REQ-NET-001 ten-client room: one observing browser plus nine walking headless bots
// (plan §6 item 1: ten software-WebGL browsers do not fit in RAM), then an eleventh join.
const CODE = 'TEN-E2E';

type Office = {
  getBoardText(): string;
  getRemoteCount(): number;
  getDrawCalls(): { total: number; main: number; shadow: number; triangles: number };
};
// Page functions are serialized, so each one reads the hook itself.
const boardText = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: Office }).__office.getBoardText());
const remoteCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: Office }).__office.getRemoteCount());
const drawCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: Office }).__office.getDrawCalls());

const bots: BotRoom[] = [];
const stops: (() => void)[] = [];
test.afterEach(async () => {
  stops.splice(0).forEach((stop) => stop());
  await leaveAll(bots);
});

/** Frames rendered per second over `ms`, measured in the page. */
const fps = (page: Page, ms: number) =>
  page.evaluate(
    (window) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - start < window) requestAnimationFrame(tick);
          else resolve((frames * 1000) / (performance.now() - start));
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

test('nine walking bots and one browser fill the room; the eleventh join is refused', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await join(page, 'Alice', CODE);
  for (let i = 0; i < E2E_WIRE.maxClients - 1; i++) {
    const bot = await joinBot(CODE, `Bot${i + 1}`);
    bots.push(bot);
    stops.push(walkBot(bot, i));
  }

  const names = ['Alice', ...bots.map((_, i) => `Bot${i + 1}`)];
  const panel = page.getByRole('region', { name: 'Online employees' });
  await expect
    .poll(
      async () =>
        (await panel.getByTestId('employee-name').allTextContents())
          .map((n) => n.replace(/ \(you\)$/, ''))
          .sort(),
      { timeout: 30_000 },
    )
    .toEqual([...names].sort());
  await expect.poll(() => boardText(page)).toBe('Online: 10');
  await expect.poll(() => remoteCount(page)).toBe(9);

  // Eleventh join, headless: the server refuses with room_full.
  const refused = await joinBot(CODE, 'Bot10').then(
    (room) => {
      bots.push(room);
      return 'joined';
    },
    (e: Error) => e.message,
  );
  expect(refused).toBe('room_full');

  // Eleventh join, browser: the join screen shows the room-full message, no game starts.
  const late = await (await browser.newContext()).newPage();
  try {
    await late.goto('/');
    await late.getByLabel('Your name').fill('Late');
    await late.getByLabel('Office code').fill(CODE);
    await late.getByRole('button', { name: 'Join Office' }).click();
    await expect(late.getByRole('alert')).toContainText('This office is full');
    await expect(late.getByTestId('game-host')).toHaveCount(0);
  } finally {
    await late.context().close();
  }

  // The observer still sees exactly ten employees (no overflow room joined its view).
  await expect(panel.getByTestId('employee-name')).toHaveCount(10);
  expect(await boardText(page)).toBe('Online: 10');

  // Evidence only (software WebGL here; the owner measures real hardware).
  const draw = await drawCalls(page);
  const rate = await fps(page, 3_000);
  const note = `10 employees: ${draw.total} draw calls (${draw.main} main + ${draw.shadow} shadow), ${draw.triangles} triangles, ${rate.toFixed(1)} FPS (headless SwiftShader)`;
  test.info().annotations.push({ type: 'measurement', description: note });
  console.log(note);
});
