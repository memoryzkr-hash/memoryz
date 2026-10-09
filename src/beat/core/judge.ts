import { WINDOW_MS } from './constants';

export type Grade = 'perfect' | 'great' | 'good' | 'miss';
export type Rank = 'S' | 'A' | 'B' | 'C';

export interface Judgement {
  /** Index of the note in the song. */
  note: number;
  grade: Grade;
  /** Negative = early. 0 for misses. */
  deltaMs: number;
}

export const GRADE_POINTS: Record<Grade, number> = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };

export function rankFor(accuracy: number, misses: number): Rank {
  if (accuracy >= 0.95 && misses === 0) return 'S';
  if (accuracy >= 0.85) return 'A';
  if (accuracy >= 0.7) return 'B';
  return 'C';
}

export function gradeFor(deltaMs: number): Grade {
  const d = Math.abs(deltaMs);
  if (d <= WINDOW_MS.perfect) return 'perfect';
  if (d <= WINDOW_MS.great) return 'great';
  return 'good';
}

export interface TimingSummary {
  /** Mean offset of the hit presses in ms (negative = early), 0 with none. */
  mean: number;
  /** Press counts in 13 bins of 20 ms from -130 to +130 ms; the edge bins also take anything further out. */
  bins: number[];
  hits: number;
}

export const TIMING_BIN_MS = 20;
export const TIMING_BINS = 13;

export function timingSummary(judged: (Judgement | null)[]): TimingSummary {
  const deltas = judged.filter((j): j is Judgement => j !== null && j.grade !== 'miss').map((j) => j.deltaMs);
  const bins = new Array(TIMING_BINS).fill(0);
  const mid = (TIMING_BINS - 1) / 2;
  for (const d of deltas) bins[Math.max(0, Math.min(TIMING_BINS - 1, Math.round(d / TIMING_BIN_MS) + mid))]++;
  const mean = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
  return { mean, bins, hits: deltas.length };
}
