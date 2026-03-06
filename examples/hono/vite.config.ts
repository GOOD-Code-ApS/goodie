import { diPlugin } from '@goodie-ts/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [diPlugin({ scan: ['@goodie-ts'], configDir: 'config' })],
  esbuild: { target: 'es2022' },
  build: {
    lib: {
      entry: 'src/main.ts',
      formats: ['es'],
      fileName: 'main',
    },
    rollupOptions: {
      external: [
        '@goodie-ts/core',
        '@goodie-ts/health',
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
