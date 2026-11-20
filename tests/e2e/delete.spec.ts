import { expect, test } from '@playwright/test';
import { createPuzzle } from './helpers';

test('a puzzle can be deleted after confirming (FR-4.3)', async ({ page }) => {
  await createPuzzle(page, 12);
  await page.getByRole('button', { name: 'Back to library' }).click();
  const card = page.getByTestId('puzzle-card');
  await expect(card).toHaveCount(1);

  await card.getByRole('button', { name: /^More actions/ }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  // Cancel first: nothing changes.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toHaveCount(1);

  await card.getByRole('button', { name: /^More actions/ }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await expect(page.getByTestId('toast')).toContainText('Puzzle deleted');
});

test('an unknown puzzle id redirects to the library with a message', async ({ page }) => {
  await page.goto('/#/play/does-not-exist');
  await expect(page.getByTestId('toast')).toContainText("doesn't exist");
  await expect(page).toHaveURL(/#\/$/);
});

test('images that are too small are rejected on the New screen (FR-1.5)', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose a photo' }).click(),
  ]);
  const { fixture } = await import('./helpers');
  await chooser.setFiles(fixture('too-small.png'));
  await expect(page.getByTestId('import-error')).toHaveText(
    'Choose an image at least 400 px on each side.',
  );
});
