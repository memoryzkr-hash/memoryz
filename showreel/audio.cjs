// Synthesizes the 15s showreel soundtrack (120 BPM, F minor) cued to the picture. No samples.
// usage: node audio.cjs out.wav
const { kick, clap, snare, hat, bass, pad, blip, sweep, whoosh, impact, thud, drop, zap, riser, reverseCym, hash, write } = require('./synth.cjs')(15);

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

write(process.argv[2] || 'audio.wav');
