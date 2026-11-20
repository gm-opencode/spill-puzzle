import { expect, test, type Page } from '@playwright/test';

interface Snapshot {
  groups: Array<{ id: number; x: number; y: number; pieces: number[] }>;
  camera: { x: number; y: number; scale: number };
  grid: { rows: number; cols: number; pw: number; ph: number };
}

type Point = { x: number; y: number };
type DragFn = (from: Point, to: Point) => Promise<void>;

async function startPuzzle(page: Page) {
  await page.goto('/#/debug/play');
  await page.getByTestId('sample-button').click();
  await expect(page.getByTestId('start-button')).toBeEnabled();
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('status')).toContainText('0 / 12');
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const h = window.__debugPlay!;
    const s = h.getState();
    return { groups: s.groups, camera: s.camera, grid: h.grid };
  });
}

/** Screen position of the centre of `piece` if its group's origin were `origin`. */
function pieceCentre(s: Snapshot, origin: Point, piece: number): Point {
  const r = Math.floor(piece / s.grid.cols);
  const c = piece % s.grid.cols;
  const wx = origin.x + c * s.grid.pw + s.grid.pw / 2;
  const wy = origin.y + r * s.grid.ph + s.grid.ph / 2;
  return { x: wx * s.camera.scale + s.camera.x, y: wy * s.camera.scale + s.camera.y };
}

/** Canvas offset inside the page, so screen points can be turned into page points. */
async function canvasOffset(page: Page): Promise<Point> {
  const box = await page.locator('[data-testid=play-host] canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return { x: box.x, y: box.y };
}

/**
 * Solve the puzzle by dragging: piece 0 onto its board place, then every other piece
 * (row-major, so each has an already-placed neighbour) onto piece 0's group.
 */
async function solve(page: Page, dragOnScreen: DragFn) {
  const offset = await canvasOffset(page);
  const drag = (a: Point, b: Point) =>
    dragOnScreen(
      { x: a.x + offset.x, y: a.y + offset.y },
      { x: b.x + offset.x, y: b.y + offset.y },
    );
  const total = 12;
  for (let piece = 0; piece < total; piece++) {
    for (let attempt = 0; ; attempt++) {
      expect(attempt, `piece ${piece} did not snap`).toBeLessThan(3);
      const s = await snapshot(page);
      const anchor = s.groups.find((g) => g.pieces.includes(0))!;
      const group = s.groups.find((g) => g.pieces.includes(piece))!;
      const target = piece === 0 ? { x: 0, y: 0 } : anchor;
      const done = piece === 0 ? Math.hypot(anchor.x, anchor.y) < 1 : anchor.pieces.includes(piece);
      if (done) break;
      await drag(pieceCentre(s, group, piece), pieceCentre(s, target, piece));
      // Wait for the drop to be processed before re-reading the state (slow CI machines).
      await expect
        .poll(
          async () => {
            const now = (await snapshot(page)).groups.find((g) => g.pieces.includes(piece))!;
            return (
              now.x !== group.x || now.y !== group.y || now.pieces.length !== group.pieces.length
            );
          },
          { timeout: 2000 },
        )
        .toBe(true)
        .catch(() => {});
    }
  }
  await expect(page.getByTestId('status')).toContainText('Completed ✓ 12 pieces');
  expect(await page.evaluate(() => window.__debugPlay!.completed)).toBe(true);
}

test.describe('play (Milestone 4)', () => {
  test('a puzzle loads, renders and fits the screen', async ({ page }) => {
    await startPuzzle(page);
    const s = await snapshot(page);
    expect(s.groups).toHaveLength(12);
    expect(s.camera.scale).toBeGreaterThan(0);
    // The canvas painted something other than the background. Screenshots read the
    // composited output, which works even though WebGL clears its buffer each frame.
    const png = await page.locator('[data-testid=play-host] canvas').screenshot();
    const painted = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const copy = document.createElement('canvas');
      copy.width = img.width;
      copy.height = img.height;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
      let different = 0;
      for (let i = 0; i < data.length; i += 4 * 97) {
        const d =
          Math.abs(data[i]! - 0x1e) + Math.abs(data[i + 1]! - 0x1f) + Math.abs(data[i + 2]! - 0x24);
        if (d > 30) different++;
      }
      return different;
    }, png.toString('base64'));
    expect(painted).toBeGreaterThan(50);
  });

  test('a 12-piece puzzle can be completed with the mouse', async ({ page }, testInfo) => {
    test.skip(!!testInfo.project.use.hasTouch, 'mouse flow; touch is tested separately');
    await startPuzzle(page);
    await solve(page, async (from, to) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up();
    });
    expect(await page.evaluate(() => window.__debugPlay!.snaps)).toBeGreaterThanOrEqual(1);
  });

  test('a 12-piece puzzle can be completed by touch', async ({ page, browserName }, testInfo) => {
    test.skip(
      !testInfo.project.use.hasTouch || browserName !== 'chromium',
      'touch drags use the Chrome DevTools Protocol',
    );
    await startPuzzle(page);
    const cdp = await page.context().newCDPSession(page);
    await solve(page, async (from, to) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }],
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    });
  });

  test('pinch zooms in with two fingers', async ({ page, browserName }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch || browserName !== 'chromium', 'CDP touch');
    await startPuzzle(page);
    const before = (await snapshot(page)).camera.scale;
    const box = (await page.locator('[data-testid=play-host] canvas').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const points = (d: number) => [
      { x: cx - d, y: cy, id: 0 },
      { x: cx + d, y: cy, id: 1 },
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30) });
    for (const d of [45, 60, 75, 90]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(d) });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = (await snapshot(page)).camera.scale;
    expect(after / before).toBeGreaterThan(2);
  });

  test('wheel zooms around the cursor and zoom to fit restores', async ({ page }, testInfo) => {
    test.skip(!!testInfo.project.use.hasTouch, 'mouse wheel');
    await startPuzzle(page);
    const fit = (await snapshot(page)).camera;
    const box = (await page.locator('[data-testid=play-host] canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await snapshot(page)).camera.scale).toBeGreaterThan(fit.scale);
    await page.getByRole('button', { name: 'Zoom to fit' }).click();
    await expect.poll(async () => (await snapshot(page)).camera.scale).toBeCloseTo(fit.scale, 5);
  });
});
