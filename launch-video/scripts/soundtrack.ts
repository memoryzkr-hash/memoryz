/**
 * Generates the film's soundtrack from code, frame-synced to src/cues.ts:
 *   public/audio/music.wav  – music bed (tense A-minor pulse → bright D-major groove), 120 BPM so every cut is on a beat
 *   public/audio/sfx.wav    – sound design (clock, whooshes, typing, rolling numbers, chimes…)
 * Deterministic: same code → same file. Run with `npm run sound`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Easing, interpolate } from 'remotion';
import { buildParticles } from '../src/components/Particles';
import { VIDEO } from '../src/config';
import {
  CLOCK, COUNT, EVERYWHERE, FLASH, GATHER, HERE_THERE, KEPT, MORNING, OUTRO, SEARCH, SLOGAN, SUBS, TABS_CUES,
  sceneStart, typingSchedule,
} from '../src/cues';
import { TOTAL_FRAMES } from '../src/timeline';

const SR = 48000;
const LEN = Math.round((TOTAL_FRAMES / VIDEO.fps) * SR);
const BEAT = 0.5; // 120 BPM
const at = (scene: Parameters<typeof sceneStart>[0], frame: number) => (sceneStart(scene) + frame) / VIDEO.fps;
const midi = (m: number) => 440 * 2 ** ((m - 69) / 12);

// ---------------------------------------------------------------- primitives

const mulberry = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rand = mulberry(20261014);
const noise = () => rand() * 2 - 1;

class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(private type: 'lp' | 'hp' | 'bp', freq: number, q = 0.707) { this.set(freq, q); }
  set(freq: number, q = 0.707) {
    const w = (2 * Math.PI * Math.min(freq, SR * 0.45)) / SR;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    let b0: number, b1: number, b2: number;
    if (this.type === 'lp') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    else if (this.type === 'hp') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha];
    const a0 = 1 + alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
  }
  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

const polyblep = (t: number, dt: number) => {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
};
class Saw {
  private phase = rand();
  constructor(private freq: number) {}
  next() {
    const dt = this.freq / SR;
    this.phase += dt;
    if (this.phase >= 1) this.phase -= 1;
    return 2 * this.phase - 1 - polyblep(this.phase, dt);
  }
}

/** Render a mono voice of `dur` seconds. */
const voice = (dur: number, fn: (t: number, i: number) => number) => {
  const out = new Float32Array(Math.round(dur * SR));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / SR, i);
  return out;
};
const env = (t: number, attack: number, decay: number) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

// ---------------------------------------------------------------- buses

type Bus = { L: Float32Array; R: Float32Array; send: Float32Array };
const makeBus = (): Bus => ({ L: new Float32Array(LEN), R: new Float32Array(LEN), send: new Float32Array(LEN) });
const music = makeBus();
const sfx = makeBus();

/** Mix a mono voice into a bus at `time` seconds; pan -1…1; `send` = reverb amount. */
const place = (bus: Bus, time: number, v: Float32Array, gain = 1, pan = 0, send = 0) => {
  const i0 = Math.round(time * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < v.length; i++) {
    const j = i0 + i;
    if (j < 0 || j >= LEN) continue;
    bus.L[j] += v[i] * gl;
    bus.R[j] += v[i] * gr;
    bus.send[j] += v[i] * gain * send;
  }
};
/** Stereo placement (separate L/R voices) for wide pads. */
const placeStereo = (bus: Bus, time: number, l: Float32Array, r: Float32Array, gain = 1, send = 0) => {
  const i0 = Math.round(time * SR);
  for (let i = 0; i < l.length; i++) {
    const j = i0 + i;
    if (j < 0 || j >= LEN) continue;
    bus.L[j] += l[i] * gain;
    bus.R[j] += r[i] * gain;
    bus.send[j] += (l[i] + r[i]) * 0.5 * gain * send;
  }
};

/** Freeverb-style stereo reverb on a bus's send, added back at `wet`. */
const reverb = (bus: Bus, wet: number, room = 0.84, damp = 0.3) => {
  const scale = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const alls = [556, 441, 341, 225];
  for (const [side, spread] of [[bus.L, 0], [bus.R, 23]] as const) {
    const cb = combs.map((n) => ({ buf: new Float32Array(Math.round((n + spread) * scale)), i: 0, store: 0 }));
    const ab = alls.map((n) => ({ buf: new Float32Array(Math.round((n + spread) * scale)), i: 0 }));
    for (let j = 0; j < LEN; j++) {
      const x = bus.send[j] * 0.015;
      let y = 0;
      for (const c of cb) {
        const out = c.buf[c.i];
        c.store = out * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * room;
        c.i = (c.i + 1) % c.buf.length;
        y += out;
      }
      for (const a of ab) {
        const b = a.buf[a.i];
        a.buf[a.i] = y + b * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        y = b - y;
      }
      side[j] += y * wet;
    }
  }
};

