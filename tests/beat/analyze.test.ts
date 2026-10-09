import { describe, expect, it } from 'vitest';
import { analyze, AnalysisError, downmix, readTags } from '../../src/beat/core/analyze';
import { chartAudio, DIFFICULTIES } from '../../src/beat/core/charts';
import { idealTaps, keyOf, playTaps, rank } from '../../src/beat/core/echo';

const RATE = 22050;

/** A drum loop: kick on 1 (loud) and 3, snare on 2 and 4, hats on the eighths, a melody blip here and there. */
function drumLoop(bpm: number, startSec: number, seconds: number, seed = 1): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  const spb = 60 / bpm;
  let r = seed;
  const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const add = (t: number, len: number, f: (i: number) => number) => {
    const s0 = Math.round(t * RATE);
    for (let i = 0; i < len * RATE && s0 + i < out.length; i++) if (s0 + i >= 0) out[s0 + i] += f(i);
  };
  for (let k = 0; startSec + k * spb / 2 < seconds; k++) {
    const t = startSec + (k * spb) / 2;
    const beat = k / 2;
    const inBar = beat % 4;
    if (inBar === 0 || inBar === 2) {
      const amp = inBar === 0 ? 1 : 0.6;
      add(t, 0.18, (i) => amp * Math.sin((2 * Math.PI * 55 * i) / RATE) * Math.exp(-i / (0.05 * RATE)));
    }
    if (inBar === 1 || inBar === 3) add(t, 0.12, (i) => 0.4 * rand() * Math.exp(-i / (0.03 * RATE)));
    add(t, 0.03, (i) => 0.12 * rand() * Math.exp(-i / (0.005 * RATE)));
    if (k % 3 === 0) add(t, 0.15, (i) => 0.25 * Math.sin((2 * Math.PI * (k % 2 ? 880 : 440) * i) / RATE) * Math.exp(-i / (0.06 * RATE)));
  }
  return out;
}

describe('analyzer', () => {
  for (const [bpm, start] of [[128, 0.61], [100, 0.2], [140, 1.05], [87, 0.4]] as const) {
    it(`finds ${bpm} BPM and the bar starts`, () => {
      const an = analyze(drumLoop(bpm, start, 45), RATE);
      expect(an.bpm).toBeCloseTo(bpm, 0);
      const bar = (4 * 60) / bpm;
      // Beat 0 sits on a bar start of the loop (loud kick), within 20 ms.
      const off = ((an.firstBeat - start) % bar + bar) % bar;
      expect(Math.min(off, bar - off)).toBeLessThan(0.02);
      expect(an.firstBeat).toBeGreaterThanOrEqual((4 * 60) / bpm - 1e-6);
      expect(an.confidence).toBeGreaterThan(0.3);
      // Hits on the beats are stronger than the gaps.
      expect(an.slots[0].strength).toBeGreaterThan(0.2);
    });
  }

  it('turns silence and very short clips down with a reason', () => {
    expect(() => analyze(new Float32Array(RATE * 5), RATE)).toThrow(AnalysisError);
    expect(() => analyze(new Float32Array(RATE * 30), RATE)).toThrow(/박자/);
  });

  it('downmixes stereo 44.1 kHz to mono at half the rate', () => {
    const l = new Float32Array([1, 1, 0, 0]);
    const r = new Float32Array([0, 0, 1, 1]);
    const m = downmix([l, r], 44100);
    expect(m.rate).toBe(22050);
    expect([...m.samples]).toEqual([0.5, 0.5]);
  });
});

describe.each(DIFFICULTIES)('chart from a recording, $label', (d) => {
  const an = analyze(drumLoop(124, 0.3, 60, 7), RATE);
  const c = chartAudio(an, d.id);

  it('is cleared with an S by pressing on every note, and ends the game for a listener', () => {
    const run = playTaps(c, idealTaps(c), an.bpm);
    expect(run.finished).toBe(true);
    expect(rank(run)).toBe('S');
    expect(run.restored).toBe(c.phrases);
    expect(playTaps(c, [], an.bpm).over).toBe(true);
  });

  it('only charts notes the recording actually hits, on the eighth-note grid', () => {
    for (const n of c.notes) {
      const slot = an.slots[n.beat * 2];
      expect(slot.strength).toBeGreaterThan(0.02);
      if (d.id === 'easy') expect(n.beat % 1).toBe(0);
    }
    if (d.twoKeys) expect(new Set(c.notes.map((n) => keyOf(n.pitch))).size).toBe(2);
  });
});

it('charts more notes as the difficulty rises', () => {
  const an = analyze(drumLoop(124, 0.3, 60, 7), RATE);
  const [e, n, h] = DIFFICULTIES.map((d) => chartAudio(an, d.id).notes.length);
  expect(e).toBeLessThan(n);
  expect(n).toBeLessThanOrEqual(h);
});

describe('tags', () => {
  const frame = (id: string, text: string) => {
    const body = new TextEncoder().encode(text);
    return [...id].map((c) => c.charCodeAt(0)).concat([0, 0, 0, body.length + 1, 0, 0, 3], [...body]);
  };
  it('reads the title and artist of an ID3v2.3 tag', () => {
    const frames = [...frame('TIT2', 'Sky High'), ...frame('TPE1', 'Elektronomia')];
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, frames.length, ...frames]);
    expect(readTags(bytes)).toEqual({ title: 'Sky High', artist: 'Elektronomia' });
  });
  it('returns nothing for a file without a tag', () => {
    expect(readTags(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toEqual({});
  });
});
