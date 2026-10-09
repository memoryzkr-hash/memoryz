import {
  FALL_GRAVITY, HEAD_W, MAX_HEARTS, PITCH_STEP, RESPAWN_HEIGHT, RESPAWN_LEAD, SPEED, START_BEAT, WINDOW_BEATS,
} from './constants';
import { GRADE_POINTS, gradeFor, rankFor, type Grade, type Judgement, type Rank } from './judge';

/**
 * Echo Bounce: the song alternates a CALL bar and a RESPONSE bar.
 *
 * In a call bar the music sings a short phrase and the ball bounces across note heads that appear
 * by themselves. The response bar is empty air: the player plays the phrase back, and every press
 * puts a note head under the ball. A missing or mistimed head and the ball falls through.
 *
 * Charts list only the calls, one bar per line: an energy digit (0-3, how much of the band plays)
 * and eight eighth-note cells, '.' for a rest or a pitch 1-5 (the staff line the head sits on).
 *
 *   2 1.3. 5...    do, mi, sol on beats 1, 2 and 3
 */

export type Role = 'call' | 'response';
export type Key = 'any' | 'low' | 'high';

export interface EchoNote {
  beat: number;
  /** 1 (bottom line) .. 5 (top line). */
  pitch: number;
  role: Role;
  phrase: number;
}

export interface EchoSong {
  notes: EchoNote[];
  /** Energy of every bar (calls and responses), for the band. */
  energy: number[];
  phrases: number;
  /** Two-key songs: low notes (pitch 1-2) and high notes (4-5) need their own key. */
  twoKeys: boolean;
  /** The song is over here: one bar after the last response. */
  endBeat: number;
}

export class EchoChartError extends Error {}

const LINE = /^([0-3])\s+(.+)$/;
const CELLS = /^[.1-5]{8}$/;

export function parseEcho(text: string, twoKeys = false): EchoSong {
  const notes: EchoNote[] = [];
  const energy: number[] = [];
  let phrase = 0;
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) return;
    const m = LINE.exec(line);
    const cells = m ? m[2].replace(/\s+/g, '') : '';
    if (!m || !CELLS.test(cells)) throw new EchoChartError(`line ${i + 1}: expected "<0-3> <8 cells of . or 1-5>", got "${raw.trim()}"`);
    if (!/[1-5]/.test(cells)) throw new EchoChartError(`line ${i + 1}: a call needs at least one note`);
    if (twoKeys && /3/.test(cells)) throw new EchoChartError(`line ${i + 1}: two-key songs use low (1-2) and high (4-5) notes only`);
    const callBar = phrase * 2;
    for (const role of ['call', 'response'] as const) {
      const bar = callBar + (role === 'call' ? 0 : 1);
      [...cells].forEach((c, k) => {
        if (c !== '.') notes.push({ beat: bar * 4 + k / 2, pitch: Number(c), role, phrase });
      });
    }
    energy.push(Number(m[1]), Number(m[1]));
    phrase++;
  });
  if (!phrase) throw new EchoChartError('the chart has no calls');
  energy.push(1);
  return { notes, energy, phrases: phrase, twoKeys, endBeat: (phrase * 2 + 1) * 4 };
}

export const heightOf = (pitch: number): number => (pitch - 1) * PITCH_STEP;
export const keyOf = (pitch: number): Key => (pitch >= 3 ? 'high' : 'low');
export const xAt = (beat: number): number => beat * SPEED;

/** A note head on the staff: a call's, one the player played, or a stray press. */
export interface Head {
  x: number;
  y: number;
  /** Beat it appeared. */
  t: number;
  /** Index of the note it answers, or -1 for a stray press. */
  note: number;
  grade: Grade | null;
  /** Played with the wrong key: sits on the wrong line. */
  wrong: boolean;
}