// ---------------------------------------------------------------- instruments

const kick = (punch = 1) =>
  voice(0.45, (t) => {
    const f = 46 + 120 * Math.exp(-t * 30);
    return Math.sin(2 * Math.PI * (46 * t + (120 / 30) * (1 - Math.exp(-t * 30)))) * Math.exp(-t * 7) * 0.9 +
      (t < 0.004 ? noise() * 0.3 * punch : 0) + Math.sin(2 * Math.PI * f * t) * 0;
  });

const clap = () => {
  const bp = new Biquad('bp', 1400, 1.2);
  return voice(0.3, (t) => {
    const bursts = [0, 0.011, 0.022].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) / (o === 0.022 ? 0.07 : 0.006)) : 0), 0);
    return bp.run(noise() * bursts) * 1.6;
  });
};

const hat = (decay = 0.035) => {
  const hp = new Biquad('hp', 7500, 0.8);
  return voice(decay * 6, (t) => hp.run(noise()) * Math.exp(-t / decay) * 0.5);
};

const tick = (freq = 2600, body = 1) => {
  const hp = new Biquad('hp', 2500);
  return voice(0.08, (t) => hp.run(noise()) * Math.exp(-t / 0.004) * 0.7 + Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / 0.012) * 0.35 * body);
};

const blip = (freq: number, decay = 0.12, bright = 0.25) =>
  voice(decay * 6, (t) => {
    const e = env(t, 0.002, decay);
    return (Math.sin(2 * Math.PI * freq * t) + bright * Math.sin(4 * Math.PI * freq * t) * Math.exp(-t * 30)) * e * 0.6;
  });

const bell = (freq: number, decay = 0.9) =>
  voice(decay * 5, (t) => {
    const partials: [number, number, number][] = [[1, 1, 1], [2.76, 0.35, 0.45], [5.4, 0.18, 0.25], [8.93, 0.08, 0.15]];
    return partials.reduce((s, [ratio, amp, d]) => s + Math.sin(2 * Math.PI * freq * ratio * t) * amp * env(t, 0.002, decay * d), 0) * 0.45;
  });

/** Band-passed noise whose centre sweeps from f0 to f1: whooshes, swishes, risers. */
const whoosh = (dur: number, f0: number, f1: number, shape: 'swell' | 'rise' | 'fall' = 'swell', q = 1.4) => {
  const bp = new Biquad('bp', f0, q);
  return voice(dur, (t, i) => {
    const p = t / dur;
    if (i % 32 === 0) bp.set(f0 * (f1 / f0) ** p, q);
    const a = shape === 'rise' ? p ** 2.2 : shape === 'fall' ? (1 - p) ** 2 : Math.sin(Math.PI * p) ** 1.5;
    return bp.run(noise()) * a * 1.4;
  });
};

const thud = (freq = 80) =>
  voice(0.25, (t) => Math.sin(2 * Math.PI * (freq * t + 30 * (1 - Math.exp(-t * 40)) / 40)) * Math.exp(-t / 0.06) * 0.8);

const impact = () => {
  const lp = new Biquad('lp', 9000);
  return voice(3, (t, i) => {
    if (i % 64 === 0) lp.set(300 + 9000 * Math.exp(-t * 3));
    const boom = Math.sin(2 * Math.PI * (32 * t + (110 / 4) * (1 - Math.exp(-t * 4)))) * Math.exp(-t / 0.9);
    return boom * 0.95 + lp.run(noise()) * Math.exp(-t / 0.5) * 0.45;
  });
};

/** Karplus–Strong plucked string. */
const pluck = (freq: number, dur = 1.2, bright = 0.6) => {
  const n = Math.max(2, Math.round(SR / freq));
  const buf = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) { prev = prev * (1 - bright) + noise() * bright; buf[i] = prev; }
  let idx = 0;
  return voice(dur, (t) => {
    const y = buf[idx];
    const next = buf[(idx + 1) % n];
    buf[idx] = (y + next) * 0.5 * 0.996;
    idx = (idx + 1) % n;
    return y * 0.9 * Math.min(1, (dur - t) / 0.05);
  });
};

