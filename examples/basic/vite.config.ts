import { diPlugin } from '@goodie-ts/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [diPlugin()],
  build: {
    lib: {
      entry: 'src/main.ts',
      formats: ['es'],
      fileName: 'main',
    },
    rollupOptions: {
      external: ['@goodie-ts/core', '@goodie-ts/decorators'],
    },
  },
});
