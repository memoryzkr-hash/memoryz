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
        survive: resolve(import.meta.dirname, 'survive.html'),
      },
    },
  },
});
