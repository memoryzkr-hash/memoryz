import { TIMING_BIN_MS, TIMING_BINS, type Grade, type Rank, type TimingSummary } from '../core/judge';
import type { StageDef } from '../core/levels';
import type { StageRecord } from '../core/records';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const SCREENS = ['title', 'pause', 'result', 'sync'] as const;
export type Screen = (typeof SCREENS)[number] | null;

/** Shows one overlay (or none, during play). */
export function show(screen: Screen): void {
  for (const id of SCREENS) $(id).hidden = id !== screen;
  $('pause-btn').hidden = screen !== null;
}

export function songLength(stage: StageDef, bars: number): string {
  const sec = Math.round((bars * 4 * 60) / stage.bpm);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** The first track without a clear: where a new player should go next. */
export function nextTrack(stages: StageDef[], records: Record<string, StageRecord>): number {
  const i = stages.findIndex((s) => !records[s.id]?.rank);
  return i < 0 ? 0 : i;
}

const PLAY_ICON = '<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M0 0l12 7-12 7z"/></svg>';

export function renderTracks(
  stages: StageDef[], bars: number[], records: Record<string, StageRecord>, onPick: (s: StageDef) => void,
): HTMLButtonElement[] {
  const list = $('tracks');
  const next = nextTrack(stages, records);
  const buttons = stages.map((s, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'track';
    const p = s.palette;
    b.style.setProperty('--sky-top', p.skyTop);
    b.style.setProperty('--sky-bottom', p.skyBottom);
    b.style.setProperty('--track-accent', p.skyTop);
    const rec = records[s.id];
    const len = songLength(s, bars[i]);
    const best = rec?.rank
      ? `<span class="badge" data-rank="${rec.rank}">${rec.rank}</span><b>${(rec.accuracy * 100).toFixed(1)}%</b>`
      : rec && rec.bestPct > 0 ? `최고 <b>${Math.floor(rec.bestPct * 100)}%</b>` : '—';
    b.innerHTML = `
      <span class="no">${String(i + 1).padStart(2, '0')}</span><span class="play">${PLAY_ICON}</span>
      <span class="title"><span class="name"></span><span class="sub"><span class="dots">${'●'.repeat(s.difficulty)}${'○'.repeat(3 - s.difficulty)}</span><span class="tagline"></span></span></span>
      <span class="num">${s.bpm}</span><span class="num">${len}</span>
      <span class="best">${best}</span>`;
    b.querySelector('.name')!.textContent = s.name;
    b.querySelector('.tagline')!.textContent = s.tagline;
    if (i === next && !rec?.rank) {
      const tag = document.createElement('span');
      tag.className = 'next';
      tag.textContent = i === 0 && !rec ? '처음이면 여기' : '다음';
      b.querySelector('.name')!.appendChild(tag);
    }
    const recText = rec?.rank ? `클리어 ${rec.rank}, 정확도 ${(rec.accuracy * 100).toFixed(1)}%` : rec?.bestPct ? `최고 ${Math.floor(rec.bestPct * 100)}%` : '기록 없음';
    b.setAttribute('aria-label', `${i + 1}번 트랙 ${s.name}, ${s.bpm} BPM, ${len}, 난이도 ${s.difficulty}. ${recText}. 누르면 시작`);
    b.addEventListener('click', () => onPick(s));
    li.appendChild(b);
    return { li, b };
  });
  list.replaceChildren(...buttons.map((x) => x.li));
  return buttons.map((x) => x.b);
}

export interface ResultView {
  stage: StageDef;
  rank: Rank;
  accuracy: number;
  counts: Record<Grade, number>;
  maxCombo: number;
  attempts: number;
  practice: boolean;
  improved: boolean;
  hasNext: boolean;
  timing: TimingSummary;
}

/** Below this many hits the average says little; above this offset it is worth calibrating. */
const SYNC_MIN_HITS = 8;
const SYNC_SUGGEST_MS = 25;

export function timingText(t: TimingSummary): string {
  if (!t.hits) return '기록 없음';
  const m = Math.round(t.mean);
  if (Math.abs(m) < 10) return `거의 정박 (평균 ${m > 0 ? '+' : ''}${m}ms)`;
  return `평균 ${Math.abs(m)}ms ${m > 0 ? '늦게' : '빠르게'}`;
}

export function fillResult(r: ResultView): void {
  $('res-stage').textContent = r.practice ? `${r.stage.name} 연습 완료` : `${r.stage.name} 클리어`;
  const rank = $('res-rank');
  rank.textContent = r.rank;
  rank.dataset.rank = r.rank;
  // Restart the entrance animation.
  rank.style.animation = 'none';
  void rank.offsetWidth;
  rank.style.animation = '';
  $('res-new').hidden = !r.improved;
  $('res-acc').textContent = `${(r.accuracy * 100).toFixed(1)}%`;
  $('res-perfect').textContent = String(r.counts.perfect);
  $('res-great').textContent = String(r.counts.great);
  $('res-good').textContent = String(r.counts.good);
  $('res-miss').textContent = String(r.counts.miss);
  $('res-combo').textContent = String(r.maxCombo);
  $('res-attempts').textContent = String(r.attempts);
  $('next').hidden = !r.hasNext;

  $('res-avg').textContent = timingText(r.timing);
  const peak = Math.max(1, ...r.timing.bins);
  const mid = (TIMING_BINS - 1) / 2;
  $('res-hist').replaceChildren(...r.timing.bins.map((n, k) => {
    const bar = document.createElement('i');
    const ms = Math.abs(k - mid) * TIMING_BIN_MS;
    bar.className = ms <= 40 ? 'perfect' : ms <= 80 ? 'great' : 'good';
    bar.style.height = `${(n / peak) * 100}%`;
    return bar;
  }));
  $('res-sync').hidden = !(r.timing.hits >= SYNC_MIN_HITS && Math.abs(r.timing.mean) >= SYNC_SUGGEST_MS);
}
