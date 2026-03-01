import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@goodie-ts/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@goodie-ts/decorators': path.resolve(
        __dirname,
        'packages/decorators/src/index.ts',
      ),
      '@goodie-ts/transformer': path.resolve(
        __dirname,
        'packages/transformer/src/index.ts',
      ),
      '@goodie-ts/vite-plugin': path.resolve(
        __dirname,
        'packages/vite-plugin/src/index.ts',
      ),
      '@goodie-ts/testing': path.resolve(
        __dirname,
        'packages/testing/src/index.ts',
      ),
      '@goodie-ts/cli': path.resolve(__dirname, 'packages/cli/src/index.ts'),
      '@goodie-ts/aop': path.resolve(__dirname, 'packages/aop/src/index.ts'),
      '@goodie-ts/hono': path.resolve(__dirname, 'packages/hono/src/index.ts'),
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
