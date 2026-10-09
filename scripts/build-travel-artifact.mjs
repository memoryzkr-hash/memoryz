/**
 * Builds travel.html as ONE self-contained file (JS, CSS and Leaflet's images inlined) for
 * publishing as a claude.ai artifact: `npm run build:travel-artifact` → dist-artifact/travel.html.
 * The artifact host wraps the file in its own <html>/<head>, so this writes body content only.
 */
import { readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const tmp = join(root, 'dist-artifact', '.build');
rmSync(join(root, 'dist-artifact'), { recursive: true, force: true });

await build({
  root,
  base: './',
  logLevel: 'warn',
  build: {
    outDir: tmp,
    emptyOutDir: true,
    assetsInlineLimit: 1e9,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: join(root, 'travel.html'), output: { codeSplitting: false } },
  },
});

const assets = join(tmp, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8'));
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8'));
if (js.length !== 1) throw new Error(`expected one script, got ${js.length}`);

const page = `<title>여행 플래너</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;600;700&display=swap">
<style>${css.join('\n')}</style>
<div id="app"></div>
<script type="module">${js[0].replace(/<\/script/gi, '<\\/script')}</script>
`;
mkdirSync(join(root, 'dist-artifact'), { recursive: true });
writeFileSync(join(root, 'dist-artifact', 'travel.html'), page);
rmSync(tmp, { recursive: true, force: true });
console.log(`dist-artifact/travel.html ${(page.length / 1024).toFixed(0)} KB`);