/** Detuned-saw pad, one stereo voice per chord. */
const pad = (notes: number[], dur: number, attack: number, release: number, cutoff: number) => {
  const make = (detune: number) => {
    const oscs = notes.flatMap((m) => [new Saw(midi(m) * (1 + detune)), new Saw(midi(m) * (1 - detune * 0.7))]);
    const lp = new Biquad('lp', cutoff, 0.6);
    return voice(dur, (t, i) => {
      if (i % 64 === 0) lp.set(cutoff * (1 + 0.12 * Math.sin(t * 1.3)));
      const a = Math.min(1, t / attack) * Math.min(1, (dur - t) / release);
      let s = 0;
      for (const o of oscs) s += o.next();
      return lp.run(s / oscs.length) * a;
    });
  };
  return [make(0.004), make(0.0055)] as const;
};

const bass = (m: number, dur: number, cutoff = 400) => {
  const saw = new Saw(midi(m));
  const lp = new Biquad('lp', cutoff, 0.9);
  return voice(dur, (t) => {
    const a = env(t, 0.004, dur * 0.6) * Math.min(1, (dur - t) / 0.02);
    return (lp.run(saw.next()) * 0.7 + Math.sin(2 * Math.PI * midi(m) * t) * 0.5) * a;
  });
};

// ---------------------------------------------------------------- music: dark half (0–13s), A minor

const DARK_END = at('S06_Flash', 0); // 13.0s

// Low drone that thickens toward the flash.
{
  const drone = voice(DARK_END, (t) => {
    const swell = 0.25 + 0.75 * (t / DARK_END) ** 1.5;
    return (Math.sin(2 * Math.PI * midi(33) * t) * 0.6 + Math.sin(2 * Math.PI * midi(40) * t) * 0.25) * swell * Math.min(1, t / 1.5) * Math.min(1, (DARK_END - t) / 0.05);
  });
  place(music, 0, drone, 0.5);
  const [l, r] = pad([57, 64, 70], DARK_END, 2.5, 0.05, 900); // A3 E4 Bb4: uneasy
  placeStereo(music, 0, l, r, 0.16, 0.6);
}
// Pulse: kick on every beat from 3s; bass 8ths; hats from 8s; claps + 16th hats in the vortex.
for (let t = 3; t < DARK_END - 0.01; t += BEAT) {
  const intensity = interpolate(t, [3, 8, 13], [0.45, 0.7, 1]);
  const typing = t >= 5.5 && t < 8 ? 0.6 : 1;
  place(music, t, kick(), 0.8 * intensity * typing);
}
for (let t = 3; t < DARK_END - 0.01; t += BEAT / 2) {
  const cutoff = interpolate(t, [3, 13], [250, 1400]);
  const typing = t >= 5.5 && t < 8 ? 0.55 : 1;
  place(music, t, bass(33, 0.22, cutoff), 0.33 * typing);
}
for (let t = 8; t < DARK_END - 0.01; t += BEAT / 2) place(music, t + BEAT / 4, hat(), 0.35, 0.3);
for (let t = 10.5; t < DARK_END - 0.01; t += BEAT / 4) place(music, t, hat(0.02), 0.18, -0.3);
for (let t = 10.5 + BEAT; t < DARK_END - 0.01; t += BEAT * 2) place(music, t, clap(), 0.45, 0, 0.5);

// ---------------------------------------------------------------- music: light half (13–35s), D major

type Chord = { root: number; tones: number[] };
const D: Chord = { root: 38, tones: [62, 66, 69, 74, 76] };
const Bm: Chord = { root: 35, tones: [59, 62, 66, 71, 74] };
const G: Chord = { root: 43, tones: [55, 62, 66, 67, 71] };
const A: Chord = { root: 45, tones: [57, 62, 64, 69, 73] };
const BAR = BEAT * 4;
const PROGRESSION = [D, Bm, G, A, D, Bm, G, A, D, G, D];
const LIGHT_END = TOTAL_FRAMES / VIDEO.fps;
const DROP = at('S12_Slogan', 0); // 29s: drums breathe out under "Fewer tabs."
const FINAL = at('S13_Outro', 0);

