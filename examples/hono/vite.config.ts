import { createLoggingPlugin } from '@goodie-ts/logging';
import { diPlugin } from '@goodie-ts/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    diPlugin({
      plugins: [createLoggingPlugin()],
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
        'hono',
        'hono/request-id',
        '@hono/node-server',
        'kysely',
        'pg',
      ],
    },
  },
});
