import { BALL_R, SPEED, SPIKE_DRAW_H } from '../core/constants';
import type { BuiltLevel } from '../core/chart';
import type { Judgement } from '../core/judge';
import type { Palette, StageDef } from '../core/levels';
import { groundAt, type RunState } from '../core/physics';

export interface Hud {
  attempt: number;
  combo: number;
  accuracy: number;
  progress: number;
  best: number;
  practice: boolean;
  checkpoints: number[];
}

export interface View {
  stage: StageDef;
  level: BuiltLevel;
  run: RunState;
  /** Song beat being heard right now (before the run starts, smaller than run.t). */
  beat: number;
  guide: boolean;
  judged: (Judgement | null)[];
  hud: Hud | null;
  /** Beats left in the count-in (-4..0), or null while playing. */
  countIn: number | null;
  /** Seconds since the ball broke, or -1. */
  deadFor: number;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; shard: boolean; rot: number; vr: number }
/** Judgement text; x is fixed to the ball, y is the world height it popped at. */
interface Popup { text: string; sub: string; color: string; age: number; y: number }

const DISPLAY = "'Bungee', 'Black Han Sans', system-ui, sans-serif";
const KOREAN = "'Black Han Sans', 'Bungee', system-ui, sans-serif";
const BODY = "'IBM Plex Sans KR', system-ui, -apple-system, sans-serif";

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
  private camYSet = false;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private trail: { x: number; y: number }[] = [];
  private lastLand = -99;
  /** Height of the notch area (env(safe-area-inset-top)), measured on resize. */
  private safeTop = 0;

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
    // Narrow (portrait) screens trade some look-ahead for a ball you can actually see.
    this.T = Math.max(20, Math.min(this.w / (this.w < this.h ? 12 : 15), this.h / 8.5));
    this.safeTop = document.getElementById('safe-probe')?.offsetHeight ?? 0;
  }

  /** Forget camera smoothing and effects (new attempt). */
  reset(): void {
    this.camYSet = false;
    this.particles = [];
    this.popups = [];
    this.trail = [];
    this.lastLand = -99;
  }

  // ---------- effects, in world units ----------

  landed(t: number, x: number, y: number, impact: number, color: string): void {
    this.lastLand = t;
    const n = Math.min(10, Math.round(impact / 2));
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.particles.push({ x: x + dir * 0.2, y, vx: dir * (1 + Math.random() * 3), vy: 1 + Math.random() * 2.5, life: 0, max: 0.35, size: 0.08 + Math.random() * 0.06, color, shard: false, rot: 0, vr: 0 });
    }
  }

  sparks(x: number, y: number, color: string): void {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const v = 4 + Math.random() * 3;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.4, size: 0.07, color, shard: false, rot: 0, vr: 0 });
    }
  }

  shatter(x: number, y: number, colors: string[]): void {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 3 + Math.random() * 9;
      this.particles.push({
        x, y: y + BALL_R, vx: Math.cos(a) * v + 3, vy: Math.sin(a) * v + 4, life: 0, max: 0.9 + Math.random() * 0.4,
        size: 0.1 + Math.random() * 0.16, color: colors[i % colors.length], shard: true, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20,
      });
    }
  }

  popup(text: string, sub: string, color: string, y: number): void {
    this.popups.push({ text, sub, color, age: 0, y: y + 1.5 });
    if (this.popups.length > 4) this.popups.shift();
  }

  // ---------- frame ----------

  render(v: View, dt: number): void {
    const { g, w, h, T } = this;
    const p = v.stage.palette;
    const run = v.run;
    const alive = !run.dead;

    // Camera: ball sits at 28% across; the ground line at 70% down, rising to keep high jumps in view.
    const camX = run.x - (w * 0.28) / T;
    let base = groundAt(v.level.world, run.x) ?? this.camY;
    if (run.y - base > 2.6) base = run.y - 2.6;
    if (run.y < base) base = Math.max(run.y, base - 3);
    if (!this.camYSet) {
      this.camY = base;
      this.camYSet = true;
    } else this.camY += (base - this.camY) * (1 - Math.exp(-dt * 5));
    const horizon = h * 0.7;
    let shake = 0;
    if (v.deadFor >= 0) shake = Math.max(0, 0.3 - v.deadFor) * 30;
    const sx = (x: number) => (x - camX) * T + (shake ? (Math.random() - 0.5) * shake : 0);
    const sy = (y: number) => horizon - (y - this.camY) * T;

    const beatFrac = frac(v.beat);
    const pulse = v.countIn === null ? (1 - beatFrac) ** 3 : 0;
    const bar = Math.floor(Math.max(0, v.beat) / 4);
    const energy = v.countIn === null ? v.level.bars[bar]?.energy ?? 0 : 0;

    // Sky.
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, p.skyTop);
    sky.addColorStop(1, p.skyBottom);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    // The beat of the bar, huge, thumping behind everything.
    if (v.countIn === null && v.beat >= 0) {
      const n = (Math.floor(v.beat) % 4) + 1;
      const size = Math.min(h * 0.8, w * 0.6) * (1 + 0.06 * pulse);
      g.font = `${size}px ${DISPLAY}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = alpha('#ffffff', 0.1 + 0.12 * pulse);
      g.fillText(String(n), w * 0.64, h * 0.4);
    }

    // Equalizer skyline: far columns that jump with the kick, more as the band fills in.
    const par = 0.25;
    const colW = 1.1;
    const first = Math.floor((camX * par) / colW) - 1;
    const cols = Math.ceil(w / T / colW) + 2;
    const skyBase = horizon + 0.6 * T + this.camY * T * 0.25;
    g.fillStyle = alpha(p.ink, 0.13);
    for (let i = first; i < first + cols; i++) {
      const x = (i * colW - camX * par) * T;
      const hgt = (1.2 + hash(i) * 3.2 + pulse * (0.4 + energy * 0.45) * (0.5 + hash(i + 9))) * T;
      const cw = colW * T * 0.62;
      g.beginPath();
      g.roundRect(x, skyBase - hgt, cw, hgt + h, cw / 2);
      g.fill();
    }

    // Ground columns.
    const blocks = v.level.world.blocks;
    const left = camX - 1;
    const right = camX + w / T + 1;
    for (const b of blocks) {
      if (b.x1 < left || b.x0 > right) continue;
      const x0 = sx(b.x0);
      const x1 = sx(b.x1);
      const top = sy(b.top);
      g.fillStyle = p.ground;
      g.fillRect(x0, top, x1 - x0, h - top + 40);
      g.fillStyle = alpha(p.edge, 0.07);
      for (let k = 1; k < 8; k++) g.fillRect(x0, top + k * 0.5 * T, x1 - x0, 1);
      g.fillStyle = p.edge;
      g.fillRect(x0, top - 2, x1 - x0, 4);
    }
    // Vertical edges where the ground steps or breaks.
    g.fillStyle = p.edge;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.x1 < left || b.x0 > right) continue;
      const prev = blocks[i - 1];
      const next = blocks[i + 1];
      if (!prev || prev.x1 < b.x0 - 1e-6 || prev.top < b.top) g.fillRect(sx(b.x0) - 1, sy(b.top) - 2, 3, (prev && prev.x1 >= b.x0 - 1e-6 ? (b.top - prev.top) * T : h) + 2);
      if (!next || next.x0 > b.x1 + 1e-6 || next.top < b.top) g.fillRect(sx(b.x1) - 2, sy(b.top) - 2, 3, (next && next.x0 <= b.x1 + 1e-6 ? (b.top - next.top) * T : h) + 2);
    }

    // Beat ticks along the ground: the metronome you run on.
    for (let b = Math.floor(left / SPEED); b <= right / SPEED; b++) {
      const x = b * SPEED;
      const top = groundAt(v.level.world, x);
      if (top === null) continue;
      const near = Math.max(0, 1 - Math.abs(v.beat - b) * 2.5);
      const barLine = ((b % 4) + 4) % 4 === 0;
      g.fillStyle = alpha(p.edge, 0.35 + 0.65 * near);
      const len = (barLine ? 0.55 : 0.28) * T;
      g.fillRect(sx(x) - 1.5, sy(top), 3, len);
      if (barLine && b >= 0 && b / 4 < v.level.bars.length) {
        g.font = `${Math.max(9, T * 0.24)}px ${DISPLAY}`;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillText(String(b / 4 + 1), sx(x) + 4, sy(top) + 0.12 * T);
      }
    }

    // Where to press: little arrows on the ground at each upcoming take-off.
    if (v.guide) {
      v.level.notes.forEach((n, i) => {
        if (v.judged[i] || n.kind === 'orb' || n.beat < v.beat - 0.3) return;
        const x = n.beat * SPEED;
        if (x < left || x > right) return;
        const top = groundAt(v.level.world, x) ?? 0;
        const cx = sx(x);
        const cy = sy(top) - 0.18 * T;
        const s = 0.16 * T;
        g.fillStyle = alpha(p.accent, 0.95);
        g.beginPath();
        g.moveTo(cx - s, cy + s * 0.5);
        g.lineTo(cx, cy - s * 0.6);
        g.lineTo(cx + s, cy + s * 0.5);
        g.closePath();
        g.fill();
      });
    }

    // Pads.
    for (const pad of v.level.world.pads) {
      if (pad.x < left || pad.x > right) continue;
      const cx = sx(pad.x);
      const top = sy(pad.y);
      g.fillStyle = p.accent;
      g.beginPath();
      g.ellipse(cx, top, 0.42 * T, 0.2 * T, 0, Math.PI, 0);
      g.fill();
      g.strokeStyle = alpha(p.accent, 0.35 + 0.5 * pulse);
      g.lineWidth = Math.max(2, 0.06 * T);
      for (let k = 0; k < 2; k++) {
        const y = top - (0.45 + k * 0.3 + pulse * 0.1) * T;
        g.beginPath();
        g.moveTo(cx - 0.18 * T, y + 0.1 * T);
        g.lineTo(cx, y - 0.04 * T);
        g.lineTo(cx + 0.18 * T, y + 0.1 * T);
        g.stroke();
      }
    }

    // Spikes.
    g.lineJoin = 'round';
    for (const s of v.level.world.spikes) {
      if (s.x < left || s.x > right) continue;
      const cx = sx(s.x);
      const by = sy(s.y);
      const ty = sy(s.y + SPIKE_DRAW_H);
      g.fillStyle = p.ink;
      g.beginPath();
      g.moveTo(cx - 0.46 * T, by);
      g.lineTo(cx, ty);
      g.lineTo(cx + 0.46 * T, by);
      g.closePath();
      g.fill();
      g.fillStyle = alpha(p.edge, 0.22);
      g.beginPath();
      g.moveTo(cx - 0.3 * T, by);
      g.lineTo(cx, ty + 0.12 * T);
      g.lineTo(cx - 0.05 * T, by);
      g.closePath();
      g.fill();
    }

    // Air rings.
    v.level.world.orbs.forEach((o, i) => {
      if (o.x < left || o.x > right) return;
      const used = run.usedOrbs.includes(i);
      const cx = sx(o.x);
      const cy = sy(o.y);
      const r = 0.4 * T * (1 + 0.1 * pulse);
      g.globalAlpha = used ? 0.25 : 1;
      g.fillStyle = alpha(p.accent, 0.3);
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = p.accent;
      g.lineWidth = Math.max(3, 0.1 * T);
      g.stroke();
      g.fillStyle = p.ink;
      g.beginPath();
      g.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    });

    // Trail while airborne.
    if (alive && !run.grounded) this.trail.push({ x: run.x, y: run.y + BALL_R });
    else if (this.trail.length) this.trail.shift();
    if (this.trail.length > 9) this.trail.shift();
    this.trail.forEach((t, i) => {
      const k = (i + 1) / (this.trail.length + 1);
      g.fillStyle = alpha(p.ball, 0.28 * k);
      g.beginPath();
      g.arc(sx(t.x), sy(t.y), BALL_R * T * (0.4 + 0.5 * k), 0, Math.PI * 2);
      g.fill();
    });

    // Guide ring: closes in on the ball (or the ring) and meets it on the beat.
    if (v.guide && alive) {
      const i = v.level.notes.findIndex((n, k) => !v.judged[k] && n.beat >= run.t - 0.05);
      const n = v.level.notes[i];
      const ahead = n ? n.beat - Math.max(v.beat, run.t - 0.05) : 99;
      if (n && ahead < 0.75 && ahead > -0.05) {
        const k = Math.max(0, ahead / 0.75);
        const orb = n.kind === 'orb' ? v.level.world.orbs.find((o) => Math.abs(o.x - n.beat * SPEED) < 0.01) : null;
        const cx = orb ? sx(orb.x) : sx(run.x);
        const cy = orb ? sy(orb.y) : sy(run.y + BALL_R);
        g.strokeStyle = alpha(p.ball, 0.25 + 0.75 * (1 - k));
        g.lineWidth = Math.max(2, 0.07 * T);
        g.beginPath();
        g.arc(cx, cy, BALL_R * T * (1.05 + 2.4 * k), 0, Math.PI * 2);
        g.stroke();
      }
    }

    // The ball.
    if (alive) this.drawBall(v, sx(run.x), sy(run.y), p);

    // Particles.
    for (const q of this.particles) {
      q.life += dt;
      q.vy -= 22 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
    }
    this.particles = this.particles.filter((q) => q.life < q.max);
    for (const q of this.particles) {
      const a = 1 - q.life / q.max;
      g.fillStyle = q.color;
      g.globalAlpha = Math.min(1, a * 1.5);
      if (q.shard) {
        g.save();
        g.translate(sx(q.x), sy(q.y));
        g.rotate(q.rot);
        const s = q.size * T;
        g.beginPath();
        g.moveTo(-s, s * 0.6);
        g.lineTo(0, -s);
        g.lineTo(s, s * 0.6);
        g.closePath();
        g.fill();
        g.restore();
      } else {
        g.beginPath();
        g.arc(sx(q.x), sy(q.y), q.size * T * (0.5 + a * 0.5), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;

    // Judgement popups.
    for (const pop of this.popups) pop.age += dt;
    this.popups = this.popups.filter((pop) => pop.age < 0.7);
    for (const pop of this.popups) {
      const a = 1 - pop.age / 0.7;
      const rise = (1 - (1 - pop.age / 0.7) ** 3) * 0.8;
      const x = sx(run.x);
      // Above where it popped, but never on top of the ball as it rises through its jump.
      const y = sy(Math.max(pop.y, run.y + BALL_R * 2 + 0.75) + rise);
      const pop0 = pop.age < 0.08 ? 1 + (0.08 - pop.age) * 4 : 1;
      g.globalAlpha = a;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = `${Math.max(14, 0.42 * T) * pop0}px ${DISPLAY}`;
      g.lineWidth = Math.max(3, 0.09 * T);
      g.strokeStyle = p.ink;
      g.strokeText(pop.text, x, y);
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

    // Count-in.
    if (v.countIn !== null && v.countIn > -4) {
      const idx = Math.min(3, Math.max(0, Math.floor(v.countIn + 4)));
      const text = ['3', '2', '1', 'GO!'][idx];
      const f = frac(v.countIn);
      g.font = `${Math.min(h * 0.3, w * 0.22) * (1 + 0.25 * (1 - f) ** 3)}px ${DISPLAY}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.globalAlpha = 0.4 + 0.6 * (1 - f);
      g.lineWidth = Math.max(4, 0.12 * T);
      g.strokeStyle = p.ink;
      g.strokeText(text, w / 2, h * 0.36);
      g.fillStyle = '#ffffff';
      g.fillText(text, w / 2, h * 0.36);
      g.globalAlpha = 1;
    }

    // Death flash.
    if (v.deadFor >= 0 && v.deadFor < 0.25) {
      g.fillStyle = alpha('#ffffff', 0.55 * (1 - v.deadFor / 0.25));
      g.fillRect(0, 0, w, h);
    }

    if (v.hud) this.drawHud(v.hud, p);
  }

  private drawBall(v: View, bx: number, by: number, p: Palette): void {
    const { g, T } = this;
    const run = v.run;
    const R = BALL_R * T;
    let scaleX = 1;
    let scaleY = 1;
    let hop = 0;
    if (run.grounded) {
      // A small hop every beat, touching down on the beat: the bounce in "bounce ball".
      const f = frac(v.countIn !== null ? v.beat : run.t);
      hop = 0.16 * 4 * f * (1 - f);
      const squash = 0.08 * Math.exp(-f * 14) + 0.16 * Math.exp(-(run.t - this.lastLand) * 10);
      scaleX = 1 + squash;
      scaleY = 1 - squash;
    } else {
      const s = Math.min(0.16, Math.abs(run.vy) / 70);
      scaleX = 1 - s * 0.6;
      scaleY = 1 + s;
    }
    g.save();
    g.translate(bx, by - hop * T);
    g.scale(scaleX, scaleY);
    g.translate(0, -R);
    g.rotate((run.x / BALL_R) * 0.5);
    g.fillStyle = p.ball;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = p.accent;
    g.fillRect(-R, -R * 0.16, R * 2, R * 0.32);
    g.restore();
    g.lineWidth = Math.max(2, 0.07 * T);
    g.strokeStyle = p.ink;
    g.stroke();
    g.restore();
    // Highlight stays on top-left regardless of spin.
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.arc(bx - R * 0.35 * scaleX, by - hop * T - R * scaleY - R * 0.35, R * 0.16, 0, Math.PI * 2);
    g.fill();
  }

  private drawHud(hud: Hud, p: Palette): void {
    const { g, w } = this;
    const top = 22 + this.safeTop;
    const x0 = 16;
    const x1 = w - 72;
    const barW = Math.max(60, x1 - x0 - 56);
    g.fillStyle = alpha(p.ink, 0.35);
    g.beginPath();
    g.roundRect(x0, top, barW, 10, 5);
    g.fill();
    if (hud.best > 0) {
      g.fillStyle = alpha('#ffffff', 0.35);
      g.fillRect(x0 + barW * hud.best - 1, top - 3, 2, 16);
    }
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(x0, top, Math.max(10, barW * hud.progress), 10, 5);
    g.fill();
    g.fillStyle = p.accent;
    for (const c of hud.checkpoints) {
      const cx = x0 + barW * c;
      g.beginPath();
      g.moveTo(cx, top - 2);
      g.lineTo(cx + 5, top + 5);
      g.lineTo(cx, top + 12);
      g.lineTo(cx - 5, top + 5);
      g.closePath();
      g.fill();
    }
    g.font = `15px ${DISPLAY}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText(`${Math.floor(hud.progress * 100)}%`, x0 + barW + 10, top + 5);

    g.font = `15px ${BODY}`;
    g.textBaseline = 'top';
    g.fillStyle = alpha('#ffffff', 0.92);
    g.fillText(hud.practice ? `연습 · 시도 ${hud.attempt}` : `시도 ${hud.attempt}`, x0, top + 22);
    g.textAlign = 'right';
    g.font = `15px ${DISPLAY}`;
    g.fillText(`${(hud.accuracy * 100).toFixed(1)}%`, x1 - 8, top + 22);
    if (hud.combo >= 2) {
      g.font = `22px ${DISPLAY}`;
      g.fillText(String(hud.combo), x1 - 8, top + 42);
      g.font = `12px ${BODY}`;
      g.fillText('콤보', x1 - 8, top + 68);
    }
  }
}
