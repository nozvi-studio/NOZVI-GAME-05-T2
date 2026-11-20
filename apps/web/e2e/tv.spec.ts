import { expect, test, type Browser, type Page } from '@playwright/test';
import { join, player, walkTo } from './helpers';

type Tv = {
  position: [number, number, number];
  width: number;
  height: number;
  rotY: number;
  inView: boolean;
  layerSize: { width: number; height: number };
  screenRect: { x: number; y: number; width: number; height: number };
  pointerEvents: string;
  mounted: boolean;
};
type Office = {
  getTv(): Tv;
  getCameraYaw(): number;
  setPose(p: { x: number; z: number; heading: number; pitch?: number }): void;
};
const getTv = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: Office }).__office.getTv());
const getYaw = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: Office }).__office.getCameraYaw());

const DEG = Math.PI / 180;

// REQ-TV-001 (T-1139): the TV screen layer, before any player is loaded.
test('the TV screen sits on the entertainment wall and the CSS3D layer follows the canvas', async ({
  page,
}) => {
  await join(page, 'TvViewer', 'TV-E2E-01');
  // Stand in the entertainment corner and face west toward the TV wall.
  await page.evaluate(
    (pose) => (window as unknown as { __office: Office }).__office.setPose(pose),
    { x: -1.2, z: -1.62, heading: -90 * DEG, pitch: 10 * DEG },
  );
  await expect.poll(async () => (await getTv(page)).inView).toBe(true);
  const tv = await getTv(page);
  expect(tv.mounted).toBe(true);
  expect(tv.rotY).toBe(90);
  expect(tv.position[0]).toBeGreaterThan(-5.83);
  expect(tv.position[0]).toBeLessThan(-5.7);
  expect(tv.position[2]).toBeCloseTo(-1.62, 5);
  expect(tv.width).toBeCloseTo(2.04, 5);
  expect(tv.height).toBeCloseTo(0.72, 5);
  expect(tv.pointerEvents).toBe('none');
  expect(tv.layerSize).toEqual({ width: 1280, height: 720 });
  // The projected screen is a sensible on-screen rectangle.
  expect(tv.screenRect.width).toBeGreaterThan(100);
  expect(tv.screenRect.x).toBeGreaterThan(0);
  expect(tv.screenRect.x + tv.screenRect.width).toBeLessThan(1280);

  // Resizing the window resizes the CSS3D layer with the WebGL canvas.
  await page.setViewportSize({ width: 1000, height: 600 });
  await expect
    .poll(async () => (await getTv(page)).layerSize)
    .toEqual({ width: 1000, height: 600 });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect
    .poll(async () => (await getTv(page)).layerSize)
    .toEqual({ width: 1280, height: 720 });

  // Dragging across the screen still orbits the camera (clicks are not taken by the TV).
  const r = (await getTv(page)).screenRect;
  const yaw0 = await getYaw(page);
  if (process.env.TV_SHOT)
    await page.screenshot({ path: process.env.TV_SHOT.replace('.png', '-before.png') });
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 200, r.y + r.height / 2, { steps: 8 });
  await page.mouse.up();
  if (process.env.TV_SHOT) await page.screenshot({ path: process.env.TV_SHOT });
  await expect.poll(async () => Math.abs((await getYaw(page)) - yaw0)).toBeGreaterThan(0.2);
});

type PlayerView = {
  kind: string;
  time: number;
  muted: boolean;
  state: { videoId: string | null; playing: boolean };
};
type PlayerHook = {
  getTvPlayer(): {
    kind: string;
    load(id: string, t: number): void;
    play(): void;
    pause(): void;
    getTime(): number;
    isMuted(): boolean;
    state: { videoId: string | null; playing: boolean };
  };
};
const playerView = (page: Page) =>
  page.evaluate((): PlayerView => {
    const p = (window as unknown as { __office: PlayerHook }).__office.getTvPlayer();
    return { kind: p.kind, time: p.getTime(), muted: p.isMuted(), state: p.state };
  });
