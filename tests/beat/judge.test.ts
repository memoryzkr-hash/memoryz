import { describe, expect, it } from 'vitest';
import { buildLevel, parseChart, ChartError } from '../../src/beat/core/chart';
import { gradeFor, Judge } from '../../src/beat/core/judge';
import type { Note } from '../../src/beat/core/chart';
import { mergeRecord, syncOffset } from '../../src/beat/core/records';

const notes: Note[] = [0, 2, 4, 6].map((beat) => ({ beat, kind: 'spike', size: 1 }));

describe('judge', () => {
  it('grades by distance from the beat in milliseconds', () => {
    expect(gradeFor(0)).toBe('perfect');
    expect(gradeFor(-45)).toBe('perfect');
    expect(gradeFor(60)).toBe('great');
    expect(gradeFor(-91)).toBe('good');
  });

  it('converts beats to ms with the tempo and says early or late', () => {
    const j = new Judge(notes, 120); // 500 ms per beat
    const late = j.hit(2.1, 'jump')!;
    expect(late.note).toBe(1);
    expect(late.deltaMs).toBeCloseTo(50);
    expect(late.grade).toBe('great');
    const early = j.hit(3.95, 'jump')!;
    expect(early.deltaMs).toBeCloseTo(-25);
    expect(early.grade).toBe('perfect');
  });

  it('ignores jumps far from any note and never judges a note twice', () => {
    const j = new Judge(notes, 120);
    expect(j.hit(1, 'jump')).toBeNull();
    expect(j.hit(0, 'jump')?.note).toBe(0);
    expect(j.hit(0.05, 'jump')).toBeNull();
  });

  it('keeps ring notes and ground notes apart', () => {
    const j = new Judge([{ beat: 1, kind: 'spike', size: 1 }, { beat: 1.5, kind: 'orb', size: 1 }], 120);
    expect(j.hit(1.4, 'jump')?.note).toBe(0);
    expect(j.hit(1.1, 'orb')?.note).toBe(1);
  });

  it('counts misses, breaks the combo and ranks the run', () => {
    const j = new Judge(notes, 120);
    j.hit(0, 'jump');
    j.hit(2, 'jump');
    expect(j.state.combo).toBe(2);
    expect(j.sweep(5)).toHaveLength(1);
    expect(j.state.combo).toBe(0);
    j.hit(6, 'jump');
    expect(j.state.maxCombo).toBe(2);
    expect(j.accuracy()).toBeCloseTo(0.75);
    expect(j.rank()).toBe('B');
  });

  it('restores a checkpoint snapshot without sharing state', () => {
    const j = new Judge(notes, 120);
    j.hit(0, 'jump');
    const snap = j.snapshot();
    j.hit(2, 'jump');
    j.restore(snap);
    expect(j.state.counts.perfect).toBe(1);
    expect(j.state.judged[1]).toBeNull();
  });
});

describe('chart', () => {
  it('reads bars with energy digits, spaces and comments', () => {
    expect(parseChart('  2 1... 1...  # hi\n\n0 ........')).toEqual([{ energy: 2, cells: '1...1...' }, { energy: 0, cells: '........' }]);
  });

  it('rejects malformed bars', () => {
    expect(() => parseChart('2 1...1..')).toThrow(ChartError);
    expect(() => parseChart('5 ........')).toThrow(ChartError);
    expect(() => parseChart('2 x.......')).toThrow(ChartError);
  });

  it('rejects a press while the ball is still in the air', () => {
    expect(() => buildLevel('1 ........\n1 11......\n1 ........')).toThrow(/in the air/);
  });

  it('rejects a ring with the ball on the ground', () => {
    expect(() => buildLevel('1 ........\n1 o.......\n1 ........')).toThrow(/ring needs the ball in the air/);
  });

  it('puts spikes under the top of the jump and records the notes', () => {
    const level = buildLevel('1 ........\n1 2.......\n1 ........');
    expect(level.notes).toEqual([{ beat: 4, kind: 'spike', size: 2 }]);
    expect(level.world.spikes.map((s) => s.x)).toEqual([17.5, 18.5]);
    expect(level.endBeat).toBe(12);
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
