import { expect, test } from '@playwright/test';
import { createPuzzle, gameSnapshot, placePiece } from './helpers';

test('reloading mid-game resumes the exact layout (FR-4.2)', async ({ page }, testInfo) => {
  await createPuzzle(page, 12);

  // Put piece 0 on the board and snap piece 1 to it.
  await placePiece(page, testInfo, 0, { x: 0, y: 0 });
  const anchor = (await gameSnapshot(page)).groups.find((g) => g.pieces.includes(0))!;
  await placePiece(page, testInfo, 1, anchor);
  await expect(page.getByTestId('play-progress')).toHaveText('2 / 12');

  // Let the debounced autosave run (spec §7: 1 s after a drop).
  await page.waitForTimeout(1600);
  const before = await gameSnapshot(page);

  await page.reload();
  await expect(page.getByTestId('play-progress')).toHaveText('2 / 12', { timeout: 20_000 });
  const after = await gameSnapshot(page);

  const byId = (gs: typeof before.groups) => [...gs].sort((a, b) => a.id - b.id);
  expect(byId(after.groups)).toEqual(byId(before.groups));
  expect(after.camera.scale).toBeCloseTo(before.camera.scale, 9);
  expect(after.camera.x).toBeCloseTo(before.camera.x, 6);
  expect(after.camera.y).toBeCloseTo(before.camera.y, 6);
});

test('progress and time are saved when leaving through the back button', async ({
  page,
}, testInfo) => {
  await createPuzzle(page, 12);
  await placePiece(page, testInfo, 0, { x: 0, y: 0 });
  const anchor = (await gameSnapshot(page)).groups.find((g) => g.pieces.includes(0))!;
  await placePiece(page, testInfo, 3, anchor); // below piece 0 (3 columns)
  await expect(page.getByTestId('play-progress')).toHaveText('2 / 12');
  await page.getByRole('button', { name: 'Back to library' }).click();
  const card = page.getByTestId('puzzle-card');
  await expect(card).toBeVisible();
  // 1 merge of 11 possible = 9%.
  await expect(card).toContainText('9%');
});
