import type { ComposedSong, MelodyNote, StyleSheet } from '../core/compose';

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Owns the AudioContext, the master chain and the clock that maps page time to heard audio time. */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  noise!: AudioBuffer;
  private muted = false;
  /** Smoothed (contextTime - performanceTime) for the sound leaving the speakers, in seconds. */
  private skew: number | null = null;

  /** Creates or wakes the context; call from a click or key press. */
  unlock(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(comp).connect(ctx.destination);
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
    return this.ctx;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  /** Audio-context time of the sound reaching the listener at page time `perfMs` (performance.now() base). */
  heardTimeAt(perfMs: number): number {
    const ctx = this.ctx;
    if (!ctx) return perfMs / 1000;
    let raw: number;
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime && ts.performanceTime) raw = ts.contextTime - ts.performanceTime / 1000;
    else raw = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) - performance.now() / 1000;
    // The estimate arrives in render-quantum steps; smooth small wobble, follow real jumps (pause, glitch).
    if (this.skew === null || Math.abs(raw - this.skew) > 0.05) this.skew = raw;
    else this.skew += (raw - this.skew) * 0.08;
    return perfMs / 1000 + this.skew;
  }

  suspend(): Promise<void> {
    return this.ctx ? this.ctx.suspend() : Promise.resolve();
  }

  resume(): Promise<void> {
    return this.ctx ? this.ctx.resume() : Promise.resolve();
  }

  // ---------- one-off effects, straight to the master ----------

  death(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.5);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.3);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.12, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.35);
  }

  /** The ball dropping through a missing note. */
  fall(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(700, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.55);
  }

  fanfare(root: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    [0, 4, 7, 12, 16, 19, 24].forEach((st, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midiHz(root + 12 + st);
      const g = ctx.createGain();
      const at = t + i * 0.07;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.18, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, at + (i === 6 ? 1.2 : 0.3));
      o.connect(g).connect(this.master);
      o.start(at);
      o.stop(at + 1.3);
    });
  }

  /** A metronome tick at an exact context time (for the sync screen). */
  tick(at: number, accent: boolean, bus: AudioNode = this.master): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.value = accent ? 1760 : 1175;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.35, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
    o.connect(g).connect(bus);
    o.start(at);
    o.stop(at + 0.08);
  }
}

/** Steps (sixteenth notes) are scheduled this far ahead of the audio clock. */
const LOOKAHEAD = 0.14;

/** What the game needs from whatever is playing the music. */
export interface Player {
  start(fromBeat: number, countInUntil: number, leadIn?: number): void;
  beatAt(t: number): number;
  pump(): void;
  stop(fade?: number): void;
  playNote(midi: number): void;
  knock(): void;
  crack(): void;
}

/**
 * Plays a recording the player loaded (an MP3 of their own), lined up so that beat 0 is the bar
 * start the analyzer found. The recording carries the music, so presses only add a light tick.
 */
export class RecordingPlayer implements Player {
  private bus: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private t0 = 0;
  private startBeat = 0;
  private stopped = true;
  private readonly spb: number;

  constructor(private readonly engine: AudioEngine, private readonly buffer: AudioBuffer, bpm: number, private readonly firstBeat: number) {
    this.spb = 60 / bpm;
    this.bus = engine.ctx!.createGain();
    this.bus.connect(engine.master);
  }

