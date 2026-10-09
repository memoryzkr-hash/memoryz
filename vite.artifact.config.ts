import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Builds the personal assistant as one self-contained script for a Claude artifact
 * (the artifact page allows no script files from other hosts). `npm run build:artifact`
 * then inlines it into dist-artifact/assistant-artifact.html.
 */
export default defineConfig({
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/assistant/main.ts'),
      formats: ['iife'],
      name: 'PersonalAssistant',
      fileName: () => 'assistant.js',
      cssFileName: 'assistant',
    },
  },
});
