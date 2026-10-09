// Bundles the usage page (src/usage) into one self-contained HTML file.
//   node scripts/build-usage-artifact.mjs [out.html]        claude.ai artifact (default: dist-artifact/usage.html)
//   node scripts/build-usage-artifact.mjs --local <dir>     Mac folder: index.html + claude-usage + install.sh + README.md
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const localDir = args[0] === '--local' ? resolve(args[1] ?? resolve(root, 'local/claude-usage')) : null;

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
const js = files.find((f) => f.type === 'chunk').code.replace(/<\/script/gi, '<\\/script');
const css = files.filter((f) => f.fileName.endsWith('.css')).map((f) => String(f.source)).join('\n');
const body = `<style>${css}</style>\n<div id="app"></div>\n<script>${js}</script>\n`;

if (localDir) {
  // A complete document, opened straight from the folder (file://).
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f2f4f6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101013" media="(prefers-color-scheme: dark)">
<title>클로드 사용량</title>
</head>
<body>
${body}</body>
</html>
`;
  mkdirSync(localDir, { recursive: true });
  writeFileSync(resolve(localDir, 'index.html'), html);
  for (const f of ['claude-usage', 'install.sh', 'README.md']) copyFileSync(resolve(root, 'tools/claude-usage', f), resolve(localDir, f));
  chmodSync(resolve(localDir, 'claude-usage'), 0o755);
  chmodSync(resolve(localDir, 'install.sh'), 0o755);
  console.log(`wrote ${localDir}/ (index.html ${(html.length / 1024).toFixed(1)} KB, claude-usage, install.sh, README.md)`);
} else {
  // The artifact host wraps this in its own <html>/<head>/<body>; title and style go first.
  const out = resolve(args[0] ?? resolve(root, 'dist-artifact/usage.html'));
  const html = `<title>클로드 사용량</title>\n${body}`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
}
