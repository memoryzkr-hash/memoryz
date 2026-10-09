import { describe, expect, it } from 'vitest';
import { MAX_HEARTS, WINDOW_BEATS } from '../../src/beat/core/constants';
import {
  advance, ballAt, EchoChartError, heightOf, idealTaps, keyOf, newEcho, parseEcho, playTaps, rank, responseCount, tap,
  type Key,
} from '../../src/beat/core/echo';
import { songFor, STAGES } from '../../src/beat/core/levels';

const BPM = 120; // 500 ms per beat

/** Three phrases: do-mi on beats 1 and 3, then sol, then do-do. */
const song = parseEcho(`
  1 1... 3...
  2 5... ....
  2 1.1. ....
`);
const responses = song.notes.map((n, i) => (n.role === 'response' ? i : -1)).filter((i) => i >= 0);

describe('chart', () => {
  it('answers every call bar with a response bar of the same rhythm', () => {
    expect(song.phrases).toBe(3);
    expect(song.notes.map((n) => `${n.role[0]}${n.beat}:${n.pitch}`)).toEqual([
      'c0:1', 'c2:3', 'r4:1', 'r6:3', 'c8:5', 'r12:5', 'c16:1', 'c17:1', 'r20:1', 'r21:1',
    ]);
    expect(song.endBeat).toBe(28);
    expect(song.energy).toEqual([1, 1, 2, 2, 2, 2, 1]);
  });

  it('rejects malformed calls', () => {
    expect(() => parseEcho('1 1...3..')).toThrow(EchoChartError);
    expect(() => parseEcho('1 ........')).toThrow(/at least one note/);
    expect(() => parseEcho('4 1.......')).toThrow(EchoChartError);
    expect(() => parseEcho('1 3.......', true)).toThrow(/two-key/);
  });

  it('puts higher pitches on higher lines and splits them into two keys', () => {
    expect(heightOf(1)).toBe(0);
    expect(heightOf(5)).toBeGreaterThan(heightOf(3));
    expect(keyOf(2)).toBe('low');
    expect(keyOf(4)).toBe('high');
  });
});

