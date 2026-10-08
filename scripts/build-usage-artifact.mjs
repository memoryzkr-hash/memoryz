// Bundles the usage page (src/usage) into one self-contained HTML file for publishing as a claude.ai artifact.
// Usage: node scripts/build-usage-artifact.mjs [out.html]   (default: dist-artifact/usage.html)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const out = resolve(process.argv[2] ?? resolve(root, 'dist-artifact/usage.html'));

const result = await build({
  root,
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    minify: true,
    lib: { entry: resolve(root, 'src/usage/main.ts'), formats: ['iife'], name: 'ClaudeUsage', fileName: () => 'usage.js' },
  },
});
const files = (Array.isArray(result) ? result[0] : result).output;
const js = files.find((f) => f.type === 'chunk').code;
const css = files.filter((f) => f.fileName.endsWith('.css')).map((f) => String(f.source)).join('\n');

// The artifact host wraps this in its own <html>/<head>/<body>; title and style go first.
const html = `<title>클로드 사용량</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">
<style>${css}</style>
<div id="app"></div>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
