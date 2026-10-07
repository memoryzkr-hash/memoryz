import { describe, expect, it } from 'vitest';
import { budgetMinutes, calendarDays, dDayLabel, makePlan, parseLocal } from '../../src/survive/core/plan';
import { BASE, readiness } from '../../src/survive/core/readiness';
import { makeExam, NOW } from './helpers';

describe('budget', () => {
  it('shrinks with the clock', () => {
    expect(budgetMinutes(-1).mode).toBe('over');
    expect(budgetMinutes(1).mode).toBe('cram');
    expect(budgetMinutes(1).minutes).toBe(30);
    expect(budgetMinutes(2.9).minutes).toBeLessThanOrEqual(budgetMinutes(3).minutes);
    expect(budgetMinutes(23).minutes).toBeLessThanOrEqual(budgetMinutes(25).minutes);
    expect(budgetMinutes(12).mode).toBe('tonight');
    expect(budgetMinutes(37)).toEqual({ mode: 'days', minutes: 60, studyDays: 2 });
    expect(budgetMinutes(24 * 30).studyDays).toBe(7);
  });

  it('counts calendar days for the D-day badge', () => {
    expect(calendarDays(NOW, parseLocal('2026-10-09T09:00'))).toBe(2);
    expect(dDayLabel(0)).toBe('D-DAY');
    expect(dDayLabel(2)).toBe('D-2');
    expect(dDayLabel(-1)).toBe('시험 끝');
  });
});

describe('makePlan', () => {
  it('D-2: skips low-importance concepts and fits the budget', () => {
    const exam = makeExam();
    const plan = makePlan(exam, NOW);
    expect(plan.dDay).toBe(2);
    expect(plan.mode).toBe('days');
    expect(plan.minutes).toBeLessThanOrEqual(plan.budgetMinutes);
    expect(plan.todo.length).toBeGreaterThan(10);
    expect(plan.skipped.length).toBeGreaterThan(0);
    // Most important first; nothing skipped is more important than something kept.
    const minKept = Math.min(...plan.todo.map((c) => c.importance));
    expect(Math.max(...plan.skipped.map((c) => c.importance))).toBeLessThanOrEqual(minKept);
    expect(plan.todo[0].importance).toBe(5);
    expect(plan.readiness).toBe(BASE);
    expect(plan.todayTarget).toBeGreaterThan(plan.readiness);
    expect(plan.routeTarget).toBeGreaterThanOrEqual(plan.todayTarget);
    expect(plan.todayMinutes).toBeLessThan(plan.minutes);
  });

  it('the night before: smaller route, all of it today', () => {
    const plan = makePlan(makeExam(undefined, '2026-10-08T09:00'), NOW);
    expect(plan.mode).toBe('tonight');
    expect(plan.todayMinutes).toBe(plan.minutes);
    expect(plan.todo.length).toBeLessThan(makePlan(makeExam(), NOW).todo.length);
  });

  it('one hour left still hands over at least three concepts', () => {
    const plan = makePlan(makeExam(undefined, '2026-10-07T20:20'), NOW);
    expect(plan.mode).toBe('cram');
    expect(plan.todo.length).toBeGreaterThanOrEqual(3);
  });

  it('after the exam there is nothing to do', () => {
    const plan = makePlan(makeExam(undefined, '2026-10-01T09:00'), NOW);
    expect(plan.mode).toBe('over');
    expect(plan.todo).toEqual([]);
  });

  it('finished concepts leave the to-do list and make room for more', () => {
    const exam = makeExam();
    const before = makePlan(exam, NOW);
    for (const c of before.todo.slice(0, 5)) exam.progress[c.id] = { mastery: 1, seen: true, done: true, shaky: false, correct: 2, wrong: 0 };
    const after = makePlan(exam, NOW);
    expect(after.todo.map((c) => c.id)).not.toContain(before.todo[0].id);
    expect(after.route.length).toBeGreaterThanOrEqual(before.route.length);
    expect(after.readiness).toBeGreaterThan(before.readiness);
    expect(readiness(exam)).toBe(after.readiness);
  });
});
