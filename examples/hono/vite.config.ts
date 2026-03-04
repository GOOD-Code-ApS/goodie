import { diPlugin } from '@goodie-ts/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [diPlugin({ scan: ['@goodie-ts'] })],
  esbuild: { target: 'es2022' },
  build: {
    lib: {
      entry: 'src/main.ts',
      formats: ['es'],
      fileName: 'main',
    },
    rollupOptions: {
      external: [
        '@goodie-ts/config',
        '@goodie-ts/core',
        '@goodie-ts/decorators',
        '@goodie-ts/health',
        '@goodie-ts/aop',
        '@goodie-ts/cache',
        '@goodie-ts/logging',
        '@goodie-ts/resilience',
        '@goodie-ts/kysely',
        '@goodie-ts/hono',
        'hono',
        'hono/request-id',
        '@hono/node-server',
        'kysely',
        'pg',
      ],
    },
  },
});
