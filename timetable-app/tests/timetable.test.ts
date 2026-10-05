import { describe, expect, it } from 'vitest';

import { dayFromDate, formatTime, hourRange, overlaps, pickColor, todayStatus, validateCourse, visibleDays, COURSE_COLORS } from '../src/timetable';
import type { Course, CourseDraft } from '../src/types';

const course = (over: Partial<Course> = {}): Course => ({
  id: 'a',
  name: '자료구조',
  room: '',
  professor: '',
  day: 0,
  start: 9 * 60,
  end: 10 * 60 + 15,
  color: COURSE_COLORS[0],
  ...over,
});

const draft = (over: Partial<CourseDraft> = {}): CourseDraft => {
  const { id: _id, ...rest } = course(over);
  return rest;
};

describe('formatTime', () => {
  it('pads hours and minutes', () => {
    expect(formatTime(9 * 60 + 5)).toBe('09:05');
    expect(formatTime(24 * 60)).toBe('24:00');
  });
});

describe('dayFromDate', () => {
  it('starts the week on Monday', () => {
    expect(dayFromDate(new Date(2026, 9, 5))).toBe(0); // 2026-10-05 is a Monday
    expect(dayFromDate(new Date(2026, 9, 11))).toBe(6); // Sunday
  });
});

describe('overlaps', () => {
  it('treats back-to-back classes as not overlapping', () => {
    expect(overlaps(course(), course({ start: 10 * 60 + 15, end: 11 * 60 }))).toBe(false);
  });
  it('detects partial overlap on the same day only', () => {
    expect(overlaps(course(), course({ start: 10 * 60, end: 11 * 60 }))).toBe(true);
    expect(overlaps(course(), course({ day: 1 }))).toBe(false);
  });
});

describe('validateCourse', () => {
  it('requires a name and a positive duration', () => {
    expect(validateCourse(draft({ name: '  ' }), [])).toMatch('과목명');
    expect(validateCourse(draft({ start: 600, end: 600 }), [])).toMatch('종료 시간');
  });
  it('rejects clashes with other courses but not with itself', () => {
    const existing = [course({ id: 'x', name: '운영체제' })];
    expect(validateCourse(draft(), existing)).toMatch('운영체제');
    expect(validateCourse(draft(), existing, 'x')).toBeNull();
  });
});

describe('grid layout', () => {
  it('shows weekend columns only when needed', () => {
    expect(visibleDays([course()])).toEqual([0, 1, 2, 3, 4]);
    expect(visibleDays([course({ day: 5 })])).toEqual([0, 1, 2, 3, 4, 5]);
    expect(visibleDays([course({ day: 6 })])).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it('widens the hour range around early and late classes', () => {
    expect(hourRange([])).toEqual({ first: 9, last: 18 });
    expect(hourRange([course({ start: 7 * 60 + 30, end: 8 * 60 }), course({ start: 19 * 60, end: 20 * 60 + 10 })])).toEqual({
      first: 7,
      last: 21,
    });
  });
});

describe('todayStatus', () => {
  const monday = (h: number, m = 0) => new Date(2026, 9, 5, h, m);
  const list = [course({ id: '1' }), course({ id: '2', start: 13 * 60, end: 14 * 60 })];

  it('finds the current and next class', () => {
    expect(todayStatus(list, monday(9, 30))).toMatchObject({ current: { id: '1' }, next: { id: '2' } });
    expect(todayStatus(list, monday(11))).toMatchObject({ current: null, next: { id: '2' } });
    expect(todayStatus(list, monday(15))).toEqual({ current: null, next: null });
  });
});

describe('pickColor', () => {
  it('prefers unused colors', () => {
    expect(pickColor([course({ color: COURSE_COLORS[0] })])).toBe(COURSE_COLORS[1]);
  });
});