export type EchoEvent =
  | { type: 'bounce'; t: number; note: number; role: Role }
  | { type: 'tap'; t: number; note: number; grade: Grade; deltaMs: number; wrong: boolean }
  | { type: 'stray'; t: number }
  | { type: 'fall'; t: number; note: number; hearts: number }
  | { type: 'respawn'; t: number }
  | { type: 'phrase'; t: number; phrase: number; perfect: boolean; healed: boolean }
  | { type: 'gameover'; t: number }
  | { type: 'finish'; t: number };

export interface EchoState {
  t: number;
  hearts: number;
  /** Infinite hearts (practice). */
  practice: boolean;
  /** Where and when the ball last bounced. */
  from: { t: number; y: number };
  /** Index of the note the ball is heading for, or notes.length after the last one. */
  next: number;
  /** Set while the ball is falling out of the staff. */
  falling: { t: number; y: number; vy: number } | null;
  over: boolean;
  finished: boolean;
  heads: Head[];
  /** Head index answering each note, -1 if none yet. */
  answer: number[];
  judged: (Judgement | null)[];
  strays: number;
  /** Stray presses per phrase (they spoil a perfect echo). */
  phraseStrays: number[];
  /** Phrases whose response was played back without a miss. */
  restored: number;
  combo: number;
  maxCombo: number;
  points: number;
  counts: Record<Grade, number>;
  /** Things that happened since the caller last emptied this list. */
  events: EchoEvent[];
}

export function newEcho(song: EchoSong, practice = false): EchoState {
  const first = song.notes[0];
  return {
    t: START_BEAT, hearts: MAX_HEARTS, practice,
    // The ball drops onto the first call note from above.
    from: { t: first.beat - RESPAWN_LEAD * 2, y: heightOf(first.pitch) + RESPAWN_HEIGHT },
    next: 0, falling: null, over: false, finished: false, heads: [],
    answer: new Array(song.notes.length).fill(-1), judged: new Array(song.notes.length).fill(null),
    strays: 0, phraseStrays: new Array(song.phrases).fill(0), restored: 0,
    combo: 0, maxCombo: 0, points: 0, counts: { perfect: 0, great: 0, good: 0, miss: 0 }, events: [],
  };
}

/** Bump height of the arc between two bounces this far apart. */
const arcHeight = (beats: number) => Math.min(4.5, 0.45 + beats);

/** The ball's arc from `from` towards a landing at (t1, y1), extended past t1 while it waits for a head. */
export function arcY(from: { t: number; y: number }, t1: number, y1: number, t: number): number {
  const span = Math.max(1e-6, t1 - from.t);
  const H = arcHeight(span);
  if (t <= t1) {
    const s = (t - from.t) / span;
    return from.y + (y1 - from.y) * s + 4 * H * s * (1 - s);
  }
  const slope = (y1 - from.y - 4 * H) / span;
  return y1 + slope * (t - t1);
}

/** Where the ball is at beat t (bottom of the ball). */
export function ballAt(s: EchoState, song: EchoSong, t: number): { x: number; y: number } {
  const x = xAt(t);
  if (t < s.from.t) return { x, y: s.from.y };
  if (s.falling) {
    const d = t - s.falling.t;
    return { x, y: s.falling.y + s.falling.vy * d - 0.5 * FALL_GRAVITY * d * d };
  }
  const n = song.notes[s.next];
  if (!n) {
    // After the last note: small bounces on the spot, one per beat.
    const f = t - Math.floor(t);
    return { x, y: s.from.y + 0.6 * 4 * f * (1 - f) };
  }
  return { x, y: arcY(s.from, n.beat, heightOf(n.pitch), t) };
}

function record(s: EchoState, note: number, grade: Grade, deltaMs: number): void {
  s.judged[note] = { note, grade, deltaMs };
  s.counts[grade]++;
  s.points += GRADE_POINTS[grade];
  s.combo = grade === 'miss' ? 0 : s.combo + 1;
  s.maxCombo = Math.max(s.maxCombo, s.combo);
}

