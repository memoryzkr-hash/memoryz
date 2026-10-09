// Turns the Vite build of beat.html (Echo Bounce) into single files with the script and styles inlined:
//   dist/beat-standalone.html  a whole page: double-click it, it plays from the file system
//   dist/beat-artifact.html    page content only, for a Claude artifact (which adds its own <html>/<head>)
// Run after `vite build`: npm run build:beat
import { readFileSync, writeFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const page = readFileSync(new URL('beat.html', dist), 'utf8');

const jsPath = /<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/.exec(page)?.[1];
const cssPath = /<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/.exec(page)?.[1];
if (!jsPath || !cssPath) throw new Error('dist/beat.html has no script or stylesheet: run `vite build` first');

const js = readFileSync(new URL(jsPath, dist), 'utf8')
  // The modulepreload polyfill is a separate chunk only needed for multi-file loading.
  .replace(/import\s*"\.\/modulepreload-polyfill-[^"]+\.js";?/, '')
  .replace(/<\/script/gi, '<\\/script');
if (/\bfrom\s*"\.\/|import\s*"\.\//.test(js)) throw new Error('the beat bundle imports another chunk; it cannot be inlined as is');
const css = readFileSync(new URL(cssPath, dist), 'utf8').replace(/<\/style/gi, '<\\/style');

const standalone = page
  .replace(/\s*<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/, '')
  .replace(/\s*<link rel="modulepreload"[^>]*>/g, '')
  .replace(/<link rel="stylesheet"[^>]*href="\.\/[^"]+"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace('</body>', () => `<script type="module">\n${js}\n</script>\n</body>`);
writeFileSync(new URL('beat-standalone.html', dist), standalone);

const title = /<title>.*?<\/title>/.exec(page)[0];
const fonts = [...page.matchAll(/<link [^>]*fonts\.(?:googleapis|gstatic)[^>]*>/g)].map((m) => m[0]).join('\n');
const body = page.slice(page.indexOf('<body>') + 6, page.indexOf('</body>')).replace(/\s*<script type="module"[^>]*><\/script>/, '');
const artifact = `${title}\n${fonts}\n<style>\n${css}\n</style>\n${body.trim()}\n<script type="module">\n${js}\n</script>\n`;
writeFileSync(new URL('beat-artifact.html', dist), artifact);

console.log(`dist/beat-standalone.html ${(standalone.length / 1024).toFixed(0)} KB`);
console.log(`dist/beat-artifact.html ${(artifact.length / 1024).toFixed(0)} KB`);