  start(fromBeat: number, countInUntil: number, leadIn = 0.12): void {
    const ctx = this.engine.ctx!;
    this.t0 = ctx.currentTime + leadIn;
    this.startBeat = fromBeat;
    this.stopped = false;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.bus);
    // The recording's second `offset` sounds at t0 (beat fromBeat).
    const offset = this.firstBeat + fromBeat * this.spb;
    if (offset >= 0) src.start(this.t0, offset);
    else src.start(this.t0 - offset, 0);
    this.source = src;
    for (let b = Math.ceil(fromBeat); b < countInUntil; b++) this.engine.tick(this.t0 + (b - fromBeat) * this.spb, b === Math.ceil(fromBeat), this.bus);
  }

  beatAt(t: number): number {
    return this.startBeat + (t - this.t0) / this.spb;
  }

  pump(): void {
    // Everything is scheduled at start.
  }

  stop(fade = 0.04): void {
    if (this.stopped) return;
    this.stopped = true;
    const ctx = this.engine.ctx!;
    this.bus.gain.setTargetAtTime(0, ctx.currentTime, fade);
    const src = this.source;
    const bus = this.bus;
    setTimeout(() => {
      try {
        src?.stop();
      } catch {
        // Already stopped.
      }
      bus.disconnect();
    }, 1500);
  }

  private blip(freq: number, vol: number, len: number): void {
    if (this.stopped) return;
    const ctx = this.engine.ctx!;
    const at = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, at);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, at + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(this.bus);
    o.start(at);
    o.stop(at + len + 0.02);
  }

  playNote(midi: number): void {
    this.blip(midi > 0 ? 440 * 2 ** ((midi - 69) / 12) : 1320, 0.08, 0.06);
  }

  knock(): void {
    this.blip(160, 0.2, 0.09);
  }

  crack(): void {
    this.blip(2400, 0.18, 0.05);
  }
}

/**
 * Plays one attempt of a written song from any beat. The band follows each bar's chord, energy
 * and fills; the lead sings the whole melody in call bars and stays silent in response bars,
 * where the player's presses play it instead.
 */
export class SongPlayer implements Player {
  private bus: GainNode;
  private delaySend: GainNode;
  private t0 = 0;
  private startBeat = 0;
  private countInUntil = 0;
  private nextStep = 0;
  private stopped = true;
  private readonly spb: number;
  private readonly style: StyleSheet;
  /** Melody notes the call sings, by sixteenth-step index. */
  private readonly calls = new Map<number, MelodyNote[]>();

  constructor(private readonly engine: AudioEngine, private readonly song: ComposedSong) {
    const ctx = engine.ctx!;
    this.style = song.style;
    this.spb = 60 / song.style.bpm;
    this.bus = ctx.createGain();
    this.bus.connect(engine.master);
    const delay = ctx.createDelay(2);
    delay.delayTime.value = this.spb * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter();
    lp.frequency.value = 2400;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.28;
    this.delaySend.connect(delay).connect(lp).connect(fb).connect(delay);
    lp.connect(this.bus);
    for (const n of song.melody) {
      const k = Math.round(n.beat * 4);
      this.calls.set(k, [...(this.calls.get(k) ?? []), n]);
    }
  }

  /** The player's press: the lead voice right now, through the same echo as the call. */
  playNote(midi: number): void {
    if (this.stopped) return;
    this.pluck(this.engine.ctx!.currentTime, midi, 0.2);
  }

  /** A press that answered nothing: a dull knock. */
  knock(): void {
    if (this.stopped) return;
    const at = this.engine.ctx!.currentTime;
    const g = this.env(at, 0.25, 0.09);
    g.connect(this.bus);
    const o = this.osc('triangle', 140, at, 0.1, g);
    o.frequency.exponentialRampToValueAtTime(70, at + 0.08);
  }

  /** A cracked note: a short glassy snap. */
  crack(): void {
    if (this.stopped) return;
    const ctx = this.engine.ctx!;
    const at = ctx.currentTime;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const g = this.env(at, 0.35, 0.12);
    hp.connect(g).connect(this.bus);
    this.noise(at, 0.14, hp);
  }

  /** Starts so that `fromBeat` sounds `leadIn` seconds from now; beats before `countInUntil` are only clicks. */
  start(fromBeat: number, countInUntil: number, leadIn = 0.12): void {
    const ctx = this.engine.ctx!;
    this.t0 = ctx.currentTime + leadIn;
    this.startBeat = fromBeat;
    this.countInUntil = countInUntil;
    this.nextStep = Math.ceil(fromBeat * 4);
    this.stopped = false;
    this.pump();
  }

  /** Song beat being heard at audio time `t`. */
  beatAt(t: number): number {
    return this.startBeat + (t - this.t0) / this.spb;
  }

  timeOf(beat: number): number {
    return this.t0 + (beat - this.startBeat) * this.spb;
  }

  get playing(): boolean {
    return !this.stopped;
  }

