import { diPlugin } from '@goodie-ts/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [diPlugin()],
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
        'hono',
        '@hono/node-server',
        'kysely',
        'pg',
      ],
    },
  },
});
