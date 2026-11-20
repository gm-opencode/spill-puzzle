import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-test',
      'dev-dist',
      'coverage',
      'node_modules',
      'test-results',
      'playwright-report',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // AGENTS.md rule 3 / architecture §3: the game core stays pure.
    files: ['src/game/geometry/**/*.ts', 'src/game/model/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'pixi.js', 'pixi.js/*', '@pixi/*'],
              message: 'game/geometry and game/model must stay pure (no React or Pixi).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'indexedDB',
        'requestAnimationFrame',
      ],
    },
  },
);
