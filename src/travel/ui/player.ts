/**
 * Plays a day's timeline in real time. Owns the departure-board HUD and the day strip under the map:
 * every stay and every ride drawn to scale on one bar, with a playhead you can drag.
 */
import { MODES } from '../core/modes';
import { formatKrw, formatMoney, toKrw, type Region } from '../core/regions';
import type { DaySchedule } from '../core/schedule';
import { buildTimeline, stateAt, type SimState, type Timeline } from '../core/sim';
import { formatClock, formatDuration } from '../core/time';
import { h, replaceChildren } from '../../assistant/ui/dom';
import { MODE_COLORS } from './map';

/** Simulated minutes per real second. */
export const SPEEDS = [
  { value: 1, label: '1분/초' },
  { value: 5, label: '5분/초' },
  { value: 10, label: '10분/초' },
  { value: 20, label: '20분/초' },
  { value: 60, label: '1시간/초' },
];

const clock = (min: number) => formatClock(min).replace('다음날 ', '+1 ');

export class Player {
  private day: DaySchedule | null = null;
  private region: Region | null = null;
  tl: Timeline | null = null;
  private t = 0;
  private playing = false;
  private speed = 10;
  private raf = 0;
  private last = 0;
  /** True once the person has pressed play, to retire the big start button. */
  started = false;

  readonly hud = h('div', { class: 'hud', 'aria-live': 'off' });
  private playBtn = h('button', { type: 'button', class: 'play', id: 'play', 'aria-label': '재생 (Space)' });
  private clockEl = h('span', { class: 'clock' }, '--:--');
  private track = h('div', { class: 'strip-track' });
  private head = h('div', { class: 'strip-head' });
  private ticks = h('div', { class: 'strip-ticks', 'aria-hidden': 'true' });
  private strip = h(
    'div',
    { class: 'strip', role: 'slider', tabIndex: 0, 'aria-label': '하루 시간표 (← → 로 장소 이동)', 'aria-valuemin': 0, 'aria-valuemax': 0, 'aria-valuenow': 0 },
    this.track,
    this.head,
  );
  private speedSel = h(
    'select',
    { class: 'speed', id: 'speed', 'aria-label': '재생 속도 (1초에 흐르는 시간)' },
    ...SPEEDS.map((s) => h('option', { value: String(s.value), selected: s.value === 10 }, s.label)),
  );
  private followBox = h('input', { type: 'checkbox', id: 'follow' });
  readonly startCta = h('button', { type: 'button', class: 'start-cta', onClick: () => this.play() }, h('span', { class: 'tri', 'aria-hidden': 'true' }), '하루 이동 재생');
  readonly controls = h(
    'div',
    { class: 'controls' },
    h(
      'div',
      { class: 'controls-row' },
      this.playBtn,
      h('button', { type: 'button', class: 'ghost', 'aria-label': '이전 장소 (←)', onClick: () => this.step(-1) }, '⏮'),
      h('button', { type: 'button', class: 'ghost', 'aria-label': '다음 장소 (→)', onClick: () => this.step(1) }, '⏭'),
      this.clockEl,
      h('span', { class: 'spacer' }),
      h('label', { class: 'follow', for: 'follow', title: '여행자를 따라 지도 이동' }, this.followBox, '따라가기'),
      this.speedSel,
    ),
    h('div', { class: 'strip-wrap' }, this.strip, this.ticks),
  );