  stop(fade = 0.04): void {
    if (this.stopped && this.bus.gain.value === 0) return;
    this.stopped = true;
    const ctx = this.engine.ctx!;
    this.bus.gain.setTargetAtTime(0, ctx.currentTime, fade);
    const bus = this.bus;
    setTimeout(() => bus.disconnect(), 1500);
  }

  /** Schedules everything due in the next LOOKAHEAD seconds. Call often (every frame and on a timer). */
  pump(): void {
    if (this.stopped) return;
    const ctx = this.engine.ctx!;
    const horizon = ctx.currentTime + LOOKAHEAD;
    const last = (this.song.endBeat + 4) * 4;
    while (!this.stopped && this.timeOf(this.nextStep / 4) < horizon) {
      const k = this.nextStep++;
      if (k > last) {
        this.stopped = true;
        break;
      }
      const at = Math.max(ctx.currentTime, this.timeOf(k / 4));
      this.scheduleStep(k, at);
    }
  }

  private scheduleStep(k: number, at: number): void {
    const beat = k / 4;
    if (beat < this.countInUntil) {
      if (k % 4 === 0) this.engine.tick(at, Math.round(beat - this.countInUntil) === -4, this.bus);
      return;
    }
    const bars = this.song.bars;
    const endStep = this.song.endBeat * 4;
    if (k >= endStep) {
      if (k === endStep) {
        const home = bars[0].chord;
        this.crash(at);
        this.kick(at, 1);
        this.pad(at, home, this.spb * 4, 0.05);
        this.bass(at, home[0] - 12, this.spb * 3);
      }
      return;
    }
    const bar = Math.floor(beat / 4);
    const b = bars[bar];
    if (!b) return;
    const st = this.style;
    const e = b.energy;
    const s = ((k % 16) + 16) % 16;
    const chord = b.chord;
    const fill = b.fill && s >= 12;
    const newSection = bar > 0 && bars[bar - 1].section !== b.section;

    if (s === 0) {
      this.pad(at, chord, this.spb * 4, e === 0 ? 0.035 : 0.022);
      // "Your turn": a little rising chirp as each response bar starts.
      if (b.role === 'response') this.chirp(at, chord[0] + 24);
      if (newSection && e >= 2) this.crash(at, 0.14);
    }
    if (st.kick[e][s] === 'x') this.kick(at, e === 0 ? 0.6 : 0.95);
    // Fills: a snare roll into the next section (a build-up when the band was quiet).
    if (fill) {
      if (s % (e === 0 ? 1 : 2) === 0 || s === 15) this.snare(at, 0.18 + (s - 12) * 0.06);
    } else if (st.snare[e][s] === 'x') this.snare(at, 0.45);
    const h = st.hat[e][s];
    if (h === 'x') this.hat(at, false);
    else if (h === 'o') this.hat(at, e >= 3);
    const bs = st.bass[e][s];
    const len = this.spb / 2;
    if (bs === 'x') this.bass(at, chord[0] - 12, len);
    else if (bs === 'o') this.bass(at, chord[0], len);
    else if (bs === 'f') this.bass(at, chord[2] - 12, len);
    if (e >= 3 && s % 2 === 1) {
      const order = [0, 1, 2, 1];
      this.arp(at, chord[order[(s >> 1) % 4]] + 12);
    }
    for (const n of this.calls.get(k) ?? []) this.pluck(at, n.midi, 0.17, Math.min(0.6, n.len * this.spb));
  }

  // ---------- instruments ----------

  private env(at: number, peak: number, decay: number, attack = 0.003): GainNode {
    const g = this.engine.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    return g;
  }

  private osc(type: OscillatorType, hz: number, at: number, dur: number, to: AudioNode): OscillatorNode {
    const o = this.engine.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(hz, at);
    o.connect(to);
    o.start(at);
    o.stop(at + dur + 0.05);
    return o;
  }

