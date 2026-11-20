import { expect, test, type Page } from '@playwright/test';
import { createPuzzle, gameSnapshot } from './helpers';

const scale = async (page: Page) => (await gameSnapshot(page)).camera.scale;

test('zoom buttons zoom in and out (FR-3.6)', async ({ page }) => {
  await createPuzzle(page, 12);
  const fit = await scale(page);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => scale(page)).toBeGreaterThan(fit * 1.2);
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(() => scale(page)).toBeCloseTo(fit, 5);
});

test('keyboard shortcuts: + zooms, 0 fits, P toggles the preview (spec §12)', async ({
  page,
}, testInfo) => {
  test.skip(!!testInfo.project.use.hasTouch, 'desktop shortcuts');
  await createPuzzle(page, 12);
  const fit = await scale(page);
  await page.keyboard.press('+');
  await expect.poll(() => scale(page)).toBeGreaterThan(fit);
  await page.keyboard.press('0');
  await expect.poll(() => scale(page)).toBeCloseTo(fit, 5);
  // Preview opens with P and closes with Escape; the board is unaffected.
  const before = (await gameSnapshot(page)).groups;
  await page.keyboard.press('p');
  await page.keyboard.press('Escape');
  expect((await gameSnapshot(page)).groups).toEqual(before);
});

test('the iOS install hint shows once, only in iOS Safari (spec §8)', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PicPuzzle' })).toBeVisible();
  const hint = page.getByTestId('install-hint');
  if (testInfo.project.name === 'iphone') {
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Add to Home Screen');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'PicPuzzle' })).toBeVisible();
    await expect(hint).toHaveCount(0);
  } else {
    await expect(hint).toHaveCount(0);
  }
});
