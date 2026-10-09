import { describe, expect, it } from 'vitest';
import { gradeFor, rankFor, timingSummary } from '../../src/beat/core/judge';
import { mergeRecord, syncOffset } from '../../src/beat/core/records';

describe('grades', () => {
  it('grades by distance from the beat in milliseconds', () => {
    expect(gradeFor(0)).toBe('perfect');
    expect(gradeFor(-45)).toBe('perfect');
    expect(gradeFor(60)).toBe('great');
    expect(gradeFor(-91)).toBe('good');
  });

  it('ranks by accuracy, and S needs no misses', () => {
    expect(rankFor(0.99, 0)).toBe('S');
    expect(rankFor(0.99, 1)).toBe('A');
    expect(rankFor(0.75, 2)).toBe('B');
    expect(rankFor(0.5, 9)).toBe('C');
  });
});

describe('timing summary', () => {
  it('averages hit presses only and bins them in 20 ms steps, clamping the far ends', () => {
    const j = (deltaMs: number, grade: 'perfect' | 'great' | 'good' | 'miss' = 'perfect') => ({ note: 0, grade, deltaMs });
    const t = timingSummary([j(0), j(21), j(-39), j(500, 'good'), j(0, 'miss'), null]);
    expect(t.hits).toBe(4);
    expect(t.mean).toBeCloseTo((0 + 21 - 39 + 500) / 4);
    expect(t.bins).toHaveLength(13);
    expect(t.bins[6]).toBe(1);
    expect(t.bins[7]).toBe(1);
    expect(t.bins[4]).toBe(1);
    expect(t.bins[12]).toBe(1);
  });

  it('is empty without hits', () => {
    expect(timingSummary([null, null])).toMatchObject({ hits: 0, mean: 0 });
  });
});

describe('records', () => {
  it('keeps the furthest progress until the first clear', () => {
    let r = mergeRecord(undefined, { cleared: false, pct: 0.4 });
    expect(r.improved).toBe(true);
    r = mergeRecord(r.record, { cleared: false, pct: 0.3 });
    expect(r.improved).toBe(false);
    expect(r.record.bestPct).toBe(0.4);
  });

  it('keeps the best rank, then the best accuracy within it', () => {
    let r = mergeRecord(undefined, { cleared: true, rank: 'A', accuracy: 0.9 });
    r = mergeRecord(r.record, { cleared: true, rank: 'B', accuracy: 0.99 });
    expect(r.improved).toBe(false);
    expect(r.record).toMatchObject({ rank: 'A', accuracy: 0.9, clears: 2, bestPct: 1 });
    r = mergeRecord(r.record, { cleared: true, rank: 'A', accuracy: 0.92 });
    expect(r.improved).toBe(true);
    expect(r.record.accuracy).toBe(0.92);
  });

  it('takes the median tap offset, rounded to 5 ms, once there are enough taps', () => {
    expect(syncOffset([10, 20, 30])).toBeNull();
    expect(syncOffset([28, 31, 33, 29, 120, 30, -40])).toBe(30);
  });
});
