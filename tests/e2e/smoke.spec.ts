import { expect, test } from '@playwright/test';

test('the app shell renders "PicPuzzle"', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PicPuzzle' })).toBeVisible();
});

test('the shapes debug page draws a grid', async ({ page }) => {
  await page.goto('/#/debug/shapes');
  await expect(page.getByTestId('grid-info')).toContainText('6 × 8 = 48 pieces');
  await expect(page.getByTestId('shapes-canvas')).toBeVisible();
});
