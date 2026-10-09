import { describe, expect, it } from 'vitest';
import { chart, DIFFICULTIES } from '../../src/beat/core/charts';
import { compose } from '../../src/beat/core/compose';
import { WINDOW_BEATS } from '../../src/beat/core/constants';
import { idealTaps, keyOf, playTaps, rank, responseCount, type Key } from '../../src/beat/core/echo';
import { chartOf, songOf, TRACKS } from '../../src/beat/core/levels';

describe('songwriter', () => {
  it('writes the same song from the same style sheet', () => {
    const a = compose(TRACKS[0].style);
    const b = compose(TRACKS[0].style);
    expect(a.melody).toEqual(b.melody);
    expect(compose({ ...TRACKS[0].style, seed: 999 }).melody).not.toEqual(a.melody);
  });

  it('follows the form: intro, call/response pairs, outro', () => {
    const s = songOf(TRACKS[0]);
    const roles = s.bars.map((b) => b.role);
    expect(roles.slice(0, 2)).toEqual(['intro', 'intro']);
    expect(roles.slice(-2)).toEqual(['outro', 'outro']);
    const middle = roles.slice(2, -2);
    middle.forEach((r, i) => expect(r).toBe(i % 2 === 0 ? 'call' : 'response'));
    expect(s.phrases).toBe(16);
  });

  it('brings a chorus back the same way', () => {
    const s = songOf(TRACKS[0]);
    const rhythmOf = (p: number) => s.melody.filter((n) => n.phrase === p).map((n) => n.beat - (s.melody.find((m) => m.phrase === p)!.beat));
    // Phrases 4-7 are the first chorus, 12-15 the second.
    for (let k = 0; k < 4; k++) expect(rhythmOf(12 + k)).toEqual(rhythmOf(4 + k));
  });
});

describe.each(TRACKS)('$name', (track) => {
  const song = songOf(track);

  it('puts the melody in range, on the eighth-note grid, only in call bars', () => {
    for (const n of song.melody) {
      expect(n.midi).toBeGreaterThanOrEqual(track.style.range[0]);
      expect(n.midi).toBeLessThanOrEqual(track.style.range[1]);
      expect(n.beat * 2).toBe(Math.round(n.beat * 2));
      expect(song.bars[Math.floor(n.beat / 4)].role).toBe('call');
    }
    for (let p = 0; p < song.phrases; p++) expect(song.melody.some((n) => n.phrase === p)).toBe(true);
  });

  it('runs between one and two minutes', () => {
    const sec = (song.endBeat * 60) / track.style.bpm;
    expect(sec).toBeGreaterThan(50);
    expect(sec).toBeLessThan(120);
  });

  it('charts easy as a subset of normal, and normal as the whole melody', () => {
    const easy = chartOf(track, 'easy').notes.map((n) => n.beat);
    const normal = chartOf(track, 'normal').notes.map((n) => n.beat);
    expect(normal).toHaveLength(song.melody.length * 2);
    for (const b of easy) expect(normal).toContain(b);
    expect(easy.length).toBeLessThan(normal.length);
  });

  describe.each(DIFFICULTIES)('$label', (d) => {
    const c = chartOf(track, d.id);

    it('is cleared with an S by pressing on every note', () => {
      const run = playTaps(c, idealTaps(c), track.style.bpm);
      expect(run.finished).toBe(true);
      expect(run.hearts).toBe(d.hearts);
      expect(rank(run)).toBe('S');
      expect(run.restored).toBe(song.phrases);
    });

    it('kills a player who only listens', () => {
      expect(playTaps(c, [], track.style.bpm).over).toBe(true);
    });

    it('keeps notes apart and the catch window inside the head', () => {
      for (let i = 1; i < c.notes.length; i++) expect(c.notes[i].beat - c.notes[i - 1].beat).toBeGreaterThanOrEqual(0.5);
      expect(c.catchBeats).toBeLessThanOrEqual(WINDOW_BEATS);
      expect(c.catchBeats * (60000 / track.style.bpm)).toBeLessThanOrEqual(d.catchMs + 1e-6);
    });

    it('cracks a note pressed too far off and takes a life', () => {
      const off = c.catchBeats + 0.05;
      const taps = idealTaps(c);
      const target = responseCount(c) > 4 ? 4 : 0;
      const bad = taps.map((p, i) => (i === target ? { ...p, beat: p.beat - off } : p));
      const run = playTaps(c, bad, track.style.bpm);
      expect(run.events.some((e) => e.type === 'tap' && e.cracked)).toBe(true);
      expect(run.events.filter((e) => e.type === 'fall')).toHaveLength(1);
    });

    if (d.twoKeys) {
      it('uses both keys, and the lines match the keys', () => {
        const keys = new Set(c.notes.map((n) => keyOf(n.pitch)));
        expect(keys).toEqual(new Set<Key>(['low', 'high']));
        expect(c.notes.every((n) => n.pitch !== 3)).toBe(true);
      });
    }
  });
});

it('gives each difficulty its own lives and catch window', () => {
  const s = songOf(TRACKS[1]);
  const [e, n, h] = DIFFICULTIES.map((d) => chart(s, d.id));
  expect(e.hearts).toBeGreaterThan(n.hearts);
  expect(e.catchBeats).toBeGreaterThan(n.catchBeats);
  expect(n.catchBeats).toBeGreaterThan(h.catchBeats);
  expect(h.twoKeys).toBe(true);
});
