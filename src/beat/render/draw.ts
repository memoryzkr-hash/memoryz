import { BALL_R, HEAD_W, WINDOW_BEATS } from '../core/constants';
import { ballAt, heightOf, xAt, type EchoSong, type EchoState, type Key } from '../core/echo';
import type { Grade } from '../core/judge';
import type { Palette, TrackDef } from '../core/levels';

export interface Hud {
  score: number;
  hearts: number;
  /** Lives this chart starts with. */
  maxHearts: number;
  combo: number;
  accuracy: number;
  progress: number;
  best: number;
  practice: boolean;
  restored: number;
  phrases: number;
  /** Timing of the latest judged presses in ms (negative = early), oldest first. */
  recent: number[];
}

/** What the card says after the last heart is gone. */
export interface EndCard { pct: number; best: number; newBest: boolean }

export interface View {
  stage: TrackDef;
  song: EchoSong;
  state: EchoState;
  /** Song beat being heard right now. */
  beat: number;
  /** Echo shadows: each call note leaves a faint outline where its answer goes. */
  hint: boolean;
  hud: Hud | null;
  /** Beats left in the count-in (-4..0), or null while playing. */
  countIn: number | null;
  /** Seconds since the game ended, or -1. */
  overFor: number;
  card: EndCard | null;
  /** Show the two touch zones of a two-key song. */
  touchKeys: boolean;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
/** Judgement text; x follows the ball, y is the world height it popped at. */
interface Popup { text: string; sub: string; color: string; age: number; y: number; stack: number }

const DISPLAY = "'Bungee', 'Black Han Sans', system-ui, sans-serif";
const KOREAN = "'Black Han Sans', 'Bungee', system-ui, sans-serif";
const BODY = "'IBM Plex Sans KR', system-ui, -apple-system, sans-serif";

/** Note-head ellipse, in tiles. The ball sits on top; the staff line runs through its middle. */
const HEAD_RX = HEAD_W / 2;
const HEAD_RY = 0.27;
const HEAD_TILT = -0.32;

const GRADE_FILL: Record<Grade, string> = { perfect: '', great: '#ffe14a', good: '#9fe8ff', miss: '#8a8296' };

const frac = (v: number) => v - Math.floor(v);
const hash = (i: number) => frac(Math.sin(i * 127.1 + 311.7) * 43758.5453);

function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  /** Pixels per tile. */
  private T = 40;
  private camY = 0;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private trail: { x: number; y: number }[] = [];
  /** Beat each note head was last bounced on, for its squash. */
  private hitAt = new Map<number, number>();
  private keyAt: Record<'low' | 'high', number> = { low: -1, high: -1 };
  private safeTop = 0;
  private safeBottom = 0;
  private lastCombo = 0;
  /** The score as shown: it rolls up towards the real one. */
  private shownScore = 0;
  private lastScore = 0;
  private gains: { amount: number; at: number }[] = [];
  private comboAt = -1;
  private readonly calm = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    parent.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.T = Math.max(20, Math.min(this.w / (this.w < this.h ? 10 : 14), this.h / 9));
    const probe = document.getElementById('safe-probe');
    this.safeTop = probe?.offsetHeight ?? 0;
    this.safeBottom = probe?.offsetWidth ?? 0;
  }

  /** Forget effects (new run). */
  reset(): void {
    this.particles = [];
    this.popups = [];
    this.trail = [];
    this.hitAt.clear();
    this.camY = 0;
    this.shownScore = 0;
    this.lastScore = 0;
    this.gains = [];
  }

  // ---------- effects ----------

  bounced(note: number, beat: number, x: number, y: number, color: string): void {
    this.hitAt.set(note, beat);
    for (let i = 0; i < 6; i++) {
      const dir = i % 2 ? 1 : -1;
      this.particles.push({ x: x + dir * 0.3, y, vx: dir * (1.5 + Math.random() * 2.5), vy: 1 + Math.random() * 2, life: 0, max: 0.35, size: 0.07, color });
    }
  }

  burst(x: number, y: number, colors: string[], n = 16): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = 3 + Math.random() * 4;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 2, life: 0, max: 0.5, size: 0.08 + Math.random() * 0.06, color: colors[i % colors.length] });
    }
  }

  popup(text: string, sub: string, color: string, y: number): void {
    // Popups that arrive together stack upwards instead of covering each other.
    const stack = this.popups.filter((q) => q.age < 0.35).length;
    this.popups.push({ text, sub, color, age: 0, y: y + 1.6, stack });
    if (this.popups.length > 4) this.popups.shift();
  }

  pressed(key: Key): void {
    if (key !== 'any') this.keyAt[key] = performance.now();
  }

  // ---------- frame ----------

  render(v: View, dt: number): void {
    const { g, w, h, T } = this;
    const p = v.stage.palette;
    const s = v.state;
    const song = v.song;
    const beat = v.beat;
    const ball = ballAt(s, song, Math.max(beat, s.t));
    const calm = this.calm.matches;

    // Camera: the staff stays put (bottom line at 68% down, 60% on a tall phone); rise only for a ball flying high.
    const camX = ball.x - (w * 0.3) / T;
    const target = Math.max(0, ball.y - 3.6);
    this.camY += (target - this.camY) * (1 - Math.exp(-dt * 6));
    const base = h * (w < h ? 0.6 : 0.68);
    const sx = (x: number) => (x - camX) * T;
    const sy = (y: number) => base - (y - this.camY) * T;
    const left = camX - 2;
    const right = camX + w / T + 2;

    const playing = v.countIn === null && beat >= 0;
    const pulse = playing && !calm ? (1 - frac(beat)) ** 3 : 0;
    const bar = Math.floor(Math.max(0, beat) / 4);
    const energy = playing ? song.energy[bar] ?? 0 : 0;

    // Sky.
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, p.skyTop);
    sky.addColorStop(1, p.skyBottom);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    // Far equalizer columns jumping with the kick.
    const colW = 1.1;
    const par = 0.2;
    const first = Math.floor((camX * par) / colW) - 1;
    g.fillStyle = alpha(p.ink, 0.1);
    for (let i = first; i < first + Math.ceil(w / T / colW) + 2; i++) {
      const x = (i * colW - camX * par) * T;
      const hgt = (1 + hash(i) * 3 + pulse * (0.3 + energy * 0.4) * (0.5 + hash(i + 9))) * T;
      const cw = colW * T * 0.6;
      g.beginPath();
      g.roundRect(x, h - hgt - h * 0.06, cw, hgt + h, cw / 2);
      g.fill();
    }

    // Bars: listening (call) bars in shade, your (response) bars lit in the accent.
    const top = sy(heightOf(5)) - 1.3 * T;
    const bottom = sy(heightOf(1)) + 0.9 * T;
    for (let b = Math.max(0, Math.floor(left / xAt(4))); b * 4 < song.endBeat && xAt(b * 4) < right; b++) {
      const x0 = sx(xAt(b * 4));
      const x1 = sx(xAt(b * 4 + 4));
      const role = song.barRoles[b];
      if (role !== 'call' && role !== 'response') continue;
      const mine = role === 'response';
      g.fillStyle = mine ? alpha(p.accent, b === bar ? 0.2 : 0.12) : alpha(p.ink, b === bar ? 0.12 : 0.07);
      g.beginPath();
      g.roundRect(x0 + 3, top, x1 - x0 - 6, bottom - top, 14);
      g.fill();
      g.font = `${Math.max(12, 0.3 * T)}px ${KOREAN}`;
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillStyle = mine ? alpha(p.accent, 1) : alpha(p.staff, 0.85);
      g.fillText(mine ? '따라 치기' : '듣기', x0 + 14, top + 10);
    }

    // The staff: five lines through the note heads, bar lines at every bar.
    g.fillStyle = alpha(p.staff, 0.5);
    for (let k = 1; k <= 5; k++) g.fillRect(0, sy(heightOf(k) - HEAD_RY) - 1, w, 2);
    for (let b = Math.max(0, Math.floor(left / xAt(4))); xAt(b * 4) < right && b * 4 <= song.endBeat; b++) {
      const x = sx(xAt(b * 4));
      const thick = b % 2 === 0 ? 4 : 2;
      g.fillRect(x - thick / 2, sy(heightOf(5) - HEAD_RY), thick, sy(heightOf(1) - HEAD_RY) - sy(heightOf(5) - HEAD_RY));
    }
    // Beat dots under the staff, the current one lit.
    for (let b = Math.max(0, Math.floor(left / xAt(1))); xAt(b) < right && b < song.endBeat; b++) {
      const near = Math.max(0, 1 - Math.abs(beat - b) * 3);
      g.fillStyle = alpha(p.staff, 0.35 + 0.65 * near);
      g.beginPath();
      g.arc(sx(xAt(b)), sy(-0.85), 2.5 + near * 2.5, 0, Math.PI * 2);
      g.fill();
    }

    // Echo shadows: when the call sings a note, its answer's outline appears one bar ahead.
    if (v.hint) {
      g.setLineDash([5, 5]);
      song.notes.forEach((n, i) => {
        if (n.role !== 'response' || s.answer[i] >= 0 || s.judged[i]) return;
        if (beat < n.beat - 4 || xAt(n.beat) > right) return;
        const appear = Math.min(1, (beat - (n.beat - 4)) / 0.2);
        this.head(sx(xAt(n.beat)), sy(heightOf(n.pitch)), 1, null, alpha(p.accent, 0.85 * appear), Math.max(2, 0.06 * T));
      });
      g.setLineDash([]);
    }

    // The starting pad the ball hops on before its first jump.
    const firstJump = xAt(song.notes[0].beat - 1);
    if (left < firstJump + 1) {
      g.fillStyle = p.staff;
      g.beginPath();
      g.roundRect(sx(Math.min(left, firstJump - 30)), sy(0) - 2, (firstJump + 0.8 - Math.min(left, firstJump - 30)) * T, 8, 4);
      g.fill();
    }

    // Melody notes this chart leaves out: small dots, so you still see the whole tune go by.
    for (const d of song.decor) {
      if (xAt(d.beat) < left || xAt(d.beat) > right || beat < d.beat - 0.15) continue;
      g.fillStyle = alpha(p.staff, 0.7);
      g.beginPath();
      g.arc(sx(xAt(d.beat)), sy(heightOf(d.pitch) - HEAD_RY), Math.max(3, 0.1 * T), 0, Math.PI * 2);
      g.fill();
    }

    // Stems (and beams) hang under the heads, so the path reads as real notation.
    const stems = new Map<number, { x: number; y: number; ink: string }>();

    // Call heads, popping in just before the ball lands on them.
    song.notes.forEach((n, i) => {
      if (n.role !== 'call' || xAt(n.beat) < left || xAt(n.beat) > right) return;
      const grow = Math.min(1, Math.max(0, (beat - (n.beat - 0.6)) / 0.18));
      if (grow <= 0) return;
      const squash = this.squash(i, beat);
      this.head(sx(xAt(n.beat)), sy(heightOf(n.pitch)), (0.4 + 0.6 * grow) * (1 + squash), p.staff, p.ink, Math.max(2, 0.06 * T), squash);
      if (grow >= 1) stems.set(i, { x: sx(xAt(n.beat)), y: sy(heightOf(n.pitch)), ink: p.ink });
    });

    // Your heads: the ones you played, coloured by how well; strays crumble.
    for (const hd of s.heads) {
      if (hd.x < left || hd.x > right) continue;
      const age = beat - hd.t;
      const pop = Math.min(1, age / 0.08 + 0.4);
      if (hd.note < 0) {
        if (age > 1) continue;
        g.globalAlpha = Math.max(0, 1 - age);
        this.head(sx(hd.x), sy(hd.y - age * age * 4), 0.6, alpha(p.ink, 0.6), alpha(p.staff, 0.6), 2, 0, age * 2);
        g.globalAlpha = 1;
        continue;
      }
      const squash = this.squash(hd.note, beat);
      if (hd.cracked) {
        // Pressed far too early: the head splits in two and drops away once the ball arrives.
        const gone = Math.max(0, beat - song.notes[hd.note].beat);
        g.globalAlpha = Math.max(0, 1 - gone);
        for (const side of [-1, 1]) {
          this.head(sx(hd.x) + side * (4 + gone * 30), sy(hd.y - gone * gone * 6), 0.55, GRADE_FILL.miss, p.ink, 2, 0, side * (0.3 + gone * 2));
        }
        g.globalAlpha = 1;
        continue;
      }
      const fill = hd.wrong ? GRADE_FILL.miss : hd.grade === 'perfect' ? p.accent : GRADE_FILL[hd.grade ?? 'good'];
      this.head(sx(hd.x), sy(hd.y), pop * (1 + squash), fill, p.ink, Math.max(2, 0.06 * T), squash);
      if (!hd.wrong && pop >= 1) stems.set(hd.note, { x: sx(hd.x), y: sy(hd.y), ink: p.ink });
      if (hd.wrong) {
        g.strokeStyle = p.ink;
        g.lineWidth = 3;
        const cx = sx(hd.x);
        const cy = sy(hd.y - HEAD_RY);
        g.beginPath();
        g.moveTo(cx - 8, cy - 8);
        g.lineTo(cx + 8, cy + 8);
        g.moveTo(cx + 8, cy - 8);
        g.lineTo(cx - 8, cy + 8);
        g.stroke();
      }
    }

    this.drawStems(song, stems);

    // Finish line after the last response: a long bar to come home to.
    const lastNote = song.notes[song.notes.length - 1];
    const endX = xAt(lastNote.beat) + 1;
    if (endX < right) {
      g.fillStyle = p.staff;
      g.beginPath();
      g.roundRect(sx(endX + 1.5), sy(heightOf(1)) - 2, (xAt(song.endBeat + 8) - endX) * T, 8, 4);
      g.fill();
    }

    // Trail and ball.
    if (beat >= s.from.t - 0.05) this.trail.push({ x: ball.x, y: ball.y + BALL_R });
    if (this.trail.length > 10) this.trail.shift();
    this.trail.forEach((t, i) => {
      const k = (i + 1) / (this.trail.length + 1);
      g.fillStyle = alpha(p.ball, 0.25 * k);
      g.beginPath();
      g.arc(sx(t.x), sy(t.y), BALL_R * T * (0.35 + 0.5 * k), 0, Math.PI * 2);
      g.fill();
    });
    if (ball.y > this.camY - 8) this.drawBall(sx(ball.x), sy(ball.y), beat - s.from.t, s.falling !== null, p);

    // Your turn: a ring around the ball counts down to each note you have to play.
    if (v.hint && !s.falling) {
      const n = song.notes[s.next];
      if (n && n.role === 'response' && s.answer[s.next] < 0) {
        const ahead = n.beat - beat;
        if (ahead < 1 && ahead > -WINDOW_BEATS) {
          const k = Math.max(0, ahead);
          g.strokeStyle = alpha(p.ball, 0.3 + 0.7 * (1 - k));
          g.lineWidth = Math.max(2, 0.06 * T);
          g.beginPath();
          g.arc(sx(ball.x), sy(ball.y + BALL_R), BALL_R * T * (1.05 + 2.2 * k), 0, Math.PI * 2);
          g.stroke();
        }
      }
    }

    // Particles.
    for (const q of this.particles) {
      q.life += dt;
      q.vy -= 22 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    this.particles = this.particles.filter((q) => q.life < q.max);
    for (const q of this.particles) {
      g.globalAlpha = Math.min(1, (1 - q.life / q.max) * 1.5);
      g.fillStyle = q.color;
      g.beginPath();
      g.arc(sx(q.x), sy(q.y), q.size * T, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // Judgement popups, riding above the ball.
    for (const pop of this.popups) pop.age += dt;
    this.popups = this.popups.filter((pop) => pop.age < 0.7);
    for (const pop of this.popups) {
      const a = pop.age < 0.45 ? 1 : 1 - (pop.age - 0.45) / 0.25;
      const rise = (1 - (1 - pop.age / 0.7) ** 3) * 0.8;
      const x = sx(ball.x);
      const y = sy(Math.max(pop.y, ball.y + BALL_R * 2 + 0.75) + rise + pop.stack * 0.95);
      const grow = pop.age < 0.08 ? 1 + (0.08 - pop.age) * 4 : 1;
      g.globalAlpha = a;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = `${Math.max(14, 0.42 * T) * grow}px ${DISPLAY}`;
      g.lineWidth = Math.max(3, 0.09 * T);
      g.strokeStyle = p.ink;
      g.strokeText(pop.text, x, y);
      g.fillStyle = p.ink;
      g.fillText(pop.text, x + 2, y + 3);
      g.fillStyle = pop.color;
      g.fillText(pop.text, x, y);
      if (pop.sub) {
        g.font = `${Math.max(11, 0.26 * T)}px ${KOREAN}`;
        g.strokeText(pop.sub, x, y + 0.34 * T);
        g.fillStyle = '#ffffff';
        g.fillText(pop.sub, x, y + 0.34 * T);
      }
    }
    g.globalAlpha = 1;

    const vig = g.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.75);
    vig.addColorStop(0, alpha(p.ink, 0));
    vig.addColorStop(1, alpha(p.ink, 0.28));
    g.fillStyle = vig;
    g.fillRect(0, 0, w, h);

    if (v.countIn !== null && v.countIn > -4) this.drawCountIn(v.countIn, p);
    else if (v.hud && !s.over && !s.finished) this.drawBanner(song, beat, p);
    if (v.touchKeys && v.hud) this.drawTouchKeys(p);
    if (v.hud) this.drawHud(v.hud, p, v.touchKeys);
    if (v.card && v.overFor >= 0.3) this.drawCard(v.card, v.overFor - 0.3, p);
  }

  /** Stems down from each head's left side; two eighths in a row share a beam. */
  private drawStems(song: EchoSong, stems: Map<number, { x: number; y: number; ink: string }>): void {
    const { g, T } = this;
    const feet = new Map<number, { x: number; top: number; y: number }>();
    for (const [i, st] of stems) {
      const top = st.y + HEAD_RY * T * 1.3;
      feet.set(i, { x: st.x - HEAD_RX * T * 0.86, top, y: top + 1.5 * T });
    }
    const beams: [number, number][] = [];
    for (const i of feet.keys()) {
      const n = song.notes[i];
      const m = song.notes[i + 1];
      if (!m || !feet.has(i + 1) || m.role !== n.role || Math.floor(m.beat / 4) !== Math.floor(n.beat / 4) || m.beat - n.beat !== 0.5) continue;
      const a = feet.get(i)!;
      const b = feet.get(i + 1)!;
      a.y = b.y = Math.max(a.y, b.y);
      beams.push([i, i + 1]);
    }
    g.strokeStyle = this.inkOf(stems);
    g.lineCap = 'round';
    g.lineWidth = Math.max(2, 0.07 * T);
    for (const f of feet.values()) {
      g.beginPath();
      g.moveTo(f.x, f.top);
      g.lineTo(f.x, f.y);
      g.stroke();
    }
    g.lineCap = 'butt';
    g.lineWidth = Math.max(4, 0.16 * T);
    for (const [i, k] of beams) {
      const a = feet.get(i)!;
      const b = feet.get(k)!;
      g.beginPath();
      g.moveTo(a.x - 1, a.y - g.lineWidth / 2);
      g.lineTo(b.x + 1, b.y - g.lineWidth / 2);
      g.stroke();
    }
    g.lineCap = 'round';
  }

  private inkOf(stems: Map<number, { ink: string }>): string {
    for (const st of stems.values()) return st.ink;
    return '#000000';
  }

  /** How squashed a note head is right after the ball bounces on it. */
  private squash(note: number, beat: number): number {
    const at = this.hitAt.get(note);
    if (at === undefined || this.calm.matches) return 0;
    return 0.25 * Math.exp(-Math.max(0, beat - at) * 10);
  }

  /** A tilted note head whose top sits at (cx, top). */
  private head(cx: number, top: number, scale: number, fill: string | null, stroke: string, lw: number, squash = 0, spin = 0): void {
    const { g, T } = this;
    const rx = HEAD_RX * T * scale * (1 + squash * 0.4);
    const ry = HEAD_RY * T * scale * (1 - squash);
    g.save();
    g.translate(cx, top + ry);
    g.rotate(HEAD_TILT + spin);
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
    g.restore();
  }

  private drawBall(bx: number, by: number, since: number, falling: boolean, p: Palette): void {
    const { g, T } = this;
    const R = BALL_R * T;
    const squash = falling || this.calm.matches ? 0 : 0.28 * Math.exp(-Math.max(0, since) * 12);
    const stretch = falling ? 0.12 : 0;
    const sxk = 1 + squash - stretch * 0.6;
    const syk = 1 - squash + stretch;
    g.save();
    g.translate(bx, by);
    g.scale(sxk, syk);
    g.translate(0, -R);
    g.fillStyle = p.ball;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = Math.max(2, 0.07 * T);
    g.strokeStyle = p.ink;
    g.stroke();
    // An eighth-note flag for a face.
    g.fillStyle = p.ink;
    g.beginPath();
    g.ellipse(-R * 0.18, R * 0.18, R * 0.22, R * 0.15, -0.4, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-R * 0.02, -R * 0.5, R * 0.1, R * 0.68);
    g.beginPath();
    g.moveTo(R * 0.08, -R * 0.5);
    g.quadraticCurveTo(R * 0.45, -R * 0.3, R * 0.32, R * 0.02);
    g.lineWidth = Math.max(1.5, R * 0.1);
    g.stroke();
    g.restore();
  }

  /** Big "listen" / "your turn" sign with the four beats of the bar. */
  private drawBanner(song: EchoSong, beat: number, p: Palette): void {
    const { g, w } = this;
    if (beat < 0) return;
    const bar = Math.floor(beat / 4);
    const role = song.barRoles[bar];
    if (role !== 'call' && role !== 'response' && role !== 'intro') return;
    const mine = role === 'response';
    const inBar = beat - bar * 4;
    const soon = (role === 'call' && inBar >= 3) || (role === 'intro' && song.barRoles[bar + 1] === 'call' && inBar >= 3);
    const y = (w < 520 ? 100 : 72) + this.safeTop;
    const text = mine ? '따라 쳐!' : role === 'intro' ? (soon ? '곧 시작' : '인트로') : soon ? '곧 네 차례' : '잘 들어';
    const size = Math.min(40, w * 0.08) * (soon && !this.calm.matches ? 1 + 0.08 * (1 - frac(beat)) : 1);
    g.font = `${size}px ${KOREAN}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 5;
    g.lineJoin = 'round';
    g.strokeStyle = p.ink;
    g.strokeText(text, w / 2, y);
    g.fillStyle = mine ? p.accent : '#ffffff';
    g.fillText(text, w / 2, y);
    for (let k = 0; k < 4; k++) {
      const on = k <= Math.floor(inBar);
      g.fillStyle = on ? (mine ? p.accent : '#ffffff') : alpha(p.ink, 0.35);
      g.beginPath();
      g.arc(w / 2 + (k - 1.5) * 18, y + size * 0.72, on ? 5 : 4, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawCountIn(countIn: number, p: Palette): void {
    const { g, w, h, T } = this;
    const idx = Math.min(3, Math.max(0, Math.floor(countIn + 4)));
    const text = ['3', '2', '1', '들어 봐'][idx];
    const f = frac(countIn);
    g.font = `${(idx === 3 ? 0.5 : 1) * Math.min(h * 0.28, w * 0.22) * (1 + 0.25 * (1 - f) ** 3)}px ${idx === 3 ? KOREAN : DISPLAY}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = 0.4 + 0.6 * (1 - f);
    g.lineWidth = Math.max(4, 0.12 * T);
    g.strokeStyle = p.ink;
    g.strokeText(text, w / 2, h * 0.3);
    g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h * 0.3);
    g.globalAlpha = 1;
  }

  /** Two corner pads for two-key songs: left half of the screen plays low, right half high. */
  private drawTouchKeys(p: Palette): void {
    const { g, w, h } = this;
    const now = performance.now();
    const zw = Math.min(170, w * 0.26);
    const zh = 48;
    const y = h - this.safeBottom - zh - 12;
    for (const [key, label, x] of [['low', '↓ 낮은 음', 12], ['high', '높은 음 ↑', w - zw - 12]] as const) {
      const lit = Math.max(0, 1 - (now - this.keyAt[key]) / 180);
      g.fillStyle = alpha(p.ink, 0.35 + 0.25 * lit);
      g.beginPath();
      g.roundRect(x, y, zw, zh, 14);
      g.fill();
      g.strokeStyle = alpha(key === 'high' ? p.accent : p.staff, 0.5 + 0.5 * lit);
      g.lineWidth = 2;
      g.stroke();
      g.font = `600 15px ${BODY}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#ffffff';
      g.fillText(label, x + zw / 2, y + zh / 2);
    }
  }

  private drawHud(hud: Hud, p: Palette, touchKeys: boolean): void {
    const { g, w, h } = this;
    const top = 16 + this.safeTop;
    const x0 = 16;
    const x1 = w - 72;
    const barW = Math.max(60, x1 - x0);

    g.fillStyle = alpha(p.ink, 0.4);
    g.beginPath();
    g.roundRect(x0, top, barW, 8, 4);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(x0, top, Math.max(8, barW * hud.progress), 8, 4);
    g.fill();
    if (hud.best > 0 && hud.best < 1) {
      g.fillStyle = p.accent;
      g.fillRect(x0 + barW * hud.best - 1.5, top - 4, 3, 16);
    }

    // Hearts.
    for (let i = 0; i < hud.maxHearts; i++) {
      const full = hud.practice || i < hud.hearts;
      this.heart(x0 + 11 + i * 26, top + 32, 10, full ? p.accent : alpha(p.ink, 0.45), p.ink);
    }
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.font = `600 13px ${BODY}`;
    g.fillStyle = alpha('#ffffff', 0.9);
    g.fillText(hud.practice ? '연습 · 무한' : `구절 ${hud.restored}/${hud.phrases}`, x0 + hud.maxHearts * 26 + 8, top + 32);

    // Live score, rolling up, with the latest gains floating off it.
    const now = performance.now();
    if (hud.score < this.lastScore) this.shownScore = hud.score;
    if (hud.score > this.lastScore) this.gains.push({ amount: hud.score - this.lastScore, at: now });
    this.lastScore = hud.score;
    this.shownScore += (hud.score - this.shownScore) * (this.calm.matches ? 1 : 0.18);
    if (Math.abs(hud.score - this.shownScore) < 1) this.shownScore = hud.score;
    g.textAlign = 'right';
    g.textBaseline = 'top';
    g.font = `24px ${DISPLAY}`;
    g.lineWidth = 4;
    g.lineJoin = 'round';
    g.strokeStyle = alpha(p.ink, 0.6);
    const scoreText = Math.round(this.shownScore).toLocaleString('ko-KR');
    g.strokeText(scoreText, x1, top + 16);
    g.fillStyle = '#ffffff';
    g.fillText(scoreText, x1, top + 16);
    const scoreW = g.measureText(scoreText).width;
    this.gains = this.gains.filter((q) => now - q.at < 700);
    this.gains.forEach((q) => {
      const k = (now - q.at) / 700;
      g.globalAlpha = 1 - k;
      g.font = `14px ${DISPLAY}`;
      g.fillStyle = p.accent;
      g.fillText(`+${q.amount.toLocaleString('ko-KR')}`, x1 - scoreW - 10, top + 22 - k * 14);
    });
    g.globalAlpha = 1;
    g.font = `600 12px ${BODY}`;
    g.fillStyle = alpha('#ffffff', 0.85);
    g.fillText(`정확도 ${(hud.accuracy * 100).toFixed(1)}%`, x1, top + 46);
    if (hud.combo !== this.lastCombo) {
      if (hud.combo > this.lastCombo) this.comboAt = now;
      this.lastCombo = hud.combo;
    }
    if (hud.combo >= 3) {
      const grow = this.calm.matches ? 1 : 1 + 0.25 * Math.max(0, 1 - ((now - this.comboAt) / 1000) * 6);
      g.font = `${20 * grow}px ${DISPLAY}`;
      g.fillStyle = '#ffffff';
      g.fillText(`${hud.combo}`, x1, top + 66);
      g.font = `600 11px ${BODY}`;
      g.fillStyle = alpha('#ffffff', 0.75);
      g.fillText(`콤보 ×${(1 + Math.min(hud.combo, 50) / 50).toFixed(1)}`, x1, top + 90);
    }

    // Timing meter: where your recent presses landed, early to late.
    // Narrower between the two corner pads of a two-key song.
    const mw = Math.min(240, w - 64, touchKeys ? w - 2 * (Math.min(170, w * 0.26) + 64) : Infinity);
    const mx = w / 2;
    const my = h - this.safeBottom - 30;
    const range = 130;
    const at = (ms: number) => mx + (Math.max(-range, Math.min(range, ms)) / range) * (mw / 2);
    g.fillStyle = alpha(p.ink, 0.45);
    g.beginPath();
    g.roundRect(mx - mw / 2 - 6, my - 10, mw + 12, 20, 10);
    g.fill();
    g.fillStyle = alpha('#9fe8ff', 0.35);
    g.fillRect(at(-range), my - 2, at(range) - at(-range), 4);
    g.fillStyle = alpha('#ffe14a', 0.6);
    g.fillRect(at(-90), my - 2, at(90) - at(-90), 4);
    g.fillStyle = '#ffffff';
    g.fillRect(at(-45), my - 2.5, at(45) - at(-45), 5);
    g.fillRect(mx - 1, my - 8, 2, 16);
    hud.recent.forEach((ms, i) => {
      const d = Math.abs(ms);
      g.fillStyle = d <= 45 ? '#ffffff' : d <= 90 ? '#ffe14a' : '#9fe8ff';
      g.globalAlpha = 0.25 + (0.75 * (i + 1)) / hud.recent.length;
      g.fillRect(at(ms) - 1.5, my - 8, 3, 16);
    });
    g.globalAlpha = 1;
    g.font = `600 11px ${BODY}`;
    g.textBaseline = 'middle';
    g.fillStyle = alpha('#ffffff', 0.8);
    g.textAlign = 'right';
    g.fillText('빠름', mx - mw / 2 - 12, my);
    g.textAlign = 'left';
    g.fillText('느림', mx + mw / 2 + 12, my);
  }

  private heart(cx: number, cy: number, r: number, fill: string, stroke: string): void {
    const g = this.g;
    g.beginPath();
    g.moveTo(cx, cy + r * 0.9);
    g.bezierCurveTo(cx - r * 1.4, cy - r * 0.1, cx - r * 0.7, cy - r * 1.2, cx, cy - r * 0.45);
    g.bezierCurveTo(cx + r * 0.7, cy - r * 1.2, cx + r * 1.4, cy - r * 0.1, cx, cy + r * 0.9);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = stroke;
    g.stroke();
  }

  private drawCard(c: EndCard, age: number, p: Palette): void {
    const { g, w, h } = this;
    const a = Math.min(1, age / 0.2);
    const size = Math.min(h * 0.2, w * 0.2);
    g.globalAlpha = a;
    g.fillStyle = alpha(p.ink, 0.45);
    g.fillRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const cy = h * 0.38;
    g.font = `${Math.max(20, size * 0.3)}px ${KOREAN}`;
    g.fillStyle = '#ffffff';
    g.fillText('메아리가 끊겼어요', w / 2, cy - size * 0.75);
    g.font = `${size}px ${DISPLAY}`;
    g.lineWidth = Math.max(5, size * 0.07);
    g.lineJoin = 'round';
    g.strokeStyle = p.ink;
    g.strokeText(`${Math.floor(c.pct * 100)}%`, w / 2, cy);
    g.fillText(`${Math.floor(c.pct * 100)}%`, w / 2, cy);
    const line = c.newBest ? '최고 기록!' : `최고 ${Math.floor(c.best * 100)}%`;
    g.font = `${Math.max(18, size * 0.24)}px ${KOREAN}`;
    g.fillStyle = c.newBest ? p.accent : '#ffffff';
    g.fillText(line, w / 2, cy + size * 0.62);
    g.font = `600 15px ${BODY}`;
    g.fillStyle = alpha('#ffffff', 0.9);
    g.fillText('누르면 처음부터 · Esc 트랙 목록', w / 2, cy + size * 0.62 + 36);
    g.globalAlpha = 1;
  }
}
