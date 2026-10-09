import type { Analysis } from './analyze';
import { chart, chartAudio, type Difficulty } from './charts';
import { compose, type ComposedSong, type StyleSheet } from './compose';
import type { EchoSong } from './echo';

/**
 * The tracklist. Every song is written by the songwriter in compose.ts from the style sheet
 * below — no samples, no recordings — so the music belongs to this project and can be used
 * anywhere, commercially included.
 */

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

export interface TrackDef {
  id: string;
  name: string;
  /** Genre and feel, a few words. */
  tagline: string;
  palette: Palette;
  /** Written songs: the songwriter's sheet. Loaded recordings carry a stand-in with their tempo. */
  style: StyleSheet;
  /** A recording the player loaded: its decoded audio and what the analyzer heard in it. */
  recording?: { buffer: AudioBuffer; analysis: Analysis; artist?: string };
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

/** Drums and bass by energy 0-3. */
const POP = {
  kick: ['x.......x.......', 'x.......x.......', 'x...x...x...x...', 'x...x...x...x.x.'],
  snare: ['................', '....x.......x...', '....x.......x...', '....x.......x..x'],
  hat: ['................', '..x...x...x...x.', 'x.x.x.x.x.x.x.x.', 'x.xox.xox.xox.xo'],
  bass: ['x...............', 'x.......x.......', 'x.o.x.o.x.o.x.o.', 'x.xox.xox.xox.xo'],
};
const FUNK = {
  kick: ['x.......x.......', 'x.....x...x.....', 'x.....x...x..x..', 'x.x...x...x..x..'],
  snare: ['................', '....x.......x...', '....x..x....x...', '....x..x.x..x..x'],
  hat: ['..x...x...x...x.', 'xxo.xxo.xxo.xxo.', 'xxoxxxoxxxoxxxox', 'xxoxxxoxxxoxxxox'],
  bass: ['x...............', 'x..x..x...x..f..', 'x..x..x.o.x..f..', 'x.xx..x.o.x.xf.o'],
};
const CHIP = {
  kick: ['x.......x.......', 'x...x...x...x...', 'x...x...x...x...', 'x..xx...x..xx...'],
  snare: ['................', '....x.......x...', '....x.......x.x.', '....x..x....x.xx'],
  hat: ['x...x...x...x...', 'x.x.x.x.x.x.x.x.', 'xxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxx'],
  bass: ['x.......x.......', 'x.x.x.x.x.x.x.x.', 'xoxoxoxoxoxoxoxo', 'xoxoxoxoxofoxoxo'],
};
const EDM = {
  kick: ['................', 'x...x...x...x...', 'x...x...x...x...', 'x...x...x...x...'],
  snare: ['................', '........x.......', '....x.......x...', '....x.......x...'],
  hat: ['................', '..x...x...x...x.', '..o...o...o...o.', 'x.o.x.o.x.o.x.o.'],
  bass: ['x...............', 'x.......x.......', '..x...x...x...x.', '.xo..xo..xo..xo.'],
};

export const TRACKS: TrackDef[] = [
  {
    id: 'sunset-hop',
    name: '노을 점프',
    tagline: '팝 · 느긋한 4분음표',
    palette: { skyTop: '#ff7a3d', skyBottom: '#ffc46b', staff: '#fff3dc', ink: '#1d1846', accent: '#ff2e7e', ball: '#fffaf2' },
    style: {
      seed: 11, bpm: 96, root: 53, scale: MAJOR, range: [65, 81], lead: 'triangle',
      chords: { verse: [0, 4, 5, 3], chorus: [3, 4, 0, 5], bridge: [5, 3, 4, 4] },
      form: [['intro', 2], ['verse', 4], ['chorus', 4], ['verse', 4], ['chorus', 4], ['outro', 2]],
      energy: { intro: 1, verse: 1, chorus: 2, bridge: 1, outro: 1 },
      ...POP,
    },
  },
  {
    id: 'stair-city',
    name: '계단 도시',
    tagline: '펑크 · 엇박 베이스',
    palette: { skyTop: '#0f9e93', skyBottom: '#7fe0c6', staff: '#f2fff9', ink: '#22092f', accent: '#ffd23f', ball: '#fffdf5' },
    style: {
      seed: 27, bpm: 112, root: 50, scale: DORIAN, range: [62, 79], lead: 'square',
      chords: { verse: [0, 3, 0, 3], chorus: [6, 3, 0, 4], bridge: [3, 4, 5, 4] },
      form: [['intro', 2], ['verse', 4], ['chorus', 4], ['verse', 4], ['chorus', 4], ['bridge', 2], ['chorus', 4], ['outro', 2]],
      energy: { intro: 1, verse: 2, chorus: 3, bridge: 1, outro: 1 },
      ...FUNK,
    },
  },
  {
    id: 'midnight-arcade',
    name: '한밤 오락실',
    tagline: '칩튠 · 쉴 틈 없는 8분음표',
    palette: { skyTop: '#a8122d', skyBottom: '#ff6a4d', staff: '#ffe7e0', ink: '#1b0d24', accent: '#ffe14a', ball: '#fff8f0' },
    style: {
      seed: 45, bpm: 128, root: 52, scale: MINOR, range: [64, 83], lead: 'square',
      chords: { verse: [0, 5, 2, 6], chorus: [5, 6, 0, 0], bridge: [3, 4, 5, 6] },
      form: [['intro', 2], ['verse', 4], ['chorus', 4], ['bridge', 2], ['chorus', 4], ['outro', 2]],
      energy: { intro: 1, verse: 2, chorus: 3, bridge: 2, outro: 1 },
      ...CHIP,
    },
  },
  {
    id: 'drop-line',
    name: '드롭 라인',
    tagline: 'EDM · 빌드업과 드롭',
    palette: { skyTop: '#1d2b7a', skyBottom: '#4a7bd6', staff: '#e8f0ff', ink: '#0b1238', accent: '#ff9f1c', ball: '#fffaf0' },
    style: {
      seed: 63, bpm: 140, root: 57, scale: MINOR, range: [64, 84], lead: 'sawtooth',
      chords: { verse: [0, 5, 3, 4], chorus: [5, 6, 0, 4], bridge: [3, 3, 4, 4] },
      form: [['intro', 4], ['verse', 4], ['chorus', 4], ['bridge', 2], ['chorus', 4], ['outro', 2]],
      energy: { intro: 1, verse: 2, chorus: 3, bridge: 0, outro: 1 },
      ...EDM,
    },
  },
];

const songs = new Map<string, ComposedSong>();
const charts = new Map<string, EchoSong>();

/** The track's song, written once and cached. */
export function songOf(track: TrackDef): ComposedSong {
  let s = songs.get(track.id);
  if (!s) {
    s = compose(track.style);
    songs.set(track.id, s);
  }
  return s;
}

/** The track's chart at a difficulty, cached. */
export function chartOf(track: TrackDef, d: Difficulty): EchoSong {
  const key = `${track.id}:${d}`;
  let c = charts.get(key);
  if (!c) {
    c = track.recording ? chartAudio(track.recording.analysis, d) : chart(songOf(track), d);
    charts.set(key, c);
  }
  return c;
}

/** How many beats the track runs (for its length on the tracklist). */
export function trackBeats(track: TrackDef): number {
  return track.recording ? chartOf(track, 'normal').endBeat : songOf(track).endBeat;
}

const LOADED_PALETTES: Palette[] = [
  { skyTop: '#3a1c71', skyBottom: '#d76d77', staff: '#fff1f3', ink: '#1a0b2e', accent: '#ffaf7b', ball: '#fffaf5' },
  { skyTop: '#0b6e4f', skyBottom: '#7ad0a4', staff: '#effff6', ink: '#08261c', accent: '#ffe066', ball: '#fffdf5' },
  { skyTop: '#c0392b', skyBottom: '#f39c12', staff: '#fff6e8', ink: '#2a0d07', accent: '#2ee6d6', ball: '#fffaf0' },
];

/** A track for a recording the player loaded. Its tempo comes from the analyzer. */
export function loadedTrack(name: string, artist: string | undefined, buffer: AudioBuffer, analysis: Analysis): TrackDef {
  const n = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return {
    id: `file:${name}:${Math.round(analysis.duration)}`,
    name,
    tagline: `${artist ? `${artist} · ` : ''}내 음악 · 박자 자동 분석`,
    palette: LOADED_PALETTES[n % LOADED_PALETTES.length],
    style: { ...TRACKS[0].style, bpm: analysis.bpm },
    recording: { buffer, analysis, artist },
  };
}
