'use strict';
// ─────────────────────────────────────────────────────────────────────────────
//  CLAUDE — MOTION REEL 2026
//  15s · 1080×1920 · 60fps. Every frame is a pure function of time, so frames
//  can be rendered in any order, in parallel, with sub-frame motion blur.
// ─────────────────────────────────────────────────────────────────────────────
const W = 1080, H = 1920, CX = W / 2, CY = H / 2, FPS = 60, DUR = 15, TAU = Math.PI * 2;
const C = { ink: '#0B0B0E', cream: '#F2EDE4', red: '#FF3D1F', blue: '#2E4BFF', lime: '#CBFF2E' };
const PAL = [C.red, C.blue, C.lime, C.cream];
const F = {
  anton: s => `400 ${s}px Anton`,
  inter: (s, w = 900) => `${w} ${s}px "Inter Tight"`,
  mono: (s, w = 500) => `${w} ${s}px "JetBrains Mono"`,
  serif: (s, it = true) => `${it ? 'italic ' : ''}400 ${s}px "Instrument Serif"`,
};

// ── math ─────────────────────────────────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const rng = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  inCubic: x => x * x * x,
  outCubic: x => 1 - Math.pow(1 - x, 3),
  inOutCubic: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  inExpo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
  inOutExpo: x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outBack: x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  inBack: x => { const c1 = 1.70158, c3 = c1 + 1; return c3 * x * x * x - c1 * x * x; },
};
const hash = x => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const _rgb = {};
const rgb = h => _rgb[h] || (_rgb[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
function mix(a, b, f) { const A = rgb(a), B = rgb(b); f = clamp(f); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], f))).join(',')})`; }
const rgba = (h, a) => { const c = rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

// ── canvas utils ─────────────────────────────────────────────────────────────
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const meas = mk(8, 8).getContext('2d');
const _lay = new Map();
function layout(text, font, track = 0) {
  const k = text + '|' + font + '|' + track; let L = _lay.get(k); if (L) return L;
  meas.font = font; const g = []; let x = 0;
  for (const ch of text) { const w = meas.measureText(ch).width; g.push({ ch, x, w }); x += w + track; }
  L = { g, w: x - track, cap: meas.measureText('H').actualBoundingBoxAscent }; _lay.set(k, L); return L;
}
function fitSize(text, fontFn, target, trackEm = 0) { const L = layout(text, fontFn(100), trackEm * 100); return 100 * target / L.w; }
function bg(c, col) { c.fillStyle = col; c.fillRect(-W, -H, W * 3, H * 3); }
function path(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }
// letters rising out of a mask line
function riseText(c, text, font, x0, base, t, t0, stag, col, dur = 0.5, track = 0, align = 'left') {
  const L = layout(text, font, track); if (align === 'center') x0 -= L.w / 2;
  c.save(); c.beginPath(); c.rect(-W, base - L.cap * 1.25, W * 3, L.cap * 1.6); c.clip();
  c.font = font; c.fillStyle = col;
  L.g.forEach((g, i) => { const p = E.outExpo(rng(t, t0 + i * stag, t0 + i * stag + dur)); if (p > 0) c.fillText(g.ch, x0 + g.x, base + (1 - p) * L.cap * 1.4); });
  c.restore(); return L;
}
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';
function scramble(text, t, t0, per = 0.014, settle = 0.12) {
  let s = ''; let i = 0;
  for (const ch of text) {
    const ts = t0 + i * per;
    if (t < ts - settle) s += ' ';
    else if (t < ts || ch === ' ') s += ch === ' ' ? ' ' : GLYPHS[Math.floor(hash(i * 13.7 + Math.floor(t * 40)) * GLYPHS.length)];
    else s += ch;
    i++;
  }
  return s;
}

// ── global hits: drive shake, chromatic aberration, flashes ──────────────────
const IMPACTS = [[0.5, .25], [1.0, 1], [1.5, .4], [2.0, .45], [2.6, .3], [2.67, .3], [2.74, .3], [2.81, .45], [3.25, .7],
  [3.5, .22], [3.75, .22], [4.0, .22], [4.25, .22], [4.5, .9], [5.62, .3], [6.5, .45], [7.0, .4], [7.5, .4], [8.0, .3],
  [8.5, .22], [9.0, .45], [9.55, .25], [10.75, .35], [11.75, .5], [11.875, .35], [12.0, .5], [12.125, .35], [12.25, .5],
  [12.375, .35], [12.5, 1.0], [14.6, .2]];
const FLASHES = [[1.0, .35], [3.25, .2], [4.5, .12], [12.5, .4]];
function impactSum(t, decay) { let s = 0; for (const [ti, a] of IMPACTS) if (t >= ti && t < ti + 1) s += a * Math.exp(-(t - ti) * decay); return s; }

// ═════════════════════════════════════════════════════════════════════════════
//  00 · INTRO  (0 → 1.5)   dot → squash → stretch → split → panels → SHOW/REEL
// ═════════════════════════════════════════════════════════════════════════════
const SZ = {};
function sIntro(c, t) {
  bg(c, C.ink);
  if (t >= 0.98) {
    const font = F.anton(SZ.show), L1 = layout('SHOW', font), L2 = layout('REEL', font);
    const cap = L1.cap, gap = 40, top = CY - (cap * 2 + gap) / 2, b1 = top + cap, b2 = b1 + gap + cap;
    const z = 1 + 0.05 * E.outCubic(rng(t, 1.0, 1.5));
    c.save(); c.translate(CX, CY); c.scale(z, z); c.translate(-CX, -CY);
    const ech = E.outExpo(rng(t, 1.16, 1.5));
    if (ech > 0) {
      c.lineWidth = 3; c.font = font; c.strokeStyle = C.cream;
      for (let k = 4; k >= 1; k--) {
        const off = k * cap * 0.3 * ech; c.globalAlpha = (1 - k * 0.2) * ech;
        c.strokeText('SHOW', CX - L1.w / 2, b1 - off); c.strokeText('REEL', CX - L2.w / 2, b2 + off);
      }
      c.globalAlpha = 1;
    }
    riseText(c, 'SHOW', font, CX - L1.w / 2, b1, t, 1.0, 0.035, C.cream);
    riseText(c, 'REEL', font, CX - L2.w / 2, b2, t, 1.07, 0.035, C.cream);
    // editorial serif cutting across the heavy sans
    c.globalCompositeOperation = 'difference';
    riseText(c, 'selected work', F.serif(150), CX, b1 + gap / 2 + 48, t, 1.12, 0.018, C.cream, 0.45, 0, 'center');
    c.globalCompositeOperation = 'source-over';
    c.restore();
  }
  if (t < 1.45) {
    const pop = E.outBack(rng(t, 0.05, 0.28)), sq = E.inOutCubic(rng(t, 0.3, 0.5));
    c.fillStyle = C.cream;
    if (t < 0.5) {
      if (pop > 0) {
        const r = 17 * pop, sx = 1 + 0.6 * sq, sy = 1 - 0.45 * sq;
        c.save(); c.translate(CX, CY + r * 0.45 * sq); c.scale(sx, sy); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.restore();
      }
    } else {
      const st = E.outExpo(rng(t, 0.5, 0.72)), sp = E.inOutExpo(rng(t, 0.66, 0.92)), wd = E.inOutExpo(rng(t, 0.9, 1.02));
      const cols = [C.red, C.cream, C.blue], xs = [180, 540, 900];
      for (let k = 0; k < (sp > 0 ? 3 : 1); k++) {
        const kk = sp > 0 ? k : 1;
        const x = lerp(CX, xs[kk], sp), w = lerp(lerp(54, 12, st), 362, wd), h = lerp(19, H + 80, st);
        const so = E.inOutExpo(rng(t, 1.0 + kk * 0.05, 1.32 + kk * 0.05)), dir = kk % 2 ? 1 : -1;
        const y = CY + dir * so * (H + 100);
        c.fillStyle = kk === 1 ? C.cream : mix(C.cream, cols[kk], rng(t, 0.66, 0.8));
        c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, Math.min(w, h) / 2 * (1 - wd)); c.fill();
        // trailing hairlines on the slide-out
        if (so > 0 && so < 1) { c.fillStyle = rgba(C.cream, 0.5 * (1 - so)); c.fillRect(x - w / 2, y - dir * (h / 2 + 30), w, 3); }
      }
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  01 · KINETIC TYPE  (1.5 → 3.25)   I MAKE / THINGS / M◯VE → zoom through the O
// ═════════════════════════════════════════════════════════════════════════════
let ML; // MOVE layout
function sType(c, t) {
  const lt = t - 1.5;
  if (lt < 0.5) {
    bg(c, C.cream);
    const fs = SZ.make, tr = -0.03 * fs, font = F.inter(fs), L = layout('I  MAKE', font, tr);
    const base = CY + L.cap / 2 + 60, x0 = CX - L.w / 2, ex = E.inExpo(rng(lt, 0.4, 0.5));
    c.save(); c.translate(0, -ex * 900);
    riseText(c, "hi, i'm claude —", F.serif(84), CX, base - L.cap - 70, lt, 0.0, 0.012, C.ink, 0.45, 0, 'center');
    const ul = E.outExpo(rng(lt, 0.16, 0.42));
    c.fillStyle = C.red; c.fillRect(x0, base + 46, L.w * ul, 24);
    c.font = font; c.fillStyle = C.ink;
    L.g.forEach((g, i) => {
      const d = 0.02 + i * 0.03, p = E.outExpo(rng(lt, d, d + 0.42)); if (p <= 0) return;
      c.save(); c.translate(x0 + g.x + g.w / 2, base - ex * i * 70); c.rotate((1 - p) * (i % 2 ? 0.7 : -0.7)); c.translate(0, (1 - p) * 520);
      c.fillText(g.ch, -g.w / 2, 0); c.restore();
    });
    c.restore();
  } else if (lt < 1.0) {
    const lb = lt - 0.5; bg(c, C.ink);
    for (let k = 0; k < 12; k++) { // speed lines
      const y = 160 + hash(k * 3.3) * 1600, len = 200 + hash(k * 7.1) * 600, sp = 3000 + hash(k * 1.7) * 3500;
      const x = W + 300 - ((lb * sp + hash(k) * 2400) % (W + 1600));
      c.fillStyle = rgba(C.cream, 0.1 + 0.25 * hash(k * 2.2)); c.fillRect(x, y, len, 3);
    }
    const fs = SZ.things, font = F.anton(fs), L = layout('THINGS', font), sy = 1.55, capH = L.cap * sy;
    const mid = CY, x0 = CX - L.w / 2, ex = E.inExpo(rng(lb, 0.4, 0.5));
    for (let half = 0; half < 2; half++) {
      c.save(); c.beginPath(); if (half === 0) c.rect(-W, -H, 3 * W, mid + H); else c.rect(-W, mid, 3 * W, 2 * H); c.clip();
      c.translate((half ? 1 : -1) * ex * W * 1.2, 0); c.font = font;
      L.g.forEach((g, i) => {
        const d = i * 0.035; if (lb < d) return;
        const p = E.outExpo(rng(lb, d, d + 0.38)), s = lerp(2.6, 1, p), age = lb - d;
        c.save(); c.translate(x0 + g.x + g.w / 2, mid); c.scale(s, s * sy); c.globalAlpha = clamp(age / 0.04);
        c.fillStyle = age < 0.13 ? PAL[(i + Math.floor(age / 0.045)) % 3] : C.cream;
        c.fillText(g.ch, -g.w / 2, L.cap / 2); c.restore();
      });
      c.restore();
    }
    if (ex > 0) { c.fillStyle = C.red; c.fillRect(-W, mid - 3, 3 * W * ex, 6); }
  } else drawMove(c, t, lt - 1.0);
}
function drawMove(c, t, lc) {
  const M = ML, base = CY + M.cap / 2, x0 = CX - M.w / 2;
  const oi = M.items[1], Oc = [x0 + oi.x + oi.w / 2, base - M.cap / 2];
  const lz = rng(lc, 0.5, 0.75), rI = M.R * 0.66, zEnd = 1110 / rI;
  const z = Math.exp(Math.log(zEnd) * E.inCubic(lz)), pe = E.inOutCubic(lz);
  bg(c, C.blue);
  // little marquee label
  c.font = F.mono(28, 700); c.fillStyle = rgba(C.cream, 0.7); c.textAlign = 'center';
  if (lz === 0) c.fillText(scramble('SQUASH & STRETCH', lc, 0.3, 0.012), CX, base + 150);
  c.textAlign = 'left';
  c.save(); c.translate(lerp(Oc[0], CX, pe), lerp(Oc[1], CY, pe)); c.scale(z, z); c.translate(-Oc[0], -Oc[1]);
  M.items.forEach((it, i) => {
    const Li = 0.1 + i * 0.07; if (lc < Li - 0.17) return;
    let sy = 1, yoff = 0;
    if (lc < Li) { const f = E.inCubic(rng(lc, Li - 0.17, Li)); yoff = -(1 - f) * 1500; sy = 1 + 0.45 * f; }
    else { const x = lc - Li; sy = 1 - 0.42 * Math.exp(-x * 10) * Math.cos(x * 30); }
    const sx = 1 + (1 - sy) * 0.9, cxl = x0 + it.x + it.w / 2;
    if (lc >= Li && lc - Li < 0.3) { // impact rays
      const x = lc - Li, rp = E.outExpo(x / 0.3);
      c.strokeStyle = C.cream; c.lineCap = 'round'; c.lineWidth = 8 * (1 - rp) + 1;
      for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
        const a = (side < 0 ? Math.PI : 0) + side * (k - 1) * 0.42, r0 = it.w / 2 + 16 + rp * 80, r1 = r0 + 70 * (1 - rp);
        c.beginPath(); c.moveTo(cxl + Math.cos(a) * r0, base - 30 + Math.sin(a) * r0 * 0.6); c.lineTo(cxl + Math.cos(a) * r1, base - 30 + Math.sin(a) * r1 * 0.6); c.stroke();
      }
    }
    c.save(); c.translate(cxl, base + yoff); c.scale(sx, sy);
    if (it.ch === 'O') {
      c.save(); c.beginPath(); c.arc(0, -M.cap / 2, rI, 0, TAU); c.clip();
      c.translate(0, -M.cap / 2); c.scale(rI / 1110, rI / 1110); c.translate(-CX, -CY);
      sShape(c, t); c.restore();
      c.beginPath(); c.arc(0, -M.cap / 2, M.R, 0, TAU); c.arc(0, -M.cap / 2, rI, 0, TAU, true); c.fillStyle = C.cream; c.fill();
    } else { c.font = F.anton(M.fs); c.fillStyle = C.cream; c.fillText(it.ch, -it.w / 2, 0); }
    c.restore();
  });
  c.restore();
}

// ═════════════════════════════════════════════════════════════════════════════
//  02 · SHAPE  (3.25 → 4.5)   index-matched polygon morphs with echo trails
// ═════════════════════════════════════════════════════════════════════════════
const NS = 240, SHY = CY - 30, SHAPES = {};
function perimeter(verts, n) {
  const L = []; let tot = 0;
  for (let i = 0; i < verts.length; i++) { const a = verts[i], b = verts[(i + 1) % verts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); L.push(l); tot += l; }
  const out = []; let seg = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const d = k / n * tot; while (acc + L[seg] < d) { acc += L[seg]; seg++; }
    const a = verts[seg], b = verts[(seg + 1) % verts.length], f = (d - acc) / L[seg]; out.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f)]);
  }
  return out;
}
function initShapes() {
  const polar = fn => Array.from({ length: NS }, (_, i) => { const a = -Math.PI / 2 + i / NS * TAU, r = fn(a); return [Math.cos(a) * r, Math.sin(a) * r]; });
  SHAPES.circle = polar(() => 1);
  const s = 0.88; SHAPES.square = perimeter([[0, -s], [s, -s], [s, s], [-s, s], [-s, -s]], NS);
  SHAPES.tri = perimeter([[0, -1.18], [1.05, 0.66], [-1.05, 0.66]], NS);
  SHAPES.star = perimeter(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i / 10 * TAU, r = i % 2 ? 0.5 : 1.18; return [Math.cos(a) * r, Math.sin(a) * r]; }), NS);
  SHAPES.flower = polar(a => 1 + 0.16 * Math.cos(6 * (a + Math.PI / 2)));
}
const KF = [
  { t: -99, s: 'circle', col: C.red, rot: 0, name: 'CIRCLE' },
  { t: 3.5, s: 'square', col: C.blue, rot: Math.PI / 2, name: 'SQUARE' },
  { t: 3.75, s: 'tri', col: C.lime, rot: 4 * Math.PI / 3, name: 'TRIANGLE' },
  { t: 4.0, s: 'star', col: C.red, rot: 8 * Math.PI / 5, name: 'STAR' },
  { t: 4.25, s: 'flower', col: C.cream, rot: 2 * Math.PI, name: 'FLOWER' },
];
function shapeState(t) {
  let k = 0; for (let i = 1; i < KF.length; i++) if (t >= KF[i].t) k = i;
  const cur = KF[k], prev = KF[Math.max(0, k - 1)];
  const m = k === 0 ? 1 : E.inOutExpo(rng(t, cur.t, cur.t + 0.24));
  const r = k === 0 ? 1 : E.outBack(rng(t, cur.t, cur.t + 0.36));
  const punch = k === 0 ? 0 : Math.exp(-(t - cur.t) * 11) * 0.16;
  return {
    A: SHAPES[prev.s], B: SHAPES[cur.s], m, k, name: cur.name,
    rot: lerp(prev.rot, cur.rot, r) + t * 0.25,
    col: k === 0 ? cur.col : mix(prev.col, cur.col, rng(t, cur.t, cur.t + 0.14)),
    scale: 250 * (1 + punch + 0.025 * Math.sin(t * 9)),
  };
}
function shapePts(t) {
  const s = shapeState(t), cr = Math.cos(s.rot), sr = Math.sin(s.rot), out = new Array(NS);
  for (let i = 0; i < NS; i++) {
    const x = lerp(s.A[i][0], s.B[i][0], s.m) * s.scale, y = lerp(s.A[i][1], s.B[i][1], s.m) * s.scale;
    out[i] = [CX + x * cr - y * sr, SHY + x * sr + y * cr];
  }
  return { pts: out, s };
}
function marquee(c, text, y, size, off, alpha = 0.16, col = C.cream) {
  const font = F.anton(size), w = layout(text, font).w; c.font = font; c.strokeStyle = rgba(col, alpha); c.lineWidth = 2;
  for (let x = ((off % w) + w) % w - w; x < W; x += w) c.strokeText(text, x, y);
}
function sShape(c, t) {
  bg(c, C.ink);
  c.fillStyle = rgba(C.cream, 0.09);
  for (let y = 30; y < H; y += 60) for (let x = 30; x < W; x += 60) c.fillRect(x - 2, y - 2, 4, 4);
  marquee(c, 'SHAPE / FORM / ', 330, 210, -t * 300);
  marquee(c, 'MORPH / FLOW / ', 1780, 210, t * 300);
  c.save(); c.translate(CX, SHY); c.lineWidth = 2;
  c.rotate(t * 0.6); c.setLineDash([4, 14]); c.strokeStyle = rgba(C.cream, 0.35); c.beginPath(); c.arc(0, 0, 395, 0, TAU); c.stroke();
  c.rotate(-t * 1.4); c.setLineDash([70, 30]); c.strokeStyle = rgba(C.cream, 0.16); c.beginPath(); c.arc(0, 0, 445, 0, TAU); c.stroke();
  c.restore(); c.setLineDash([]);
  for (let k = 0; k < 3; k++) {
    const a = t * (1.6 + k * 0.5) + k * 2.1, r = k === 1 ? 445 : 395;
    c.fillStyle = PAL[k]; c.beginPath(); c.arc(CX + Math.cos(a) * r, SHY + Math.sin(a) * r, 10, 0, TAU); c.fill();
  }
  const { pts, s } = shapePts(t);
  if (s.k > 0) {
    const age = t - KF[s.k].t;
    if (age < 0.5) { const p = E.outExpo(age / 0.5); c.strokeStyle = s.col; c.globalAlpha = 1 - p; c.lineWidth = 12 * (1 - p) + 1; c.beginPath(); c.arc(CX, SHY, 260 + p * 460, 0, TAU); c.stroke(); c.globalAlpha = 1; }
  }
  c.lineWidth = 3;
  for (let k = 6; k >= 1; k--) {
    const tk = t - k * 0.028; c.globalAlpha = (1 - k / 7) * 0.6; c.strokeStyle = shapeState(tk).col; path(c, shapePts(tk).pts); c.stroke();
  }
  c.globalAlpha = 1; c.fillStyle = s.col; path(c, pts); c.fill();
  // editor handles
  c.lineWidth = 3; c.strokeStyle = C.ink; c.fillStyle = C.cream;
  for (let j = 0; j < NS; j += 30) { const p = pts[j]; c.fillRect(p[0] - 8, p[1] - 8, 16, 16); c.strokeRect(p[0] - 8, p[1] - 8, 16, 16); }
  const p0 = pts[0], p1 = pts[8];
  c.strokeStyle = C.cream; c.lineWidth = 2; c.beginPath(); c.moveTo(p0[0] - (p1[0] - p0[0]) * 6, p0[1] - (p1[1] - p0[1]) * 6); c.lineTo(p0[0] + (p1[0] - p0[0]) * 6, p0[1] + (p1[1] - p0[1]) * 6); c.stroke();
  const label = `shape.morph( ${s.name} )`, since = s.k ? t - KF[s.k].t : t - 3.25;
  c.font = F.mono(32, 500); c.fillStyle = rgba(C.cream, 0.85); c.textAlign = 'center';
  c.fillText(label.slice(0, 13) + label.slice(13, 13 + Math.max(0, Math.floor(since / 0.016))), CX, SHY + 540);
  c.textAlign = 'left';
}

// ═════════════════════════════════════════════════════════════════════════════
//  03/04 · PARTICLES + DIMENSION  (4.5 → 7.9)
//  One 2,000-particle system that flows: shatter → FLOW → sphere → torus → cube → grid
// ═════════════════════════════════════════════════════════════════════════════
const NP = 2000, PD = [], PCOL = [C.red, C.lime, C.blue, C.cream];
const GC = 6, GR = 10, GS = 150, GG = 10, GX0 = (W - (GC * GS + (GC - 1) * GG)) / 2, GY0 = (H - (GR * GS + (GR - 1) * GG)) / 2;
const tileCenter = ti => [GX0 + (ti % GC) * (GS + GG) + GS / 2, GY0 + Math.floor(ti / GC) * (GS + GG) + GS / 2];
function rotProj(x, y, z, ry, rx) {
  const c1 = Math.cos(ry), s1 = Math.sin(ry); const X = x * c1 + z * s1; let Z = -x * s1 + z * c1;
  const c2 = Math.cos(rx), s2 = Math.sin(rx); const Y = y * c2 - Z * s2; Z = y * s2 + Z * c2;
  const s = 1500 / (1500 + Z); return [CX + X * s, CY + Y * s, s];
}
const ROTY = t => t * 0.9 + 1.7 * E.inOutCubic(rng(t, 6.95, 7.4)) + 1.7 * E.inOutCubic(rng(t, 7.45, 7.8));
const ROTX = t => 0.35 + 0.2 * Math.sin(t * 1.1);
function pulse3d(t) { let s = 0; for (const b of [6.5, 7.0, 7.5]) if (t >= b) s += Math.exp(-(t - b) * 7); return s; }
function fExplode(p, t) {
  const tau = Math.max(0, t - 4.5), dx = p.o[0] - CX, dy = p.o[1] - SHY, r0 = Math.hypot(dx, dy), th0 = Math.atan2(dy, dx);
  const v = 700 + 1500 * p.h2, r = r0 + v * (1 - Math.exp(-2.4 * tau)) / 2.4;
  const th = th0 + (0.6 + 1.2 * p.h3) * tau + 0.5 * (1 - Math.exp(-3 * tau));
  return [CX + Math.cos(th) * r, SHY + Math.sin(th) * r, 1];
}
const fText = (p, t) => [p.tx + Math.sin(t * 5 + p.h1 * 30) * 1.2, p.ty + Math.cos(t * 4 + p.h2 * 30) * 1.2, 1.1];
function f3(p, t, v, R, ry, rx) { const k = R * (1 + 0.32 * pulse3d(t) * p.h5 * p.h5); return rotProj(v[0] * k, v[1] * k, v[2] * k, ry, rx); }
const fSphere = (p, t) => f3(p, t, p.sph, 370, ROTY(t), ROTX(t));
const fTorus = (p, t) => f3(p, t, p.tor, 1, ROTY(t), ROTX(t) + 0.9);
const fCube = (p, t) => f3(p, t, p.cub, 250, ROTY(t) + 0.6, ROTX(t) + 0.5);
const fGrid = p => [p.gx, p.gy, 1];
const TR = [
  { f: fText, s: p => 4.85 + 0.32 * p.h3, d: 0.5, arc: 1 },
  { f: fSphere, s: p => 5.95 + 0.3 * (p.tx / W), d: 0.45, arc: 0.6 },
  { f: fTorus, s: p => 6.97 + 0.1 * p.h1, d: 0.36, arc: 0.3 },
  { f: fCube, s: p => 7.47 + 0.1 * p.h2, d: 0.3, arc: 0.3 },
  { f: fGrid, s: p => 7.66 + 0.18 * p.row / 9 + 0.04 * p.h4, d: 0.28, arc: 0.2 },
];
function pPos(p, t) {
  let last = -1;
  for (let k = TR.length - 1; k >= 0; k--) if (t >= p.st[k] + TR[k].d) { last = k; break; }
  let pos = last < 0 ? fExplode(p, t) : TR[last].f(p, t);
  for (let k = last + 1; k < TR.length; k++) {
    const e0 = rng(t, p.st[k], p.st[k] + TR[k].d); if (e0 <= 0) break;
    const e = E.inOutCubic(e0), q = TR[k].f(p, t), dx = q[0] - pos[0], dy = q[1] - pos[1], a = Math.sin(Math.PI * e) * (p.h5 - 0.5) * TR[k].arc;
    pos = [pos[0] + dx * e - dy * a, pos[1] + dy * e + dx * a, lerp(pos[2], q[2], e)];
  }
  return pos;
}
function sampleText(text, font, n) {
  const cv = mk(W, H), x = cv.getContext('2d'); x.font = font; x.fillStyle = '#fff'; x.textAlign = 'center';
  const cap = layout(text, font).cap; x.fillText(text, CX, CY + cap / 2);
  const d = x.getImageData(0, 0, W, H).data, inside = (xx, y) => d[(Math.round(y) * W + Math.round(xx)) * 4 + 3] > 128;
  let m = 0; for (let y = 0; y < H; y += 3) for (let xx = 0; xx < W; xx += 3) if (inside(xx, y)) m++;
  const st = 3 * Math.sqrt(m / (n * 1.04)), pts = [], r0 = mulberry32(3); // even grid sized to n, jittered
  for (let y = st / 2; y < H; y += st) for (let xx = st / 2; xx < W; xx += st) { const px = xx + (r0() - .5) * st * .5, py = y + (r0() - .5) * st * .5; if (inside(px, py)) pts.push([px, py]); }
  const r = mulberry32(7); for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  return Array.from({ length: n }, (_, i) => pts[i % pts.length]);
}
function initParticles() {
  const sp = shapePts(4.5).pts, txt = sampleText('FLOW', F.anton(SZ.flow), NP);
  for (let i = 0; i < NP; i++) {
    const p = { h1: hash(i * 1.731 + .1), h2: hash(i * 7.31 + .2), h3: hash(i * 3.17 + .3), h4: hash(i * 9.13 + .4), h5: hash(i * 5.71 + .5) };
    const j = Math.floor(p.h4 * NS), rr = Math.sqrt(0.08 + 0.92 * p.h2);
    p.o = [CX + (sp[j][0] - CX) * rr, SHY + (sp[j][1] - SHY) * rr];
    [p.tx, p.ty] = txt[i];
    const y = 1 - 2 * (i + 0.5) / NP, r = Math.sqrt(1 - y * y), ph = i * 2.399963;
    p.sph = [Math.cos(ph) * r, y, Math.sin(ph) * r];
    const u = TAU * p.h1, v = TAU * p.h3; p.tor = [(290 + 120 * Math.cos(v)) * Math.cos(u), 120 * Math.sin(v), (290 + 120 * Math.cos(v)) * Math.sin(u)];
    const a = Math.round(p.h1 * 8) / 4 - 1, b = Math.round(p.h3 * 8) / 4 - 1, f = i % 6;
    p.cub = [[a, b, 1], [a, b, -1], [a, 1, b], [a, -1, b], [1, a, b], [-1, a, b]][f];
    const ti = i % (GC * GR); p.row = Math.floor(ti / GC); const [gx, gy] = tileCenter(ti);
    p.gx = gx + (p.h2 - 0.5) * GS * 0.8; p.gy = gy + (p.h5 - 0.5) * GS * 0.8;
    p.ci = p.h5 < 0.1 ? 0 : p.h5 < 0.17 ? 1 : p.h5 < 0.25 ? 2 : 3;
    p.st = TR.map(tr => tr.s(p));
    PD.push(p);
  }
}
function drawParticles(c, t) {
  const B = Array.from({ length: 12 }, () => []);
  for (const p of PD) {
    if (t > 7.9 && rng(t, p.st[4] + 0.26, p.st[4] + 0.4) > p.h1) continue; // dissolve into tiles
    const a = pPos(p, t), b = pPos(p, t - 1 / 110), s = a[2], db = s < 0.88 ? 0 : s < 1.05 ? 1 : 2;
    B[p.ci * 3 + db].push(b[0], b[1], a[0], a[1]);
  }
  c.lineCap = 'round';
  for (let k = 0; k < 12; k++) {
    const arr = B[k]; if (!arr.length) continue;
    c.strokeStyle = PCOL[(k / 3) | 0]; c.globalAlpha = [0.4, 0.78, 1][k % 3]; c.lineWidth = [3, 4.4, 6][k % 3];
    c.beginPath(); for (let j = 0; j < arr.length; j += 4) { c.moveTo(arr[j], arr[j + 1]); c.lineTo(arr[j + 2] + 0.01, arr[j + 3]); } c.stroke();
  }
  c.globalAlpha = 1;
}
function ring3d(c, t, R, tx, tz, col, prog, w) {
  if (prog <= 0) return; c.beginPath(); const n = 120, ry = ROTY(t) * 0.5, rx = ROTX(t);
  for (let k = 0; k <= n * prog; k++) {
    const a = k / n * TAU, x = Math.cos(a) * R, z = Math.sin(a) * R;
    const y2 = -z * Math.sin(tx), z2 = z * Math.cos(tx), x3 = x * Math.cos(tz) - y2 * Math.sin(tz), y3 = x * Math.sin(tz) + y2 * Math.cos(tz);
    const P = rotProj(x3, y3, z2, ry, rx); k ? c.lineTo(P[0], P[1]) : c.moveTo(P[0], P[1]);
  }
  c.strokeStyle = col; c.lineWidth = w; c.stroke();
}
function sParticles(c, t, bgc = C.ink) {
  bg(c, bgc);
  const g = c.createRadialGradient(CX, CY, 0, CX, CY, 900); g.addColorStop(0, 'rgba(46,75,255,0.25)'); g.addColorStop(1, 'rgba(46,75,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (t > 4.5 && t < 5.0) { const p = E.outExpo((t - 4.5) / 0.5); c.strokeStyle = C.cream; c.globalAlpha = 1 - p; c.lineWidth = 16 * (1 - p); c.beginPath(); c.arc(CX, SHY, 200 + p * 900, 0, TAU); c.stroke(); c.globalAlpha = 1; }
  if (t > 6.2) {
    c.save(); c.translate(110, CY); c.rotate(-Math.PI / 2); marquee(c, 'DIMENSION — ', 70, 170, -t * 200, 0.14 * rng(t, 6.2, 6.5)); c.restore();
    const pr = E.outExpo(rng(t, 6.3, 6.9)) * (1 - E.inOutCubic(rng(t, 7.55, 7.8)));
    ring3d(c, t, 500, 1.2, 0.3, C.blue, pr, 4); ring3d(c, t, 565, 1.4, -0.5, C.red, pr, 2.5); ring3d(c, t, 630, 0.25, 1.1, rgba(C.cream, 0.35), pr, 1.5);
  }
  drawParticles(c, t);
  c.font = F.mono(28, 500); c.fillStyle = rgba(C.cream, 0.75); c.textAlign = 'center';
  if (t > 5.3 && t < 5.95) c.fillText(scramble('n = 2,000 particles  ·  curl  ·  arc paths', t, 5.32, 0.008), CX, CY + 340);
  if (t > 6.45 && t < 7.7) {
    const nm = t < 6.97 ? 'sphere( r=370 )' : t < 7.47 ? 'torus( 290, 120 )' : 'cube( lattice=9 )';
    c.fillText(nm, CX, CY + 640);
    c.fillStyle = rgba(C.cream, 0.45); c.font = F.mono(24, 500);
    c.fillText(`rotY ${((ROTY(t) * 57.2958) % 360).toFixed(1).padStart(5, '0')}°   rotX ${(ROTX(t) * 57.2958).toFixed(1)}°   fov 50`, CX, CY + 690);
  }
  c.textAlign = 'left';
}

// ═════════════════════════════════════════════════════════════════════════════
//  05 · RHYTHM  (7.9 → 9.55)   Bauhaus tile grid · diagonal + radial flip waves
// ═════════════════════════════════════════════════════════════════════════════
const TILES = [];
function initTiles() {
  const words = { 4: 'MOTION', 5: 'DESIGN' };
  for (let ti = 0; ti < GC * GR; ti++) {
    const col = ti % GC, row = (ti / GC) | 0, h = k => hash(ti * 17.3 + k * 3.1);
    const b1 = [C.red, C.blue, C.lime, C.ink][Math.floor(h(4) * 4)];
    TILES.push({
      h: h(9), r0: Math.floor(h(8) * 4),
      faces: [
        { bg: C.cream, fg: [C.red, C.blue, C.ink, C.red, C.blue][Math.floor(h(1) * 5)], kind: Math.floor(h(2) * 9) },
        { bg: b1, fg: b1 === C.lime ? C.ink : C.cream, kind: Math.floor(h(5) * 9) },
        words[row] ? { bg: C.cream, fg: C.ink, letter: words[row][col] } : { bg: (col + row) % 2 ? C.red : C.blue, fg: rgba(C.cream, 0.9), kind: [0, 1, 6, 2][Math.floor(h(6) * 4)] },
      ],
    });
  }
}
function drawTile(c, S, f, rot, radius, ga) {
  const h = S / 2; c.beginPath(); c.roundRect(-h, -h, S, S, radius); c.fillStyle = f.bg; c.fill();
  if (ga <= 0) return;
  c.save(); c.clip(); c.globalAlpha *= ga; c.fillStyle = f.fg;
  if (f.letter) { c.font = F.anton(S * 0.8); c.textAlign = 'center'; c.fillText(f.letter, 0, S * 0.3); c.restore(); return; }
  c.rotate(rot); c.beginPath();
  switch (f.kind) {
    case 0: c.moveTo(-h, -h); c.arc(-h, -h, S, 0, Math.PI / 2); c.closePath(); break;
    case 1: c.arc(0, h, h, Math.PI, TAU); break;
    case 2: c.arc(0, 0, S * 0.34, 0, TAU); break;
    case 3: c.arc(0, 0, S * 0.4, 0, TAU); c.arc(0, 0, S * 0.2, 0, TAU, true); break;
    case 4: c.moveTo(-h, -h); c.lineTo(h, -h); c.lineTo(-h, h); c.closePath(); break;
    case 5: for (let k = 0; k < 3; k++) c.rect(-h, -h + S * (k * 2 + 0.5) / 6, S, S / 6); break;
    case 6: c.moveTo(-h, -h); c.arc(-h, -h, h, 0, Math.PI / 2); c.closePath(); c.moveTo(h, h); c.arc(h, h, h, Math.PI, Math.PI * 1.5); c.closePath(); break;
    case 7: c.rect(-S * 0.1, -S * 0.34, S * 0.2, S * 0.68); c.rect(-S * 0.34, -S * 0.1, S * 0.68, S * 0.2); break;
    default: c.moveTo(-h, -h); c.arc(-h, 0, h, -Math.PI / 2, Math.PI / 2); c.closePath(); c.moveTo(h, h); c.arc(h, 0, h, Math.PI / 2, Math.PI * 1.5); c.closePath();
  }
  c.fill(); c.restore();
}
function sGrid(c, t) {
  bg(c, C.ink);
  c.fillStyle = rgba(C.cream, 0.06);
  for (let k = 0; k <= GC; k++) c.fillRect(GX0 + k * (GS + GG) - GG / 2 - 1, 0, 2, H);
  for (let k = 0; k <= GR; k++) c.fillRect(0, GY0 + k * (GS + GG) - GG / 2 - 1, W, 2);
  const melt = E.inOutCubic(rng(t, 9.36, 9.55));
  for (let ti = 0; ti < GC * GR; ti++) {
    const col = ti % GC, row = (ti / GC) | 0, T = TILES[ti], [x, y] = tileCenter(ti);
    const a = 7.92 + 0.18 * row / 9 + 0.03 * col, pop = E.outBack(rng(t, a, a + 0.3)); if (pop <= 0) continue;
    const d1 = 8.45 + (col + row) * 0.02, d2 = 8.8 + Math.hypot(col - 2.5, row - 4.5) * 0.03;
    const e1 = E.inOutCubic(rng(t, d1, d1 + 0.22)), e2 = E.inOutCubic(rng(t, d2, d2 + 0.22));
    let st = 0, fe = 0; if (e2 > 0) { fe = e2; st = e2 >= 0.5 ? 2 : 1; } else if (e1 > 0) { fe = e1; st = e1 >= 0.5 ? 1 : 0; }
    const fx = Math.abs(Math.cos(Math.PI * fe)), m = lerp(1, 0.6, melt);
    const rot = (T.r0 + E.outBack(rng(t, 8.2 + col * 0.02, 8.42 + col * 0.02)) + E.outBack(rng(t, 8.62 + row * 0.012, 8.84 + row * 0.012))) * Math.PI / 2;
    c.save(); c.translate(x, y + E.inCubic(melt) * 80 * (0.5 + T.h)); c.scale(pop * fx * m, pop * (1 + 0.12 * Math.sin(Math.PI * fe)) * m);
    drawTile(c, GS, T.faces[st], rot, lerp(0, GS / 2, melt), 1 - melt);
    if (fe > 0 && fe < 1) { c.fillStyle = `rgba(0,0,0,${Math.sin(Math.PI * fe) * 0.35})`; c.fillRect(-GS / 2, -GS / 2, GS, GS); }
    c.restore();
  }
  if (t < 8.45) drawParticles(c, t);
}

// ═════════════════════════════════════════════════════════════════════════════
//  06 · FLUID  (9.55 → 10.75)   metaballs: blur → alpha threshold, colours bleed
// ═════════════════════════════════════════════════════════════════════════════
let GA, gactx, GB, gbctx;
function goo(c, blobs) {
  const w = W / 2, h = H / 2; gactx.clearRect(0, 0, w, h);
  for (const b of blobs) { gactx.fillStyle = b[3]; gactx.beginPath(); gactx.arc(b[0] / 2, b[1] / 2, Math.max(0, b[2] / 2), 0, TAU); gactx.fill(); }
  gbctx.clearRect(0, 0, w, h); gbctx.filter = 'blur(11px)'; gbctx.drawImage(GA, 0, 0); gbctx.filter = 'none';
  const id = gbctx.getImageData(0, 0, w, h), d = id.data;
  for (let j = 3; j < d.length; j += 4) { const a = d[j]; d[j] = a < 108 ? 0 : a > 138 ? 255 : (a - 108) * 8.5; }
  gbctx.putImageData(id, 0, 0);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(GB, 0, 0, W, H);
}
function attractor(k, t) {
  const a = hash(k * 4.1), b = hash(k * 2.3), conv = E.inOutCubic(rng(t, 10.3, 10.6));
  const x = CX + Math.sin(t * (0.9 + a * 1.4) + k * 1.7) * (140 + 250 * b), y = CY + Math.sin(t * (0.8 + b) + k * 2.9) * (260 + 420 * a);
  return [lerp(x, CX, conv), lerp(y, CY, conv)];
}
const beatPulse = t => Math.exp(-(((t % 0.5) + 0.5) % 0.5) * 8);
function sFluid(c, t) {
  bg(c, C.ink);
  c.fillStyle = rgba(C.cream, 0.07);
  for (let y = 30; y < H; y += 60) for (let x = 30; x < W; x += 60) c.fillRect(x - 2, y - 2, 4, 4);
  const blobs = [];
  for (let i = 0; i < GC * GR; i++) {
    const T = TILES[i], [tx, ty] = tileCenter(i), sx = tx, sy = ty + 80 * (0.5 + T.h), k = i % 12;
    const s0 = 9.55 + 0.25 * T.h, e = E.inOutCubic(rng(t, s0, s0 + 0.55)), A = attractor(k, t), ang = T.h * TAU + t * 2;
    const x = lerp(sx, A[0] + Math.cos(ang) * 24, e), y = lerp(sy, A[1] + Math.sin(ang) * 24, e) + (1 - e) * e * 120;
    blobs.push([x, y, lerp(45, 36 + 34 * hash(k * 5.5), e) * (1 + 0.18 * beatPulse(t) * e), T.faces[2].bg]);
  }
  const fr = 1260 * E.inExpo(rng(t, 10.45, 10.75));
  if (fr > 0) blobs.push([CX, CY, fr, C.cream]);
  goo(c, blobs);
  const ta = rng(t, 9.62, 9.85) * (1 - rng(t, 10.4, 10.55));
  if (ta > 0) {
    c.save(); c.globalCompositeOperation = 'difference'; c.globalAlpha = ta;
    const font = F.serif(380), L = layout('fluid', font), x0 = CX - L.w / 2; c.font = font; c.fillStyle = C.cream;
    L.g.forEach((g, i) => c.fillText(g.ch, x0 + g.x, CY + 110 + Math.sin(t * 5 + i * 0.9) * 16 + (1 - E.outExpo(rng(t, 9.62 + i * 0.03, 10.0))) * 120));
    c.font = F.mono(28, 500); c.textAlign = 'center'; c.fillText(scramble('metaballs · blur → threshold · 60 nodes', t, 9.75, 0.008), CX, CY + 330);
    c.restore();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  07 · TIMING  (10.75 → 11.75)   the graph editor, spacing chart, the flex
// ═════════════════════════════════════════════════════════════════════════════
function cubicBez(x1, y1, x2, y2) {
  return x => { let lo = 0, hi = 1, s = x; for (let k = 0; k < 24; k++) { s = (lo + hi) / 2; const bx = 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s; if (bx < x) lo = s; else hi = s; } return 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s; };
}
const EZ = cubicBez(0.83, 0, 0.17, 1);
function sEase(c, t) {
  const lt = t - 10.75; bg(c, C.cream);
  const gx = 170, gy = 590, gs = 700, X = u => gx + u * gs, Y = v => gy + gs - v * gs;
  riseText(c, 'Timing', F.serif(210), CX, 380, lt, 0.0, 0.025, C.ink, 0.45, 0, 'center');
  riseText(c, 'is everything.', F.serif(92), CX, 480, lt, 0.1, 0.012, C.ink, 0.45, 0, 'center');
  const gp = E.outExpo(rng(lt, 0, 0.3));
  c.fillStyle = rgba(C.ink, 0.1);
  for (let k = 1; k < 4; k++) { c.fillRect(X(k / 4) - 1, Y(0), 2, -gs * gp); c.fillRect(X(0), Y(k / 4) - 1, gs * gp, 2); }
  c.fillStyle = C.ink; c.fillRect(X(0) - 2, Y(0), 4, -gs * gp); c.fillRect(X(0), Y(0) - 2, gs * gp, 4);
  const hp = E.outBack(rng(lt, 0.1, 0.35));
  if (hp > 0) {
    const P1 = [lerp(X(0), X(0.83), hp), Y(0)], P2 = [lerp(X(1), X(0.17), hp), Y(1)];
    c.strokeStyle = C.blue; c.lineWidth = 3;
    c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(P1[0], P1[1]); c.moveTo(X(1), Y(1)); c.lineTo(P2[0], P2[1]); c.stroke();
    c.fillStyle = C.blue; for (const P of [P1, P2]) { c.beginPath(); c.arc(P[0], P[1], 15 * clamp(hp, 0, 1.2), 0, TAU); c.fill(); }
  }
  const cp = E.outExpo(rng(lt, 0.05, 0.4));
  c.strokeStyle = C.red; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath();
  for (let k = 0; k <= 140 * cp; k++) { const u = k / 140; k ? c.lineTo(X(u), Y(EZ(u))) : c.moveTo(X(u), Y(EZ(u))); }
  c.stroke();
  c.fillStyle = C.ink; for (const [u, v] of [[0, 0], [1, 1]]) c.fillRect(X(u) - 10, Y(v) - 10, 20, 20);
  // value track (right) + spacing chart (bottom)
  const vx = X(1) + 80, sy = Y(0) + 150, tp = E.outExpo(rng(lt, 0.15, 0.45));
  c.fillStyle = rgba(C.ink, 0.25); c.fillRect(vx - 1, Y(0), 3, -gs * tp); c.fillRect(X(0), sy - 1, gs * tp, 3);
  const bu = rng(lt, 0.3, 0.82), bv = EZ(bu);
  for (let k = 0; k <= 16; k++) {
    const uk = k / 16; if (uk > bu + 1e-6 || lt < 0.3) break; const vk = EZ(uk);
    c.fillStyle = rgba(C.ink, 0.35); c.beginPath(); c.arc(X(vk), sy, 9, 0, TAU); c.fill();
    c.beginPath(); c.arc(X(uk), Y(vk), 5, 0, TAU); c.fill(); c.fillRect(vx - 12, Y(vk) - 1.5, 24, 3);
  }
  const bp = E.outBack(rng(lt, 0.0, 0.2)), land = lt - 0.82, sq = land > 0 ? 0.35 * Math.exp(-land * 12) * Math.cos(land * 34) : 0;
  c.fillStyle = C.red;
  c.beginPath(); c.arc(X(bu), Y(bv), 20 * bp, 0, TAU); c.fill();
  c.beginPath(); c.arc(vx, Y(bv), 24 * bp, 0, TAU); c.fill();
  c.save(); c.translate(X(bv), sy); c.scale(1 + sq, 1 - sq); c.beginPath(); c.arc(0, 0, 32 * bp, 0, TAU); c.fill(); c.restore();
  c.font = F.mono(24, 700); c.fillStyle = rgba(C.ink, 0.55);
  c.fillText('TIME →', X(1) - 90, Y(0) + 44); c.save(); c.translate(X(0) - 26, Y(1) + 110); c.rotate(-Math.PI / 2); c.fillText('VALUE →', 0, 0); c.restore();
  c.fillText('0f', X(0) - 8, sy + 52); c.fillText('24f', X(1) - 22, sy + 52);
  const code = 'cubic-bezier(.83, 0, .17, 1)';
  c.font = F.mono(38, 700); c.fillStyle = C.ink; c.textAlign = 'center';
  c.fillText(code.slice(0, Math.floor(rng(lt, 0.15, 0.5) * code.length)) + (lt % 0.2 < 0.1 ? '▌' : ' '), CX, sy + 150);
  c.textAlign = 'left';
}

// ═════════════════════════════════════════════════════════════════════════════
//  08 · RECAP  (11.75 → 12.5)   six cuts at 1/16 notes
// ═════════════════════════════════════════════════════════════════════════════
const invert = c => { c.globalCompositeOperation = 'difference'; c.fillStyle = '#fff'; c.fillRect(-W, -H, 3 * W, 3 * H); c.globalCompositeOperation = 'source-over'; };
const MONT = [
  { w: 'CRAFT', sub: 'obsessive.', bg: C.red, fg: C.ink },
  { f: (c, l) => { sShape(c, 4.06 + l); invert(c); } },
  { w: 'TASTE', sub: 'opinionated.', bg: C.lime, fg: C.ink },
  { f: (c, l) => sParticles(c, 6.75 + l, C.blue) },
  { w: 'DETAIL', sub: 'every frame.', bg: C.cream, fg: C.ink },
  { f: (c, l) => sGrid(c, 9.2 + l) },
];
function sMontage(c, t) {
  const lt = t - 11.75, k = Math.min(5, Math.floor(lt / 0.125)), l2 = lt - k * 0.125, M = MONT[k];
  bg(c, C.ink);
  c.save(); const z = 1.1 - 0.1 * E.outCubic(l2 / 0.125); c.translate(CX, CY); c.scale(z, z); c.rotate((k % 2 ? 1 : -1) * 0.03); c.translate(-CX, -CY);
  if (M.w) {
    bg(c, M.bg); const font = F.anton(SZ['m' + M.w]), L = layout(M.w, font);
    c.save(); c.translate(CX, CY); c.scale(1, 1.75); c.font = font; c.fillStyle = M.fg; c.fillText(M.w, -L.w / 2, L.cap / 2); c.restore();
    c.font = F.serif(110); c.fillStyle = M.fg; c.textAlign = 'center'; c.fillText(M.sub, CX, CY + L.cap * 0.875 + 150); c.textAlign = 'left';
  } else M.f(c, l2);
  c.restore();
  c.font = F.mono(30, 700); c.fillStyle = k % 2 || k === 0 ? C.cream : C.ink; c.fillStyle = (M.bg === C.lime || M.bg === C.cream || k === 1) ? C.ink : C.cream;
  c.fillText(`${String(k + 1).padStart(2, '0')}/06`, CX - 50, 240);
}

// ═════════════════════════════════════════════════════════════════════════════
//  09 · CONTACT  (12.5 → 15)   box-reveal name card → collapse to the dot (loops)
// ═════════════════════════════════════════════════════════════════════════════
function sOutro(c, t) {
  const lt = t - 12.5; bg(c, C.ink);
  const sc = 1 - E.inBack(rng(t, 14.28, 14.55));
  if (sc > 0.002) {
    c.save(); c.translate(CX, CY); c.scale(sc, sc); c.translate(-CX, -CY);
    for (let k = 1; k < 12; k++) { const p = E.outExpo(rng(lt, 0.02 * k, 0.6 + 0.02 * k)); c.fillStyle = rgba(C.cream, 0.07); c.fillRect(k * W / 12 - 1, CY - H / 2 * p, 2, H * p); }
    const gp = E.outExpo(rng(lt, 0.1, 0.9)); c.save(); c.translate(CX, CY - 40); c.rotate(lt * 0.15); c.setLineDash([3, 12]); c.strokeStyle = rgba(C.cream, 0.18); c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, 520 * gp, 0, TAU); c.stroke(); c.restore(); c.setLineDash([]);
    marquee(c, 'MOTION REEL 2026 — ', 360, 150, -lt * 120, 0.1 * rng(lt, 0.2, 0.6));
    marquee(c, 'AVAILABLE NOW — ', 1720, 150, lt * 120, 0.1 * rng(lt, 0.2, 0.6));
    const fs = SZ.name, tr = -0.035 * fs, font = F.inter(fs), L = layout('CLAUDE', font, tr), base = CY - 30, x0 = CX - L.w / 2;
    riseText(c, "let's make things move.", F.serif(70), CX, base - L.cap - 90, lt, 0.5, 0.01, rgba(C.cream, 0.85), 0.5, 0, 'center');
    c.font = font;
    L.g.forEach((g, i) => {
      const s0 = 0.02 + i * 0.05, a = E.outExpo(rng(lt, s0, s0 + 0.14)), b = E.inExpo(rng(lt, s0 + 0.14, s0 + 0.28));
      if (lt >= s0 + 0.14) { c.fillStyle = C.cream; c.fillText(g.ch, x0 + g.x, base); }
      const bx = x0 + g.x - 6, bw = g.w + 12, top = base - L.cap - 16, bh = L.cap + 32;
      if (a > 0 && b < 1) { c.fillStyle = PAL[i % 3]; c.fillRect(bx + bw * b, top, bw * (a - b), bh); }
    });
    c.fillStyle = C.red; c.fillRect(x0, base + 36, L.w * E.outExpo(rng(lt, 0.36, 0.7)), 14);
    riseText(c, 'Motion Designer', F.serif(128), CX, base + 200, lt, 0.38, 0.015, C.cream, 0.5, 0, 'center');
    c.font = F.mono(28, 500); c.fillStyle = rgba(C.cream, 0.7); c.textAlign = 'center';
    c.fillText(scramble('KINETIC TYPE · GENERATIVE · 3D · FLUID', lt, 0.55, 0.012), CX, base + 300);
    c.textAlign = 'left';
    const pp = E.outBack(rng(lt, 0.85, 1.15));
    if (pp > 0) {
      c.save(); c.translate(CX, base + 450); c.scale(pp, pp);
      c.fillStyle = C.lime; c.beginPath(); c.roundRect(-290, -60, 580, 120, 60); c.fill();
      c.fillStyle = C.red; c.globalAlpha = 0.55 + 0.45 * Math.cos(lt * 9); c.beginPath(); c.arc(-226, 0, 12, 0, TAU); c.fill(); c.globalAlpha = 1;
      c.font = F.inter(36, 800); c.fillStyle = C.ink; c.fillText('AVAILABLE FOR HIRE', -192, 13);
      const ax = 196 + 10 * beatPulse(t); c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = C.ink;
      c.beginPath(); c.moveTo(ax, 0); c.lineTo(ax + 50, 0); c.moveTo(ax + 32, -18); c.lineTo(ax + 50, 0); c.lineTo(ax + 32, 18); c.stroke();
      c.restore();
    }
    c.restore();
  }
  if (t >= 14.42) {
    const dp = E.outBack(rng(t, 14.42, 14.6)), sq = E.inOutCubic(rng(t, 14.66, 14.78)), out = E.inBack(rng(t, 14.78, 14.9));
    const r = 17 * dp * (1 - out);
    if (r > 0) { c.save(); c.translate(CX, CY); c.scale(1 + 0.5 * sq, 1 - 0.4 * sq); c.fillStyle = C.cream; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.restore(); }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  timeline, HUD, post
// ═════════════════════════════════════════════════════════════════════════════
function scene(c, t) {
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.setLineDash([]);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.lineCap = 'butt'; c.lineJoin = 'miter';
  const s = impactSum(t, 12);
  c.translate(CX + vnoise(t * 38) * s * 24, CY + vnoise(t * 38 + 77) * s * 24); c.rotate(vnoise(t * 21 + 33) * s * 0.012); c.translate(-CX, -CY);
  if (t < 1.5) sIntro(c, t);
  else if (t < 3.25) sType(c, t);
  else if (t < 4.5) sShape(c, t);
  else if (t < 7.9) sParticles(c, t);
  else if (t < 9.55) sGrid(c, t);
  else if (t < 10.75) sFluid(c, t);
  else if (t < 11.75) sEase(c, t);
  else if (t < 12.5) sMontage(c, t);
  else sOutro(c, t);
  c.restore();
}
const SECTIONS = [[1.5, '01', 'KINETIC TYPE'], [3.25, '02', 'SHAPE'], [4.5, '03', 'PARTICLES'], [6.2, '04', 'DIMENSION'], [7.9, '05', 'RHYTHM'],
  [9.55, '06', 'FLUID'], [10.75, '07', 'TIMING'], [11.75, '08', 'RECAP'], [12.5, '09', 'CONTACT']];
function lightBg(t) {
  if (t >= 1.5 && t < 2.0) return true;
  if (t >= 10.75 && t < 11.75) return true;
  if (t >= 11.75 && t < 12.5) { const k = Math.floor((t - 11.75) / 0.125); return k === 0 || k === 1 || k === 2 || k === 4; }
  return false;
}
function hud(c, t, f) {
  const a = rng(t, 1.5, 1.7) * (1 - rng(t, 14.2, 14.4)); if (a <= 0) return;
  const col = lightBg(t) ? C.ink : C.cream, m = 48, L = 46;
  c.save(); c.globalAlpha = a; c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 3;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { c.beginPath(); c.moveTo(x, y + sy * L); c.lineTo(x, y); c.lineTo(x + sx * L, y); c.stroke(); }
  c.font = F.mono(22, 700); c.textBaseline = 'middle';
  c.fillText('CLAUDE — MOTION REEL ’26', 76, 84);
  const ff = f % 60, ss = Math.floor(f / 60);
  c.textAlign = 'right'; c.fillText(`TC 00:00:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`, W - 76, 84);
  let sec = SECTIONS[0]; for (const s of SECTIONS) if (t >= s[0]) sec = s;
  const bi = Math.floor(t * 2), bp = Math.exp(-(t * 2 - bi) * 6);
  c.fillText('120 BPM', W - 108, H - 84);
  c.beginPath(); c.arc(W - 86, H - 84, 6 + 4 * bp, 0, TAU); c.globalAlpha = a * (0.4 + 0.6 * bp); c.fill(); c.globalAlpha = a;
  c.textAlign = 'left'; c.fillText(scramble(`${sec[1]} / ${sec[2]}`, t, sec[0], 0.02, 0.1), 76, H - 84);
  c.globalAlpha = a * 0.25; c.fillRect(76, H - 122, W - 152, 2); c.globalAlpha = a; c.fillRect(76, H - 123, (W - 152) * (t / DUR), 4);
  c.restore();
}
let VIG, GRAINPAT = [], TMP, CH = [];
function rgbSplit(c, a) {
  const src = c.canvas, cols = ['#ff0000', '#00ff00', '#0000ff'];
  CH.forEach((cv, i) => { const x = cv.getContext('2d'); x.globalCompositeOperation = 'copy'; x.drawImage(src, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = cols[i]; x.fillRect(0, 0, W, H); });
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'copy'; c.drawImage(CH[1], 0, 0);
  c.globalCompositeOperation = 'lighter'; c.drawImage(CH[0], -a, 0); c.drawImage(CH[2], a, 0); c.restore();
}
function post(c, t, f) {
  const ca = impactSum(t, 9) * 10; if (ca > 0.8) rgbSplit(c, ca);
  let fl = 0; for (const [ti, a] of FLASHES) if (t >= ti && t < ti + 0.3) fl += a * Math.exp(-(t - ti) * 18);
  if (fl > 0.01) { c.fillStyle = `rgba(255,255,255,${fl})`; c.fillRect(0, 0, W, H); }
  c.drawImage(VIG, 0, 0);
  c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.11;
  c.translate(-Math.floor(hash(f * 1.31) * 256), -Math.floor(hash(f * 2.77) * 256)); c.fillStyle = GRAINPAT[f % GRAINPAT.length]; c.fillRect(0, 0, W + 256, H + 256);
  c.restore();
}
function init() {
  SZ.show = fitSize('SHOW', F.anton, 860);
  SZ.make = fitSize('I  MAKE', s => F.inter(s), 960, -0.03);
  SZ.things = fitSize('THINGS', F.anton, 960);
  SZ.flow = fitSize('FLOW', F.anton, 920);
  SZ.name = fitSize('CLAUDE', s => F.inter(s), 940, -0.035);
  for (const w of ['CRAFT', 'TASTE', 'DETAIL']) SZ['m' + w] = fitSize(w, F.anton, 900);
  { // M◯VE layout: a geometric ring replaces the O
    const L100 = layout('MVE', F.anton(100)), cap100 = L100.cap, w100 = L100.w + cap100 * 1.12;
    const fs = 100 * 940 / w100; meas.font = F.anton(fs); const cap = meas.measureText('H').actualBoundingBoxAscent, R = cap / 2;
    const items = [{ ch: 'M', w: meas.measureText('M').width }, { ch: 'O', w: 2 * R + cap * 0.12 }, { ch: 'V', w: meas.measureText('V').width }, { ch: 'E', w: meas.measureText('E').width }];
    let x = 0; items.forEach(it => { it.x = x; x += it.w; }); ML = { items, w: x, cap, R, fs };
  }
  initShapes(); initParticles(); initTiles();
  GA = mk(W / 2, H / 2); gactx = GA.getContext('2d'); GB = mk(W / 2, H / 2); gbctx = GB.getContext('2d', { willReadFrequently: true });
  VIG = mk(W, H); { const v = VIG.getContext('2d'), g = v.createRadialGradient(CX, CY, 420, CX, CY, 1200); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.36)'); v.fillStyle = g; v.fillRect(0, 0, W, H); }
  const r = mulberry32(42);
  for (let k = 0; k < 4; k++) {
    const g = mk(256, 256), x = g.getContext('2d'), id = x.createImageData(256, 256);
    for (let j = 0; j < id.data.length; j += 4) { const v = 128 + ((r() + r() + r()) / 3 - 0.5) * 220; id.data[j] = id.data[j + 1] = id.data[j + 2] = v; id.data[j + 3] = 255; }
    x.putImageData(id, 0, 0); GRAINPAT.push(x.createPattern(g, 'repeat'));
  }
  CH = [mk(W, H), mk(W, H), mk(W, H)];
}

// ── entry points ─────────────────────────────────────────────────────────────
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let SUB, sctx;
window.renderFrame = (f, S = 4, shutter = 0.7) => {
  const t = f / FPS;
  if (S > 1 && t >= 3.0 && t < 3.25) S = 20; // zoom-through moves too fast for 4 samples
  if (S <= 1) scene(ctx, t);
  else {
    if (!SUB) { SUB = mk(W, H); sctx = SUB.getContext('2d'); }
    // forward shutter: samples never cross a frame-aligned cut
    for (let k = 0; k < S; k++) {
      scene(sctx, t + (k / S) * shutter / FPS);
      ctx.globalAlpha = 1 / (k + 1); ctx.drawImage(SUB, 0, 0);
    }
    ctx.globalAlpha = 1;
  }
  post(ctx, t, f); hud(ctx, t, f);
};
window.READY = (async () => {
  await Promise.all(['400 100px Anton', '900 100px "Inter Tight"', '800 100px "Inter Tight"', '500 30px "JetBrains Mono"', '700 30px "JetBrains Mono"',
    'italic 400 100px "Instrument Serif"', '400 100px "Instrument Serif"'].map(f => document.fonts.load(f)));
  init();
  return true;
})();
// live preview: open index.html in a browser
if (!navigator.webdriver) {
  const t0 = performance.now();
  READY.then(() => { const loop = () => { const f = Math.floor(((performance.now() - t0) / 1000 % DUR) * FPS); window.renderFrame(f, 1); requestAnimationFrame(loop); }; loop(); });
}