describe('playing back', () => {
  it('clears with every note PERFECT when pressed on the beat', () => {
    const s = playTaps(song, idealTaps(song), BPM);
    expect(s.finished).toBe(true);
    expect(s.over).toBe(false);
    expect(s.hearts).toBe(MAX_HEARTS);
    expect(s.counts).toEqual({ perfect: responseCount(song), great: 0, good: 0, miss: 0 });
    expect(s.restored).toBe(3);
    expect(rank(s)).toBe('S');
  });

  it('bounces on the call heads by itself and lands exactly on each one', () => {
    const s = newEcho(song);
    advance(s, song, 2);
    expect(s.events.filter((e) => e.type === 'bounce').map((e) => e.t)).toEqual([0, 2]);
    expect(ballAt(s, song, 2).y).toBeCloseTo(heightOf(3));
  });

  it('catches the ball with a head pressed a little early or a little late', () => {
    for (const shift of [-WINDOW_BEATS + 0.01, WINDOW_BEATS - 0.01]) {
      const taps = idealTaps(song).map((p) => ({ ...p, beat: p.beat + shift }));
      const s = playTaps(song, taps, BPM);
      expect(s.over).toBe(false);
      expect(s.hearts).toBe(MAX_HEARTS);
      expect(s.counts.miss).toBe(0);
      expect(s.counts.good).toBe(responseCount(song));
    }
  });

  it('starts a late bounce from the moment of the press', () => {
    const s = newEcho(song);
    advance(s, song, 4.1);
    tap(s, song, 4.1, 'any', BPM);
    expect(s.events.find((e) => e.type === 'bounce' && e.note === responses[0])?.t).toBeCloseTo(4.1);
    expect(s.from.t).toBeCloseTo(4.1);
  });

  it('drops the ball and costs a heart when a note is not played', () => {
    const taps = idealTaps(song).slice(1);
    const s = playTaps(song, taps, BPM, { until: 7 });
    expect(s.hearts).toBe(MAX_HEARTS - 1);
    expect(s.judged[responses[0]]?.grade).toBe('miss');
    // The rest of that phrase goes by while the ball is gone: a miss, but no second heart.
    expect(s.judged[responses[1]]?.grade).toBe('miss');
    expect(s.events.some((e) => e.type === 'respawn')).toBe(true);
    expect(s.falling).toBeNull();
  });

  it('respawns onto the next call, carries on, and a clean echo gives the heart back', () => {
    const s = playTaps(song, idealTaps(song).slice(2), BPM);
    expect(s.finished).toBe(true);
    expect(s.restored).toBe(2);
    const heals = s.events.filter((e) => e.type === 'phrase' && e.healed);
    expect(heals).toHaveLength(1);
    expect(s.hearts).toBe(MAX_HEARTS);
  });

  it('never heals past the maximum', () => {
    const s = playTaps(song, idealTaps(song), BPM);
    expect(s.events.filter((e) => e.type === 'phrase' && e.healed)).toHaveLength(0);
  });

  it('ends the game when the last heart is gone', () => {
    const long = parseEcho('1 1.......\n'.repeat(5));
    const s = playTaps(long, [], BPM);
    expect(s.over).toBe(true);
    expect(s.hearts).toBe(0);
    expect(s.events.filter((e) => e.type === 'fall')).toHaveLength(MAX_HEARTS);
  });

  it('never runs out of hearts in practice', () => {
    const long = parseEcho('1 1.......\n'.repeat(5));
    const s = playTaps(long, [], BPM, { practice: true });
    expect(s.over).toBe(false);
    expect(s.finished).toBe(true);
    expect(s.counts.miss).toBe(5);
  });

  it('counts presses with no note near as strays that break the combo and spoil the phrase', () => {
    const taps: { beat: number; key: Key }[] = [...idealTaps(song), { beat: 5, key: 'any' }];
    const s = playTaps(song, taps, BPM);
    expect(s.strays).toBe(1);
    expect(s.finished).toBe(true);
    expect(s.maxCombo).toBeLessThan(responseCount(song));
    const first = s.events.find((e) => e.type === 'phrase' && e.phrase === 0);
    expect(first).toMatchObject({ perfect: false });
  });
});

describe('two keys', () => {
  const two = parseEcho('1 1... 4...', true);
  it('needs the matching key for high and low notes', () => {
    const right = playTaps(two, idealTaps(two), BPM);
    expect(right.counts.perfect).toBe(2);
    const wrong = playTaps(two, idealTaps(two).map((p) => ({ ...p, key: (p.key === 'high' ? 'low' : 'high') as Key })), BPM);
    expect(wrong.counts.miss).toBeGreaterThan(0);
    expect(wrong.hearts).toBe(MAX_HEARTS - 1);
  });
});

describe.each(STAGES)('stage $name', (stage) => {
  const s = songFor(stage);
  it('is a full song that a perfect player clears with an S', () => {
    expect(s.phrases).toBeGreaterThanOrEqual(12);
    const run = playTaps(s, idealTaps(s), stage.bpm);
    expect(run.finished).toBe(true);
    expect(run.hearts).toBe(MAX_HEARTS);
    expect(rank(run)).toBe('S');
    expect(run.restored).toBe(s.phrases);
  });

  it('ends early for a player who only listens', () => {
    const run = playTaps(s, [], stage.bpm);
    expect(run.over).toBe(true);
  });

  it('keeps note heads from overlapping', () => {
    const beats = s.notes.map((n) => n.beat);
    for (let i = 1; i < beats.length; i++) expect(beats[i] - beats[i - 1]).toBeGreaterThanOrEqual(0.5);
  });
});
