import { expect, test, type Page } from '@playwright/test';

// Evidence capture, not a pixel-diff test: writes fixed camera poses to visual-out/ for review
// next to the reference photos in except/. Fails only on console errors (and, softly, on a
// camera above the ceiling). Override the folder with VISUAL_OUT=<dir>.
const OUT = process.env.VISUAL_OUT ?? 'visual-out';
const CEILING = 2.7;
const DEG = Math.PI / 180;

type Pose = { x: number; z: number; heading: number; yaw?: number; pitch?: number };
type Hook = {
  setPose(p: Pose): void;
  getCamera(): { x: number; y: number; z: number; yaw: number; pitch: number };
  getDrawCalls(): { total: number; main: number; shadow: number; triangles: number };
};
type Win = { __office: Hook };

const setPose = (page: Page, p: Pose) =>
  page.evaluate((pose) => (window as unknown as Win).__office.setPose(pose), p);
const getCamera = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__office.getCamera());
const getDrawCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__office.getDrawCalls());

// Poses use the layout frame: heading 0 faces +Z (south, window side), -90 deg faces west.
const POSES: { name: string; pose?: Pose; note: string }[] = [
  { name: '01-spawn', note: 'spawn view as the player first sees it' },
  {
    name: '02-pods',
    pose: { x: -0.6, z: 2.05, heading: -90 * DEG, pitch: 22 * DEG },
    note: 'aisle between the pods looking west, window on the left (cf. except/main.jpg)',
  },
  {
    name: '03-tv-wall',
    pose: { x: -1.0, z: -0.5, heading: -90 * DEG, pitch: 18 * DEG },
    note: 'entertainment corner looking west toward the TV wall',
  },
  {
    name: '04-across-tv-wall',
    pose: { x: 3.0, z: 2.05, heading: 90 * DEG, pitch: 15 * DEG },
    note: 'east wall with utility door and air conditioner (cf. except/across-wall-tv.jpg)',
  },
  {
    name: '05-near-wall-fade',
    pose: { x: -1.2, z: -3.35, heading: 0, pitch: 25 * DEG },
    note: 'back to the north wall: camera pulled in, player mesh faded',
  },
  {
    name: '06-desk-side',
    pose: { x: -3.4, z: 2.05, heading: 180 * DEG, pitch: 35 * DEG },
    note: 'side view of ws_1 looking north: chair must face its desk (to the right, +X)',
  },
  {
    name: '07-sofa-side',
    pose: { x: -2.1, z: 0.6, heading: 180 * DEG, pitch: 35 * DEG },
    note: 'side view of the sofa looking north: seat must face the TV (to the left, -X)',
  },
];

test('captures fixed visual poses', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (
        window as unknown as { __office?: { isLightingReady?(): boolean } }
      ).__office?.isLightingReady?.() === true,
  );
  // Furniture GLBs load asynchronously; capture only after the swap finished.
  const furniture = await page.waitForFunction(() =>
    (window as unknown as { __office?: { getFurniture?(): unknown } }).__office?.getFurniture?.(),
  );
  console.log(`[visual] furniture: ${JSON.stringify(await furniture.jsonValue())}`);
  for (const { name, pose, note } of POSES) {
    if (pose) await setPose(page, pose);
    // Let the spring-damped camera settle before capturing.
    await page.waitForTimeout(1500);
    const cam = await getCamera(page);
    const calls = await getDrawCalls(page);
    console.log(
      `[visual] ${name}: ${note}; camera y=${cam.y.toFixed(2)} m; draw calls main=${calls.main} ` +
        `shadow=${calls.shadow} total=${calls.total}; triangles(all passes)=${calls.triangles}`,
    );
    expect.soft(cam.y, `${name}: camera above ceiling`).toBeLessThan(CEILING);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  expect(errors).toEqual([]);
});
