// Renders korea.html frame-by-frame into an MP4.
// Usage: node scripts/render-korea.mjs [out.mp4] [--fps 30] [--from 0] [--to 42] [--stills]
// Needs: a running `npx vite --port 5179` (or KOREA_URL), Playwright, ffmpeg.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(`${process.env.NODE_PATH_PLAYWRIGHT ?? '/opt/node22/lib/node_modules'}/playwright`);
}

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const out = args.find((a) => a.endsWith('.mp4') || a.endsWith('/')) ?? 'docs/korea/korea-2026.mp4';
const fps = opt('fps', 30);
const stills = args.includes('--stills');
const url = process.env.KOREA_URL ?? 'http://localhost:5179/korea.html?capture';
const W = 1920;
const H = 1080;

const browser = await playwright.chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
page.on('pageerror', (e) => console.error('[page]', e));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ready !== undefined);
await page.evaluate(() => window.__ready);
const duration = await page.evaluate(() => window.__duration);
const from = opt('from', 0);
const to = opt('to', duration);

if (stills) {
  // Quick look: one PNG per listed time.
  mkdirSync(out, { recursive: true });
  const times = args.filter((a) => /^\d+(\.\d+)?$/.test(a) && !['fps', 'from', 'to'].some((n) => args[args.indexOf(a) - 1] === `--${n}`));
  for (const t of times.map(Number)) {
    await page.evaluate((tt) => window.__renderFrame(tt), t);
    await page.screenshot({ path: `${out}/t${String(t).padStart(5, '0')}.png` });
  }
  await browser.close();
  process.exit(0);
}

mkdirSync(dirname(out), { recursive: true });
const ff = spawn(
  'ffmpeg',
  ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
  { stdio: ['pipe', 'inherit', 'inherit'] },
);

const frames = Math.round((to - from) * fps);
const started = Date.now();
for (let f = 0; f < frames; f++) {
  await page.evaluate((tt) => window.__renderFrame(tt), from + f / fps);
  const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 60 === 0) {
    const el = (Date.now() - started) / 1000;
    console.log(`frame ${f}/${frames}  ${el.toFixed(0)}s elapsed`);
  }
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log(`wrote ${out}`);