PROGRESSION.forEach((chord, bar) => {
  const t0 = DARK_END + bar * BAR;
  const last = bar === PROGRESSION.length - 1;
  const dur = last ? LIGHT_END - t0 : BAR + 0.15;
  const [l, r] = pad(chord.tones, dur, bar === 0 ? 0.9 : 0.25, last ? 1.8 : 0.2, 1800);
  placeStereo(music, t0, l, r, 0.36, 0.7);
  // Arpeggio from scene 7 on.
  if (t0 >= at('S07_Particles', 0) - 0.01 || bar === 0) {
    const pattern = [0, 2, 1, 3, 2, 4, 3, 1];
    pattern.forEach((k, step) => {
      const t = t0 + step * (BEAT / 2);
      if (bar === 0 && t < at('S07_Particles', 0) - 0.01) return;
      if (t >= FINAL + 1) return;
      place(music, t, pluck(midi(chord.tones[k] + 12), 0.9, 0.55), 0.38, step % 2 ? 0.35 : -0.35, 0.5);
    });
  }
  // Bass on beats 1 and 3 (and the "and" of 4) once the numbers start.
  if (t0 >= at('S08_CountUp', 0) - 0.01 && t0 < FINAL) {
    for (const off of [0, 2 * BEAT, 3.5 * BEAT]) place(music, t0 + off, bass(chord.root, off === 3.5 * BEAT ? 0.24 : 0.9, 700), 0.26);
  }
  if (last) place(music, t0, bass(chord.root, dur, 500), 0.32);
});
// Drums: soft groove from 17s until the slogan.
for (let t = at('S08_CountUp', 0); t < DROP - 0.01; t += BEAT) {
  place(music, t, kick(0.5), 0.45);
  place(music, t + BEAT / 2, hat(0.05), 0.22, 0.25);
  if (Math.round((t - DARK_END) / BEAT) % 2 === 1) place(music, t, clap(), 0.26, 0, 0.6);
}
// Fill into the slogan, then a single hit when the outro logo lands.
place(music, DROP - BEAT, whoosh(BEAT, 800, 6000, 'rise'), 0.25);
place(music, FINAL, kick(0.4), 0.55);

// ---------------------------------------------------------------- sfx

// S01: clock ticks on every beat; the minute flips with a heavier click.
for (let f = 0; f < 90; f += 15) place(sfx, at('S01_Clock', f), tick(f % 30 ? 1900 : 2600), 0.55, 0.1);
place(sfx, at('S01_Clock', CLOCK.minuteTick), tick(1300, 2), 0.9);
place(sfx, at('S01_Clock', CLOCK.minuteTick), thud(110), 0.35);

// S02: each tab whooshes in and lands; the counter bumps climb in pitch.
TABS_CUES.delays.forEach((d, i) => {
  const pan = Math.max(-0.8, Math.min(0.8, Math.cos(i * 2.3)));
  place(sfx, at('S02_Tabs', d) - 0.08, whoosh(0.24, 500, 2600), i < 10 ? 0.22 : 0.32, pan);
  place(sfx, at('S02_Tabs', d + TABS_CUES.landLag), thud(140 + (i % 4) * 15), 0.25, pan);
});
place(sfx, at('S02_Tabs', TABS_CUES.counterAt), thud(70), 0.6);
place(sfx, at('S02_Tabs', TABS_CUES.counterAt), blip(midi(81), 0.12), 0.35, 0, 0.3);
TABS_CUES.delays.slice(10).forEach((d, i) => {
  place(sfx, at('S02_Tabs', d + TABS_CUES.bumpLag), blip(midi([84, 86, 88, 89][i]), 0.1), 0.42, 0, 0.3);
});

// S03: keystrokes.
{
  place(sfx, at('S03_Search', 0), whoosh(0.3, 300, 1200), 0.15);
  const { times } = typingSchedule(SEARCH.text, SEARCH.start, SEARCH.seed);
  times.forEach((f, i) => {
    const space = SEARCH.text[i] === ' ';
    place(sfx, at('S03_Search', f), tick(space ? 900 : 1500 + rand() * 900, space ? 1.2 : 0.6), space ? 1 : 0.85, (rand() - 0.5) * 0.3);
  });
}