function bounce(s: EchoState, song: EchoSong, i: number, t: number): void {
  const n = song.notes[i];
  s.from = { t, y: heightOf(n.pitch) };
  s.next = i + 1;
  s.events.push({ type: 'bounce', t, note: i, role: n.role });
  if (n.role === 'response') phraseDone(s, song, i, t);
}

/** After a phrase's last response note: count it and give a heart back for a clean echo. */
function phraseDone(s: EchoState, song: EchoSong, i: number, t: number): void {
  const n = song.notes[i];
  const after = song.notes[i + 1];
  if (after && after.phrase === n.phrase && after.role === 'response') return;
  const mine = song.notes.map((m, k) => (m.phrase === n.phrase && m.role === 'response' ? k : -1)).filter((k) => k >= 0);
  const grades = mine.map((k) => s.judged[k]?.grade ?? 'miss');
  const clean = grades.every((g) => g !== 'miss');
  const perfect = clean && grades.every((g) => g === 'perfect' || g === 'great') && s.phraseStrays[n.phrase] === 0;
  if (clean) s.restored++;
  const healed = perfect && s.hearts < MAX_HEARTS && !s.falling;
  if (healed) s.hearts++;
  s.events.push({ type: 'phrase', t, phrase: n.phrase, perfect, healed });
}

function fall(s: EchoState, song: EchoSong, i: number, t: number): void {
  const n = song.notes[i];
  const y = arcY(s.from, n.beat, heightOf(n.pitch), t);
  const span = Math.max(1e-6, n.beat - s.from.t);
  const vy = (heightOf(n.pitch) - s.from.y - 4 * arcHeight(span)) / span;
  s.falling = { t, y, vy };
  if (!s.practice) s.hearts--;
  s.events.push({ type: 'fall', t, note: i, hearts: s.hearts });
  if (s.hearts <= 0) {
    s.over = true;
    s.events.push({ type: 'gameover', t });
  }
}

/** First call note after note i, or -1. */
function nextCall(song: EchoSong, i: number): number {
  for (let k = i; k < song.notes.length; k++) if (song.notes[k].role === 'call') return k;
  return -1;
}

/** Plays the song forward to beat t: call bounces, late misses, falls and respawns. */
export function advance(s: EchoState, song: EchoSong, t: number): void {
  while (!s.over && !s.finished) {
    if (s.falling) {
      // Response notes that go by while the ball is gone are misses (no extra heart).
      while (s.next < song.notes.length && song.notes[s.next].role === 'response' && song.notes[s.next].beat + WINDOW_BEATS <= t) {
        if (!s.judged[s.next]) record(s, s.next, 'miss', 0);
        phraseDone(s, song, s.next, song.notes[s.next].beat);
        s.next++;
      }
      const c = nextCall(song, s.next);
      if (c >= 0 && song.notes[c].beat - RESPAWN_LEAD <= t) {
        for (let k = s.next; k < c; k++) {
          if (s.judged[k] || song.notes[k].role !== 'response') continue;
          record(s, k, 'miss', 0);
          phraseDone(s, song, k, song.notes[k].beat);
        }
        const at = song.notes[c].beat - RESPAWN_LEAD;
        s.falling = null;
        s.from = { t: at, y: heightOf(song.notes[c].pitch) + RESPAWN_HEIGHT };
        s.next = c;
        s.events.push({ type: 'respawn', t: at });
        continue;
      }
      if (c < 0 && t >= song.endBeat) {
        s.finished = true;
        s.events.push({ type: 'finish', t: song.endBeat });
      }
      break;
    }

    const i = s.next;
    const n = song.notes[i];
    if (!n) {
      if (t >= song.endBeat) {
        s.finished = true;
        s.events.push({ type: 'finish', t: song.endBeat });
      }
      break;
    }
    if (n.role === 'call') {
      if (n.beat > t) break;
      bounce(s, song, i, n.beat);
      continue;
    }
    const h = s.answer[i];
    if (h >= 0) {
      // Answered early: the head is already there when the ball comes down.
      if (n.beat > t) break;
      if (s.heads[h].wrong) fall(s, song, i, n.beat);
      else bounce(s, song, i, n.beat);
      continue;
    }
    if (n.beat + WINDOW_BEATS > t) break;
    record(s, i, 'miss', 0);
    fall(s, song, i, n.beat + WINDOW_BEATS);
  }
  s.t = Math.max(s.t, t);
}

