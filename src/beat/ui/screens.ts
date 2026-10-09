import { TIMING_BIN_MS, TIMING_BINS, type Grade, type Rank, type TimingSummary } from '../core/judge';
import { DIFFICULTIES, type Difficulty } from '../core/charts';
import type { TrackDef } from '../core/levels';
import { recordKey, type StageRecord } from '../core/records';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const SCREENS = ['title', 'pause', 'result', 'sync'] as const;
export type Screen = (typeof SCREENS)[number] | null;

/** Shows one overlay (or none, during play). */
export function show(screen: Screen): void {
  for (const id of SCREENS) $(id).hidden = id !== screen;
  $('pause-btn').hidden = screen !== null;
}

export function songLength(bpm: number, beats: number): string {
  const sec = Math.round((beats * 60) / bpm);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** The first track without a clear at this difficulty: where to go next. */
export function nextTrack(tracks: TrackDef[], records: Record<string, StageRecord>, d: Difficulty): number {
  const i = tracks.findIndex((t) => !records[recordKey(t.id, d)]?.rank);
  return i < 0 ? 0 : i;
}

const PLAY_ICON = '<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M0 0l12 7-12 7z"/></svg>';

export interface TrackInfo { beats: number; notes: number }

export function renderTracks(
  tracks: TrackDef[], info: TrackInfo[], records: Record<string, StageRecord>, d: Difficulty, onPick: (t: TrackDef) => void,
): HTMLButtonElement[] {
  const list = $('tracks');
  const next = nextTrack(tracks, records, d);
  const buttons = tracks.map((t, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'track';
    const p = t.palette;
    b.style.setProperty('--sky-top', p.skyTop);
    b.style.setProperty('--sky-bottom', p.skyBottom);
    b.style.setProperty('--track-accent', p.skyTop);
    const rec = records[recordKey(t.id, d)];
    const len = songLength(t.style.bpm, info[i].beats);
    const best = rec?.rank
      ? `<span class="badge" data-rank="${rec.rank}">${rec.rank}</span><b>${(rec.accuracy * 100).toFixed(1)}%</b>`
      : rec && rec.bestPct > 0 ? `최고 <b>${Math.floor(rec.bestPct * 100)}%</b>` : '—';
    b.innerHTML = `
      <span class="no">${String(i + 1).padStart(2, '0')}</span><span class="play">${PLAY_ICON}</span>
      <span class="title"><span class="name"></span><span class="sub"><span class="tagline"></span> · 노트 ${info[i].notes}</span></span>
      <span class="num">${t.style.bpm}</span><span class="num">${len}</span>
      <span class="best">${best}</span>`;
    b.querySelector('.name')!.textContent = t.name;
    b.querySelector('.tagline')!.textContent = t.tagline;
    if (i === next && !rec?.rank) {
      const tag = document.createElement('span');
      tag.className = 'next';
      tag.textContent = i === 0 && !rec ? '처음이면 여기' : '다음';
      b.querySelector('.name')!.appendChild(tag);
    }
    const recText = rec?.rank ? `클리어 ${rec.rank}, 정확도 ${(rec.accuracy * 100).toFixed(1)}%` : rec?.bestPct ? `최고 ${Math.floor(rec.bestPct * 100)}%` : '기록 없음';
    b.setAttribute('aria-label', `${i + 1}번 트랙 ${t.name}, ${t.style.bpm} BPM, ${len}, 노트 ${info[i].notes}개. ${recText}. 누르면 시작`);
    b.addEventListener('click', () => onPick(t));
    li.appendChild(b);
    return { li, b };
  });
  list.replaceChildren(...buttons.map((x) => x.li));
  return buttons.map((x) => x.b);
}

/** The difficulty switch above the tracklist. */
export function renderDifficulties(current: Difficulty, onChange: (d: Difficulty) => void): void {
  const box = $('diffs');
  box.replaceChildren(...DIFFICULTIES.map((d) => {
    const label = document.createElement('label');
    label.className = 'diff';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'difficulty';
    input.value = d.id;
    input.id = `diff-${d.id}`;
    input.checked = d.id === current;
    input.addEventListener('change', () => onChange(d.id));
    const span = document.createElement('span');
    span.innerHTML = `<b></b><small></small>`;
    span.querySelector('b')!.textContent = d.label;
    span.querySelector('small')!.textContent = d.blurb;
    label.append(input, span);
    return label;
  }));
}

export interface ResultView {
  stage: TrackDef;
  difficulty: string;
  rank: Rank;
  accuracy: number;
  counts: Record<Grade, number>;
  maxCombo: number;
  /** Phrases echoed back without a miss. */
  restored: number;
  phrases: number;
  practice: boolean;
  /** Played with the echo shadows turned off. */
  noHint: boolean;
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
  $('res-stage').textContent = `${r.stage.name} · ${r.difficulty} ${r.practice ? '연습 완료' : '클리어'}${r.noHint ? ' · 그림자 없이' : ''}`;
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
  $('res-attempts').textContent = `${r.restored}/${r.phrases}`;
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
