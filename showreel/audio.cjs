// Synthesizes the 15s soundtrack (120 BPM, F minor) cued to the picture. No samples.
// usage: node audio.cjs out.wav
const fs = require('fs');
const SR = 48000, DUR = 15, N = SR * DUR;
const MAIN = [new Float32Array(N), new Float32Array(N)];
const DUCK = [new Float32Array(N), new Float32Array(N)];   // sidechained to the kick
const SEND = [new Float32Array(N), new Float32Array(N)];   // reverb bus
const KICKS = [];
let seed = 12345; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function coef(type, f, q) {
  f = Math.min(f, SR * 0.45); const w = 2 * Math.PI * f / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q); let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al; return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * cs / a0, a2: (1 - al) / a0 };
}
function filt(type, f, q = 0.707) { return Object.assign({ type, q, x1: 0, x2: 0, y1: 0, y2: 0 }, coef(type, f, q)); }
function retune(s, f) { Object.assign(s, coef(s.type, f, s.q)); }
function bq(s, x) { const y = s.b0 * x + s.b1 * s.x1 + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2; s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = y; return y; }

function voice(t0, dur, fn, { gain = 1, pan = 0, send = 0, duck = false } = {}) {
  const i0 = Math.round(t0 * SR), n = Math.round(dur * SR), gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4), B = duck ? DUCK : MAIN;
  for (let k = 0; k < n; k++) {
    const i = i0 + k; if (i >= N) break; const v = fn(k / SR, k); if (i < 0) continue;
    B[0][i] += v * gl; B[1][i] += v * gr; if (send) { SEND[0][i] += v * gl * send; SEND[1][i] += v * gr * send; }
  }
}
// ── instruments ──────────────────────────────────────────────────────────────
function kick(t0, g = 1) {
  KICKS.push(t0); let ph = 0;
  voice(t0, 0.5, tt => { ph += 2 * Math.PI * (44 + 130 * Math.exp(-tt * 32) + 30 * Math.exp(-tt * 7)) / SR; const env = Math.exp(-tt * 6.5) * Math.min(1, tt / 0.0015); return Math.tanh(Math.sin(ph) * env * 1.8) + (tt < 0.004 ? rnd() * 0.35 * (1 - tt / 0.004) : 0); }, { gain: 0.85 * g });
}
function clap(t0, g = 1) {
  const bp = filt('bp', 1300, 1.1), hp = filt('hp', 700);
  voice(t0, 0.45, tt => { let e = 0; for (const o of [0, 0.009, 0.019]) if (tt >= o) e = Math.max(e, Math.exp(-(tt - o) * (o < 0.015 ? 70 : 13))); return bq(bp, bq(hp, rnd())) * e * 3.2; }, { gain: 0.5 * g, send: 0.35 });
}
function snare(t0, g = 1, pan = 0) {
  const hp = filt('hp', 1600); let ph = 0;
  voice(t0, 0.3, tt => { ph += 2 * Math.PI * (190 + 70 * Math.exp(-tt * 40)) / SR; return bq(hp, rnd()) * Math.exp(-tt * 17) * 0.9 + Math.sin(ph) * Math.exp(-tt * 24) * 0.7; }, { gain: 0.45 * g, send: 0.25, pan });
}
function hat(t0, g = 1, open = false, pan = 0.3) {
  const hp = filt('hp', 7800, 0.9); voice(t0, open ? 0.32 : 0.05, tt => bq(hp, rnd()) * Math.exp(-tt * (open ? 12 : 80)), { gain: 0.24 * g, pan, send: 0.05 });
}
function bass(t0, dur, m, g = 1) {
  const lp = filt('lp', 900, 1.4), f = mtof(m); let ph = 0;
  voice(t0, dur + 0.03, (tt, k) => {
    if (k % 32 === 0) retune(lp, 180 + 1600 * Math.exp(-tt * 16));
    ph += f / SR; const saw = 2 * (ph % 1) - 1, env = Math.min(1, tt / 0.003) * (tt < dur ? 1 : Math.max(0, 1 - (tt - dur) / 0.03)) * Math.exp(-tt * 2.5);
    return (bq(lp, saw) * 0.75 + Math.sin(2 * Math.PI * ph) * 0.55) * env;
  }, { gain: 0.42 * g, duck: true });
}
function pad(t0, dur, ms, g = 1, cut = 1500) {
  const oscs = []; ms.forEach(m => { for (const d of [-0.12, 0, 0.11]) oscs.push({ f: mtof(m) * Math.pow(2, d / 12), ph: (rnd() + 1) / 2, p: d * 7 }); });
  const lp = [filt('lp', cut, 0.8), filt('lp', cut, 0.8)], i0 = Math.round(t0 * SR), n = Math.round((dur + 0.8) * SR);
  for (let k = 0; k < n; k++) {
    const i = i0 + k; if (i >= N) break; const tt = k / SR;
    const env = Math.min(1, tt / 0.25) * (tt < dur ? 1 : Math.exp(-(tt - dur) * 6)) * g * 0.07;
    let l = 0, r = 0; for (const o of oscs) { o.ph += o.f / SR; const s = 2 * (o.ph % 1) - 1; l += s * (0.5 - o.p * 0.5); r += s * (0.5 + o.p * 0.5); }
    l = bq(lp[0], l) * env; r = bq(lp[1], r) * env; if (i < 0) continue;
    DUCK[0][i] += l; DUCK[1][i] += r; SEND[0][i] += l * 0.3; SEND[1][i] += r * 0.3;
  }
}
function blip(t0, m, g = 1, pan = 0, dec = 14) {
  const f = mtof(m); let ph = 0;
  voice(t0, 0.7, tt => { ph += f / SR; return (Math.sin(2 * Math.PI * ph) + 0.35 * Math.sin(6 * Math.PI * ph) * Math.exp(-tt * 40)) * Math.exp(-tt * dec) * Math.min(1, tt / 0.002); }, { gain: 0.22 * g, pan, send: 0.45 });
}
function sweep(t0, dur, f0, f1, g = 1, pan = 0) { // pitched zip
  let ph = 0; voice(t0, dur, tt => { const x = tt / dur; ph += (f0 * Math.pow(f1 / f0, x)) / SR; return Math.sin(2 * Math.PI * ph) * Math.sin(Math.PI * x); }, { gain: 0.16 * g, pan, send: 0.3 });
}
function whoosh(t0, dur, f0, f1, g = 1, shape = 'swell', pan = 0) {
  const bp = filt('bp', f0, 1.2);
  voice(t0, dur, (tt, k) => {
    const x = tt / dur; if (k % 16 === 0) retune(bp, f0 * Math.pow(f1 / f0, x));
    const env = shape === 'rise' ? Math.pow(x, 2.2) : shape === 'fall' ? Math.exp(-x * 5) * Math.min(1, x * 30) : Math.pow(Math.sin(Math.PI * Math.pow(x, 0.7)), 2);
    return bq(bp, rnd()) * env * 2.4;
  }, { gain: 0.32 * g, pan, send: 0.25 });
}
function impact(t0, g = 1) {
  kick(t0, 1.1 * g); let ph = 0;
  voice(t0, 2.0, tt => { ph += 2 * Math.PI * (36 + 34 * Math.exp(-tt * 5)) / SR; return Math.tanh(Math.sin(ph) * 1.4) * Math.exp(-tt * 2.0); }, { gain: 0.55 * g });
  const hp = filt('hp', 2600); voice(t0, 1.8, tt => bq(hp, rnd()) * Math.exp(-tt * 3), { gain: 0.2 * g, send: 0.7 });
}
function thud(t0, m, g = 1) {
  let ph = 0; const f = mtof(m);
  voice(t0, 0.35, tt => { ph += 2 * Math.PI * f * (1 + 1.5 * Math.exp(-tt * 40)) / SR; return Math.sin(ph) * Math.exp(-tt * 11); }, { gain: 0.5 * g, send: 0.15 });
  snare(t0, 0.35 * g);
}
function drop(t0, g = 1, pan = 0) { // liquid bloop
  let ph = 0; voice(t0, 0.25, tt => { ph += 2 * Math.PI * (300 + 900 * Math.exp(-tt * 28)) / SR; return Math.sin(ph) * Math.exp(-tt * 18) * Math.min(1, tt / 0.003); }, { gain: 0.3 * g, pan, send: 0.4 });
}
function zap(t0, g = 1) {
  let ph = 0; voice(t0, 0.25, tt => { ph += 2 * Math.PI * (1600 * Math.exp(-tt * 18) + 60) / SR; return Math.sign(Math.sin(ph)) * 0.4 * Math.exp(-tt * 14); }, { gain: 0.18 * g, send: 0.3 });
}
function riser(t0, dur, g = 1) {
  whoosh(t0, dur, 300, 7000, 0.9 * g, 'rise');
  let ph = 0; voice(t0, dur, tt => { const x = tt / dur; ph += (110 * Math.pow(8, x)) / SR; return (2 * (ph % 1) - 1) * Math.pow(x, 2.5) * 0.25; }, { gain: 0.22 * g, send: 0.4 });
}
function reverseCym(t0, dur, g = 1) {
  const hp = filt('hp', 4000); voice(t0, dur, tt => bq(hp, rnd()) * Math.pow(tt / dur, 3), { gain: 0.4 * g, send: 0.3 });
}

