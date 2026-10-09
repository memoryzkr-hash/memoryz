import type { ComposedSong, MelodyNote } from './compose';
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