  private noise(at: number, dur: number, to: AudioNode): void {
    const src = this.engine.ctx!.createBufferSource();
    src.buffer = this.engine.noise;
    src.connect(to);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.05);
  }

  private kick(at: number, vol: number): void {
    const g = this.env(at, vol, 0.28, 0.002);
    g.connect(this.bus);
    const o = this.osc('sine', 150, at, 0.3, g);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.11);
  }

  private snare(at: number, vol: number): void {
    const ctx = this.engine.ctx!;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = this.env(at, vol, 0.14);
    bp.connect(g).connect(this.bus);
    this.noise(at, 0.16, bp);
    const tg = this.env(at, vol * 0.5, 0.07);
    tg.connect(this.bus);
    const o = this.osc('triangle', 200, at, 0.08, tg);
    o.frequency.exponentialRampToValueAtTime(150, at + 0.07);
  }

  private hat(at: number, open: boolean): void {
    const ctx = this.engine.ctx!;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const g = this.env(at, open ? 0.1 : 0.13, open ? 0.2 : 0.035);
    hp.connect(g).connect(this.bus);
    this.noise(at, open ? 0.22 : 0.05, hp);
  }

  private bass(at: number, midi: number, dur: number): void {
    const ctx = this.engine.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(1100, at);
    lp.frequency.exponentialRampToValueAtTime(260, at + dur);
    const g = this.env(at, 0.2, dur, 0.005);
    lp.connect(g).connect(this.bus);
    this.osc('sawtooth', midiHz(midi), at, dur, lp);
  }

  private pad(at: number, chord: number[], dur: number, vol: number): void {
    const ctx = this.engine.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.3);
    g.gain.setValueAtTime(vol, at + dur - 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.1);
    lp.connect(g).connect(this.bus);
    for (const m of chord) {
      for (const cents of [-8, 8]) {
        const o = this.osc('sawtooth', midiHz(m), at, dur + 0.1, lp);
        o.detune.value = cents;
      }
    }
  }

  private chirp(at: number, midi: number): void {
    [0, 7].forEach((st, i) => {
      const g = this.env(at + i * 0.05, 0.05, 0.08);
      g.connect(this.bus);
      this.osc('sine', midiHz(midi + st), at + i * 0.05, 0.1, g);
    });
  }

  private pluck(at: number, midi: number, vol = 0.17, decay = 0.3): void {
    const g = this.env(at, vol, decay);
    g.connect(this.bus);
    g.connect(this.delaySend);
    const ctx = this.engine.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.frequency.setValueAtTime(5000, at);
    lp.frequency.exponentialRampToValueAtTime(900, at + 0.25);
    lp.connect(g);
    this.osc(this.style.lead, midiHz(midi), at, decay + 0.02, lp);
  }

  private arp(at: number, midi: number): void {
    const g = this.env(at, 0.045, 0.1);
    g.connect(this.bus);
    this.osc('triangle', midiHz(midi + 12), at, 0.12, g);
  }

  private crash(at: number, vol = 0.22): void {
    const ctx = this.engine.ctx!;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3500;
    const g = this.env(at, vol, 1.3);
    hp.connect(g).connect(this.bus);
    this.noise(at, 1.4, hp);
  }

}

/** A plain click track for the sync screen. */
export class ClickTrack {
  private bus: GainNode;
  private t0 = 0;
  private next = 0;
  private stopped = false;
  readonly spb: number;

  constructor(private readonly engine: AudioEngine, bpm: number, private readonly beats: number) {
    this.spb = 60 / bpm;
    this.bus = engine.ctx!.createGain();
    this.bus.connect(engine.master);
  }

  start(): void {
    this.t0 = this.engine.ctx!.currentTime + 0.3;
    this.pump();
  }

  /** Beat heard at audio time t (beat 0 is the first click). */
  beatAt(t: number): number {
    return (t - this.t0) / this.spb;
  }

  pump(): void {
    const ctx = this.engine.ctx!;
    while (!this.stopped && this.next < this.beats && this.t0 + this.next * this.spb < ctx.currentTime + LOOKAHEAD) {
      this.engine.tick(this.t0 + this.next * this.spb, this.next % 4 === 0, this.bus);
      this.next++;
    }
  }

  stop(): void {
    this.stopped = true;
    this.bus.gain.setTargetAtTime(0, this.engine.ctx!.currentTime, 0.02);
  }
}
