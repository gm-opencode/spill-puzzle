import { expect, type Page, type TestInfo } from '@playwright/test';
import path from 'node:path';

export const fixture = (name: string) => path.join(import.meta.dirname, '..', 'fixtures', name);

export type Point = { x: number; y: number };

/** Library → pick a photo → choose a piece count → start. Ends on the Play screen. */
export async function createPuzzle(page: Page, pieces: number, file = 'portrait.png') {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  const button = page.getByRole('button', { name: /Choose a photo|New puzzle/ }).first();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button.click()]);
  await chooser.setFiles(fixture(file));
  await page.getByRole('radio', { name: `${pieces} pieces` }).click();
  await page.getByTestId('start-puzzle').click();
  await page.waitForURL(/#\/play\//, { timeout: 10_000 }).catch(async () => {
    const toasts = await page.getByTestId('toast').allTextContents();
    throw new Error(
      `Start puzzle did not open the Play screen. Toasts: ${JSON.stringify(toasts)}. ` +
        `Errors: ${JSON.stringify(errors)}`,
    );
  });
  await expect(page.getByTestId('play-progress')).toHaveText(/^0 \/ \d+$/, { timeout: 20_000 });
}

interface GameSnapshot {
  groups: Array<{ id: number; x: number; y: number; pieces: number[] }>;
  camera: { x: number; y: number; scale: number };
  grid: { rows: number; cols: number; pw: number; ph: number };
}

export async function gameSnapshot(page: Page): Promise<GameSnapshot> {
  return page.evaluate(() => {
    const g = window.__game!;
    const s = g.getState();
    return { groups: s.groups, camera: s.camera, grid: g.grid };
  });
}

/** Page position of the centre of `piece` if its group's origin were `origin`. */
export async function pieceCentreOnPage(
  page: Page,
  s: GameSnapshot,
  origin: Point,
  piece: number,
): Promise<Point> {
  const box = (await page.locator('[data-testid=play-host] canvas').boundingBox())!;
  const r = Math.floor(piece / s.grid.cols);
  const c = piece % s.grid.cols;
  const wx = origin.x + c * s.grid.pw + s.grid.pw / 2;
  const wy = origin.y + r * s.grid.ph + s.grid.ph / 2;
  return {
    x: box.x + wx * s.camera.scale + s.camera.x,
    y: box.y + wy * s.camera.scale + s.camera.y,
  };
}

/** Drag with the mouse, or with CDP touch events on touch-emulating Chromium projects. */
export async function drag(page: Page, testInfo: TestInfo, from: Point, to: Point) {
  const touch =
    !!testInfo.project.use.hasTouch && testInfo.project.use.defaultBrowserType !== 'webkit';
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    return;
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/**
 * Drag `piece`'s group so the piece lands where it belongs relative to `target`'s origin,
 * then wait until the game state shows the group moved (CI can be slow to process input).
 */
export async function placePiece(page: Page, testInfo: TestInfo, piece: number, target: Point) {
  const s = await gameSnapshot(page);
  const group = s.groups.find((g) => g.pieces.includes(piece))!;
  await drag(
    page,
    testInfo,
    await pieceCentreOnPage(page, s, group, piece),
    await pieceCentreOnPage(page, s, target, piece),
  );
  await expect
    .poll(
      async () => {
        const now = (await gameSnapshot(page)).groups.find((g) => g.pieces.includes(piece))!;
        return now.x !== group.x || now.y !== group.y || now.pieces.length !== group.pieces.length;
      },
      { timeout: 2000 },
    )
    .toBe(true)
    .catch(() => {
      // Didn't move: the caller decides whether to retry.
    });
}
