/**
 * A small songwriter. From a style sheet and a seed it writes a whole song — intro, verses,
 * choruses, a bridge and an outro — as a chord per bar, the band's energy per bar and a lead melody.
 *
 * The melody is written in call-and-response phrases: two bars per phrase, the lead sings the
 * first (the call) and the player plays it back in the second (the response). Phrases are built
 * from a few motifs per section that repeat with small variations, so a chorus comes back the way
 * a chorus should and the player can learn it.
 *
 * Everything is deterministic: the same style sheet always writes the same song.
 */

export type Section = 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro';
export type BarRole = 'intro' | 'call' | 'response' | 'outro';

export interface StyleSheet {
  seed: number;
  bpm: number;
  /** Key root, MIDI. */
  root: number;
  /** Semitone offsets of the seven scale degrees. */
  scale: number[];
  /** Chord roots as scale degrees, one per phrase, looped within the section. */
  chords: Record<'verse' | 'chorus' | 'bridge', number[]>;
  /** Song form: intro/outro in bars, the others in phrases (two bars each). */
  form: [Section, number][];
  /** Lowest and highest melody note, MIDI. */
  range: [number, number];
  /** Drum and bass patterns by energy 0-3, 16 sixteenth steps each. */
  kick: string[];
  snare: string[];
  hat: string[];
  bass: string[];
  lead: OscillatorType;
  /** Energy (0-3) of each kind of section. */
  energy: Record<Section, number>;
}

export interface ComposedBar {
  role: BarRole;
  section: Section;
  /** Phrase index, -1 in the intro and outro. */
  phrase: number;
  /** Triad, MIDI, around the middle of the keyboard. */
  chord: number[];
  energy: number;
  /** Last bar of a section: the drummer fills. */
  fill: boolean;
}

export interface MelodyNote {
  /** Song beat, always on the eighth-note grid. */
  beat: number;
  midi: number;
  /** Sounding length in beats. */
  len: number;
  phrase: number;
  /** 3 on beat 1, 2 on beat 3, 1 on beats 2 and 4, 0 off the beat: how much the note carries the bar. */
  weight: number;
}

export interface ComposedSong {
  style: StyleSheet;
  bars: ComposedBar[];
  /** The calls' melody (the responses repeat it, played by the player). */
  melody: MelodyNote[];
  phrases: number;
  endBeat: number;
}

/** mulberry32: small, fast, seeded. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One-bar rhythms on the eighth-note grid, by how busy the section is. */
const RHYTHMS: string[][] = [
  ['x...x...', 'x.x.x...', 'x...x.x.', 'x.x...x.', 'x...xx..'],
  ['x.x.x.x.', 'x..x..x.', 'x.x.x...', 'x...x.x.', 'xx..x.x.', 'x.x..xx.'],
  ['x.xxx.x.', 'x..x..x.', 'x.x.x.x.', 'xx.x.x..', 'x.x.xx..', 'x..xx.x.'],
  ['x.xxx.x.', 'xx.x.xx.', 'x.x.x.xx', 'x..xx.x.', 'xx.xx.x.', 'x.xx.xx.'],
];

interface Motif {
  rhythm: string;
  /** Scale steps from the chord root for each note. */
  steps: number[];
}

const weightOf = (cell: number) => (cell === 0 ? 3 : cell === 4 ? 2 : cell % 2 === 0 ? 1 : 0);

export function compose(style: StyleSheet): ComposedSong {
  const rand = rng(style.seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const deg = (d: number) => style.root + 12 + style.scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  const triad = (d: number) => [0, 2, 4].map((k) => deg(d + k) - 12);

  /** A motif: a rhythm, and a melodic line that lands on chord tones on the strong beats. */
  const makeMotif = (energy: number): Motif => {
    const rhythm = pick(RHYTHMS[energy]);
    const steps: number[] = [];
    let at = pick([0, 2, 4]);
    [...rhythm].forEach((c, cell) => {
      if (c !== 'x') return;
      if (steps.length) {
        const move = pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]);
        at = Math.max(-2, Math.min(7, at + move));
        // Strong beats sit on a chord tone (root, third, fifth or octave).
        if (weightOf(cell) >= 2) at = [0, 2, 4, 7].reduce((b, t) => (Math.abs(t - at) < Math.abs(b - at) ? t : b), 0);
      }
      steps.push(at);
    });
    return { rhythm, steps };
  };

  /** Same rhythm, a new ending: the answer to a motif. */
  const vary = (m: Motif, resolve: boolean): Motif => {
    const steps = [...m.steps];
    const last = steps.length - 1;
    steps[last] = resolve ? 0 : Math.max(-2, Math.min(7, steps[last] + pick([-2, 2, 3])));
    if (last > 1 && !resolve) steps[last - 1] = Math.max(-2, Math.min(7, steps[last - 1] + pick([-1, 1])));
    return { rhythm: m.rhythm, steps };
  };

  // Motifs per section kind, written once, so repeated sections come back the same.
  const motifs = new Map<Section, Motif[]>();
  const motifsFor = (sec: Section): Motif[] => {
    let ms = motifs.get(sec);
    if (!ms) {
      const e = Math.max(0, Math.min(3, style.energy[sec]));
      const a = makeMotif(e);
      const b = makeMotif(e);
      ms = [a, b, a, vary(b, true)];
      if (sec === 'chorus') ms = [a, a, b, vary(a, true)];
      if (sec === 'bridge') ms = [a, vary(a, false), b, vary(b, true)];
      motifs.set(sec, ms);
    }
    return ms;
  };

  const bars: ComposedBar[] = [];
  const melody: MelodyNote[] = [];
  let phrase = 0;
  for (const [sec, count] of style.form) {
    const energy = style.energy[sec];
    if (sec === 'intro' || sec === 'outro') {
      for (let i = 0; i < count; i++) {
        bars.push({ role: sec, section: sec, phrase: -1, chord: triad(0), energy, fill: i === count - 1 });
      }
      continue;
    }
    const prog = style.chords[sec];
    const ms = motifsFor(sec);
    for (let i = 0; i < count; i++) {
      const root = prog[i % prog.length];
      const chord = triad(root);
      const motif = ms[i % ms.length];
      const callBar = bars.length;
      const last = i === count - 1;
      bars.push({ role: 'call', section: sec, phrase, chord, energy, fill: false });
      bars.push({ role: 'response', section: sec, phrase, chord, energy, fill: last });
      let k = 0;
      const cells = [...motif.rhythm].map((c, cell) => (c === 'x' ? cell : -1)).filter((c) => c >= 0);
      cells.forEach((cell, n) => {
        // The octave closest to the previous note that stays in range, so the line never leaps wildly.
        const base = deg(root + motif.steps[k++]);
        const prev = melody.length ? melody[melody.length - 1].midi : (style.range[0] + style.range[1]) / 2;
        let midi = base;
        for (let o = -3; o <= 3; o++) {
          const m = base + 12 * o;
          if (m < style.range[0] || m > style.range[1]) continue;
          if (midi < style.range[0] || midi > style.range[1] || Math.abs(m - prev) < Math.abs(midi - prev)) midi = m;
        }
        const next = n + 1 < cells.length ? cells[n + 1] : 8;
        melody.push({ beat: callBar * 4 + cell / 2, midi, len: Math.min(1.5, (next - cell) / 2), phrase, weight: weightOf(cell) });
      });
      phrase++;
    }
  }
  return { style, bars, melody, phrases: phrase, endBeat: bars.length * 4 };
}
