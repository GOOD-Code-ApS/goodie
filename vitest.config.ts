import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@goodie-ts/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@goodie-ts/transformer': path.resolve(
        __dirname,
        'packages/transformer/src/index.ts',
      ),
      '@goodie-ts/vite-plugin': path.resolve(
        __dirname,
        'packages/vite-plugin/src/index.ts',
      ),
      '@goodie-ts/testing/vitest': path.resolve(
        __dirname,
        'packages/testing/src/vitest.ts',
      ),
      '@goodie-ts/testing': path.resolve(
        __dirname,
        'packages/testing/src/index.ts',
      ),
      '@goodie-ts/cli': path.resolve(__dirname, 'packages/cli/src/index.ts'),
      '@goodie-ts/http': path.resolve(__dirname, 'packages/http/src/index.ts'),
      '@goodie-ts/hono/plugin': path.resolve(
        __dirname,
        'packages/hono/src/plugin.ts',
      ),
      '@goodie-ts/hono': path.resolve(__dirname, 'packages/hono/src/index.ts'),
      '@goodie-ts/health': path.resolve(
        __dirname,
        'packages/health/src/index.ts',
      ),
      '@goodie-ts/logging': path.resolve(
        __dirname,
        'packages/logging/src/index.ts',
      ),
      '@goodie-ts/cache': path.resolve(
        __dirname,
        'packages/cache/src/index.ts',
      ),
      '@goodie-ts/resilience': path.resolve(
        __dirname,
        'packages/resilience/src/index.ts',
      ),
      '@goodie-ts/security': path.resolve(
        __dirname,
        'packages/security/src/index.ts',
      ),
      '@goodie-ts/kysely': path.resolve(
        __dirname,
        'packages/kysely/src/index.ts',
      ),
      '@goodie-ts/events': path.resolve(
        __dirname,
        'packages/events/src/index.ts',
      ),
      '@goodie-ts/scheduler': path.resolve(
        __dirname,
        'packages/scheduler/src/index.ts',
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
  bench: {
    include: ['benchmarks/**/*.bench.ts'],
  },
});
