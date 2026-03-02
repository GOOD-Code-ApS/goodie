import { createKyselyPlugin } from '@goodie-ts/kysely';
import { createLoggingPlugin } from '@goodie-ts/logging';
import { diPlugin } from '@goodie-ts/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    diPlugin({
      plugins: [createLoggingPlugin(), createKyselyPlugin()],
    }),
  ],
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
        '@goodie-ts/decorators',
        '@goodie-ts/aop',
        '@goodie-ts/logging',
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
