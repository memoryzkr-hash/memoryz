import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        game: resolve(import.meta.dirname, 'index.html'),
        site: resolve(import.meta.dirname, 'site/index.html'),
      },
    },
  },
});
