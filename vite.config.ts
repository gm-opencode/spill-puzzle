/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The bake worker is created with `{ type: 'module' }` (spec §5).
  worker: { format: 'es' },
  test: {
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Pure logic only (NFR-10). Browser-only code is covered by Playwright.
      include: ['src/game/geometry/**', 'src/game/model/**', 'src/game/bake/atlas.ts'],
      exclude: ['**/index.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        // Milestone 3 DoD: ≥ 90% on game/model.
        'src/game/model/**': { lines: 90, statements: 90, functions: 90, branches: 90 },
      },
    },
  },
});
