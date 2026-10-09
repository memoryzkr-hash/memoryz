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
        assistant: resolve(import.meta.dirname, 'assistant.html'),
        travel: resolve(import.meta.dirname, 'travel.html'),
        usage: resolve(import.meta.dirname, 'usage.html'),
        beat: resolve(import.meta.dirname, 'beat.html'),
        promo: resolve(import.meta.dirname, 'promo.html'),
      },
    },
  },
});
