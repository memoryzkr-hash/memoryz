# Tally launch video

A 35-second launch motion graphic (1920×1080, 30fps) with a synthesised, frame-synced soundtrack,
written in code with [Remotion](https://www.remotion.dev/). See [PLAN.md](PLAN.md) for the storyboard.

```bash
npm install
npm run dev                                   # Remotion Studio preview (generates audio first)
npx remotion still Video out/f.png --frame=45 # a single frame
npm run render                                # out/video.mp4    1080p, h264 CRF 12, AAC 320k
npm run render:4k                             # out/video-4k.mp4 3840×2160
npm run sound                                 # regenerate public/audio/{music,sfx}.wav only
```

- **Sound:** `scripts/soundtrack.ts` synthesises a music bed and sound effects, placed on the event
  frames in `src/cues.ts` (the same constants the scenes animate from). Drop a `public/music.mp3` in to
  replace the generated music; the effects stay.
- **Browser:** if Remotion can't download its own Chrome Headless Shell (offline/sandboxed machines), point
  it at a local one: `REMOTION_BROWSER_EXECUTABLE=/path/to/chrome-headless-shell npm run render`.
