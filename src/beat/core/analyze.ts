/**
 * Listens to a real recording and finds what a chart needs: the tempo, where the bars start,
 * and how strongly something hits on every eighth note (and how bright it sounds).
 *
 * Kept simple and dependency-free, tuned for music with a steady beat (EDM, pop, NCS-style tracks):
 *   1. three bands (low / mid / high) with biquad filters, energy every ~12 ms;
 *   2. onset strength = rise in log energy, summed over bands;
 *   3. tempo from the autocorrelation of that envelope (with a soft preference for 120 BPM),
 *      then fine-tuned with the beat phase by lining a grid up against the whole song;
 *   4. bar starts where the low band (the kick) hits hardest;
 *   5. every eighth-note slot gets the strongest onset near it and the band balance there.
 */

export interface Slot {
  /** Onset strength near this eighth note, 0 = nothing. */
  strength: number;
  /** 0..1, share of high-band energy: a rough "how high does it sound". */
  bright: number;
}

export interface Analysis {
  bpm: number;
  /** Seconds into the recording where beat 0 (a bar start) falls. */
  firstBeat: number;
  /** Length of the recording in seconds. */
  duration: number;
  /** One per eighth note from beat 0. */
  slots: Slot[];
  /** Loudness of each bar, 0-3. */
  barEnergy: number[];
  /** How well the beat grid fits, 0..1 (low means the tempo is a guess). */
  confidence: number;
}

export class AnalysisError extends Error {}

const TARGET_RATE = 22050;
const HOP = 256;

interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

function biquad(type: 'lowpass' | 'highpass' | 'bandpass', freq: number, q: number, rate: number): Biquad {
  const w = (2 * Math.PI * freq) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  let b0: number, b1: number, b2: number;
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

/** Energy per hop of one filtered band. */
function bandEnergy(x: Float32Array, f: Biquad, frames: number): Float64Array {
  const out = new Float64Array(frames);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < frames * HOP; i++) {
    const x0 = x[i] ?? 0;
    const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    out[(i / HOP) | 0] += y0 * y0;
  }
  return out;
}

/** Positive rise in log energy, frame to frame. */
function flux(e: Float64Array): Float64Array {
  const out = new Float64Array(e.length);
  for (let i = 1; i < e.length; i++) out[i] = Math.max(0, Math.log(e[i] + 1e-6) - Math.log(e[i - 1] + 1e-6));
  return out;
}

/** Subtract a moving average (about half a second), keep what sticks out. */
function sharpen(env: Float64Array, win: number): Float64Array {
  const out = new Float64Array(env.length);
  let sum = 0;
  const half = win >> 1;
  for (let i = 0; i < Math.min(env.length, half); i++) sum += env[i];
  for (let i = 0; i < env.length; i++) {
    if (i + half < env.length) sum += env[i + half];
    if (i - half - 1 >= 0) sum -= env[i - half - 1];
    const n = Math.min(env.length, i + half + 1) - Math.max(0, i - half);
    out[i] = Math.max(0, env[i] - sum / n);
  }
  return out;
}

/** Linear interpolation into an envelope. */
const at = (env: Float64Array, f: number) => {
  const i = Math.floor(f);
  if (i < 0 || i + 1 >= env.length) return 0;
  const k = f - i;
  return env[i] * (1 - k) + env[i + 1] * k;
};

/** Mono, at ~22 kHz (averaging whole-number factors down from 44.1/48 kHz). */
export function downmix(channels: Float32Array[], rate: number): { samples: Float32Array; rate: number } {
  const factor = Math.max(1, Math.round(rate / TARGET_RATE));
  const n = Math.floor(channels[0].length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const ch of channels) for (let k = 0; k < factor; k++) s += ch[i * factor + k];
    out[i] = s / (factor * channels.length);
  }
  return { samples: out, rate: rate / factor };
}

