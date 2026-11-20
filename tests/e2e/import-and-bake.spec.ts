import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const fixture = (name: string) => path.join(import.meta.dirname, '..', 'fixtures', name);

async function importFixture(page: Page, name: string) {
  await page.goto('/#/debug/bake');
  await page.getByTestId('file-input').setInputFiles(fixture(name));
}

test.describe('importImage (spec §2)', () => {
  test('applies EXIF orientation and downscales to 2048 px', async ({ page }) => {
    await importFixture(page, 'landscape-exif6.jpg');
    // Stored 2400×1600 with orientation 6 → displayed 1600×2400 → fit to 2048.
    await expect(page.getByTestId('import-info')).toContainText('1365×2048');
    await expect(page.getByTestId('thumbnail')).toBeVisible();
  });

  test('puts the stored top-left corner at the displayed top-right', async ({ page }) => {
    await page.goto('/#/debug/bake');
    const corners = await page.evaluate(async () => {
      const modulePath = '/src/image/importImage.ts';
      const mod = (await import(/* @vite-ignore */ modulePath)) as {
        importImage: (file: Blob) => Promise<{ blob: Blob; width: number }>;
      };
      const file = await (await fetch('/tests/fixtures/landscape-exif6.jpg')).blob();
      const result = await mod.importImage(file);
      const bitmap = await createImageBitmap(result.blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const px = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
      return { topLeft: px(20, 20), topRight: px(bitmap.width - 20, 20) };
    });
    expect(corners.topRight[0]).toBeGreaterThan(200); // red marker
    expect(corners.topRight[1]).toBeLessThan(60);
    expect(corners.topLeft[0]).toBeLessThan(120); // gradient, not red
  });

  test('keeps a small-enough portrait PNG at its size', async ({ page }) => {
    await importFixture(page, 'portrait.png');
    await expect(page.getByTestId('import-info')).toContainText(/900×1600 image\/(webp|jpeg)/);
  });

  test('rejects images under 400 px (FR-1.5)', async ({ page }) => {
    await importFixture(page, 'too-small.png');
    await expect(page.getByTestId('import-error')).toContainText(
      'Choose an image at least 400 px on each side.',
    );
  });

  test('rejects files that cannot be decoded', async ({ page }) => {
    await importFixture(page, 'corrupt.jpg');
    await expect(page.getByTestId('import-error')).toContainText("isn't supported");
  });
});

test.describe('baking (spec §5)', () => {
  for (const mode of ['worker', 'main-thread'] as const) {
    test(`bakes ~48 pieces into an atlas (${mode})`, async ({ page }) => {
      await importFixture(page, 'portrait.png');
      await expect(page.getByTestId('import-info')).toBeVisible();
      await page.getByLabel('Pieces').selectOption('48');
      if (mode === 'main-thread') await page.getByLabel('Force main-thread fallback').check();
      await page.getByTestId('bake-button').click();
      const info = page.getByTestId('bake-info');
      await expect(info).toContainText('9×5 = 45 pieces'); // 900×1600 at ~48 (spec §3)
      await expect(info).toContainText(`(${mode})`);
      await expect(info).toContainText('1 atlas:');
      await expect(page.getByTestId('atlas-canvas')).toHaveCount(1);
    });
  }
});
