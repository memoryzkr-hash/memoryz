/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  // orchestra/ 는 별도 패키지라 자체 테스트를 돈다
  test: { include: ['tests/**/*.test.ts'] },
});
