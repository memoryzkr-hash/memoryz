/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        care: resolve(import.meta.dirname, 'care/index.html'),
      },
    },
  },
  // orchestra/ 는 별도 패키지라 자체 테스트를 돈다
  test: { include: ['tests/**/*.test.{ts,mjs}'] },
});
