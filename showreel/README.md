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

## People

**Code-drawn: [`code-character.mp4`](code-character.mp4)** (6s). A 14-joint 2D rig (`person.js`). Legs use
2-bone IK against procedural foot paths, so the feet stay planted on the scrolling ground. The walk
ramps into a run (with onion skins), then she does a front flip with a squash-and-stretch landing and
waves. There are no keyframes: every pose is a function of time. Footsteps in the soundtrack
(`person-audio.cjs`) come from the rig's gait phase. To rebuild:

```bash
PAGE=person.html node render.cjs /tmp/pf 0 360 4 4 && node person-audio.cjs /tmp/pf/events.json /tmp/person.wav
ffmpeg -framerate 60 -i /tmp/pf/f%04d.png -i /tmp/person.wav -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -shortest code-character.mp4
```

**AI-generated: [`ai/ai-person.jpg`](ai/ai-person.jpg), [`ai/ai-person.mp4`](ai/ai-person.mp4)** (5s, no audio). A fictional
person, made with Higgsfield (Soul 2 for the still, Seedance 2.5 image-to-video at 1080p). She has the
same black bob and cream sweater as the code-drawn character.
