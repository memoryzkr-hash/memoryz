import { parseEcho, type EchoSong } from './echo';

/** The band behind a song. Notes are MIDI numbers; patterns are 16 sixteenth-note steps per bar. */
export interface SongDef {
  /** Key root (MIDI). */
  root: number;
  /** Semitone offsets of the seven scale degrees. */
  scale: number[];
  /** Scale degree of each bar's chord; one chord per phrase (call + response share it). */
  progression: number[];
  /** 'x' hit, '.' rest. */
  kick: string;
  snare: string;
  /** 'x' closed hat, 'o' open hat. */
  hat: string;
  /** 'x' root, 'o' octave up, 'f' fifth. */
  bass: string;
  /** The voice that sings the call (and that the player's presses play back). */
  lead: OscillatorType;
}

export interface Palette {
  skyTop: string;
  skyBottom: string;
  /** Staff lines and bar lines. */
  staff: string;
  /** Outlines and dark marks. */
  ink: string;
  /** The response side: your note heads, the "your turn" band. */
  accent: string;
  ball: string;
}

export interface StageDef {
  id: string;
  name: string;
  tagline: string;
  bpm: number;
  /** 1-3 */
  difficulty: number;
  palette: Palette;
  song: SongDef;
  twoKeys: boolean;
  /** Calls only; each is answered by a response bar of the same rhythm. */
  chart: string;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

/** Staff line 1..5 sings scale degrees do, re, mi, sol, high do. */
const LINE_DEGREES = [0, 1, 2, 4, 7];

/** MIDI note a staff line sings in this song. */
export function midiOf(song: SongDef, pitch: number): number {
  const d = LINE_DEGREES[Math.max(1, Math.min(5, pitch)) - 1];
  return song.root + 12 + song.scale[d % 7] + 12 * Math.floor(d / 7);
}

export const STAGES: StageDef[] = [
  {
    id: 'echo',
    name: '메아리',
    tagline: '네 박자 따라 치기',
    bpm: 96,
    difficulty: 1,
    twoKeys: false,
    palette: { skyTop: '#ff7a3d', skyBottom: '#ffc46b', staff: '#fff3dc', ink: '#1d1846', accent: '#ff2e7e', ball: '#fffaf2' },
    song: {
      root: 53, scale: MAJOR, progression: [0, 4, 5, 3],
      kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x.......x...o...', lead: 'triangle',
    },
    chart: `
      1 1.2. 3...
      1 3.2. 1...
      2 1.3. 5...
      2 5.3. 1...
      2 1.1. 3.3.
      2 5... 3...
      3 1.2. 3.5.
      3 5.4. 3.1.
      3 3.3. 5...
      3 1.3. 5.3.
      2 5.3. 2.1.
      1 1... 5...
    `,
  },
  {
    id: 'round',
    name: '돌림노래',
    tagline: '8분음표 · 엇박',
    bpm: 112,
    difficulty: 2,
    twoKeys: false,
    palette: { skyTop: '#0f9e93', skyBottom: '#7fe0c6', staff: '#f2fff9', ink: '#22092f', accent: '#ffd23f', ball: '#fffdf5' },
    song: {
      root: 50, scale: DORIAN, progression: [0, 3, 6, 4],
      kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'xxo.xxo.xxo.xxo.', bass: 'x..x..x...x..f..', lead: 'square',
    },
    chart: `
      1 1.2. 33..
      1 3.2. 11..
      2 1..3 ..5.
      2 5..3 ..1.
      2 13.5 .3..
      2 5.31 .1..
      3 1.1. 3.35
      3 5.53 .1..
      3 1..2 ..34
      3 5.4. 3.21
      3 33.5 5.1.
      3 1.3. 5.53
      2 5..3 ..1.
      2 1... 5.5.
    `,
  },
  {
    id: 'two-voices',
    name: '높은음 낮은음',
    tagline: '두 키로 높낮이까지',
    bpm: 120,
    difficulty: 3,
    twoKeys: true,
    palette: { skyTop: '#a8122d', skyBottom: '#ff6a4d', staff: '#ffe7e0', ink: '#1b0d24', accent: '#ffe14a', ball: '#fff8f0' },
    song: {
      root: 52, scale: MINOR, progression: [0, 5, 2, 6],
      kick: 'x...x...x...x.x.', snare: '....x.......x..x', hat: 'x.xox.xox.xox.xo', bass: 'x.xox.xox.xox.xf', lead: 'sawtooth',
    },
    chart: `
      1 1.4. 1.4.
      1 4.1. 4.1.
      2 1.1. 4...
      2 4.4. 1...
      2 1.4. 4.1.
      2 4..1 ..4.
      3 1.4. 1.44
      3 4.1. 4.11
      3 1..4 ..1.
      3 4..1 ..44
      3 14.1 .4..
      3 41.4 .1..
      2 1.4. 1.4.
      2 4... 1...
    `,
  },
];

const built = new Map<string, EchoSong>();

/** Parses a stage's chart once and caches it. */
export function songFor(stage: StageDef): EchoSong {
  let song = built.get(stage.id);
  if (!song) {
    song = parseEcho(stage.chart, stage.twoKeys);
    built.set(stage.id, song);
  }
  return song;
}
