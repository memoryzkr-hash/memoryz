/**
 * AI 자동코스: decides the next card from how the student answered.
 *
 * Default path for a concept the student does not know (spec §4B):
 *   Recall → 20초 설명 → 선택형 → 암기카드 → 유사문제 → 다음 핵심개념
 * Knows it already (recall ✓ then 선택형 ✓) → skip the rest.
 * Missed or 헷갈림 → the concept comes back as a review a few cards later.
 */
import { emptyProgress, readiness, shown } from './readiness';
import type { Concept, CourseState, Exam, Progress, Response, Step, StepKind } from './types';

const REVIEW_GAP = 4;
const MAX_REVIEW_TRIES = 2;

export type GainLabel = '정답' | '헷갈리던 개념 복습 완료' | '핵심 개념 학습 완료' | '설명 확인' | '암기 완료';

export interface Outcome {
  /** null for cards with no right answer (설명, 헷갈림). */
  correct: boolean | null;
  /** Index of the right option on choice cards, so the screen can mark it. */
  answerIndex: number | null;
  gains: GainLabel[];
  before: number;
  after: number;
  /** The concept just finished with this card. */
  finished: Concept | null;
}

export function newCourse(): CourseState {
  return { conceptId: null, queue: [], reviews: [], answered: 0, trouble: false };
}

function progressOf(exam: Exam, id: string): Progress {
  return (exam.progress[id] ??= emptyProgress());
}

function find(exam: Exam, id: string): Concept | undefined {
  return exam.concepts.find((c) => c.id === id);
}

function reviewKind(c: Concept, last: StepKind | null): StepKind {
  const order: StepKind[] = ['similar', 'mcq', 'flash'];
  const usable = order.filter((k) => (k === 'similar' ? c.similar : k === 'mcq' ? c.mcq : true));
  return usable.find((k) => k !== last) ?? usable[0];
}

/** Brings back shaky concepts from earlier sessions that are still on the route. */
export function seedReviews(exam: Exam, course: CourseState, routeIds: string[]): void {
  for (const id of routeIds) {
    const p = exam.progress[id];
    if (p?.done && p.shaky && !course.reviews.some((r) => r.conceptId === id)) {
      course.reviews.push({ conceptId: id, due: course.answered + 2 + course.reviews.length * 2, tries: 0 });
    }
  }
}

/**
 * The card to show now, or null when the route is finished.
 * `routeIds` is the plan's to-do list in priority order; it can change between calls (the plan adapts).
 */
export function currentStep(exam: Exam, course: CourseState, routeIds: string[]): Step | null {
  if (course.conceptId && course.queue.length) return course.queue[0];

  // Between concepts: a due review first, so mistakes come back while they are fresh.
  const due = course.reviews.filter((r) => r.due <= course.answered && find(exam, r.conceptId));
  const nextNew = routeIds.find((id) => !exam.progress[id]?.done && find(exam, id));
  const review = due[0] ?? (nextNew ? undefined : course.reviews.find((r) => find(exam, r.conceptId)));
  if (review) {
    const c = find(exam, review.conceptId)!;
    return { kind: reviewKind(c, null), conceptId: c.id, review: true };
  }
  if (!nextNew) return null;
  course.conceptId = nextNew;
  course.queue = [{ kind: 'recall', conceptId: nextNew, review: false }];
  course.trouble = false;
  return course.queue[0];
}

function path(c: Concept, from: StepKind[]): Step[] {
  return from
    .filter((k) => (k === 'mcq' ? c.mcq : k === 'similar' ? c.similar : true))
    .map((kind) => ({ kind, conceptId: c.id, review: false }));
}

const add = (p: Progress, amount: number) => {
  p.mastery = Math.min(1, Math.max(0, p.mastery + amount));
};

