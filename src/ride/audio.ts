import { rpmFor } from './render/dashboard';

const MUTE_KEY = 'neon-rider.muted';

/** Engine, wind and effects, all synthesized with WebAudio. Everything is best-effort. */
export class RideAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: { a: OscillatorNode; b: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private wind: { filter: BiquadFilterNode; gain: GainNode } | null = null;
  muted: boolean;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** Must be called from a user gesture (click/key) the first time. */
  unlock(): void {
    try {
      if (!this.ctx) this.build();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Not persisted.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  private build(): void {
    const ctx = (this.ctx = new AudioContext());
    const master = (this.master = ctx.createGain());
    master.gain.value = this.muted ? 0 : 0.8;
    master.connect(ctx.destination);

    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = 'sawtooth';
    b.type = 'square';
    b.detune.value = -1200;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    a.connect(filter);
    b.connect(filter);
    filter.connect(gain).connect(master);
    a.start();
    b.start();
    this.engine = { a, b, filter, gain };

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(2);
    noise.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 800;
    wf.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    noise.connect(wf).connect(wg).connect(master);
    noise.start();
    this.wind = { filter: wf, gain: wg };
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Called every frame. `running` false silences the engine (menus, after a crash). */
  update(kmh: number, throttle: number, boosting: boolean, running: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.engine || !this.wind) return;
    const t = ctx.currentTime;
    const rpm = rpmFor(kmh);
    const f = 38 + rpm * 120 + (boosting ? 18 : 0);
    this.engine.a.frequency.setTargetAtTime(f, t, 0.05);
    this.engine.b.frequency.setTargetAtTime(f * 1.01, t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(300 + rpm * 1400 + throttle * 600 + (boosting ? 900 : 0), t, 0.08);
    this.engine.gain.gain.setTargetAtTime(running ? 0.05 + throttle * 0.05 : 0, t, 0.15);
    const speedK = Math.min(1.3, kmh / 200);
    this.wind.gain.gain.setTargetAtTime(running ? speedK * speedK * 0.16 : 0.02, t, 0.2);
    this.wind.filter.frequency.setTargetAtTime(500 + speedK * 1500, t, 0.2);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, vol: number, from: number, to: number, type: BiquadFilterType = 'bandpass', delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  nearMiss(combo: number): void {
    this.burst(0.35, 0.5, 2500, 400);
    this.tone(660 + Math.min(combo, 8) * 80, 0.12, 'triangle', 0.12, undefined, 0.05);
  }

  scrape(): void {
    this.burst(0.3, 0.35, 5000, 2500, 'highpass');
  }

  crash(): void {
    this.burst(0.9, 0.9, 1800, 120, 'lowpass');
    this.tone(90, 0.6, 'sine', 0.6, 35);
    this.burst(0.4, 0.4, 6000, 3000, 'highpass', 0.05);
  }

  bounce(speed: number): void {
    this.burst(0.2, Math.min(0.5, speed * 0.06), 900, 150, 'lowpass');
  }

  wasted(): void {
    // A low, slow, falling sting.
    this.tone(220, 1.6, 'sawtooth', 0.12, 55);
    this.tone(110, 1.8, 'sine', 0.3, 40);
  }

  beep(high: boolean): void {
    this.tone(high ? 880 : 440, high ? 0.45 : 0.18, 'square', 0.08);
  }
}
