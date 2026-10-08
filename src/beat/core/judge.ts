import { MATCH_BEATS, WINDOW_MS } from './constants';
import type { Note } from './chart';

export type Grade = 'perfect' | 'great' | 'good' | 'miss';
export type Rank = 'S' | 'A' | 'B' | 'C';

export interface Judgement {
  note: number;
  grade: Grade;
  /** Negative = early. 0 for misses. */
  deltaMs: number;
}

export const GRADE_POINTS: Record<Grade, number> = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };

export function gradeFor(deltaMs: number): Grade {
  const d = Math.abs(deltaMs);
  if (d <= WINDOW_MS.perfect) return 'perfect';
  if (d <= WINDOW_MS.great) return 'great';
  return 'good';
}

export interface JudgeState {
  judged: (Judgement | null)[];
  counts: Record<Grade, number>;
  combo: number;
  maxCombo: number;
  points: number;
}

export class Judge {
  state: JudgeState;

  constructor(readonly notes: Note[], readonly bpm: number) {
    this.state = Judge.empty(notes.length);
  }

  static empty(n: number): JudgeState {
    return { judged: new Array(n).fill(null), counts: { perfect: 0, great: 0, good: 0, miss: 0 }, combo: 0, maxCombo: 0, points: 0 };
  }

  snapshot(): JudgeState {
    const s = this.state;
    return { ...s, judged: [...s.judged], counts: { ...s.counts } };
  }

  restore(s: JudgeState): void {
    this.state = { ...s, judged: [...s.judged], counts: { ...s.counts } };
  }

  private record(j: Judgement): Judgement {
    const s = this.state;
    s.judged[j.note] = j;
    s.counts[j.grade]++;
    s.points += GRADE_POINTS[j.grade];
    s.combo = j.grade === 'miss' ? 0 : s.combo + 1;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    return j;
  }

  /** A jump (or a ring jump) left the ground at beat t. Matches it to the nearest open note of that kind. */
  hit(t: number, action: 'jump' | 'orb'): Judgement | null {
    let best = -1;
    let bestD = Infinity;
    this.notes.forEach((n, i) => {
      if (this.state.judged[i] || (n.kind === 'orb') !== (action === 'orb')) return;
      const d = Math.abs(t - n.beat);
      if (d <= MATCH_BEATS && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best < 0) return null;
    const deltaMs = ((t - this.notes[best].beat) * 60000) / this.bpm;
    return this.record({ note: best, grade: gradeFor(deltaMs), deltaMs });
  }

  /** Notes that went by unpressed before beat t. */
  sweep(t: number): Judgement[] {
    const out: Judgement[] = [];
    this.notes.forEach((n, i) => {
      if (!this.state.judged[i] && n.beat < t - MATCH_BEATS) out.push(this.record({ note: i, grade: 'miss', deltaMs: 0 }));
    });
    return out;
  }

  judgedCount(): number {
    const c = this.state.counts;
    return c.perfect + c.great + c.good + c.miss;
  }

  /** 0..1 over the notes judged so far (1 before any). */
  accuracy(): number {
    const n = this.judgedCount();
    return n ? this.state.points / n : 1;
  }

  rank(): Rank {
    const a = this.accuracy();
    if (a >= 0.95 && this.state.counts.miss === 0) return 'S';
    if (a >= 0.85) return 'A';
    if (a >= 0.7) return 'B';
    return 'C';
  }
}
