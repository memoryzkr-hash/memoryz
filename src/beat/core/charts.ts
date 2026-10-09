import { AnalysisError, type Analysis } from './analyze';
import type { BarRole, ComposedSong, MelodyNote } from './compose';
import { WINDOW_BEATS } from './constants';
import type { EchoNote, EchoSong } from './echo';

/**
 * One song, three charts. The music never changes; what changes is which of the melody's notes
 * you have to play back, how far off a press may be before the note cracks, and how many lives
 * you get.
 */

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyDef {
  id: Difficulty;
  label: string;
  /** What the chart asks for, in a few words. */
  blurb: string;
  /** Presses further off than this crack the note. Never wider than the head itself allows. */
  catchMs: number;
  hearts: number;
  twoKeys: boolean;
}

export const DIFFICULTIES: DifficultyDef[] = [
  { id: 'easy', label: '쉬움', blurb: '구절마다 센박 2개, 목숨 5', catchMs: 150, hearts: 5, twoKeys: false },
  { id: 'normal', label: '보통', blurb: '멜로디 전부, 목숨 3', catchMs: 120, hearts: 3, twoKeys: false },
  { id: 'hard', label: '어려움', blurb: '멜로디 전부 + 높낮이 두 키', catchMs: 95, hearts: 3, twoKeys: true },
];

export const difficultyOf = (id: Difficulty): DifficultyDef => DIFFICULTIES.find((d) => d.id === id)!;

/** Easy keeps at most this many notes per phrase: the ones on the strongest beats. */
const EASY_MAX = 2;

/** The notes of one call this difficulty asks you to play back. */
function pickNotes(notes: MelodyNote[], d: Difficulty): MelodyNote[] {
  if (d !== 'easy') return notes;
  const onBeat = notes.filter((n) => n.weight >= 1);
  const pool = onBeat.length ? onBeat : notes.slice(0, 1);
  const keep = new Set([...pool].sort((a, b) => b.weight - a.weight || a.beat - b.beat).slice(0, EASY_MAX));
  return notes.filter((n) => keep.has(n));
}

export function chart(song: ComposedSong, d: Difficulty): EchoSong {
  const def = difficultyOf(d);
  const lo = Math.min(...song.melody.map((n) => n.midi));
  const hi = Math.max(...song.melody.map((n) => n.midi));
  /** Staff line 1-5 by where the note sits in the song's range. */
  const lineOf = (midi: number) => (hi === lo ? 3 : 1 + Math.round(((midi - lo) / (hi - lo)) * 4));

  const notes: EchoNote[] = [];
  const decor: EchoSong['decor'] = [];
  for (let p = 0; p < song.phrases; p++) {
    const call = song.melody.filter((n) => n.phrase === p);
    const picked = pickNotes(call, d);
    // Two keys: above the phrase's middle is "high", the rest "low", on lines 4-5 and 1-2.
    const sorted = [...picked].map((n) => n.midi).sort((a, b) => a - b);
    const mid = (sorted[0] + sorted[sorted.length - 1]) / 2;
    const top = sorted[sorted.length - 1];
    const bottom = sorted[0];
    const line = (n: MelodyNote) => {
      if (!def.twoKeys) return lineOf(n.midi);
      if (top === bottom) return 1;
      return n.midi > mid ? (n.midi === top ? 5 : 4) : n.midi === bottom ? 1 : 2;
    };
    for (const n of call) if (!picked.includes(n)) decor.push({ beat: n.beat, pitch: lineOf(n.midi) });
    for (const role of ['call', 'response'] as const) {
      for (const n of picked) {
        notes.push({ beat: n.beat + (role === 'call' ? 0 : 4), pitch: line(n), role, phrase: p, midi: n.midi });
      }
    }
  }
  notes.sort((a, b) => a.beat - b.beat);
  return {
    notes,
    barRoles: song.bars.map((b) => b.role),
    barPhrase: song.bars.map((b) => b.phrase),
    energy: song.bars.map((b) => b.energy),
    phrases: song.phrases,
    twoKeys: def.twoKeys,
    endBeat: song.endBeat,
    catchBeats: Math.min(WINDOW_BEATS, (def.catchMs / 1000) * (song.style.bpm / 60)),
    hearts: def.hearts,
    decor,
  };
}

/** How each difficulty picks from a recording's eighth-note slots. */
const AUDIO_PICK: Record<Difficulty, { share: number; perBar: number; onBeatOnly: boolean }> = {
  easy: { share: 0.3, perBar: 2, onBeatOnly: true },
  normal: { share: 0.45, perBar: 4, onBeatOnly: false },
  hard: { share: 0.6, perBar: 6, onBeatOnly: false },
};

