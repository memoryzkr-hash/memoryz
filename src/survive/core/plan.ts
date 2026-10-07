/**
 * 시험 생존모드: turns "time left until the exam" into a route the student can actually finish.
 * Pure function of (exam, now) — re-run it any time and the route adapts to the clock and to progress.
 */
import { projectedReadiness, readiness } from './readiness';
import type { Concept, Exam, Progress, StepKind } from './types';

/** How long a struggling student spends per card, a little pessimistic on purpose. */
export const STEP_SECONDS: Record<StepKind, number> = { recall: 35, explain: 25, mcq: 40, flash: 15, similar: 40 };
const REVIEW_SECONDS = 40;
/** Daily study a non-studier will plausibly do. */
const MINUTES_PER_DAY = 30;
const MAX_PLAN_DAYS = 7;

export type PlanMode = 'cram' | 'tonight' | 'days' | 'over';

export interface Plan {
  mode: PlanMode;
  hoursLeft: number;
  /** Calendar days until the exam date (0 = 시험 당일). */
  dDay: number;
  /** Days with study time left, today included. */
  studyDays: number;
  budgetMinutes: number;
  /** Ordered: concepts still to learn first (most important first), then finished ones. */
  route: Concept[];
  todo: Concept[];
  skipped: Concept[];
  /** Minutes to finish what is left of the route. */
  minutes: number;
  todayMinutes: number;
  counts: { concepts: number; memorize: number; problems: number };
  readiness: number;
  todayTarget: number;
  routeTarget: number;
}

export function parseLocal(dateTime: string): Date {
  const [d, t = '09:00'] = dateTime.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return new Date(y, m - 1, day, hh, mm);
}

export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function calendarDays(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

export function dDayLabel(dDay: number): string {
  if (dDay < 0) return '시험 끝';
  return dDay === 0 ? 'D-DAY' : `D-${dDay}`;
}

/** Seconds a concept still needs: the full path when new, a single review when shaky, nothing when solid. */
export function secondsLeft(c: Concept, p: Progress | undefined): number {
  if (p?.done) return p.shaky ? REVIEW_SECONDS : 0;
  let s = STEP_SECONDS.recall + STEP_SECONDS.explain + STEP_SECONDS.flash;
  if (c.mcq) s += STEP_SECONDS.mcq;
  if (c.similar) s += STEP_SECONDS.similar;
  // Students who already know it skip half the path; some need a review. Net ≈ 85 % + one review chance.
  return Math.round(s * 0.85 + REVIEW_SECONDS * 0.4);
}

export function budgetMinutes(hoursLeft: number): { mode: PlanMode; minutes: number; studyDays: number } {
  if (hoursLeft <= 0) return { mode: 'over', minutes: 0, studyDays: 0 };
  if (hoursLeft < 3) return { mode: 'cram', minutes: Math.round(Math.min(40, Math.max(10, hoursLeft * 60 * 0.5))), studyDays: 1 };
  if (hoursLeft < 24) return { mode: 'tonight', minutes: Math.round(Math.min(50, Math.max(40, hoursLeft * 60 * 0.07))), studyDays: 1 };
  const studyDays = Math.min(MAX_PLAN_DAYS, Math.ceil(hoursLeft / 24));
  return { mode: 'days', minutes: MINUTES_PER_DAY * studyDays, studyDays };
}

const byPriority = (a: Concept, b: Concept) => b.importance - a.importance || a.order - b.order;

export function makePlan(exam: Exam, now: Date): Plan {
  const examAt = parseLocal(exam.examAt);
  const hoursLeft = (examAt.getTime() - now.getTime()) / 3_600_000;
  const dDay = calendarDays(now, examAt);
  const budget = budgetMinutes(hoursLeft);
  const prog = (c: Concept) => exam.progress[c.id];

  const finished = exam.concepts.filter((c) => prog(c)?.done);
  const open = exam.concepts.filter((c) => !prog(c)?.done).sort(byPriority);

  // Finished-but-shaky concepts get their review out of the same budget first.
  let left = budget.minutes * 60 - finished.reduce((s, c) => s + secondsLeft(c, prog(c)), 0);
  const todo: Concept[] = [];
  for (const c of open) {
    const cost = secondsLeft(c, prog(c));
    // Always hand over at least three concepts: "3분만" has to have something in it.
    if (cost <= left || todo.length < Math.min(3, open.length)) {
      todo.push(c);
      left -= cost;
    } else if (left < 60) break;
  }
  if (budget.mode === 'over') todo.length = 0;

  const chosen = new Set([...todo, ...finished].map((c) => c.id));
  const skipped = exam.concepts.filter((c) => !chosen.has(c.id)).sort(byPriority);
  const route = [...todo, ...finished.sort(byPriority)];
  const seconds = route.reduce((s, c) => s + secondsLeft(c, prog(c)), 0);
  const minutes = Math.ceil(seconds / 60);
  const todayMinutes = budget.mode === 'over' ? 0 : budget.studyDays <= 1 ? minutes : Math.max(3, Math.ceil(minutes / budget.studyDays));

  const today: string[] = [];
  let acc = finished.reduce((s, c) => s + secondsLeft(c, prog(c)), 0);
  for (const c of todo) {
    acc += secondsLeft(c, prog(c));
    if (acc > todayMinutes * 60 + 30) break;
    today.push(c.id);
  }

  return {
    mode: budget.mode,
    hoursLeft,
    dDay,
    studyDays: budget.studyDays,
    budgetMinutes: budget.minutes,
    route,
    todo,
    skipped,
    minutes,
    todayMinutes,
    counts: {
      concepts: route.filter((c) => c.kind === 'concept').length,
      memorize: route.filter((c) => c.kind === 'memorize').length,
      problems: route.reduce((n, c) => n + (c.mcq ? 1 : 0) + (c.similar ? 1 : 0), 0),
    },
    readiness: readiness(exam),
    todayTarget: projectedReadiness(exam, today),
    routeTarget: projectedReadiness(exam, todo.map((c) => c.id)),
  };
}
