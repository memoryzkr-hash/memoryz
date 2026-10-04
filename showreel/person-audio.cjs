// Soundtrack for the code-drawn character (6s). Footfalls come from the rig's
// gait phase (events.json written by render.cjs), so every step lands on a foot plant.
// usage: node person-audio.cjs events.json out.wav
const fs = require('fs');
const S = require('./synth.cjs')(6);
const ev = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { kick, hat, pad, blip, sweep, whoosh, impact, thud, bass, reverseCym } = S;

// bed: Fm pad that brightens as she speeds up
pad(0.0, 2.0, [53, 56, 60], 0.7, 900); pad(2.0, 1.3, [49, 53, 56, 61], 0.8, 1600);
pad(4.0, 2.0, [56, 60, 63, 68], 0.8, 2200);
// drop-in: falling zip, then a squashy landing
sweep(0.08, 0.34, 1400, 300, 0.9); thud(ev.drop, 40, 1.0); blip(ev.drop + 0.02, 84, 0.6, 0, 20);
// footsteps: low tap + scuff, panned by foot
for (const [t, g, k] of ev.steps) { kick(t, 0.28 * g); hat(t + 0.01, 0.9 * g, false, k ? -0.35 : 0.35); }
// the run builds: bass pulse + hats on the steps
for (const [t, g] of ev.steps.filter(s => s[0] > 2.2)) bass(t, 0.12, 41, 0.8 * g);
// flip: anticipation, swoosh through the rotation, impact on landing
reverseCym(3.0, ev.takeoff - 3.0, 0.7); whoosh(ev.takeoff, ev.land - ev.takeoff, 300, 5000, 1.1, 'swell');
sweep(ev.takeoff, 0.5, 300, 1200, 0.5);
impact(ev.land, 0.75);
// hello: bright arpeggio under the title, little sparkle on each wave
[72, 75, 79, 84, 87].forEach((m, i) => blip(ev.title + i * 0.05, m, 0.55, (i - 2) * 0.3, 10));
for (let k = 0; k < 4; k++) blip(4.55 + k * 0.39, 96, 0.18, 0.4, 30);
kick(ev.title, 0.5);
S.write(process.argv[3] || 'person.wav');