  constructor(private readonly onState: (s: SimState, tl: Timeline) => void, private readonly onFollow: (on: boolean) => void) {
    this.setPlayIcon();
    this.playBtn.addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    this.speedSel.addEventListener('change', () => (this.speed = Number(this.speedSel.value)));
    this.followBox.addEventListener('change', () => this.onFollow(this.followBox.checked));
    document.addEventListener('visibilitychange', () => document.hidden && this.pause());

    const seekAt = (clientX: number) => {
      if (!this.tl) return;
      const r = this.strip.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      this.seek(this.tl.start + f * (this.tl.end - this.tl.start));
    };
    this.strip.addEventListener('pointerdown', (e) => {
      this.pause();
      this.strip.setPointerCapture(e.pointerId);
      this.strip.classList.add('dragging');
      seekAt(e.clientX);
    });
    this.strip.addEventListener('pointermove', (e) => this.strip.hasPointerCapture(e.pointerId) && seekAt(e.clientX));
    const end = (e: PointerEvent) => {
      if (this.strip.hasPointerCapture(e.pointerId)) this.strip.releasePointerCapture(e.pointerId);
      this.strip.classList.remove('dragging');
    };
    this.strip.addEventListener('pointerup', end);
    this.strip.addEventListener('pointercancel', end);
    this.strip.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        this.pause();
        this.seek(this.t + (e.key === 'ArrowLeft' ? -5 : 5));
      }
    });
  }

  private setPlayIcon(): void {
    replaceChildren(this.playBtn, h('span', { class: this.playing ? 'bars' : 'tri', 'aria-hidden': 'true' }));
    this.playBtn.setAttribute('aria-label', this.playing ? '일시정지 (Space)' : '재생 (Space)');
  }

  get time(): number {
    return this.t;
  }

  /** New or edited day. Keeps the clock where it was when `keepTime` (editing while watching). */
  load(day: DaySchedule, region: Region, keepTime: boolean): void {
    this.day = day;
    this.region = region;
    this.tl = buildTimeline(day);
    this.drawStrip();
    this.seek(keepTime ? this.t : this.tl.start);
    if (!keepTime) this.pause();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  play(): void {
    if (!this.tl) return;
    if (this.t >= this.tl.end) this.seek(this.tl.start);
    this.playing = true;
    if (!this.started) {
      this.started = true;
      this.startCta.hidden = true;
    }
    this.setPlayIcon();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this.playing = false;
    this.setPlayIcon();
    cancelAnimationFrame(this.raf);
  }

  /** Jump to the previous / next arrival. */
  step(dir: -1 | 1): void {
    if (!this.day || !this.tl) return;
    this.pause();
    const marks = [this.tl.start, ...this.day.visits.slice(1).map((v) => v.arrive), this.tl.end];
    const target = dir > 0 ? marks.find((m) => m > this.t + 0.5) : [...marks].reverse().find((m) => m < this.t - 0.5);
    this.seek(target ?? (dir > 0 ? this.tl.end : this.tl.start));
  }

  seek(t: number): void {
    if (!this.tl || !this.day) return;
    this.t = Math.min(Math.max(t, this.tl.start), this.tl.end);
    const span = Math.max(1, this.tl.end - this.tl.start);
    const f = (this.t - this.tl.start) / span;
    this.head.style.left = `${f * 100}%`;
    this.strip.setAttribute('aria-valuenow', String(Math.round(this.t)));
    this.strip.setAttribute('aria-valuetext', clock(this.t));
    const s = stateAt(this.day, this.tl, this.t);
    this.clockEl.textContent = clock(this.t);
    this.drawHud(s);
    this.track.querySelectorAll<HTMLElement>('.seg').forEach((el, i) => el.classList.toggle('past', i < s.segment || (i === s.segment && s.progress >= 1)));
    this.onState(s, this.tl);
  }

  private tick = (now: number) => {
    if (!this.playing || !this.tl) return;
    const dt = Math.min(0.25, (now - this.last) / 1000); // a background tab shouldn't jump hours
    this.last = now;
    this.seek(this.t + dt * this.speed);
    if (this.t >= this.tl.end) {
      this.pause();
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private drawStrip(): void {
    const tl = this.tl!;
    const day = this.day!;
    const span = Math.max(1, tl.end - tl.start);
    this.strip.setAttribute('aria-valuemin', String(tl.start));
    this.strip.setAttribute('aria-valuemax', String(tl.end));
    replaceChildren(
      this.track,
      ...tl.segments.map((seg) => {
        const left = ((seg.from - tl.start) / span) * 100;
        const width = ((seg.to - seg.from) / span) * 100;
        if (seg.kind === 'move') {
          const m = MODES[seg.mode];
          return h(
            'div',
            { class: 'seg move', style: `left:${left}%;width:${width}%;--c:${MODE_COLORS[seg.mode]}`, title: `${m.icon} ${m.label} ${formatDuration(seg.to - seg.from)}` },
            width > 4 ? h('span', null, m.icon) : null,
          );
        }
        const v = day.visits[seg.visit];
        return h(
          'div',
          { class: 'seg stay', style: `left:${left}%;width:${width}%`, title: `${seg.visit + 1}. ${v.stop.name} ${formatDuration(seg.to - seg.from)}` },
          width > 3 ? h('span', null, String(seg.visit + 1)) : null,
        );
      }),
    );
    // Hour ticks: every hour, or every 2–3 h on long days.
    const every = span > 14 * 60 ? 180 : span > 8 * 60 ? 120 : 60;
    const first = Math.ceil(tl.start / every) * every;
    const ticks: HTMLElement[] = [];
    for (let m = first; m <= tl.end; m += every) {
      const f = (m - tl.start) / span;
      if (f < 0.04 || f > 0.95) continue; // a label at the very edge would spill out of the card
      ticks.push(h('span', { style: `left:${((m - tl.start) / span) * 100}%` }, clock(m).slice(-5, -3).replace(/^0/, '') + '시'));
    }
    replaceChildren(this.ticks, ...ticks);
  }

  private drawHud(s: SimState): void {
    const day = this.day!;
    const region = this.region!;
    const v = day.visits[s.visit];
    let chip: HTMLElement;
    let title: string;
    let sub: string;
    let progress: number;
    if (s.kind === 'done') {
      chip = h('span', { class: 'chip-state done' }, '도착');
      title = v?.stop.name ?? '';
      sub = `하루 일정 끝 · ${clock(day.end)}`;
      progress = 1;
    } else if (s.kind === 'stay') {
      const waiting = v && s.t < v.begin;
      chip = h('span', { class: 'chip-state stay' }, s.visit === 0 ? '출발 전' : waiting ? '개장 대기' : '머무는 중');
      title = v?.stop.name ?? '';
      const next = day.visits[s.visit + 1];
      sub = s.visit === 0 ? `${clock(day.start)} 출발${next ? ` → ${next.stop.name}` : ''}` : `${clock(v.leave)}까지 · ${formatDuration(v.leave - s.t)} 남음`;
      progress = s.progress;
    } else {
      const m = MODES[s.mode!];
      const leg = day.legs[s.visit - 1];
      chip = h('span', { class: 'chip-state', style: `--c:${MODE_COLORS[s.mode!]}` }, `${m.icon} ${s.kind === 'wait' ? `${m.label} 타러 가는 중` : m.label}`);
      title = `→ ${v.stop.name}`;
      sub = `${clock(leg.arrive)} 도착 예정 · ${formatDuration(leg.arrive - s.t)} 남음`;
      progress = s.kind === 'wait' ? 0 : s.progress;
    }
    const total = day.transport + day.places;
    replaceChildren(
      this.hud,
      h('div', { class: 'hud-top' }, h('span', { class: 'hud-time' }, clock(s.t)), chip),
      h('div', { class: 'hud-title' }, title),
      h('div', { class: 'hud-sub' }, sub),
      h('div', { class: 'hud-bar', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.round(progress * 100)}%` })),
      h(
        'dl',
        { class: 'hud-stats' },
        h('div', null, h('dt', null, '쓴 돈'), h('dd', null, formatMoney(region, s.spent))),
        h('div', null, h('dt', null, '남은 예상'), h('dd', null, formatMoney(region, Math.max(0, total - s.spent)))),
        h('div', null, h('dt', null, '이동'), h('dd', null, `${s.km.toFixed(1)}km`)),
      ),
      region.id === 'KR' ? null : h('div', { class: 'hud-fx' }, `≈ ${formatKrw(toKrw(region, s.spent))} 사용`),
    );
  }
}
