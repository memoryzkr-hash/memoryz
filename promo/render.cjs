// 영상 HTML을 한 프레임씩 찍어서 MP4로 만든다.
//   node promo/render.cjs blinder            → promo/out/blinder.mp4 (60fps)
//   node promo/render.cjs blinder --shots 0,2,6.5  → 그 순간들의 PNG만 찍기(확인용)
// 필요한 것: playwright(크로미움), ffmpeg
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const ROOT = __dirname;
const name = process.argv[2];
const shotsArg = process.argv.indexOf("--shots");
const fpsArg = process.argv.indexOf("--fps");
const FPS = fpsArg > 0 ? Number(process.argv[fpsArg + 1]) : 60;
if (!name || !fs.existsSync(path.join(ROOT, name, "index.html"))) {
  console.error("사용법: node promo/render.cjs <blinder|juljul> [--shots 0,1.5] [--fps 60]");
  process.exit(1);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".otf": "font/otf", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/${name}/index.html?render`);
  await page.waitForFunction(() => typeof window.seek === "function");
  const duration = await page.evaluate(() => window.DURATION);
  const stage = await page.$("#stage");
  const outDir = path.join(ROOT, "out");
  fs.mkdirSync(outDir, { recursive: true });

  if (shotsArg > 0) {
    const times = process.argv[shotsArg + 1].split(",").map(Number);
    for (const t of times) {
      await page.evaluate((t) => window.seek(t), t);
      const file = path.join(outDir, `${name}_${t.toFixed(2)}s.png`);
      await stage.screenshot({ path: file });
      console.log(file);
    }
  } else {
    const out = path.join(outDir, `${name}.mp4`);
    const ff = spawn("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
      "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
      "-profile:v", "high", "-movflags", "+faststart", "-r", String(FPS),
      out,
    ], { stdio: ["pipe", "inherit", "inherit"] });
    const total = Math.round(duration * FPS);
    for (let i = 0; i < total; i++) {
      await page.evaluate((t) => window.seek(t), i / FPS);
      const buf = await stage.screenshot({ type: "png" });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      if (i % FPS === 0) process.stdout.write(`\r${name}: ${Math.round((i / total) * 100)}%`);
    }
    ff.stdin.end();
    const code = await new Promise((r) => ff.on("close", r));
    console.log(`\n${code === 0 ? "완료" : "ffmpeg 오류 " + code}: ${out}`);
  }

  await browser.close();
  server.close();
  if (errors.length) {
    console.error("페이지 오류:\n" + errors.join("\n"));
    process.exit(1);
  }
})();
