import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    cacheDir: './node_modules/.vitest-consult',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