/**
 * A chart from a real recording (see analyze.ts). Bars pair up into listen / play-back phrases
 * like the written songs, but each bar keeps its own rhythm: in a response bar you play what the
 * recording actually hits there. Strong hits first; harder levels take more of them.
 */
export function chartAudio(an: Analysis, d: Difficulty): EchoSong {
  const def = difficultyOf(d);
  const rule = AUDIO_PICK[d];
  const bars = Math.floor(an.slots.length / 8);
  const strengths = an.slots.map((s) => s.strength).filter((v) => v > 0.02).sort((a, b) => b - a);
  const floor = strengths[Math.min(strengths.length - 1, Math.floor(strengths.length * rule.share))] ?? 1;

  const picks: number[][] = [];
  for (let b = 0; b < bars; b++) {
    const cells = [...Array(8).keys()]
      .filter((c) => !rule.onBeatOnly || c % 2 === 0)
      .filter((c) => an.slots[b * 8 + c].strength >= floor && an.slots[b * 8 + c].strength > 0.02)
      .sort((x, y) => an.slots[b * 8 + y].strength - an.slots[b * 8 + x].strength)
      .slice(0, rule.perBar)
      .sort((x, y) => x - y);
    picks.push(cells);
  }
  const first = picks.findIndex((p) => p.length > 0);
  if (first < 0) throw new AnalysisError('박자를 찾지 못했어요. 비트가 분명한 곡으로 해 보세요.');
  let last = bars - 1;
  while (last > first && picks[last].length === 0) last--;
  // Response bars come in pairs after the first call; make the last pair whole.
  if ((last - first) % 2 === 0) last++;

  const brights = an.slots.map((s) => s.bright).sort((a, b) => a - b);
  const qb = (p: number) => brights[Math.min(brights.length - 1, Math.floor(p * brights.length))];
  const lineOf = (bright: number) => (bright < qb(0.2) ? 1 : bright < qb(0.4) ? 2 : bright < qb(0.6) ? 3 : bright < qb(0.8) ? 4 : 5);

  const barRoles: BarRole[] = [];
  const barPhrase: number[] = [];
  const notes: EchoNote[] = [];
  let phrases = 0;
  const total = last + 2;
  for (let b = 0; b < total; b++) {
    if (b < first) {
      barRoles.push('intro');
      barPhrase.push(-1);
      continue;
    }
    if (b > last) {
      barRoles.push('outro');
      barPhrase.push(-1);
      continue;
    }
    const role = (b - first) % 2 === 0 ? 'call' : 'response';
    barRoles.push(role);
    if (role === 'call') {
      // A phrase only counts when its response bar has something to play.
      const hasAnswer = (picks[b + 1] ?? []).length > 0;
      barPhrase.push(hasAnswer ? phrases : -1);
      barPhrase.push(hasAnswer ? phrases : -1);
      if (hasAnswer) phrases++;
    }
  }
  for (let b = first; b <= last; b++) {
    const role = barRoles[b] as 'call' | 'response';
    const cells = picks[b] ?? [];
    const bright = cells.map((c) => an.slots[b * 8 + c].bright);
    const mid = bright.length ? [...bright].sort((x, y) => x - y)[bright.length >> 1] : 0;
    cells.forEach((c, k) => {
      const s = an.slots[b * 8 + c];
      let pitch = lineOf(s.bright);
      if (def.twoKeys) {
        const high = bright.length > 1 ? s.bright > mid || (s.bright === mid && k % 2 === 1) : s.bright >= qb(0.5);
        pitch = high ? (s.bright >= qb(0.8) ? 5 : 4) : s.bright < qb(0.2) ? 1 : 2;
      }
      notes.push({ beat: b * 4 + c / 2, pitch, role, phrase: barPhrase[b], midi: 0 });
    });
  }
  if (!notes.some((n) => n.role === 'call')) throw new AnalysisError('박자를 찾지 못했어요. 비트가 분명한 곡으로 해 보세요.');
  return {
    notes,
    barRoles,
    barPhrase,
    energy: barRoles.map((_, b) => an.barEnergy[b] ?? 1),
    phrases,
    twoKeys: def.twoKeys,
    endBeat: total * 4,
    catchBeats: Math.min(WINDOW_BEATS, (def.catchMs / 1000) * (an.bpm / 60)),
    hearts: def.hearts,
    decor: [],
  };
}
