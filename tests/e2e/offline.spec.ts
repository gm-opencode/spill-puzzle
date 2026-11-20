import { expect, test, type Page } from '@playwright/test';
import { createPuzzle, gameSnapshot, placePiece } from './helpers';

/** Wait until the service worker controls the page (after its first install, reload once). */
async function waitForServiceWorker(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('offline: load, go offline, reload, open a puzzle and play (FR-5.2)', async ({
  page,
  context,
}, testInfo) => {
  await waitForServiceWorker(page);
  await createPuzzle(page, 12);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(1);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'PicPuzzle' })).toBeVisible();
  const card = page.getByTestId('puzzle-card');
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: /^Open / }).click();
  await expect(page.getByTestId('play-progress')).toHaveText('0 / 12', { timeout: 20_000 });

  await placePiece(page, testInfo, 0, { x: 0, y: 0 });
  const anchor = (await gameSnapshot(page)).groups.find((g) => g.pieces.includes(0))!;
  await placePiece(page, testInfo, 1, anchor);
  await expect(page.getByTestId('play-progress')).toHaveText('2 / 12');
});

test('the app is installable (FR-5.1)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chrome DevTools Protocol');
  await waitForServiceWorker(page);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    return link ? ((await (await fetch(link.href)).json()) as Record<string, unknown>) : null;
  });
  expect(manifest).toMatchObject({
    name: 'PicPuzzle',
    short_name: 'PicPuzzle',
    display: 'standalone',
  });
  const icons = (manifest?.icons ?? []) as Array<{ sizes: string; purpose?: string }>;
  expect(icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
});

test('no requests leave the app origin while creating and playing (NFR-4)', async ({
  page,
}, testInfo) => {
  const foreign: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    const local =
      url.hostname === 'localhost' || url.protocol === 'data:' || url.protocol === 'blob:';
    if (!local) foreign.push(req.url());
  });
  await createPuzzle(page, 12);
  await placePiece(page, testInfo, 0, { x: 0, y: 0 });
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(1);
  expect(foreign).toEqual([]);
});
