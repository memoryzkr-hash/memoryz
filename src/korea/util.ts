import timeline from './timeline.json';

export const TL = timeline;
export const DURATION = timeline.duration;
export type Window = readonly [number, number] | number[];

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const smooth = (x: number) => x * x * (3 - 2 * x);
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeIn = (x: number) => x * x * x;
export const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const backOut = (x: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

/** Scene `w` is on screen at `t` (cuts are hidden under black, so no overlap). */
export const inScene = (t: number, w: Window) => t >= w[0] && (t < w[1] || w[1] === DURATION);

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sum of decaying impulses from the shared impact list: 0 before a hit, `amp` at it, then decays. */
export function impactEnvelope(t: number, decay: number, filter?: (amp: number, braam: boolean) => number) {
  let v = 0;
  for (const hit of TL.impacts) {
    const dt = t - hit.t;
    if (dt < 0 || dt > 6) continue;
    const a = filter ? filter(hit.amp, Boolean((hit as { braam?: boolean }).braam)) : hit.amp;
    v += a * Math.exp(-dt * decay);
  }
  return v;
}

/** Smooth deterministic noise in [-1, 1]. */
export function noise1(x: number, seed = 0) {
  return (Math.sin(x * 1.7 + seed) * 0.5 + Math.sin(x * 3.1 + seed * 2.3) * 0.3 + Math.sin(x * 7.3 + seed * 4.1) * 0.2);
}

/** Heart pulse level 0..1 from the shared heartbeat list (lub + softer dub). */
export function heartbeat(t: number) {
  let v = 0;
  for (const b of TL.heartbeats) {
    const d1 = t - b;
    const d2 = t - b - 0.17;
    if (d1 >= 0 && d1 < 1) v += Math.exp(-d1 * 14);
    if (d2 >= 0 && d2 < 1) v += 0.6 * Math.exp(-d2 * 14);
  }
  return Math.min(1.2, v);
}
