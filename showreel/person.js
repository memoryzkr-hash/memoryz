'use strict';
// ─────────────────────────────────────────────────────────────────────────────
//  CODE-DRAWN CHARACTER — 6s · 1080×1920 · 60fps
//  A 2D rig (hip, torso, head, 2×thigh/shin/foot, 2×upper/forearm). Legs are
//  solved with 2-bone IK against procedural foot paths, so feet never slide on
//  the scrolling ground. Every frame is a pure function of time.
// ─────────────────────────────────────────────────────────────────────────────
const W = 1080, H = 1920, CX = W / 2, CY = H / 2, FPS = 60, DUR = 6, TAU = Math.PI * 2;
const C = { ink: '#0B0B0E', cream: '#F2EDE4', red: '#FF3D1F', blue: '#2E4BFF', lime: '#CBFF2E', skin: '#E9B994', pants: '#16162A', hair: '#121216' };
const F = { mono: (s, w = 500) => `${w} ${s}px "JetBrains Mono"`, serif: (s, it = true) => `${it ? 'italic ' : ''}400 ${s}px "Instrument Serif"`, anton: s => `400 ${s}px Anton` };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t, rng = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  inOutCubic: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outCubic: x => 1 - Math.pow(1 - x, 3), inCubic: x => x * x * x,
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  outBack: x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2,
};
const hash = x => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgba = (h, a) => `rgba(${rgb(h).join(',')},${a})`;
const mix = (a, b, f) => { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], f))).join(',')})`; };

// ── rig dimensions ───────────────────────────────────────────────────────────
const THIGH = 150, SHIN = 148, TORSO = 230, NECK = 26, HEAD = 66, UARM = 122, FARM = 112;
const GROUND = 1460, STAND_H = 302; // hip height when standing (legs slightly soft)

// ── locomotion: frequency & stride ramp walk → run, integrated numerically ──
const GAIT = t => { // 0 = idle, 1 = walk, 2 = run
  const w = rng(t, 0.75, 1.0), r = E.inOutCubic(rng(t, 1.9, 2.5)), stop = E.inOutCubic(rng(t, 3.0, 3.3));
  return { amt: w * (1 - stop), run: r };
};
const gaitParams = g => ({ T: lerp(1.0, 0.56, g.run), S: lerp(230, 420, g.run), sf: lerp(0.62, 0.38, g.run), lift: lerp(55, 120, g.run), lean: lerp(0.06, 0.32, g.run), bob: lerp(10, 26, g.run) });
const INT = []; // precomputed [phase, groundX] at 1ms steps
(function integrate() {
  let ph = 0, gx = 0; const dt = 0.001;
  for (let i = 0; i <= DUR / dt + 2; i++) {
    INT.push([ph, gx]); const t = i * dt, g = GAIT(t), P = gaitParams(g);
    ph += dt / P.T * g.amt;
    gx += dt * g.amt * P.S / (P.sf * P.T);
    // carry momentum through the flip, ease to rest on landing
    if (t >= 3.0 && t < 4.3) gx += dt * 900 * (1 - E.inOutCubic(rng(t, 3.9, 4.3)));
  }
})();
const integ = t => { const f = clamp(t, 0, DUR) / 0.001, i = Math.floor(f), a = INT[i], b = INT[i + 1] || a, u = f - i; return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]; };

// ── IK / pose helpers ────────────────────────────────────────────────────────
// angles are measured from "straight down", positive = rotated forward (+x)
function legIK(hip, foot) {
  const dx = foot[0] - hip[0], dy = foot[1] - hip[1], d = Math.min(Math.hypot(dx, dy), THIGH + SHIN - 0.5);
  const base = Math.atan2(dx, dy), A = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
  const knee = Math.PI - Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1));
  return { th: base + A, bend: knee };
}
const pose = o => Object.assign({ hip: [CX, GROUND - STAND_H], tau: 0, rot: 0, legs: [{ th: 0, bend: 0, foot: 0 }, { th: 0, bend: 0, foot: 0 }], arms: [{ a: 0, bend: 0.3 }, { a: 0, bend: 0.3 }], tilt: 0 }, o);
function lerpPose(A, B, e) {
  const L = (a, b) => lerp(a, b, e);
  return {
    hip: [L(A.hip[0], B.hip[0]), L(A.hip[1], B.hip[1])], tau: L(A.tau, B.tau), rot: L(A.rot, B.rot), tilt: L(A.tilt, B.tilt),
    legs: A.legs.map((l, i) => ({ th: L(l.th, B.legs[i].th), bend: L(l.bend, B.legs[i].bend), foot: L(l.foot, B.legs[i].foot) })),
    arms: A.arms.map((a, i) => ({ a: L(a.a, B.arms[i].a), bend: L(a.bend, B.arms[i].bend) })),
  };
}
function plantedPose(hipY, tau, arms, spread = 26) {
  const hip = [CX, hipY];
  return pose({ hip, tau, arms, legs: [legIK(hip, [CX + spread, GROUND - 22]), legIK(hip, [CX - spread, GROUND - 22])].map(l => ({ ...l, foot: 0 })) });
}
const STAND = () => plantedPose(GROUND - STAND_H, 0.02, [{ a: 0.1, bend: 0.25 }, { a: -0.08, bend: 0.25 }]);
const CROUCH = () => plantedPose(GROUND - STAND_H + 105, 0.55, [{ a: -1.3, bend: 0.25 }, { a: -1.1, bend: 0.25 }], 40);
const LAND = () => plantedPose(GROUND - STAND_H + 120, 0.45, [{ a: 1.5, bend: 0.3 }, { a: 1.3, bend: 0.3 }], 60);

function walkPose(t) {
  const g = GAIT(t), P = gaitParams(g), [ph] = integ(t), hip = [CX, 0], legs = [];
  let bob = 0;
  for (let k = 0; k < 2; k++) {
    const p = ((ph + k * 0.5) % 1 + 1) % 1; let fx, fy, fa = 0;
    if (p < P.sf) { const q = p / P.sf; fx = CX + P.S / 2 - P.S * q; fy = GROUND - 22; bob += Math.sin(Math.PI * q); fa = lerp(0.12, -0.15, q) * g.amt; }
    else { const q = (p - P.sf) / (1 - P.sf), e = E.inOutSine(q); fx = CX - P.S / 2 + P.S * e; fy = GROUND - 22 - P.lift * Math.sin(Math.PI * q); fa = -0.4 * Math.sin(Math.PI * q) + 0.15 * q; }
    // blend toward neutral stance while idling
    fx = lerp(CX + (k ? -26 : 26), fx, g.amt); fy = lerp(GROUND - 22, fy, g.amt);
    legs.push({ fx, fy, fa });
  }
  hip[1] = GROUND - STAND_H - (bob * P.bob - P.bob * 0.6) * g.amt + 10 * g.run * g.amt;
  const L = legs.map(l => ({ ...legIK(hip, [l.fx, l.fy]), foot: l.fa }));
  const swing = k => Math.sin(TAU * (ph + k * 0.5) + Math.PI / 2) * lerp(0.55, 1.15, g.run) * g.amt;
  return pose({
    hip, tau: (P.lean + 0.02) * g.amt + 0.02 * (1 - g.amt), legs: L, tilt: -0.05 * g.run,
    arms: [{ a: -swing(0) + 0.1 * g.run, bend: lerp(0.3, 1.6, g.run) + 0.3 * Math.max(0, -swing(0)) }, { a: -swing(1) + 0.1 * g.run, bend: lerp(0.3, 1.6, g.run) + 0.3 * Math.max(0, -swing(1)) }],
  });
}
// ── master pose timeline ─────────────────────────────────────────────────────
const TAKEOFF = 3.32, LANDT = 3.98;
function airHipY(t) { const u = rng(t, TAKEOFF, LANDT); return GROUND - STAND_H - 20 - 330 * 4 * u * (1 - u); }
function getPose(t) {
  if (t < 0.55) { // dropped in from above
    const p = STAND(), f = E.inCubic(rng(t, 0.08, 0.42));
    p.hip[1] = lerp(-700, GROUND - STAND_H, f); p.legs.forEach(l => { l.th = 0; l.bend = 0; l.foot = -0.2; }); p.arms.forEach(a => { a.a = 2.6; a.bend = 0.2; });
    if (t > 0.42) return lerpPose(lerpPose(LAND(), STAND(), 0), STAND(), E.outBack(rng(t, 0.42, 0.62)));
    return p;
  }
  if (t < 3.0) {
    const w = walkPose(t);
    if (t < 0.62) return lerpPose(LAND(), w, E.outBack(rng(t, 0.42, 0.62)));
    return w;
  }
  const run = walkPose(3.0);
  if (t < TAKEOFF - 0.06) return lerpPose(run, CROUCH(), E.inOutCubic(rng(t, 3.0, TAKEOFF - 0.06)));
  const EXT = pose({ hip: [CX, airHipY(t)], tau: 0.15, legs: [{ th: -0.25, bend: 0.05, foot: -0.6 }, { th: -0.35, bend: 0.1, foot: -0.6 }], arms: [{ a: 2.9, bend: 0.1 }, { a: 2.7, bend: 0.1 }] });
  const TUCK = pose({ hip: [CX, airHipY(t)], tau: 0.7, legs: [{ th: 2.1, bend: 2.5, foot: 0.3 }, { th: 1.9, bend: 2.4, foot: 0.3 }], arms: [{ a: 1.4, bend: 1.3 }, { a: 1.2, bend: 1.3 }] });
  const OPEN = pose({ hip: [CX, airHipY(t)], tau: 0.2, legs: [{ th: 0.35, bend: 0.5, foot: 0 }, { th: 0.15, bend: 0.4, foot: 0 }], arms: [{ a: 1.9, bend: 0.2 }, { a: 1.7, bend: 0.2 }] });
  const spin = TAU * E.inOutCubic(rng(t, TAKEOFF + 0.02, LANDT - 0.1));
  let p;
  if (t < TAKEOFF + 0.05) p = lerpPose(CROUCH(), EXT, E.outCubic(rng(t, TAKEOFF - 0.06, TAKEOFF + 0.05)));
  else if (t < 3.62) p = lerpPose(EXT, TUCK, E.inOutCubic(rng(t, TAKEOFF + 0.05, 3.55)));
  else if (t < LANDT) p = lerpPose(TUCK, OPEN, E.inOutCubic(rng(t, 3.68, 3.9)));
  else if (t < 4.12) p = lerpPose(LAND(), LAND(), 0);
  else if (t < 4.5) p = lerpPose(LAND(), STAND(), E.outBack(rng(t, 4.12, 4.5)));
  else p = STAND();
  if (t >= LANDT && t < 4.12) { // landing absorb: legs catch, hips sink
    const k = rng(t, LANDT, 4.08); p = lerpPose(lerpPose(OPEN, LAND(), 0), LAND(), E.outCubic(k)); p.hip[0] = CX;
  }
  if (t < LANDT) p.rot = spin;
  if (t >= 4.5) { // wave hello
    const w = E.outBack(rng(t, 4.5, 4.75));
    p.arms[0] = { a: lerp(0.1, 2.0, w), bend: lerp(0.25, 1.0 + 0.4 * Math.sin((t - 4.5) * 16), w) };
    p.tilt = -0.12 * w; p.tau = 0.02 - 0.06 * w;
  }
  return p;
}
// ── forward kinematics ───────────────────────────────────────────────────────
const dir = a => [Math.sin(a), Math.cos(a)];
function fk(p) {
  const up = [Math.sin(p.tau), -Math.cos(p.tau)], hip = p.hip;
  const neck = [hip[0] + up[0] * TORSO, hip[1] + up[1] * TORSO], sh = [hip[0] + up[0] * (TORSO - 34), hip[1] + up[1] * (TORSO - 34)];
  const ha = p.tau + p.tilt, head = [neck[0] + Math.sin(ha) * (NECK + HEAD), neck[1] - Math.cos(ha) * (NECK + HEAD)];
  const legs = p.legs.map(l => {
    const d1 = dir(l.th), knee = [hip[0] + d1[0] * THIGH, hip[1] + d1[1] * THIGH], d2 = dir(l.th - l.bend), ank = [knee[0] + d2[0] * SHIN, knee[1] + d2[1] * SHIN];
    return { knee, ank, footA: l.foot + (p.rot || 0) * 0 };
  });
  const arms = p.arms.map(a => {
    const d1 = dir(a.a), el = [sh[0] + d1[0] * UARM, sh[1] + d1[1] * UARM], d2 = dir(a.a + a.bend), hand = [el[0] + d2[0] * FARM, el[1] + d2[1] * FARM];
    return { el, hand };
  });
  return { hip, neck, sh, head, ha, legs, arms };
}
// ── drawing ──────────────────────────────────────────────────────────────────
function seg(c, a, b, w, col) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
function shoe(c, ank, ang, col) {
  c.save(); c.translate(ank[0], ank[1]); c.rotate(-ang); c.fillStyle = col;
  c.beginPath(); c.roundRect(-26, -4, 96, 34, [10, 18, 16, 10]); c.fill();
  c.fillStyle = rgba(C.cream, 0.9); c.fillRect(-26, 22, 96, 8); c.restore();
}
function drawLeg(c, R, k, far) {
  const L = R.legs[k], pc = far ? mix(C.pants, '#000000', 0.35) : C.pants;
  seg(c, R.hip, L.knee, 70, pc); seg(c, L.knee, L.ank, 58, pc);
  shoe(c, L.ank, L.footA, far ? mix(C.red, '#000000', 0.35) : C.red);
}
function drawArm(c, R, k, far) {
  const A = R.arms[k], sc = far ? mix(C.cream, '#000000', 0.3) : C.cream;
  seg(c, R.sh, A.el, 52, sc); seg(c, A.el, A.hand, 46, sc);
  c.fillStyle = far ? mix(C.skin, '#000000', 0.3) : C.skin; c.beginPath(); c.arc(A.hand[0], A.hand[1], 24, 0, TAU); c.fill();
}
function drawHead(c, R, t) {
  const [x, y] = R.head;
  c.save(); c.translate(x, y); c.rotate(R.ha);
  // neck
  c.fillStyle = C.skin; c.fillRect(-20, HEAD - 10, 40, NECK + 30);
  // bob haircut: back mass + face + fringe
  c.fillStyle = C.hair; c.beginPath(); c.ellipse(-12, -6, HEAD + 14, HEAD + 10, 0, 0, TAU); c.fill();
  c.beginPath(); c.roundRect(-HEAD - 2, -10, HEAD + 34, HEAD + 34, [0, 0, 26, 30]); c.fill();
  c.fillStyle = C.skin; c.beginPath(); c.ellipse(14, 10, HEAD - 8, HEAD - 2, 0, -Math.PI * 0.5, Math.PI * 0.75); c.lineTo(0, -10); c.fill();
  c.beginPath(); c.moveTo(HEAD + 2, 4); c.quadraticCurveTo(HEAD + 20, 18, HEAD + 2, 26); c.fill(); // nose
  c.fillStyle = C.hair; c.beginPath(); c.moveTo(-30, -HEAD + 4); c.quadraticCurveTo(40, -HEAD - 30, HEAD + 10, -20); c.lineTo(HEAD - 6, -10); c.quadraticCurveTo(30, -34, -10, -30); c.closePath(); c.fill();
  // eye + blink
  const bl = [1.1, 2.6, 4.9, 5.6].some(b => t > b && t < b + 0.12) ? 0.15 : 1;
  c.save(); c.translate(40, 2); c.scale(1, bl); c.fillStyle = C.ink; c.beginPath(); c.arc(0, 0, 7, 0, TAU); c.fill(); c.restore();
  c.fillStyle = rgba(C.red, 0.28); c.beginPath(); c.arc(34, 30, 14, 0, TAU); c.fill(); // blush
  c.strokeStyle = C.ink; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.arc(46, 34, 12, 0.3, 1.3); c.stroke(); // smile
  c.fillStyle = '#C9CDD6'; c.beginPath(); c.arc(-4, 40, 7, 0, TAU); c.fill(); // earring
  c.restore();
}
function drawTorso(c, R) {
  const up = [R.sh[0] - R.hip[0], R.sh[1] - R.hip[1]];
  seg(c, R.hip, [R.hip[0] + up[0] * 0.15, R.hip[1] + up[1] * 0.15], 120, C.pants);
  seg(c, [R.hip[0] + up[0] * 0.12, R.hip[1] + up[1] * 0.12], R.sh, 132, C.cream);
  // sweater knit ribs + turtleneck
  c.strokeStyle = rgba('#B9AE9C', 0.7); c.lineWidth = 4;
  for (let k = 0; k < 4; k++) { const f = 0.12 + k * 0.03, p = [R.hip[0] + up[0] * f, R.hip[1] + up[1] * f]; const n = [up[1], -up[0]], l = Math.hypot(n[0], n[1]); c.beginPath(); c.moveTo(p[0] - n[0] / l * 58, p[1] - n[1] / l * 58); c.lineTo(p[0] + n[0] / l * 58, p[1] + n[1] / l * 58); c.stroke(); }
  seg(c, R.sh, R.neck, 74, mix(C.cream, '#B9AE9C', 0.35));
}
function drawChar(c, p, t, ghost) {
  const R = fk(p);
  c.save();
  if (p.rot) { const piv = [p.hip[0] + Math.sin(p.tau) * 90, p.hip[1] - Math.cos(p.tau) * 90]; c.translate(piv[0], piv[1]); c.rotate(p.rot); c.translate(-piv[0], -piv[1]); }
  if (ghost) {
    c.strokeStyle = ghost; c.lineWidth = 6; c.lineCap = 'round';
    const L = (a, b) => { c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); };
    R.legs.forEach(l => { L(R.hip, l.knee); L(l.knee, l.ank); }); R.arms.forEach(a => { L(R.sh, a.el); L(a.el, a.hand); }); L(R.hip, R.neck);
    c.beginPath(); c.arc(R.head[0], R.head[1], HEAD, 0, TAU); c.stroke(); c.restore(); return R;
  }
  drawArm(c, R, 1, true); drawLeg(c, R, 1, true);
  drawTorso(c, R); drawHead(c, R, t);
  drawLeg(c, R, 0, false); drawArm(c, R, 0, false);
  c.restore(); return R;
}
// ── scene ────────────────────────────────────────────────────────────────────
const SHAPES = Array.from({ length: 14 }, (_, i) => ({ x: hash(i * 3.1) * 2400, y: 260 + hash(i * 5.7) * 820, s: 90 + hash(i * 1.9) * 220, k: Math.floor(hash(i * 8.3) * 5), col: [C.red, C.lime, C.cream, C.blue, C.cream][Math.floor(hash(i * 2.2) * 5)], depth: 0.15 + hash(i * 4.4) * 0.35 }));
function bgShape(c, s, x) {
  c.save(); c.translate(x, s.y); c.fillStyle = s.col; c.globalAlpha = 0.9; const h = s.s / 2; c.beginPath();
  switch (s.k) { case 0: c.arc(0, 0, h, 0, TAU); break; case 1: c.arc(0, h, h, Math.PI, TAU); break; case 2: c.moveTo(-h, h); c.lineTo(0, -h); c.lineTo(h, h); break; case 3: c.moveTo(-h, -h); c.arc(-h, -h, s.s, 0, Math.PI / 2); break; default: c.rect(-h * 0.25, -h, h * 0.5, s.s); }
  c.closePath(); c.fill(); c.restore();
}
const SECT = [[0, 'RIG / DROP-IN'], [0.75, 'WALK CYCLE · IK'], [1.9, 'RUN'], [3.0, 'FRONT FLIP'], [4.5, 'HELLO']];
function scene(c, t) {
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  const [, gx] = integ(t);
  const land = t >= LANDT && t < LANDT + 0.5 ? Math.exp(-(t - LANDT) * 12) : 0, drop = t >= 0.42 && t < 0.9 ? Math.exp(-(t - 0.42) * 12) * 0.7 : 0;
  const sh = (land + drop) * 26; c.translate(Math.sin(t * 93) * sh, Math.cos(t * 71) * sh);
  c.fillStyle = C.blue; c.fillRect(-100, -100, W + 200, H + 200);
  // sky shapes (parallax)
  for (const s of SHAPES) { const span = 2600, x = ((s.x - gx * s.depth) % span + span) % span - 400; bgShape(c, s, x); }
  // ground
  c.fillStyle = C.ink; c.fillRect(-100, GROUND, W + 200, H);
  const gl = E.outExpo(rng(t, 0.0, 0.5)); c.fillStyle = C.cream; c.fillRect(CX - (W / 2 + 100) * gl, GROUND - 2, (W + 200) * gl, 6);
  c.fillStyle = rgba(C.cream, 0.5);
  for (let k = -1; k < 12; k++) { const x = ((k * 120 - gx) % 1440 + 1440) % 1440 - 120; c.fillRect(x, GROUND + 60, 60, 6); }
  for (let k = -1; k < 8; k++) { const x = ((k * 200 - gx * 1.6) % 1600 + 1600) % 1600 - 200; c.fillRect(x, GROUND + 180, 110, 10); }
  // big type behind the character
  c.font = F.anton(330); c.fillStyle = rgba(C.cream, 0.12); c.textAlign = 'center';
  let sec = SECT[0]; for (const s of SECT) if (t >= s[0]) sec = s;
  const word = { 'RIG / DROP-IN': 'HELLO', 'WALK CYCLE · IK': 'WALK', RUN: 'RUN', 'FRONT FLIP': 'FLIP', HELLO: 'HI!' }[sec[1]];
  c.save(); c.translate(CX, 760); c.scale(1, 1.6); c.fillText(word, 0, 100); c.restore(); c.textAlign = 'left';
  const p = getPose(t);
  c.save(); c.translate(CX, GROUND); c.scale(1.35, 1.35); c.translate(-CX, -GROUND); // hero scale
  // shadow
  const hh = clamp((GROUND - STAND_H - p.hip[1]) / 500, -0.3, 1);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(CX + 10, GROUND + 4, 150 * (1 - hh * 0.6), 18 * (1 - hh * 0.6), 0, 0, TAU); c.fill();
  // onion skins while running
  const on = rng(t, 1.6, 1.9) * (1 - rng(t, 2.9, 3.05));
  if (on > 0) for (let k = 3; k >= 1; k--) { c.save(); c.translate(-k * 70, 0); drawChar(c, getPose(t - k * 0.07), t, rgba(k === 1 ? C.lime : C.cream, on * 0.35 / k)); c.restore(); }
  // flip arc: trail of head positions
  if (t > TAKEOFF && t < LANDT + 0.4) {
    c.fillStyle = C.lime; const a = 1 - rng(t, LANDT, LANDT + 0.4);
    for (let tt = TAKEOFF; tt < Math.min(t, LANDT); tt += 0.02) {
      const q = getPose(tt), R = fk(q), piv = [q.hip[0] + Math.sin(q.tau) * 90, q.hip[1] - Math.cos(q.tau) * 90], cr = Math.cos(q.rot), sr = Math.sin(q.rot);
      const dx = R.head[0] - piv[0], dy = R.head[1] - piv[1]; c.globalAlpha = a * 0.8; c.beginPath(); c.arc(piv[0] + dx * cr - dy * sr, piv[1] + dx * sr + dy * cr, 7, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  }
  const R = drawChar(c, p, t);
  // joint debug dots (the rig showing through)
  const dbg = rng(t, 0.8, 1.0) * (1 - rng(t, 1.7, 1.9));
  if (dbg > 0 && !p.rot) {
    c.globalAlpha = dbg; c.fillStyle = C.lime; c.strokeStyle = C.ink; c.lineWidth = 3;
    [R.hip, R.sh, R.neck, ...R.legs.flatMap(l => [l.knee, l.ank]), ...R.arms.flatMap(a => [a.el, a.hand])].forEach(j => { c.beginPath(); c.arc(j[0], j[1], 10, 0, TAU); c.fill(); c.stroke(); });
    c.font = F.mono(26, 700); c.fillStyle = C.lime; c.fillText('IK', R.legs[0].knee[0] + 22, R.legs[0].knee[1]); c.globalAlpha = 1;
  }
  c.restore();
  // end title
  const tt = rng(t, 4.75, 5.2);
  if (tt > 0) {
    c.save(); c.beginPath(); c.rect(0, 160, W, 290); c.clip();
    c.font = F.serif(150); c.fillStyle = C.cream; c.textAlign = 'center'; c.fillText('made of code.', CX, 320 + (1 - E.outExpo(tt)) * 200); c.restore();
    c.font = F.mono(28, 700); c.fillStyle = rgba(C.cream, 0.85 * rng(t, 5.0, 5.3)); c.textAlign = 'center';
    c.fillText('14 joints · 2-bone IK · 0 keyframes', CX, 400); c.textAlign = 'left';
  }
  c.restore();
}
function hud(c, t, f) {
  const m = 48, L = 46; c.save(); c.fillStyle = C.cream; c.strokeStyle = C.cream; c.lineWidth = 3;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { c.beginPath(); c.moveTo(x, y + sy * L); c.lineTo(x, y); c.lineTo(x + sx * L, y); c.stroke(); }
  c.font = F.mono(22, 700); c.textBaseline = 'middle'; c.fillText('CLAUDE — CHARACTER RIG 01', 76, 84);
  c.textAlign = 'right'; c.fillText(`TC 00:00:${String(Math.floor(f / 60)).padStart(2, '0')}:${String(f % 60).padStart(2, '0')}`, W - 76, 84);
  let sec = SECT[0]; for (const s of SECT) if (t >= s[0]) sec = s; c.textAlign = 'left'; c.fillText(sec[1], 76, H - 84);
  c.globalAlpha = 0.25; c.fillRect(76, H - 122, W - 152, 2); c.globalAlpha = 1; c.fillRect(76, H - 123, (W - 152) * (t / DUR), 4);
  c.restore();
}
let GRAIN = [], VIG;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function init() {
  let s = 42; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let k = 0; k < 4; k++) { const g = mk(256, 256), x = g.getContext('2d'), id = x.createImageData(256, 256); for (let j = 0; j < id.data.length; j += 4) { const v = 128 + ((r() + r() + r()) / 3 - 0.5) * 220; id.data[j] = id.data[j + 1] = id.data[j + 2] = v; id.data[j + 3] = 255; } x.putImageData(id, 0, 0); GRAIN.push(x.createPattern(g, 'repeat')); }
  VIG = mk(W, H); const v = VIG.getContext('2d'), g = v.createRadialGradient(CX, CY, 420, CX, CY, 1200); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.36)'); v.fillStyle = g; v.fillRect(0, 0, W, H);
}
const cv = document.getElementById('c'), ctx = cv.getContext('2d'); let SUB, sctx;
window.DURATION = DUR;
// sound cues for the soundtrack: footfalls come straight from the gait phase
window.EVENTS = () => {
  const steps = []; let prev = null;
  for (let i = 0; i < INT.length - 1; i++) {
    const t = i * 0.001; if (t > 3.0) break; const g = GAIT(t), sf = gaitParams(g).sf, ph = INT[i][0];
    for (let k = 0; k < 2; k++) { const v = Math.floor(ph + k * 0.5); if (prev && v > prev[k] && g.amt > 0.15) steps.push([+t.toFixed(3), +(g.amt * (0.6 + 0.4 * g.run)).toFixed(2), k]); }
    prev = [0, 1].map(k => Math.floor(ph + k * 0.5));
  }
  return { steps, drop: 0.42, takeoff: TAKEOFF, land: LANDT, title: 4.75 };
};
window.renderFrame = (f, S = 4, shutter = 0.7) => {
  const t = f / FPS;
  if (S <= 1) scene(ctx, t);
  else { if (!SUB) { SUB = mk(W, H); sctx = SUB.getContext('2d'); } for (let k = 0; k < S; k++) { scene(sctx, t + (k / S) * shutter / FPS); ctx.globalAlpha = 1 / (k + 1); ctx.drawImage(SUB, 0, 0); } ctx.globalAlpha = 1; }
  ctx.drawImage(VIG, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.1; ctx.translate(-Math.floor(hash(f * 1.31) * 256), -Math.floor(hash(f * 2.77) * 256)); ctx.fillStyle = GRAIN[f % 4]; ctx.fillRect(0, 0, W + 256, H + 256); ctx.restore();
  hud(ctx, t, f);
};
window.READY = (async () => { await Promise.all(['400 100px Anton', '700 30px "JetBrains Mono"', 'italic 400 100px "Instrument Serif"'].map(f => document.fonts.load(f))); init(); return true; })();
if (!navigator.webdriver) { const t0 = performance.now(); READY.then(() => { const loop = () => { window.renderFrame(Math.floor(((performance.now() - t0) / 1000 % DUR) * FPS), 1); requestAnimationFrame(loop); }; loop(); }); }
