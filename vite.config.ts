import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ride: resolve(import.meta.dirname, 'ride.html'),
        arena: resolve(import.meta.dirname, 'arena.html'),
      },
    },
  },
});
