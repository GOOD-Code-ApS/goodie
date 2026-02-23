import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@goodie/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@goodie/decorators': path.resolve(
        __dirname,
        'packages/decorators/src/index.ts',
      ),
      '@goodie/transformer': path.resolve(
        __dirname,
        'packages/transformer/src/index.ts',
      ),
      '@goodie/vite-plugin': path.resolve(
        __dirname,
        'packages/vite-plugin/src/index.ts',
      ),
      '@goodie/testing': path.resolve(
        __dirname,
        'packages/testing/src/index.ts',
      ),
    },
  },
  test: {
    globals: true,
    include: [
      'packages/**/__tests__/**/*.test.ts',
      'examples/**/__tests__/**/*.test.ts',
    ],
  },
});
