/** Tiny synthesized sound effects (no audio files). Every sound is best-effort and silent on failure. */

const MUTE_KEY = 'memoryz-royale.muted';

let ctx: AudioContext | null = null;
let muted = readMuted();
const lastPlayed = new Map<string, number>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // Preference just won't persist.
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Skip a sound if the same one played within `gapMs`, so swarms don't turn into noise. */
function throttled(name: string, gapMs: number): boolean {
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? -Infinity) < gapMs) return true;
  lastPlayed.set(name, now);
  return false;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur);
}

function noise(dur: number, vol: number, cutoff: number): void {
  const a = audio();
  if (!a) return;
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const gain = a.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start();
}

export const sfx = {
  click: () => tone(660, 0.06, 'square', 0.05),
  deploy: () => {
    tone(320, 0.12, 'triangle', 0.12, 640);
  },
  swing: () => {
    if (!throttled('swing', 90)) noise(0.07, 0.12, 2500);
  },
  shoot: () => {
    if (!throttled('shoot', 90)) tone(900, 0.06, 'square', 0.03, 400);
  },
  death: () => {
    if (!throttled('death', 120)) tone(220, 0.15, 'sawtooth', 0.04, 80);
  },
  explosion: () => {
    noise(0.45, 0.35, 700);
    tone(90, 0.4, 'sine', 0.25, 40);
  },
  towerDown: () => {
    noise(0.9, 0.5, 500);
    tone(70, 0.8, 'sine', 0.35, 30);
  },
  error: () => tone(160, 0.15, 'square', 0.06),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, undefined, i * 0.13)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.35, 'triangle', 0.12, undefined, i * 0.2)),
};
