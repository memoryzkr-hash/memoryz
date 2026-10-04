# Motion Reel 2026

A 15-second, 1080×1920 / 60fps motion-graphics showreel, made entirely in code: no footage, samples or After Effects.

**Watch:** [`showreel.mp4`](showreel.mp4) · **Live preview:** serve this folder and open `index.html`

| Time | Section | Technique |
|---|---|---|
| 0.0 | Intro | dot → squash → stretch → split → tri-panel wipe → SHOW/REEL mask reveal + echo outlines |
| 1.5 | Kinetic type | staggered fly-ins, colour-cycling scale slam, slice exit, squash-and-stretch drops |
| 3.0 | Zoom-through | match cut through the O of M◯VE into the next scene |
| 3.25 | Shape | index-matched polygon morphs (circle → square → triangle → star → flower) with echo trails |
| 4.5 | Particles | 2,000 particles shatter, swirl and resolve into FLOW along arced paths |
| 6.2 | Dimension | the same particles become a sphere → torus → cube in 3D, then fall into a grid |
| 7.9 | Rhythm | Bauhaus tile grid with diagonal and radial flip waves that spell MOTION DESIGN |
| 9.55 | Fluid | tiles melt into metaballs (blur → alpha threshold), then a liquid flood |
| 10.75 | Timing | graph editor: bezier handles, value track, spacing chart |
| 11.75 | Recap | six cuts on 1/16 notes |
| 12.5 | Contact | box-reveal name card, then everything collapses into the opening dot, so it loops seamlessly |

Every frame is a pure function of time (`reel.js`), so frames render in parallel and get real
sub-frame motion blur (4 samples, or 20 during the zoom-through). The 120 BPM soundtrack is
synthesized sample by sample in `audio.cjs` (kick, clap, hats, sidechained bass and pads,
whooshes, risers, Freeverb-style reverb), with cues timed to the picture.

```bash
./build.sh   # needs node, playwright (chromium), ffmpeg. About 1 minute on 4 cores
```

Fonts: Anton, Inter Tight, Instrument Serif, JetBrains Mono (SIL OFL, via Google Fonts).