function isRight(c: Concept, step: Step, r: Response): boolean | null {
  if (r.type === 'choose') {
    const q = step.kind === 'similar' ? c.similar : c.mcq;
    return q ? q.answer === r.index : null;
  }
  if (r.type === 'knew') return true;
  if (r.type === 'missed' || r.type === 'dontknow') return false;
  return null;
}

export function respond(exam: Exam, course: CourseState, step: Step, r: Response): Outcome {
  const c = find(exam, step.conceptId);
  if (!c) throw new Error(`unknown concept ${step.conceptId}`);
  const before = readiness(exam);
  const p = progressOf(exam, c.id);
  p.seen = true;
  const gains: GainLabel[] = [];
  const right = step.kind === 'explain' ? null : isRight(c, step, r);
  const choiceQ = step.kind === 'mcq' ? c.mcq : step.kind === 'similar' ? c.similar : null;
  let finished: Concept | null = null;
  course.answered++;

  if (right === true) {
    p.correct++;
    gains.push('정답');
  } else if (right === false) p.wrong++;

  if (step.review) {
    const idx = course.reviews.findIndex((x) => x.conceptId === c.id);
    const entry = idx >= 0 ? course.reviews[idx] : null;
    if (right === true) {
      add(p, 0.25);
      p.shaky = false;
      gains.push('헷갈리던 개념 복습 완료');
      if (idx >= 0) course.reviews.splice(idx, 1);
    } else if (entry) {
      entry.tries++;
      entry.due = course.answered + REVIEW_GAP + 1;
      // Two misses in one sitting: leave it for next time instead of grinding.
      if (entry.tries >= MAX_REVIEW_TRIES) course.reviews.splice(idx, 1);
    }
    return { correct: right, answerIndex: choiceQ?.answer ?? null, gains, before, after: readiness(exam), finished };
  }

  // Normal path: drop the card just answered, then decide what comes next.
  course.queue.shift();
  const queued = (k: StepKind) => course.queue.some((s) => s.kind === k);

  switch (step.kind) {
    case 'recall':
      if (r.type === 'knew') {
        add(p, 0.35);
        // Prove it with one choice question; the explanation is skipped.
        course.queue = path(c, c.mcq ? ['mcq'] : ['flash']);
      } else {
        if (r.type === 'unsure') add(p, 0.05);
        course.trouble = true;
        course.queue = path(c, ['explain', 'mcq', 'flash', 'similar']);
      }
      break;
    case 'explain':
      if (p.mastery < 0.1) add(p, 0.08);
      if (r.type === 'unsure') course.trouble = true;
      gains.push('설명 확인');
      break;
    case 'mcq':
    case 'similar':
      if (right) add(p, course.trouble ? 0.2 : 0.25);
      else {
        course.trouble = true;
        if (step.kind === 'mcq') {
          // Knew-it shortcut failed: fall back to the full path.
          if (!queued('explain') && !queued('flash')) course.queue.unshift(...path(c, ['explain']));
          if (!queued('similar')) course.queue.push(...path(c, ['similar']));
        }
      }
      break;
    case 'flash':
      if (r.type === 'knew') {
        add(p, 0.1);
        gains.push('암기 완료');
      } else course.trouble = true;
      break;
  }

  if (course.queue.length === 0) {
    p.done = true;
    add(p, 0.15);
    gains.push('핵심 개념 학습 완료');
    if (course.trouble) {
      p.shaky = true;
      p.mastery = Math.min(p.mastery, 0.6);
      course.reviews.push({ conceptId: c.id, due: course.answered + REVIEW_GAP, tries: 0 });
    } else p.shaky = false;
    finished = c;
    course.conceptId = null;
    course.trouble = false;
  }

  return { correct: right, answerIndex: choiceQ?.answer ?? null, gains, before, after: readiness(exam), finished };
}

/** "+3 준비도" only when the number on the gauge actually moved. */
export function shownGain(o: Outcome): number {
  return shown(o.after) - shown(o.before);
}
