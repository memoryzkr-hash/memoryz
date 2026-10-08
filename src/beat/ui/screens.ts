import type { Grade, Rank } from '../core/judge';
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

function recordLine(rec: StageRecord | undefined): string {
  if (!rec) return '';
  if (rec.rank) return `클리어 ${rec.rank} · ${(rec.accuracy * 100).toFixed(1)}%`;
  return rec.bestPct > 0 ? `최고 ${Math.floor(rec.bestPct * 100)}%` : '';
}

export function renderStages(stages: StageDef[], records: Record<string, StageRecord>, onPick: (s: StageDef) => void): void {
  const box = $('stages');
  box.replaceChildren();
  stages.forEach((s, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'stage-card';
    const p = s.palette;
    card.style.setProperty('--ground', p.ground);
    card.style.setProperty('--edge', p.edge);
    card.style.setProperty('--card-beat', `${60 / s.bpm}s`);
    card.innerHTML = `
      <div class="art" style="background: linear-gradient(${p.skyTop}, ${p.skyBottom})"><span class="num">${i + 1}</span><span class="ball"></span></div>
      <div class="body">
        <span class="name"></span>
        <span class="meta"><b>${s.bpm} BPM</b> · <span class="dots">${'●'.repeat(s.difficulty)}${'○'.repeat(3 - s.difficulty)}</span></span>
        <span class="meta tagline"></span>
        <span class="best"></span>
      </div>`;
    card.querySelector('.name')!.textContent = s.name;
    card.querySelector('.tagline')!.textContent = s.tagline;
    card.querySelector('.best')!.textContent = recordLine(records[s.id]);
    card.setAttribute('aria-label', `${i + 1}단계 ${s.name}, ${s.bpm} BPM. ${recordLine(records[s.id])}`);
    card.addEventListener('click', () => onPick(s));
    box.appendChild(card);
  });
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
}
