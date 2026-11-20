import { expect, test } from '@playwright/test';
import { createPuzzle } from './helpers';

test('without IndexedDB the app still plays and shows a banner (spec §11)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
  });
  await createPuzzle(page, 12);
  await expect(page.getByTestId('storage-banner')).toHaveText(
    "Progress can't be saved in this browser mode.",
  );
  await expect(page.getByTestId('play-progress')).toHaveText('0 / 12');
});
