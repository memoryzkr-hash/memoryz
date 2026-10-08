/** Plays a day's timeline in real time: play/pause, speed, scrubbing, and the live HUD. */
import { MODES } from '../core/modes';
import { formatMoney, formatKrw, toKrw, type Region } from '../core/regions';
import type { DaySchedule } from '../core/schedule';
import { buildTimeline, stateAt, type SimState, type Timeline } from '../core/sim';
import { formatClock, formatDuration } from '../core/time';
import { h, replaceChildren } from '../../assistant/ui/dom';

/** Simulated minutes per real second. */
export const SPEEDS = [
  { value: 1, label: '1분/초' },
  { value: 5, label: '5분/초' },
  { value: 10, label: '10분/초' },
  { value: 20, label: '20분/초' },
  { value: 60, label: '1시간/초' },
];

export interface PlayerView {
  hud: HTMLElement;
  controls: HTMLElement;
}

export class Player {
  private day: DaySchedule | null = null;
  private region: Region | null = null;
  tl: Timeline | null = null;
  private t = 0;
  private playing = false;
  private speed = 10;
  private raf = 0;
  private last = 0;

  readonly hud = h('div', { class: 'hud', 'aria-live': 'off' });
  private playBtn = h('button', { type: 'button', class: 'play', 'aria-label': '재생' }, '▶');
  private scrub = h('input', { type: 'range', class: 'scrub', min: 0, max: 1, step: 1, value: 0, 'aria-label': '시뮬레이션 시각' });
  private clockEl = h('span', { class: 'clock' }, '--:--');
  private speedSel = h(
    'select',
    { class: 'speed', 'aria-label': '재생 속도 (1초에 흐르는 시간)' },
    ...SPEEDS.map((s) => h('option', { value: String(s.value), selected: s.value === 10 }, s.label)),
  );
  private followBox = h('input', { type: 'checkbox' });
  readonly controls = h(
    'div',
    { class: 'controls' },
    this.playBtn,
    h('button', { type: 'button', class: 'ghost', 'aria-label': '처음으로', onClick: () => this.seek(this.tl?.start ?? 0) }, '⏮'),
    this.clockEl,
    this.scrub,
    this.speedSel,
    h('label', { class: 'follow', title: '여행자를 따라 지도 이동' }, this.followBox, '따라가기'),
  );

  constructor(private readonly onState: (s: SimState, tl: Timeline) => void, private readonly onFollow: (on: boolean) => void) {
    this.playBtn.addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    this.scrub.addEventListener('input', () => {
      this.pause();
      this.seek(Number(this.scrub.value));
    });
    this.speedSel.addEventListener('change', () => (this.speed = Number(this.speedSel.value)));
    this.followBox.addEventListener('change', () => this.onFollow(this.followBox.checked));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
  }

  /** New or edited day. Keeps the clock where it was when `keepTime` (editing while watching). */
  load(day: DaySchedule, region: Region, keepTime: boolean): void {
    this.day = day;
    this.region = region;
    this.tl = buildTimeline(day);
    this.scrub.min = String(this.tl.start);
    this.scrub.max = String(Math.max(this.tl.start + 1, this.tl.end));
    this.seek(keepTime ? this.t : this.tl.start);
    if (!keepTime) this.pause();
  }

  play(): void {
    if (!this.tl) return;
    if (this.t >= this.tl.end) this.seek(this.tl.start);
    this.playing = true;
    this.playBtn.textContent = '⏸';
    this.playBtn.setAttribute('aria-label', '일시정지');
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this.playing = false;
    this.playBtn.textContent = '▶';
    this.playBtn.setAttribute('aria-label', '재생');
    cancelAnimationFrame(this.raf);
  }

  seek(t: number): void {
    if (!this.tl || !this.day) return;
    this.t = Math.min(Math.max(t, this.tl.start), this.tl.end);
    this.scrub.value = String(Math.round(this.t));
    const s = stateAt(this.day, this.tl, this.t);
    this.clockEl.textContent = formatClock(this.t);
    this.drawHud(s);
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

  private drawHud(s: SimState): void {
    const day = this.day!;
    const region = this.region!;
    const v = day.visits[s.visit];
    let status: string;
    let detail = '';
    if (s.kind === 'done') {
      status = '🏁 하루 일정 끝';
      detail = `${formatClock(day.end)} 도착 · ${v?.stop.name ?? ''}`;
    } else if (s.kind === 'stay') {
      const waiting = v && s.t < v.begin;
      status = `${waiting ? '⏳ 문 열기를 기다리는 중' : '📍 머무는 중'} · ${v?.stop.name ?? ''}`;
      detail = s.visit === 0 ? `${formatClock(day.start)} 출발 예정` : `${formatClock(v.leave)}까지 · 남은 ${formatDuration(v.leave - s.t)}`;
    } else {
      const m = MODES[s.mode!];
      const leg = day.legs[s.visit - 1];
      status = s.kind === 'wait' ? `${m.icon} ${m.label} 타러 가는 중` : `${m.icon} ${m.label}로 이동 중`;
      detail = `→ ${v.stop.name} · ${formatClock(leg.arrive)} 도착 예정 (${Math.round(s.progress * 100)}%)`;
    }
    const krw = region.id === 'KR' ? '' : ` (${formatKrw(toKrw(region, s.spent))})`;
    replaceChildren(
      this.hud,
      h('div', { class: 'hud-time' }, formatClock(s.t)),
      h('div', { class: 'hud-status' }, status),
      h('div', { class: 'hud-detail' }, detail),
      h(
        'div',
        { class: 'hud-stats' },
        h('span', null, '💸 ', h('b', null, formatMoney(region, s.spent)), krw),
        h('span', null, '📏 ', h('b', null, `${s.km.toFixed(1)}km`)),
      ),
    );
  }
}