// S04: card slides, the whip pan, card slides back.
place(sfx, at('S04_HereThere', HERE_THERE.cardA) - 0.05, whoosh(0.35, 400, 2000), 0.35, -0.6);
place(sfx, at('S04_HereThere', HERE_THERE.textA), thud(100), 0.3, 0.4);
place(sfx, at('S04_HereThere', HERE_THERE.pan[0]) - 0.05, whoosh(0.4, 200, 5000, 'swell', 0.9), 0.6, 0);
place(sfx, at('S04_HereThere', HERE_THERE.cardB), whoosh(0.3, 600, 2200), 0.3, 0.6);
place(sfx, at('S04_HereThere', HERE_THERE.textB), thud(100), 0.3, -0.4);

// S05: the vortex winds up into the white flash.
{
  const start = at('S05_Everywhere', 0);
  place(sfx, start, whoosh(DARK_END - start, 200, 7000, 'rise', 0.8), 0.5, 0, 0.4);
  place(sfx, at('S05_Everywhere', EVERYWHERE.word), thud(60), 0.5);
  const riser = voice(DARK_END - start, (t) => {
    const p = t / (DARK_END - start);
    return Math.sin(2 * Math.PI * (180 * t + 900 * p * p * t)) * p ** 2 * 0.25;
  });
  place(sfx, start, riser, 0.35, 0, 0.3);
}

// S06: impact on the cut to white; the logo strokes tick in; a shimmer for the wordmark.
place(sfx, DARK_END, impact(), 0.9, 0, 0.5);
for (let i = 0; i < 5; i++) place(sfx, at('S06_Flash', FLASH.logoDelay + i * FLASH.stagger), whoosh(0.12, 2500, 6000, 'fall'), 0.2, -0.3 + i * 0.15);
[86, 90, 93].forEach((m, i) => place(sfx, at('S06_Flash', FLASH.logoDelay + 5 * FLASH.stagger) + i * 0.06, bell(midi(m), 1.2), 0.22, -0.3 + i * 0.3, 0.8));

// S07: labels pop, particles sparkle as they land.
for (let i = 0; i < 8; i++) place(sfx, at('S07_Particles', i * GATHER.labelStagger), blip(midi([74, 78, 81, 86, 74, 78, 81, 86][i]), 0.08), 0.18, Math.cos(i) * 0.6);
{
  const particles = buildParticles({ ...GATHER, sources: [{ x: 0, y: 0, color: '' }], target: { x: 0, y: 0 } });
  const scale = [86, 88, 90, 93, 95, 98];
  particles.filter((_, i) => i % 3 === 0).forEach((p, i) => {
    place(sfx, at('S07_Particles', p.arrive), bell(midi(scale[i % scale.length]), 0.25), 0.06, (rand() - 0.5) * 0.8, 0.6);
  });
  place(sfx, at('S07_Particles', GATHER.start), whoosh(2, 300, 1500, 'swell', 0.7), 0.2, 0, 0.4);
}

// S08: a tick each time the total rolls over a dollar.
{
  let last = COUNT.from;
  for (let f = COUNT.start; f <= COUNT.start + COUNT.duration; f++) {
    const v = Math.floor(interpolate(f, [COUNT.start, COUNT.start + COUNT.duration], [COUNT.from, COUNT.to], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }));
    if (v !== last) place(sfx, at('S08_CountUp', f), tick(3000, 1.5), 0.6);
    last = v;
  }
  place(sfx, at('S08_CountUp', COUNT.number), whoosh(0.3, 300, 1500), 0.2);
}

// S09: deductions plink downward, digits rattle as they roll, a warm chime for "actually kept".
KEPT.deductions.forEach(({ at: f }, i) => place(sfx, at('S09_Kept', f), blip(midi([79, 76, 72][i]), 0.15, 0.6), 0.4, 0.3, 0.3));
for (const start of [KEPT.firstMorph, KEPT.secondMorph]) {
  for (let k = 0; k < 9; k++) place(sfx, at('S09_Kept', start) + k * 0.045 * (1 + k * 0.12), tick(2200 - k * 80, 0.8), 0.32 * (1 - k / 12), (rand() - 0.5) * 0.4);
}
place(sfx, at('S09_Kept', KEPT.secondMorph + KEPT.centsLag), blip(midi(93), 0.08), 0.25);
[81, 86].forEach((m, i) => place(sfx, at('S09_Kept', KEPT.labelSwap) + i * 0.09, bell(midi(m), 1), 0.28, 0, 0.7));