const drive = (page: Page, action: 'play' | 'pause' | ['load', string, number]) =>
  page.evaluate((a) => {
    const p = (window as unknown as { __office: PlayerHook }).__office.getTvPlayer();
    if (a === 'play') p.play();
    else if (a === 'pause') p.pause();
    else p.load(a[1], a[2]);
  }, action);

// T-1140: e2e builds use the fake TV player and never contact YouTube.
test('the TV uses the fake player in e2e and makes no request to YouTube', async ({ page }) => {
  const youtube: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (/(^|\.)(youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com)$/.test(host))
      youtube.push(r.url());
  });
  await join(page, 'TvPlayer', 'TV-E2E-02');
  const before = await playerView(page);
  expect(before.kind).toBe('fake');
  expect(before.muted).toBe(true);
  expect(before.state.videoId).toBeNull();

  await drive(page, ['load', 'AAAAAAAAAAA', 5]);
  await drive(page, 'play');
  await expect.poll(async () => (await playerView(page)).time).toBeGreaterThan(5.3);
  await drive(page, 'pause');
  const paused = (await playerView(page)).time;
  await page.waitForTimeout(300);
  expect((await playerView(page)).time).toBe(paused);
  await expect(page.getByTestId('tv-fake-player')).toHaveText(/AAAAAAAAAAA/);

  expect(youtube).toEqual([]);
});

// T-1142 (REQ-TV-002, REQ-TV-003): TV mode panel, Close, Esc and focus recovery.
type TvModeHook = {
  isTvMode(): boolean;
  getTvView(): { videoId: string | null; status: string; time: number; muted: boolean };
  getTv(): Tv & { canvasPointerEvents: string };
};
const tvMode = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: TvModeHook }).__office.isTvMode());
const tvView = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: TvModeHook }).__office.getTvView());
const tvLayer = (page: Page) =>
  page.evaluate(() => (window as unknown as { __office: TvModeHook }).__office.getTv());

