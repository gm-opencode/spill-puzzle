import { defineConfig, devices } from '@playwright/test';

const DEV_PORT = 5173;
const PREVIEW_PORT = 4173;

/**
 * E2E config (implementation plan, test strategy): Chromium desktop, Pixel 7 emulation
 * and WebKit iPhone emulation against the dev server, plus an `offline` project against
 * a production build (service worker included) for the PWA specs.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${DEV_PORT}`,
    trace: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /offline\.spec/ },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] }, testIgnore: /offline\.spec/ },
    { name: 'iphone', use: { ...devices['iPhone 15'] }, testIgnore: /offline\.spec/ },
    {
      name: 'offline',
      testMatch: /offline\.spec/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${PREVIEW_PORT}`,
        serviceWorkers: 'allow',
      },
    },
  ],
  webServer: [
    {
      // Dev server: the debug routes only exist in dev builds. `--mode test` enables the
      // test-only `window.__game` hook (implementation plan M5).
      command: `npx vite --mode test --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Production build with the service worker, in test mode for the same hook.
      command: `npm run build:test && npx vite preview --outDir dist-test --port ${PREVIEW_PORT} --strictPort`,
      url: `http://localhost:${PREVIEW_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
