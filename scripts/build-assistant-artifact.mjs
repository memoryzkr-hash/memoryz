// Inlines the artifact build (vite.artifact.config.ts) into one HTML file for a Claude artifact.
// The artifact wraps the file in its own <!doctype><html><head><body>, so this writes only the
// page content: title, style, root element, script.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../dist-artifact/', import.meta.url);
const js = readFileSync(new URL('assistant.js', dir), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(new URL('assistant.css', dir), 'utf8').replace(/<\/style/gi, '<\\/style');

const html = `<title>개인 비서</title>
<style>
${css}
</style>
<div id="app"></div>
<script>
${js}
</script>
`;
writeFileSync(new URL('assistant-artifact.html', dir), html);
console.log(`dist-artifact/assistant-artifact.html ${(html.length / 1024).toFixed(0)} KB`);
