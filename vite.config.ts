/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BACKGROUND = '#1e1f24';

export default defineConfig({
  // Set BASE_PATH (e.g. "/spill-puzzle/") when hosting under a sub-path such as GitHub Pages.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    // Spec §8: prompt-type service worker, precache the app shell, no runtime API caches.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // registered in src/app/pwa.ts
      strategies: 'generateSW',
      includeAssets: ['favicon.svg', 'robots.txt', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'PicPuzzle',
        short_name: 'PicPuzzle',
        description:
          'Turn any photo into a jigsaw puzzle. Works offline; your photos never leave your device.',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        background_color: BACKGROUND,
        theme_color: BACKGROUND,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,txt,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  // The bake worker is created with `{ type: 'module' }` (spec §5).
  worker: { format: 'es' },
  test: {
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Pure logic only (NFR-10). Browser-only code is covered by Playwright.
      include: [
        'src/game/geometry/**',
        'src/game/model/**',
        'src/game/bake/atlas.ts',
        'src/game/render/camera.ts',
        'src/game/render/input.ts',
        'src/storage/**',
        'src/screens/play/session.ts',
        'src/screens/new/difficulty.ts',
        'src/app/router.ts',
        'src/i18n/**',
      ],
      exclude: ['src/game/geometry/index.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        // Milestone 3 DoD: ≥ 90% on game/model.
        'src/game/model/**': { lines: 90, statements: 90, functions: 90, branches: 90 },
      },
    },
  },
});