export function analyze(samples: Float32Array, rate: number): Analysis {
  const duration = samples.length / rate;
  if (duration < 15) throw new AnalysisError('15초보다 긴 곡을 골라 주세요.');
  const frames = Math.floor(samples.length / HOP);
  const hopSec = HOP / rate;

  const low = bandEnergy(samples, biquad('lowpass', 150, 0.7, rate), frames);
  const mid = bandEnergy(samples, biquad('bandpass', 900, 0.6, rate), frames);
  const high = bandEnergy(samples, biquad('highpass', 3000, 0.7, rate), frames);
  const lowF = flux(low);
  const midF = flux(mid);
  const highF = flux(high);
  const raw = new Float64Array(frames);
  for (let i = 0; i < frames; i++) raw[i] = lowF[i] + midF[i] + 0.6 * highF[i];
  const env = sharpen(raw, Math.round(0.5 / hopSec));
  const kick = sharpen(lowF, Math.round(0.5 / hopSec));

  let peak = 0;
  for (const v of env) peak = Math.max(peak, v);
  if (peak < 1e-3) throw new AnalysisError('소리가 너무 작거나 박자를 찾지 못했어요.');

  // 1. Tempo from autocorrelation, preferring the 80-160 BPM range.
  const minLag = Math.floor(60 / 180 / hopSec);
  const maxLag = Math.ceil(60 / 70 / hopSec);
  let bestLag = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + 2 * lag < frames; i++) sum += env[i] * (env[i + lag] + 0.5 * env[i + 2 * lag]);
    const bpm = 60 / (lag * hopSec);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.6) ** 2);
    if (sum * prior > bestScore) {
      bestScore = sum * prior;
      bestLag = lag;
    }
  }
  let rough = 60 / (bestLag * hopSec);
  while (rough < 80) rough *= 2;
  while (rough >= 165) rough /= 2;

  // 2. Fine tempo and phase together: the grid that lands on the most onsets across the song.
  const fit = (bpm: number) => {
    const period = 60 / bpm / hopSec;
    let best = { score: -Infinity, phase: 0 };
    for (let ph = 0; ph < period; ph += 0.25) {
      let score = 0;
      for (let f = ph; f < frames; f += period) score += at(env, f) + 0.25 * at(env, f + period / 2);
      if (score > best.score) best = { score, phase: ph };
    }
    return best;
  };
  let bpm = rough;
  let grid = fit(bpm);
  for (let b = rough * 0.98; b <= rough * 1.02; b += 0.02) {
    const g = fit(b);
    if (g.score > grid.score) {
      grid = g;
      bpm = b;
    }
  }
  // Whole-number tempos are the norm in produced music; snap when it fits just as well.
  const whole = Math.round(bpm);
  const wholeFit = fit(whole);
  if (wholeFit.score >= grid.score * 0.995) {
    bpm = whole;
    grid = wholeFit;
  }
  const period = 60 / bpm / hopSec;

  // 3. Bar starts: of the four beats, the one where the kick hits hardest.
  let bestBar = 0;
  let bestKick = -Infinity;
  for (let m = 0; m < 4; m++) {
    let sum = 0;
    for (let f = grid.phase + m * period; f < frames; f += 4 * period) sum += at(kick, f);
    if (sum > bestKick) {
      bestKick = sum;
      bestBar = m;
    }
  }
  const spb = 60 / bpm;
  // Beat 0: the first bar start at least one bar in, so the count-in plays over the recording.
  let firstBeat = (grid.phase + bestBar * period) * hopSec;
  while (firstBeat < 4 * spb) firstBeat += 4 * spb;

  // 4. Eighth-note slots.
  const slots: Slot[] = [];
  const reach = (spb / 8) / hopSec;
  for (let t = firstBeat; t < duration - spb; t += spb / 2) {
    const c = t / hopSec;
    let strength = 0;
    for (let f = Math.floor(c - reach); f <= Math.ceil(c + reach); f++) strength = Math.max(strength, env[f] ?? 0);
    const i = Math.round(c + 2);
    const total = (low[i] ?? 0) + (mid[i] ?? 0) + (high[i] ?? 0) + 1e-9;
    slots.push({ strength: strength / peak, bright: (high[i] ?? 0) / total + 0.5 * ((mid[i] ?? 0) / total) });
  }

  // 5. Loudness per bar, in quartiles.
  const bars = Math.floor(slots.length / 8);
  const loud: number[] = [];
  for (let b = 0; b < bars; b++) {
    const f0 = Math.floor((firstBeat + b * 4 * spb) / hopSec);
    const f1 = Math.floor((firstBeat + (b + 1) * 4 * spb) / hopSec);
    let e = 0;
    for (let f = f0; f < f1 && f < frames; f++) e += low[f] + mid[f] + high[f];
    loud.push(e / Math.max(1, f1 - f0));
  }
  const sorted = [...loud].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  const barEnergy = loud.map((e) => (e < q(0.15) ? 0 : e < q(0.4) ? 1 : e < q(0.7) ? 2 : 3));

  // Confidence: how much more the grid catches than an off-grid one would.
  let on = 0, off = 0;
  for (let f = grid.phase; f < frames; f += period) {
    on += at(env, f);
    off += at(env, f + period * 0.37);
  }
  const confidence = Math.max(0, Math.min(1, (on - off) / (on + 1e-9)));

  return { bpm, firstBeat, duration, slots, barEnergy, confidence };
}

/** Title and artist from an MP3's ID3v2 tag, if it has one. */
export function readTags(bytes: Uint8Array): { title?: string; artist?: string } {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return {};
  const version = bytes[3];
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
  const end = Math.min(bytes.length, 10 + size);
  const out: { title?: string; artist?: string } = {};
  let p = 10;
  while (p + 10 <= end) {
    const id = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const len = version >= 4
      ? ((bytes[p + 4] & 0x7f) << 21) | ((bytes[p + 5] & 0x7f) << 14) | ((bytes[p + 6] & 0x7f) << 7) | (bytes[p + 7] & 0x7f)
      : (bytes[p + 4] << 24) | (bytes[p + 5] << 16) | (bytes[p + 6] << 8) | bytes[p + 7];
    const body = bytes.subarray(p + 10, p + 10 + len);
    if ((id === 'TIT2' || id === 'TPE1') && body.length > 1) {
      const enc = body[0];
      const data = body.subarray(1);
      const label = enc === 1 || enc === 2 ? (enc === 2 ? 'utf-16be' : 'utf-16') : enc === 3 ? 'utf-8' : 'latin1';
      const text = new TextDecoder(label).decode(data).replace(/\0+$/g, '').trim();
      if (text) out[id === 'TIT2' ? 'title' : 'artist'] = text;
    }
    p += 10 + len;
  }
  return out;
}