// S10: number flies up, card arrives, bars knock in.
place(sfx, at('S10_Subs', SUBS.exit[0]), whoosh(0.3, 800, 5000), 0.35);
place(sfx, at('S10_Subs', SUBS.card), whoosh(0.35, 300, 1200), 0.25);
place(sfx, at('S10_Subs', SUBS.card + 8), thud(90), 0.3);
for (let i = 0; i < 3; i++) place(sfx, at('S10_Subs', SUBS.barStart + i * SUBS.barStagger), pluck(midi([69, 74, 66][i]), 0.6, 0.8), 0.45, -0.4 + i * 0.4, 0.3);

// S11: phone rises; notification chime; text lands.
place(sfx, at('S11_Morning', MORNING.phone), whoosh(0.5, 200, 1200), 0.3, 0, 0.3);
place(sfx, at('S11_Morning', MORNING.left), thud(100), 0.2, -0.5);
place(sfx, at('S11_Morning', MORNING.notification), bell(midi(86), 0.8), 0.4, 0, 0.5);
place(sfx, at('S11_Morning', MORNING.notification) + 0.13, bell(midi(93), 1), 0.4, 0, 0.5);
place(sfx, at('S11_Morning', MORNING.right), thud(100), 0.2, 0.5);

// S12: letters tap in; each tab card flicks as it folds down.
for (let i = 0; i < 5; i++) place(sfx, at('S12_Slogan', SLOGAN.fewerStart + i * SLOGAN.fewerStagger), tick(1200, 0.5), 0.2, -0.5 + i * 0.1);
for (let i = 0; i < 5; i++) {
  const t = at('S12_Slogan', SLOGAN.tabsStart + i * SLOGAN.tabsStagger);
  place(sfx, t, whoosh(0.09, 1500, 5000, 'fall', 0.9), 0.4, 0.1 + i * 0.1);
  place(sfx, t + 0.1, tick(1800, 1), 0.3, 0.1 + i * 0.1);
}

// S13: pen strokes for the logo, a final shimmer.
for (let i = 0; i < 5; i++) place(sfx, at('S13_Outro', OUTRO.logoDelay + i * OUTRO.stagger), whoosh(0.18, 1500, 5000, 'fall'), 0.22, -0.3 + i * 0.15);
[74, 81, 86, 90].forEach((m, i) => place(sfx, at('S13_Outro', OUTRO.logoDelay + 5 * OUTRO.stagger) + i * 0.08, bell(midi(m), 1.6), 0.18, -0.3 + i * 0.2, 0.9));

// ---------------------------------------------------------------- mix & write

// Effects sit ~3.5 dB forward of the music.
for (const a of [sfx.L, sfx.R, sfx.send]) for (let j = 0; j < LEN; j++) a[j] *= 1.5;
reverb(music, 1.1);
reverb(sfx, 0.8);

// Shared bus limiter: gain is derived from the summed mix and applied to both stems, so their balance holds
// whether the generated music is used or replaced by public/music.mp3.
{
  let rms = 0;
  for (let j = 0; j < LEN; j++) rms += (music.L[j] + sfx.L[j]) ** 2 + (music.R[j] + sfx.R[j]) ** 2;
  rms = Math.sqrt(rms / (2 * LEN));
  const makeup = 10 ** (-15 / 20) / rms; // aim for ≈ -15 dBFS RMS before limiting
  const ceiling = 0.89;
  const release = Math.exp(-1 / (0.12 * SR));
  const look = Math.round(0.004 * SR);
  const peak = new Float32Array(LEN);
  for (let j = 0; j < LEN; j++) peak[j] = Math.max(Math.abs(music.L[j] + sfx.L[j]), Math.abs(music.R[j] + sfx.R[j])) * makeup;
  let g = 1;
  for (let j = 0; j < LEN; j++) {
    let p = 0;
    for (let k = j; k < Math.min(LEN, j + look); k += 8) p = Math.max(p, peak[k]);
    const target = p > ceiling ? ceiling / p : 1;
    g = target < g ? target : g * release + target * (1 - release);
    const gain = g * makeup;
    music.L[j] *= gain; music.R[j] *= gain; sfx.L[j] *= gain; sfx.R[j] *= gain;
  }
}

const writeWav = (path: string, bus: Bus) => {
  const data = Buffer.alloc(LEN * 4);
  for (let j = 0; j < LEN; j++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bus.L[j])) * 32767), j * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bus.R[j])) * 32767), j * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([header, data]));
  console.log(`wrote ${path}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio');
writeWav(join(root, 'music.wav'), music);
writeWav(join(root, 'sfx.wav'), sfx);
