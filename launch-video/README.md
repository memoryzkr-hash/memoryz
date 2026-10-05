# Tally launch video

A 35-second launch motion graphic (1920×1080, 30fps), written in code with [Remotion](https://www.remotion.dev/).
See [PLAN.md](PLAN.md) for the storyboard and the phase checklist.

```bash
npm install
npm run dev                                   # Remotion Studio preview
npx remotion still Video out/f.jpg --frame=45 # a single frame
npm run render                                # out/video.mp4 (h264, crf 18)
```

If Remotion can't download its own Chrome Headless Shell (offline/sandboxed machines),
point it at a local one: `REMOTION_BROWSER_EXECUTABLE=/path/to/chrome-headless-shell npm run render`.
