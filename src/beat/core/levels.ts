import { buildLevel, type BuiltLevel } from './chart';

/** Notes are MIDI numbers; patterns are 16 sixteenth-note steps per bar. */
export interface SongDef {
  /** Key root (MIDI). */
  root: number;
  /** Semitone offsets of the seven scale degrees. */
  scale: number[];
  /** Scale degree of each bar's chord, looped. */
  progression: number[];
  /** 'x' hit, '.' rest. */
  kick: string;
  snare: string;
  /** 'x' closed hat, 'o' open hat. */
  hat: string;
  /** 'x' root, 'o' octave up, 'f' fifth. */
  bass: string;
  lead: OscillatorType;
}

export interface Palette {
  skyTop: string;
  skyBottom: string;
  ground: string;
  /** Top edge of the ground and beat ticks. */
  edge: string;
  /** Spikes and outlines. */
  ink: string;
  /** Pads, rings and the guide ring. */
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
  chart: string;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

export const STAGES: StageDef[] = [
  {
    id: 'first-beat',
    name: '첫 박자',
    tagline: '가시 · 구멍 · 계단 · 발판',
    bpm: 108,
    difficulty: 1,
    palette: { skyTop: '#ff7a3d', skyBottom: '#ffc46b', ground: '#25307d', edge: '#fff3dc', ink: '#16194a', accent: '#ff2e7e', ball: '#fffaf2' },
    song: {
      root: 53, scale: MAJOR, progression: [0, 4, 5, 3],
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x.o.x.o.x.o.x.o.', lead: 'triangle',
    },
    chart: `
      0 .... ....   # intro
      1 .... ....
      1 1... ....
      1 1... ....
      2 1... 1...
      2 1... 1...
      2 1... 1...
      2 1.1. 1...
      2 2... 1...
      2 2... 1...
      2 _... _...
      2 1.1. ^...
      3 u... 1...   # up the stairs
      3 u... 1...
      3 d... d...
      3 1.1. 1...
      1 1... ....   # breather
      1 _... ....
      1 1... ....
      1 ^... ....
      3 1... 2...
      3 1... 2...
      3 _.1. 1...
      3 2... ^...
      3 u... u...
      3 1... 1...
      3 d... d...
      3 2.1. 2...
      2 1... 1...
      2 _... _...
      2 1.1. 1.1.
      1 .... ....
    `,
  },
  {
    id: 'stair-city',
    name: '계단 도시',
    tagline: '엇박 · 가시 3개 · 공중 링',
    bpm: 124,
    difficulty: 2,
    palette: { skyTop: '#0f9e93', skyBottom: '#7fe0c6', ground: '#3d1752', edge: '#ffe066', ink: '#22092f', accent: '#ffd23f', ball: '#fffdf5' },
    song: {
      root: 50, scale: DORIAN, progression: [0, 3, 6, 4],
      kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'xxo.xxo.xxo.xxo.', bass: 'x..x..x...x..f..', lead: 'square',
    },
    chart: `
      0 .... ....
      1 .... ....
      1 1... 1...
      1 1... 2...
      2 1..1 ..1.   # 3-3-2
      2 1..1 ..1.
      2 2... 2...
      2 1.1. ^...
      3 u.u. u...   # three steps up
      3 1... 1...
      3 d.d. d...
      3 2... 3...
      2 1o.. ....   # rings
      2 1o.. ....
      2 1o.. 1...
      2 2... ^...
      3 1..1 ..1.
      3 2..1 ..u.
      3 1..1 ..d.
      3 3... 3...
      1 ^... ^...   # breather
      1 1o.. ....
      1 1o.o ....
      1 _... 1...
      3 u.1. u.1.
      3 d.1. d.1.
      3 1..1 ..1.
      3 3... ^...
      3 1o.o .o..   # ring chain
      3 1... 1...
      3 _.2. 1...
      3 u... d...
      2 1..1 ..1.
      2 2..2 ..2.
      2 1.1. 1.1.
      1 .... ....
    `,
  },
  {
    id: 'double-time',
    name: '더블 타임',
    tagline: '쉬지 않는 점프 · 링 연속',
    bpm: 140,
    difficulty: 3,
    palette: { skyTop: '#a8122d', skyBottom: '#ff6a4d', ground: '#1b0d24', edge: '#ffb3a6', ink: '#0d0613', accent: '#ffe14a', ball: '#fff8f0' },
    song: {
      root: 52, scale: MINOR, progression: [0, 5, 2, 6],
      kick: 'x...x...x...x.x.', snare: '....x.......x..x', hat: 'x.xox.xox.xox.xo', bass: 'x.xox.xox.xox.xf', lead: 'sawtooth',
    },
    chart: `
      0 .... ....
      1 .... ....
      2 1.1. 1.1.
      2 2.1. 2.1.
      3 1..1 ..1.
      3 2..2 ..1.
      3 1o.. 1o..
      3 3... ^...
      3 u.u. 1.1.   # up two, run along the top
      3 1.1. d.d.
      3 1o.o .o..
      3 1..1 ..u.
      3 1..1 ..1.
      3 d.2. .1..
      3 _.._ .._.
      3 2... 3...
      1 ^... ^...   # breather
      1 ^... ^...
      2 1o.o ....
      2 3... 3...
      3 1.1. 1.1.
      3 u.1. 1.1.
      3 1.1. d.1.
      3 1o.. 1o..
      3 2..2 ..2.
      3 1..1 ..^.
      3 .1.. 1..1   # off the beat
      3 .3.. .^..
      3 1o.o .o..
      3 u..1 ..1.
      3 d..2 ..2.
      3 3... 3...
      2 _..1 .._.
      2 1o.o ..1.
      3 1.1. 1.1.
      3 2.2. 2.2.
      3 1..1 ..1.
      3 3..3 ..3.
      2 1.1. 1.1.
      1 .... ....
    `,
  },
];

const built = new Map<string, BuiltLevel>();

/** Builds a stage's terrain once and caches it. */
export function levelFor(stage: StageDef): BuiltLevel {
  let level = built.get(stage.id);
  if (!level) {
    level = buildLevel(stage.chart);
    built.set(stage.id, level);
  }
  return level;
}