/**
 * A press at beat t with a key ('any' on one-key songs). Call `advance(s, song, t)` first.
 * Matches the nearest open response note within the window; anything else is a stray press.
 */
export function tap(s: EchoState, song: EchoSong, t: number, key: Key, bpm: number): void {
  if (s.over || s.finished) return;
  const ball = ballAt(s, song, t);
  let best = -1;
  let bestD = Infinity;
  song.notes.forEach((n, i) => {
    if (n.role !== 'response' || s.answer[i] >= 0 || s.judged[i]) return;
    const d = Math.abs(t - n.beat);
    if (d <= WINDOW_BEATS && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  if (best < 0 || s.falling) {
    if (!s.falling) {
      s.strays++;
      s.phraseStrays[Math.min(song.phrases - 1, Math.max(0, Math.floor(t / 8)))]++;
      s.combo = 0;
      s.heads.push({ x: xAt(t), y: Math.max(0, ball.y - 0.4), t, note: -1, grade: null, wrong: false });
      s.events.push({ type: 'stray', t });
    }
    return;
  }
  const n = song.notes[best];
  const wrong = song.twoKeys && key !== keyOf(n.pitch);
  const deltaMs = ((t - n.beat) * 60000) / bpm;
  const grade: Grade = wrong ? 'miss' : gradeFor(deltaMs);
  record(s, best, grade, wrong ? 0 : deltaMs);
  const y = wrong ? heightOf(key === 'high' ? 4 : 1) : heightOf(n.pitch);
  s.answer[best] = s.heads.length;
  s.heads.push({ x: xAt(t), y, t, note: best, grade, wrong });
  s.events.push({ type: 'tap', t, note: best, grade, deltaMs, wrong });
  // Late (or dead on): the ball is already waiting at this note, so the new head catches it now.
  if (t >= n.beat && s.next === best) {
    if (wrong) fall(s, song, best, t);
    else bounce(s, song, best, t);
  }
}

export function responseCount(song: EchoSong): number {
  return song.notes.filter((n) => n.role === 'response').length;
}

/** 0..1 over the response notes judged so far (1 before any). */
export function accuracy(s: EchoState): number {
  const n = s.counts.perfect + s.counts.great + s.counts.good + s.counts.miss;
  return n ? s.points / n : 1;
}

export function rank(s: EchoState): Rank {
  return rankFor(accuracy(s), s.counts.miss);
}

/** How far through the song, 0..1. */
export function progress(song: EchoSong, t: number): number {
  return Math.min(1, Math.max(0, t / song.endBeat));
}

/** The presses a perfect player makes: every response note, on the beat, with the right key. */
export function idealTaps(song: EchoSong): { beat: number; key: Key }[] {
  return song.notes
    .filter((n) => n.role === 'response')
    .map((n) => ({ beat: n.beat, key: song.twoKeys ? keyOf(n.pitch) : 'any' }));
}

/** Plays taps through a song to the end (or to `until`). */
export function playTaps(song: EchoSong, taps: { beat: number; key: Key }[], bpm: number, opts: { practice?: boolean; until?: number } = {}): EchoState {
  const s = newEcho(song, opts.practice);
  for (const p of [...taps].sort((a, b) => a.beat - b.beat)) {
    if (opts.until !== undefined && p.beat > opts.until) break;
    advance(s, song, p.beat);
    tap(s, song, p.beat, p.key, bpm);
  }
  advance(s, song, opts.until ?? song.endBeat + 1);
  return s;
}

export { HEAD_W };