/** Walks (keys, through the server) from spawn round the sofa to face the TV. */
async function walkToTv(page: Page) {
  await walkTo(page, [
    [-1.2, -0.3],
    [-4.0, -0.3],
  ]);
  await walkTo(page, [[-5.0, -0.9]], 0.3);
  await expect(page.getByTestId('prompt')).toHaveText('E — Watch TV');
  // The prompt is painted above the game canvas, not just present in the DOM.
  const box = (await page.getByTestId('prompt').boundingBox())!;
  const onTop = await page.evaluate(
    ([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('[data-testid="prompt"]'),
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(onTop).toBe(true);
}

async function openTv(page: Page) {
  await page.keyboard.press('e');
  await expect(page.getByTestId('tv-panel')).toBeVisible();
  await expect.poll(() => tvMode(page)).toBe(true);
}

/** Holds W until the player has moved; returns the distance covered. */
async function moveWithW(page: Page) {
  const start = await player(page);
  await page.keyboard.down('w');
  try {
    await expect
      .poll(async () => {
        const p = await player(page);
        return Math.hypot(p.x - start.x, p.z - start.z);
      })
      .toBeGreaterThan(0.2);
  } finally {
    await page.keyboard.up('w');
  }
}

test('E at the TV opens the panel with the catalog, URL field and all controls', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await join(page, 'TvPanel', 'TV-E2E-03');
  await walkToTv(page);
  await openTv(page);
  const panel = page.getByTestId('tv-panel');
  // The interaction prompt is hidden while the panel is open.
  await expect(page.getByTestId('prompt')).toHaveCount(0);

  // Catalog (the fake provider in e2e: no ytimg.com thumbnails), URL field and controls.
  const catalog = panel.getByRole('list', { name: 'Catalog' });
  await expect(catalog.getByRole('button')).toHaveText(['Alpha clip', 'Bravo clip', 'Café clip']);
  await expect(panel.getByLabel('YouTube link')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Play link' })).toBeVisible();
  for (const name of ['Play', 'Pause', 'Stop', 'Close', 'Click to unmute'])
    await expect(panel.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(panel.getByRole('slider', { name: 'Seek' })).toBeVisible();
  await expect(panel.getByTestId('tv-now')).toHaveText('Nothing playing');

  // The controls go to the room; the player follows the replicated state (T-1143).
  await catalog.getByRole('button', { name: 'Alpha clip' }).click();
  await expect.poll(async () => (await tvView(page)).status).toBe('playing');
  expect((await tvView(page)).videoId).toBe('AAAAAAAAAAA');
  await expect(page.getByTestId('tv-fake-player')).toHaveText(/AAAAAAAAAAA ▶/);
  await expect(panel.getByTestId('tv-now')).toHaveText('Playing: Alpha clip');
  await panel.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await tvView(page)).status).toBe('paused');
  await panel.getByRole('slider', { name: 'Seek' }).fill('42');
  await expect.poll(async () => (await tvView(page)).time).toBe(42);
  await expect(panel.getByTestId('tv-time')).toHaveText('0:42 / 2:00');
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await tvView(page)).time).toBeGreaterThan(42.2);
  // Evidence screenshot of the open panel (all controls visible).
  if (process.env.TV_PANEL_SHOT) await page.screenshot({ path: process.env.TV_PANEL_SHOT });
  // Muted start (plan §6.5) until the user clicks.
  expect((await tvView(page)).muted).toBe(true);
  await panel.getByRole('button', { name: 'Click to unmute' }).click();
  await expect.poll(async () => (await tvView(page)).muted).toBe(false);
  await expect(panel.getByRole('button', { name: 'Click to unmute' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect.poll(async () => (await tvView(page)).status).toBe('idle');
  await expect(panel.getByTestId('tv-now')).toHaveText('Nothing playing');
});

test('after clicking the screen, Close leaves TV mode and gives the keyboard back', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await join(page, 'TvClose', 'TV-E2E-04');
  await walkToTv(page);
  expect((await tvLayer(page)).pointerEvents).toBe('none');
  await openTv(page);
  const inMode = await tvLayer(page);
  expect(inMode.pointerEvents).toBe('auto');
  expect(inMode.canvasPointerEvents).toBe('none');

  // Stand-in for the YouTube iframe (the fake player has none): it takes focus on click.
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.dataset.testid = 'tv-test-iframe';
    frame.srcdoc = '<body style="margin:0;background:#123"></body>';
    frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
    const screen = document.querySelector<HTMLElement>('[data-testid="tv-screen"]')!;
    screen.style.position = 'relative';
    screen.appendChild(frame);
  });
  const r = inMode.screenRect;
  // Click the part of the screen right of the panel.
  const x = Math.max(r.x + r.width / 2, 340);
  expect(x).toBeLessThan(r.x + r.width - 5);
  await page.mouse.click(x, r.y + r.height / 2);
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('IFRAME');
  // Keys now go to the iframe, so Esc cannot reach the app: the on-screen Close is the way out.
  await page.keyboard.press('Escape');
  expect(await tvMode(page)).toBe(true);

  await page.getByTestId('tv-panel').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('tv-panel')).toHaveCount(0);
  expect(await tvMode(page)).toBe(false);
  const closed = await tvLayer(page);
  expect(closed.pointerEvents).toBe('none');
  expect(closed.canvasPointerEvents).toBe('auto');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('CANVAS');
  await moveWithW(page);

  // Camera orbit works again: a drag across the screen turns the camera.
  const after = await tvLayer(page);
  const yaw0 = await getYaw(page);
  const cx = after.screenRect.x + after.screenRect.width / 2;
  const cy = after.screenRect.y + after.screenRect.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 200, cy, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await getYaw(page)) - yaw0)).toBeGreaterThan(0.2);
});

