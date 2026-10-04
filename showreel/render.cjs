// Renders frames [start, end) with N parallel headless Chromium workers.
// usage: node render.cjs <outDir> [start=0] [end=900] [workers=4] [subframes=4] [step=1]
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const [outDir, start = 0, end = 900, workers = 4, S = 4, step = 1] = process.argv.slice(2).map((v, i) => (i ? +v : v));
const root = __dirname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  }).listen(0);
  const url = `http://127.0.0.1:${server.address().port}/${process.env.PAGE || 'index.html'}`;
  const frames = []; for (let f = start; f < end; f += step) frames.push(f);
  let next = 0, done = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    page.on('pageerror', e => { console.error('PAGE ERROR', e); process.exit(1); });
    await page.goto(url); await page.evaluate(() => { document.body.classList.add('capture'); return window.READY; });
    const ev = await page.evaluate(() => window.EVENTS ? window.EVENTS() : null);
    if (ev) fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify(ev));
    while (next < frames.length) {
      const f = frames[next++];
      const b64 = await page.evaluate(([f, S]) => { window.renderFrame(f, S); return document.getElementById('c').toDataURL('image/png').slice(22); }, [f, S]);
      fs.writeFileSync(path.join(outDir, `f${String(f).padStart(4, '0')}.png`), Buffer.from(b64, 'base64'));
      if (++done % 60 === 0) console.log(`${done}/${frames.length} frames  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    await browser.close();
  }));
  server.close(); console.log(`done: ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})();
