/**
 * 시험 준비도: how much of what matters the student holds right now. Not a score prediction.
 * Weighted by importance, so the concepts we skip on purpose cost little.
 */
import type { Concept, Exam, Progress } from './types';

/** Starting credit for uploading the material — the first step counts. */
export const BASE = 5;
const SPAN = 90;

export function weight(c: Concept): number {
  return Math.pow(Math.max(1, Math.min(5, c.importance)), 1.5);
}

export function emptyProgress(): Progress {
  return { mastery: 0, seen: false, done: false, shaky: false, correct: 0, wrong: 0 };
}

export function readinessOf(concepts: Concept[], mastery: (c: Concept) => number): number {
  let total = 0;
  let held = 0;
  for (const c of concepts) {
    const w = weight(c);
    total += w;
    held += w * Math.max(0, Math.min(1, mastery(c)));
  }
  return total ? BASE + (SPAN * held) / total : BASE;
}

export function readiness(exam: Exam): number {
  return readinessOf(exam.concepts, (c) => exam.progress[c.id]?.mastery ?? 0);
}

/** What 준비도 would be if the student reached a typical level on these concepts. */
export function projectedReadiness(exam: Exam, ids: Iterable<string>, typical = 0.75): number {
  const boost = new Set(ids);
  return readinessOf(exam.concepts, (c) => {
    const m = exam.progress[c.id]?.mastery ?? 0;
    return boost.has(c.id) ? Math.max(m, typical) : m;
  });
}

export const shown = (r: number) => Math.max(0, Math.min(100, Math.round(r)));
