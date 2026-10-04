// Tiny sample-free synth: instruments write into stereo buses; write() mixes
// (kick sidechain on DUCK bus, Freeverb-style reverb on SEND bus) to a 16-bit WAV.
module.exports = function createSynth(DUR) {
const fs = require('fs');
const SR = 48000, N = Math.round(SR * DUR);
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

function hash(x) { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function write(out) {
// mix────────────────────────────────────────────────────────────────────
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
fs.writeFileSync(out, buf);
console.log('wrote', out, 'peak', peak.toFixed(3));
}
return { SR, kick, clap, snare, hat, bass, pad, blip, sweep, whoosh, impact, thud, drop, zap, riser, reverseCym, hash, mtof, write };
};
