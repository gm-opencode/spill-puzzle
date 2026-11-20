import { expect, test } from '@playwright/test';
import { createPuzzle, gameSnapshot, placePiece } from './helpers';

test('create a 12-piece puzzle, solve it, and see it completed in the library', async ({
  page,
}, testInfo) => {
  await createPuzzle(page, 12);
  await expect(page.getByTestId('play-progress')).toHaveText('0 / 12');

  // Test-only hook: everything but the last piece, then one real drag.
  await page.evaluate(() => window.__game!.solveAllButOne());
  await expect(page.getByTestId('play-progress')).toHaveText('11 / 12');

  const s = await gameSnapshot(page);
  const anchor = s.groups.find((g) => g.pieces.includes(0))!;
  for (let attempt = 0; attempt < 3; attempt++) {
    await placePiece(page, testInfo, 11, anchor);
    if (await page.getByTestId('completion').isVisible()) break;
    await page.waitForTimeout(100);
  }

  await expect(page.getByTestId('completion')).toBeVisible();
  await expect(page.getByTestId('completion-stats')).toHaveText(/^12 pieces in \d+:\d\d$/);
  await expect(page.getByTestId('play-progress')).toHaveText('12 / 12');

  await page.getByRole('button', { name: 'Library', exact: true }).click();
  const card = page.getByTestId('puzzle-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('completed-badge')).toBeVisible();
  await expect(card).toContainText('100%');

  // Reopening a completed puzzle shows the completion screen again.
  await card.getByRole('button', { name: /^Open / }).click();
  await expect(page.getByTestId('completion')).toBeVisible({ timeout: 20_000 });
});

test('acceptance criterion 1: from photo to playing 48 pieces in under 15 s', async ({ page }) => {
  await page.goto('/');
  const started = Date.now();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose a photo' }).click(),
  ]);
  const { fixture } = await import('./helpers');
  await chooser.setFiles(fixture('landscape-exif6.jpg'));
  await page.getByRole('radio', { name: '48 pieces' }).click(); // the default, made explicit
  await page.getByTestId('start-puzzle').click();
  await expect(page.getByTestId('play-progress')).toHaveText(/^0 \/ \d+$/, { timeout: 15_000 });
  expect(Date.now() - started).toBeLessThan(15_000);
});
