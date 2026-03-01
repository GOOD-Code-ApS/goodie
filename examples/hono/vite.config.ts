import { createLoggingPlugin } from '@goodie-ts/logging';
import { createResiliencePlugin } from '@goodie-ts/resilience';
import { diPlugin } from '@goodie-ts/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    diPlugin({
      plugins: [createLoggingPlugin(), createResiliencePlugin()],
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
        '@goodie-ts/resilience',
        'hono',
        'hono/request-id',
        '@hono/node-server',
        'kysely',
        'pg',
      ],
    },
  },
});
