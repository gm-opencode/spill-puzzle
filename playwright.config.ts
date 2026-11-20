import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

/**
 * E2E config (implementation plan, test strategy): Chromium desktop, Pixel 7
 * emulation and WebKit iPhone emulation. Set `PW_PROJECTS=chromium` to run a subset.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 15'] } },
  ],
  // Dev server for now: the M1/M2 debug routes only exist in dev builds.
  // Switch to `vite preview` when the offline/PWA specs land (Milestone 6).
  webServer: {
    // `--mode test` enables the test-only `window.__game` hook (implementation plan M5).
    command: `npx vite --mode test --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
