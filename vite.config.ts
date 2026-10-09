import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

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
  // Exported copies (npm run export:travel) carry their own tests; don't run them twice.
  test: { exclude: [...configDefaults.exclude, 'dist-handoff/**', 'dist-artifact/**'] },
});
