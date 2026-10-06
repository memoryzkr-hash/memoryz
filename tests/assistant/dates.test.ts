import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  endOfWeek,
  formatLong,
  formatShort,
  isValidDate,
  isValidTime,
  sectionOf,
  todayIn,
  weekday,
  zonedToUtc,
} from '../../src/assistant/core/dates';

// 2026-10-06 is a Tuesday — the example day used throughout docs/assistant/.
const TUE = '2026-10-06';

describe('validation', () => {
  it.each([
    ['2026-10-13', true],
    ['2028-02-29', true],
    ['2026-02-29', false],
    ['2026-02-30', false],
    ['2026-13-01', false],
    ['2026-1-5', false],
    ['', false],
  ])('date %s → %s', (s, ok) => {
    expect(isValidDate(s)).toBe(ok);
  });

  it.each([
    ['00:00', true],
    ['15:00', true],
    ['23:59', true],
    ['24:00', false],
    ['9:00', false],
    ['12:60', false],
  ])('time %s → %s', (s, ok) => {
    expect(isValidTime(s)).toBe(ok);
  });
});

describe('calendar math', () => {
  it('knows 2026-10-06 is a Tuesday', () => {
    expect(weekday(TUE)).toBe(2);
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays(TUE, 7)).toBe('2026-10-13');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-09-06', TUE)).toBe(30);
    expect(daysBetween(TUE, '2026-10-13')).toBe(7);
  });

  it('weeks run Monday → Sunday', () => {
    expect(endOfWeek(TUE)).toBe('2026-10-11');
    expect(endOfWeek('2026-10-05')).toBe('2026-10-11'); // Monday
    expect(endOfWeek('2026-10-11')).toBe('2026-10-11'); // Sunday
  });
});

describe('sectionOf (event list)', () => {
  it.each([
    ['2026-10-05', 'past'],
    [TUE, 'today'],
    ['2026-10-07', 'week'],
    ['2026-10-11', 'week'],
    ['2026-10-12', 'later'],
    ['2026-10-13', 'later'],
  ])('%s → %s', (date, section) => {
    expect(sectionOf(date, TUE)).toBe(section);
  });

  it('on a Sunday, tomorrow is already "later"', () => {
    expect(sectionOf('2026-10-12', '2026-10-11')).toBe('later');
  });
});

describe('time zones', () => {
  it('today depends on where you are', () => {
    const instant = new Date('2026-10-06T20:30:00Z');
    expect(todayIn('Asia/Seoul', instant)).toBe('2026-10-07');
    expect(todayIn('America/Los_Angeles', instant)).toBe('2026-10-06');
  });

  it('turns Seoul wall time into UTC', () => {
    expect(zonedToUtc('2026-10-13', '15:00', 'Asia/Seoul').toISOString()).toBe('2026-10-13T06:00:00.000Z');
    expect(zonedToUtc('2026-10-13', '00:30', 'Asia/Seoul').toISOString()).toBe('2026-10-12T15:30:00.000Z');
  });

  it('handles daylight saving time', () => {
    expect(zonedToUtc('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(zonedToUtc('2026-12-01', '09:00', 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });
});

describe('formatting', () => {
  it('writes Korean dates', () => {
    expect(formatLong('2026-10-13')).toBe('10월 13일 (화)');
    expect(formatShort('2026-10-08')).toBe('10/8 (목)');
  });
});