// ── arrangement (times match reel.js) ────────────────────────────────────────
const CH = { Fm: [53, 56, 60], Db: [49, 53, 56], Ab: [56, 60, 63], Eb: [51, 55, 58] }, PROG = ['Fm', 'Db', 'Ab', 'Eb'], ROOT = { Fm: 41, Db: 37, Ab: 44, Eb: 39 };
// 00 intro
pad(0, 0.95, [41, 48, 53], 0.6, 500);
blip(0.05, 84, 0.9, 0, 18);
sweep(0.28, 0.24, 180, 900, 1);                 // wind-up (anticipation)
whoosh(0.46, 0.32, 800, 5000, 0.8, 'fall'); kick(0.5, 0.55);
blip(0.70, 77, 0.6, -0.6); blip(0.75, 84, 0.6, 0); blip(0.80, 89, 0.6, 0.6);
riser(0.55, 0.45, 0.8);
impact(1.0, 1.0);
for (let k = 0; k < 8; k++) hat(1.0 + k * 0.035, 0.6, false, (k % 2 ? 0.5 : -0.5));
reverseCym(1.2, 0.3, 0.6);
// groove 1.5 → 10.75
for (let b = 1.5; b < 10.74; b += 0.5) {
  const n = Math.round((b - 1.5) / 0.5), fluid = b >= 9.5;
  kick(b, n === 0 ? 1.1 : 1);
  if (n % 2 === 1) clap(b, fluid ? 0.7 : 1);
  hat(b + 0.25, fluid ? 0.6 : 1, n % 4 === 3, 0.3);
  if (!fluid) { hat(b + 0.125, 0.45, false, -0.35); hat(b + 0.375, 0.45, false, -0.35); }
}
for (let bar = 0; bar < 5; bar++) {
  const t0 = 1.5 + bar * 2, ch = PROG[bar % 4], end = Math.min(t0 + 2, 10.75);
  pad(t0, end - t0, CH[ch], 0.9);
  for (let e = 0; e < 8 && t0 + e * 0.25 < 10.75 - 1e-6; e++) bass(t0 + e * 0.25, 0.2, ROOT[ch] + (e % 2 ? 12 : 0), e % 2 ? 0.7 : 1);
}
// 01 type
blip(1.5, 72, 0.5); blip(2.0, 75, 0.5);
[2.6, 2.67, 2.74, 2.81].forEach((t, k) => thud(t, [45, 48, 52, 57][k], 0.9));
whoosh(2.95, 0.32, 250, 6000, 1.0, 'rise'); impact(3.25, 0.6);
// 02 shape morphs
[3.5, 3.75, 4.0, 4.25].forEach((t, k) => { blip(t, [72, 75, 79, 84][k], 0.8, k % 2 ? 0.5 : -0.5); whoosh(t - 0.06, 0.2, 1500, 7000, 0.4); });
// 03 particles
impact(4.5, 0.85); riser(4.9, 0.6, 0.5);
[77, 80, 82, 84, 87, 89, 92, 96].forEach((m, k) => blip(5.42 + k * 0.025, m, 0.45, k % 2 ? 0.6 : -0.6, 10));
whoosh(5.9, 0.55, 300, 3000, 0.6);
// 04 dimension
[6.5, 7.0, 7.5].forEach(t => zap(t, 1));
whoosh(7.6, 0.4, 2000, 300, 0.5);
// 05 rhythm
for (let k = 0; k < 14; k++) hat(7.92 + k * 0.026, 0.55, false, (hash(k) * 2 - 1));
whoosh(8.42, 0.4, 500, 6000, 0.45, 'swell', -0.4); whoosh(8.78, 0.4, 500, 6000, 0.5, 'swell', 0.4);
blip(9.0, 84, 0.6); blip(9.0, 91, 0.4);
// 06 fluid
[9.42, 9.55, 9.68, 9.9, 10.05, 10.2, 10.38].forEach((t, k) => drop(t, 0.9, (k % 3 - 1) * 0.6));
whoosh(10.38, 0.4, 200, 4000, 0.9, 'rise');
// 07 timing — drums out, clock ticks on each drawn frame, riser into the recap
for (let k = 0; k <= 16; k++) blip(11.05 + k * 0.52 / 16, 96, 0.25 + k * 0.02, 0.2, 60);
blip(10.75, 79, 0.5); blip(11.6, 72, 0.7); kick(11.6, 0.35);
riser(11.0, 0.75, 1.0);
pad(10.75, 1.0, [41, 48, 56], 0.5, 700);
// 08 recap — six 1/16 hits
[0, 1, 2, 3, 4, 5].forEach(k => { const t = 11.75 + k * 0.125; kick(t, 0.8); snare(t, 0.9, k % 2 ? 0.3 : -0.3); blip(t, 72 + [0, 3, 7, 10, 12, 15][k], 0.5); });
// 09 contact
impact(12.5, 1.15); pad(12.5, 1.9, [53, 56, 60, 65], 1.0, 2200); bass(12.5, 1.6, 29, 1.2);
for (let k = 0; k < 6; k++) blip(12.66 + k * 0.05, [77, 80, 84, 87, 89, 92][k], 0.35, (k / 2.5 - 1), 22);
for (let k = 0; k < 14; k++) blip(13.05 + k * 0.022, 100 + (k * 7) % 12, 0.08, (hash(k + 3) * 2 - 1), 40);
[65, 72, 77].forEach(m => blip(13.35, m, 0.45, 0, 6));
for (let b = 13.0; b < 14.25; b += 0.25) hat(b, 0.35, false, 0.2);
for (let b = 13.0; b < 14.25; b += 0.5) kick(b, 0.45);
reverseCym(14.05, 0.5, 0.9); sweep(14.3, 0.25, 900, 200, 0.8);
blip(14.48, 84, 0.8, 0, 16); kick(14.55, 0.4); blip(14.84, 96, 0.5, 0, 22);
function hash(x) { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// ── mix ──────────────────────────────────────────────────────────────────────
KICKS.sort((a, b) => a - b);
{ let ki = 0, last = -9; for (let i = 0; i < N; i++) { const t = i / SR; while (ki < KICKS.length && KICKS[ki] <= t) last = KICKS[ki++]; const d = 1 - 0.65 * Math.exp(-(t - last) * 9); DUCK[0][i] *= d; DUCK[1][i] *= d; } }
function reverb(x, spread) { // Freeverb-ish
  const out = new Float32Array(N), combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map(d => ({ b: new Float32Array(Math.round((d + spread) * SR / 44100)), i: 0, s: 0 }));
  const aps = [556, 441, 341, 225].map(d => ({ b: new Float32Array(Math.round((d + spread) * SR / 44100)), i: 0 }));
  for (let n = 0; n < N; n++) {
    let y = 0; const inp = x[n] * 0.015;
    for (const c of combs) { const o = c.b[c.i]; c.s = o * 0.75 + c.s * 0.25; c.b[c.i] = inp + c.s * 0.86; c.i = (c.i + 1) % c.b.length; y += o; }
    for (const a of aps) { const o = a.b[a.i]; a.b[a.i] = y + o * 0.5; a.i = (a.i + 1) % a.b.length; y = o - y; }
    out[n] = y;
  }
  return out;
}
const RV = [reverb(SEND[0], 0), reverb(SEND[1], 23)];
const L = new Float32Array(N), R = new Float32Array(N); let peak = 0;
const hpL = filt('hp', 25), hpR = filt('hp', 25);
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh(bq(hpL, MAIN[0][i] + DUCK[0][i] + RV[0][i] * 0.9) * 1.1);
  R[i] = Math.tanh(bq(hpR, MAIN[1][i] + DUCK[1][i] + RV[1][i] * 0.9) * 1.1);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak, fadeIn = SR * 0.005, fadeOut = SR * 0.12;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const f = Math.min(1, i / fadeIn, (N - i) / fadeOut) * norm;
  buf.writeInt16LE(Math.round(clampS(L[i] * f) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(clampS(R[i] * f) * 32767), 46 + i * 4);
}
function clampS(v) { return Math.max(-1, Math.min(1, v)); }
fs.writeFileSync(process.argv[2] || 'audio.wav', buf);
console.log('wrote', process.argv[2] || 'audio.wav', 'peak', peak.toFixed(3));
