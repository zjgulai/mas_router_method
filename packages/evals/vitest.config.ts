import { defineConfig } from 'vitest/config';

/**
 * Per-package cache directory. Turbo runs test tasks for every package in
 * parallel, and vitest's default cache lives at the workspace root — two packages
 * clearing the same directory race and one crashes with ENOTEMPTY.
 */
export default defineConfig({
  test: {
    cacheDir: `./node_modules/.vitest-evals`,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
