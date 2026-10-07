import { describe, expect, it } from 'vitest';
import { currentStep, newCourse, respond, seedReviews, shownGain } from '../../src/survive/core/engine';
import { makePlan } from '../../src/survive/core/plan';
import { readiness } from '../../src/survive/core/readiness';
import type { Response } from '../../src/survive/core/types';
import { makeExam, NOW } from './helpers';

function setup() {
  const exam = makeExam();
  const course = newCourse();
  const route = makePlan(exam, NOW).todo.map((c) => c.id);
  return { exam, course, route };
}

describe('자동코스', () => {
  it('a concept the student does not know runs the full path', () => {
    const { exam, course, route } = setup();
    const kinds: string[] = [];
    let step = currentStep(exam, course, route)!;
    const first = step.conceptId;
    kinds.push(step.kind);
    respond(exam, course, step, { type: 'dontknow' });
    while ((step = currentStep(exam, course, route)!) && step.conceptId === first && !step.review) {
      kinds.push(step.kind);
      const c = exam.concepts.find((x) => x.id === first)!;
      const r: Response = step.kind === 'mcq' ? { type: 'choose', index: c.mcq!.answer } : step.kind === 'similar' ? { type: 'choose', index: c.similar!.answer } : step.kind === 'flash' ? { type: 'knew' } : { type: 'next' };
      respond(exam, course, step, r);
    }
    expect(kinds).toEqual(['recall', 'explain', 'mcq', 'flash', 'similar']);
    expect(exam.progress[first].done).toBe(true);
    // Said 모르겠음 once → comes back as a review later.
    expect(exam.progress[first].shaky).toBe(true);
    expect(course.reviews.map((r) => r.conceptId)).toContain(first);
  });

  it('knew it → one check question, explanation skipped', () => {
    const { exam, course, route } = setup();
    const s1 = currentStep(exam, course, route)!;
    respond(exam, course, s1, { type: 'knew' });
    const s2 = currentStep(exam, course, route)!;
    expect(s2.kind).toBe('mcq');
    const c = exam.concepts.find((x) => x.id === s1.conceptId)!;
    const o = respond(exam, course, s2, { type: 'choose', index: c.mcq!.answer });
    expect(o.correct).toBe(true);
    expect(o.gains).toContain('정답');
    expect(o.gains).toContain('핵심 개념 학습 완료');
    expect(o.finished?.id).toBe(c.id);
    expect(exam.progress[c.id].shaky).toBe(false);
    expect(currentStep(exam, course, route)!.conceptId).not.toBe(c.id);
  });

  it('knew it but the check failed → explanation and a similar problem', () => {
    const { exam, course, route } = setup();
    const s1 = currentStep(exam, course, route)!;
    respond(exam, course, s1, { type: 'knew' });
    const c = exam.concepts.find((x) => x.id === s1.conceptId)!;
    const wrong = (c.mcq!.answer + 1) % c.mcq!.options.length;
    const o = respond(exam, course, currentStep(exam, course, route)!, { type: 'choose', index: wrong });
    expect(o.correct).toBe(false);
    expect(o.answerIndex).toBe(c.mcq!.answer);
    expect(course.queue.map((s) => s.kind)).toEqual(['explain', 'similar']);
  });

  it('a shaky concept comes back after a few cards, and fixing it counts', () => {
    const { exam, course, route } = setup();
    const s1 = currentStep(exam, course, route)!;
    respond(exam, course, s1, { type: 'unsure' });
    // Finish the first concept answering everything right.
    for (let s = currentStep(exam, course, route)!; s.conceptId === s1.conceptId && !s.review; s = currentStep(exam, course, route)!) {
      const c = exam.concepts.find((x) => x.id === s.conceptId)!;
      respond(exam, course, s, s.kind === 'mcq' ? { type: 'choose', index: c.mcq!.answer } : s.kind === 'similar' ? { type: 'choose', index: c.similar!.answer } : { type: 'knew' });
    }
    let review = null;
    for (let i = 0; i < 20 && !review; i++) {
      const s = currentStep(exam, course, route)!;
      if (s.review) review = s;
      else respond(exam, course, s, s.kind === 'recall' ? { type: 'knew' } : s.kind === 'mcq' ? { type: 'choose', index: exam.concepts.find((x) => x.id === s.conceptId)!.mcq!.answer } : { type: 'knew' });
    }
    expect(review?.conceptId).toBe(s1.conceptId);
    const c = exam.concepts.find((x) => x.id === s1.conceptId)!;
    const q = review!.kind === 'similar' ? c.similar! : c.mcq!;
    const o = respond(exam, course, review!, { type: 'choose', index: q.answer });
    expect(o.gains).toContain('헷갈리던 개념 복습 완료');
    expect(exam.progress[c.id].shaky).toBe(false);
  });

  it('a review missed twice is left for next time', () => {
    const { exam, course, route } = setup();
    const id = route[0];
    exam.progress[id] = { mastery: 0.5, seen: true, done: true, shaky: true, correct: 0, wrong: 1 };
    seedReviews(exam, course, route);
    course.answered = 10;
    const c = exam.concepts.find((x) => x.id === id)!;
    for (let i = 0; i < 2; i++) {
      const step = { kind: 'mcq' as const, conceptId: id, review: true };
      respond(exam, course, step, { type: 'dontknow' });
    }
    expect(course.reviews.find((r) => r.conceptId === c.id)).toBeUndefined();
    expect(exam.progress[id].shaky).toBe(true);
  });

  it('준비도 only goes up and the shown gain matches the gauge', () => {
    const { exam, course, route } = setup();
    let last = readiness(exam);
    for (let i = 0; i < 60; i++) {
      const s = currentStep(exam, course, route);
      if (!s) break;
      const r: Response = i % 3 === 0 ? { type: 'dontknow' } : s.kind === 'explain' ? { type: 'next' } : { type: 'knew' };
      const o = respond(exam, course, s, s.kind === 'mcq' || s.kind === 'similar' ? { type: 'choose', index: 0 } : r);
      expect(o.after).toBeGreaterThanOrEqual(o.before);
      expect(o.before).toBeCloseTo(last);
      expect(shownGain(o)).toBe(Math.round(o.after) - Math.round(o.before));
      last = o.after;
    }
    expect(last).toBeGreaterThan(20);
    expect(last).toBeLessThanOrEqual(95);
  });

  it('runs to the end of the route and stops', () => {
    const { exam, course, route } = setup();
    let n = 0;
    for (let s = currentStep(exam, course, route); s; s = currentStep(exam, course, route)) {
      const c = exam.concepts.find((x) => x.id === s!.conceptId)!;
      respond(exam, course, s, s.kind === 'mcq' ? { type: 'choose', index: c.mcq!.answer } : s.kind === 'similar' ? { type: 'choose', index: c.similar!.answer } : { type: 'knew' });
      if (++n > 500) throw new Error('never ends');
    }
    expect(route.every((id) => exam.progress[id].done)).toBe(true);
    expect(makePlan(exam, NOW).routeTarget).toBeGreaterThan(0);
  });
});