test('Esc closes the panel, and an invalid pasted URL shows a message', async ({ page }) => {
  test.setTimeout(90_000);
  await join(page, 'TvEsc', 'TV-E2E-05');
  await walkToTv(page);
  await openTv(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tv-panel')).toHaveCount(0);
  expect(await tvMode(page)).toBe(false);
  expect((await tvLayer(page)).pointerEvents).toBe('none');
  await expect(page.getByTestId('prompt')).toHaveText('E — Watch TV');

  await openTv(page);
  const panel = page.getByTestId('tv-panel');
  const field = panel.getByLabel('YouTube link');
  const before = await player(page);
  // Typing in the field does not walk the player.
  await field.fill('https://vimeo.com/76979871');
  await field.press('Enter');
  await expect(panel.getByRole('alert')).toHaveText('Not a YouTube link or video id.');
  expect((await tvView(page)).videoId).toBeNull();
  // Holding W in the field would walk ~1 m outside TV mode; late server corrections
  // after the walk can still shift the player by a few centimetres.
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  const still = await player(page);
  expect(Math.hypot(still.x - before.x, still.z - before.z)).toBeLessThan(0.1);

  // A valid link (not in the catalog) is accepted and the message goes away.
  await field.fill('https://youtu.be/BBBBBBBBBBB?t=3');
  await panel.getByRole('button', { name: 'Play link' }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect.poll(async () => (await tvView(page)).videoId).toBe('BBBBBBBBBBB');

  // Esc from inside the URL field still closes (the app has focus).
  await field.focus();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('CANVAS');
  await moveWithW(page);
});

// T-1143 (REQ-TV-004, REQ-TV-006): the room `tv` state drives every page's player.
type SyncHook = {
  openTvMode(): void;
  getTvSync(): { videoId: string | null; status: string; expected: number | null };
  getTvPlayer(): { getTime(): number; state: { videoId: string | null; playing: boolean } };
};
type PageTv = {
  videoId: string | null;
  status: string;
  expected: number | null;
  time: number;
  player: { videoId: string | null; playing: boolean };
};
const pageTv = (page: Page) =>
  page.evaluate((): PageTv => {
    const o = (window as unknown as { __office: SyncHook }).__office;
    const s = o.getTvSync();
    const p = o.getTvPlayer();
    return {
      videoId: s.videoId,
      status: s.status,
      expected: s.expected,
      time: p.getTime(),
      player: p.state,
    };
  });

/** Opens TV mode through the dev hook (walking to the TV is covered above). */
async function openPanel(page: Page) {
  await page.evaluate(() => (window as unknown as { __office: SyncHook }).__office.openTvMode());
  const panel = page.getByTestId('tv-panel');
  await expect(panel).toBeVisible();
  return panel;
}

/** Every page shows `videoId` with `status`, and its player follows (fake player state). */
async function expectAll(pages: Page[], videoId: string | null, status: string) {
  for (const page of pages) {
    await expect
      .poll(async () => {
        const tv = await pageTv(page);
        return [tv.videoId, tv.status, tv.player.videoId, tv.player.playing];
      })
      .toEqual([videoId, status, videoId, status === 'playing']);
  }
}

/** The player times of all pages agree within `seconds` (read close together). */
async function expectInSync(pages: Page[], seconds: number) {
  await expect
    .poll(async () => {
      const times = await Promise.all(pages.map(async (p) => (await pageTv(p)).time));
      return Math.max(...times) - Math.min(...times);
    })
    .toBeLessThan(seconds);
}

async function joinPage(browser: Browser, name: string, code: string) {
  const page = await (await browser.newContext()).newPage();
  await join(page, name, code);
  return page;
}

test('play, pause, seek, change video and Stop sync across three pages; Close is local', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const code = 'TV-E2E-06';
  const a = await joinPage(browser, 'TvA', code);
  const b = await joinPage(browser, 'TvB', code);
  const c = await joinPage(browser, 'TvC', code);
  const all = [a, b, c];
  try {
    // A picks a catalog video; B and C load the same id and play.
    const panelA = await openPanel(a);
    await panelA
      .getByRole('list', { name: 'Catalog' })
      .getByRole('button', { name: 'Alpha clip' })
      .click();
    await expectAll(all, 'AAAAAAAAAAA', 'playing');
    await expectInSync(all, 1);

    // B pauses, seeks and changes the video; A and C follow.
    const panelB = await openPanel(b);
    await panelB.getByRole('button', { name: 'Pause', exact: true }).click();
    await expectAll(all, 'AAAAAAAAAAA', 'paused');
    await panelB.getByRole('slider', { name: 'Seek' }).fill('42');
    for (const page of all) await expect.poll(async () => (await pageTv(page)).time).toBe(42);
    await panelB.getByRole('button', { name: 'Play', exact: true }).click();
    await expectAll(all, 'AAAAAAAAAAA', 'playing');
    for (const page of all)
      await expect.poll(async () => (await pageTv(page)).time).toBeGreaterThan(42.2);
    await expectInSync(all, 1);
    await panelB
      .getByRole('list', { name: 'Catalog' })
      .getByRole('button', { name: 'Bravo clip' })
      .click();
    await expectAll(all, 'BBBBBBBBBBB', 'playing');
    await expect(a.getByTestId('tv-panel').getByTestId('tv-now')).toHaveText('Playing: Bravo clip');
    await expectInSync(all, 1);
    if (process.env.TV_SYNC_SHOT) {
      // Evidence: page B's panel and screen while A and C play the same clip.
      await b.screenshot({ path: process.env.TV_SYNC_SHOT });
    }

    // Close on A is local: A leaves TV mode, everyone keeps playing.
    await panelA.getByRole('button', { name: 'Close' }).click();
    await expect(a.getByTestId('tv-panel')).toHaveCount(0);
    await a.waitForTimeout(500);
    await expectAll(all, 'BBBBBBBBBBB', 'playing');

    // Stop on C idles all three.
    const panelC = await openPanel(c);
    await panelC.getByRole('button', { name: 'Stop', exact: true }).click();
    await expectAll(all, null, 'idle');
    await expect(b.getByTestId('tv-fake-player')).toHaveText('');
    await expect(panelC.getByTestId('tv-now')).toHaveText('Nothing playing');
  } finally {
    await Promise.all(all.map((p) => p.context().close()));
  }
});

test('a page that joins mid-video seeks to the server position within 1 s', async ({ browser }) => {
  test.setTimeout(90_000);
  const code = 'TV-E2E-07';
  const a = await joinPage(browser, 'TvHost', code);
  const late = await (await browser.newContext()).newPage();
  try {
    const panel = await openPanel(a);
    await panel
      .getByRole('list', { name: 'Catalog' })
      .getByRole('button', { name: 'Café clip' })
      .click();
    await expectAll([a], 'CCCCCCCCCCC', 'playing');
    // Let the video run so a late joiner has to seek well past the start.
    await expect.poll(async () => (await pageTv(a)).time).toBeGreaterThan(4);

    await join(late, 'TvLate', code);
    const joinedAt = Date.now();
    await expect
      .poll(
        async () => {
          const tv = await pageTv(late);
          return (
            tv.player.videoId === 'CCCCCCCCCCC' &&
            tv.player.playing &&
            tv.expected !== null &&
            Math.abs(tv.time - tv.expected) < 0.5
          );
        },
        { timeout: 1000, intervals: [50] },
      )
      .toBe(true);
    expect(Date.now() - joinedAt).toBeLessThan(1000);
    const tv = await pageTv(late);
    expect(tv.time).toBeGreaterThan(4);
    await expectInSync([a, late], 1);
  } finally {
    await Promise.all([a, late].map((p) => p.context().close()));
  }
});

// T-1144 (REQ-TV-009): per-video error UI for the IFrame error codes, with the fake player.
type ErrorHook = { getTvPlayer(): { emitError(code: number): void } };
const emitError = (page: Page, code: number) =>
  page.evaluate(
    (c) => (window as unknown as { __office: ErrorHook }).__office.getTvPlayer().emitError(c),
    code,
  );

test('a player error shows a per-video message on every page and another video can be chosen', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const code = 'TV-E2E-08';
  const a = await joinPage(browser, 'ErrA', code);
  const b = await joinPage(browser, 'ErrB', code);
  const c = await joinPage(browser, 'ErrC', code);
  const all = [a, b, c];
  try {
    // B stands at the TV so its screen is in view (evidence screenshot).
    await walkToTv(b);
    await openTv(b);
    const panels = [await openPanel(a), b.getByTestId('tv-panel'), await openPanel(c)];
    await panels[0]!
      .getByRole('list', { name: 'Catalog' })
      .getByRole('button', { name: 'Alpha clip' })
      .click();
    await expectAll(all, 'AAAAAAAAAAA', 'playing');
    for (const page of all) await expect(page.getByTestId('tv-screen-error')).toBeHidden();

    // Embedding blocked (150) on every client, as a blocked video fails for everyone.
    for (const page of all) await emitError(page, 150);
    for (const [i, page] of all.entries()) {
      const screen = page.getByTestId('tv-screen-error');
      await expect(screen).toBeVisible();
      await expect(screen).toContainText("This video can't be played here");
      const alert = panels[i]!.getByTestId('tv-error');
      await expect(alert).toContainText("This video can't be played here");
      await expect(alert).toContainText('does not allow playing it outside YouTube');
      await expect(alert).toHaveAttribute('data-code', '150');
      await expect(panels[i]!.getByTestId('tv-now')).toHaveText("Can't play: Alpha clip");
      // The failed item is not offered again; the others still are.
      const catalog = panels[i]!.getByRole('list', { name: 'Catalog' });
      await expect(catalog.getByRole('button', { name: /Alpha clip/ })).toBeDisabled();
      await expect(catalog.getByRole('button', { name: 'Bravo clip' })).toBeEnabled();
      // The player stopped locally; the shared state still names the video.
      expect((await pageTv(page)).player.videoId).toBeNull();
      expect((await pageTv(page)).videoId).toBe('AAAAAAAAAAA');
    }
    if (process.env.TV_ERROR_SHOT) await b.screenshot({ path: process.env.TV_ERROR_SHOT });

    // C chooses another video: the error clears everywhere and all three play it.
    await panels[2]!
      .getByRole('list', { name: 'Catalog' })
      .getByRole('button', { name: 'Bravo clip' })
      .click();
    await expectAll(all, 'BBBBBBBBBBB', 'playing');
    for (const [i, page] of all.entries()) {
      await expect(page.getByTestId('tv-screen-error')).toBeHidden();
      await expect(panels[i]!.getByTestId('tv-error')).toHaveCount(0);
      await expect(panels[i]!.getByTestId('tv-now')).toHaveText('Playing: Bravo clip');
    }
  } finally {
    await Promise.all(all.map((p) => p.context().close()));
  }
});

// T-1568 (REQ-NFR-005): a refused command shows a message in the panel until the block ends.
test('too many TV commands show a rate-limit message that clears after the wait', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await join(page, 'TvLimit', 'TV-E2E-09');
  await walkToTv(page);
  await openTv(page);
  const panel = page.getByTestId('tv-panel');
  const notice = panel.getByTestId('tv-rate-limited');
  await expect(notice).toHaveCount(0);
  await panel
    .getByRole('list', { name: 'Catalog' })
    .getByRole('button', { name: 'Alpha clip' })
    .click();
  await expect.poll(async () => (await tvView(page)).status).toBe('playing');
  // More commands than the server allows per window; the first refusal brings the notice.
  for (let i = 0; i < 8; i++) {
    const name = i % 2 === 0 ? 'Pause' : 'Play';
    await panel.getByRole('button', { name, exact: true }).click();
    if ((await notice.count()) > 0) break;
  }
  await expect(notice).toBeVisible();
  await expect(notice).toHaveText(/^Too many TV commands, try again in \d+ s\.$/);
  // retryAfterMs is at most the server window (10 s).
  await expect(notice).toHaveCount(0, { timeout: 12_000 });
  // Commands work again after the wait.
  const before = (await tvView(page)).status;
  await panel
    .getByRole('button', { name: before === 'playing' ? 'Pause' : 'Play', exact: true })
    .click();
  await expect
    .poll(async () => (await tvView(page)).status)
    .toBe(before === 'playing' ? 'paused' : 'playing');
});
