import { BALL_R, FOOT, PAD_HALF_W, SPEED, START_BEAT } from './constants';
import { advanceTo, cloneRun, groundAt, newRun, press, release, step, type Block, type RunState, type World } from './physics';

/**
 * A chart is written as music, not as terrain: one line per bar, an energy digit (0-3, how much of
 * the band plays) and eight eighth-note cells saying what happens on that half beat.
 *
 *   2 1... 1...    two single spikes, on beats 1 and 3
 *
 *   .  nothing          1 2 3  jump over that many spikes (tap)
 *   _  jump a pit (tap) u      jump up a one-tile step (tap)
 *   d  drop a step      ^      yellow pad over a spike bed (no tap)
 *   o  air ring over a pit (tap while in the air)
 *
 * The builder plays the chart with a perfect virtual player through the real physics and puts each
 * obstacle under the highest point of that player's jump, so the right beat clears it dead centre.
 */

export type NoteKind = 'spike' | 'pit' | 'up' | 'orb';
/** A beat the player has to press on. */
export interface Note { beat: number; kind: NoteKind; size: number }
/** Something that happens on its own: a pad launch or a drop. */
export interface Cue { beat: number; kind: 'pad' | 'down' }

export interface ChartBar { energy: number; cells: string }

export interface BuiltLevel {
  world: World;
  notes: Note[];
  cues: Cue[];
  bars: ChartBar[];
  /** The finish line, at the end of the last bar. */
  endBeat: number;
}

export interface InputEvent { beat: number; type: 'press' | 'release' }

const CELLS = /^[.123_ud^o]{8}$/;
/** The ideal player lets go this long after each press, so holding never adds a jump. */
const RELEASE_AFTER = 0.2;
/** How late the virtual player's jump may leave after its press (landing a hair after the beat). */
const JUMP_SLACK = 0.05;

export class ChartError extends Error {}

export function parseChart(text: string): ChartBar[] {
  const bars: ChartBar[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) return;
    const m = /^([0-3])\s+(.+)$/.exec(line);
    const cells = m ? m[2].replace(/\s+/g, '') : '';
    if (!m || !CELLS.test(cells)) throw new ChartError(`line ${i + 1}: expected "<0-3> <8 cells>", got "${raw.trim()}"`);
    bars.push({ energy: Number(m[1]), cells });
  });
  return bars;
}

/** Sets the ground top from x onwards. */
function raiseFrom(blocks: Block[], x: number, top: number): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.x1 <= x) out.push(b);
    else if (b.x0 >= x) out.push({ ...b, top });
    else out.push({ x0: b.x0, x1: x, top: b.top }, { x0: x, x1: b.x1, top });
  }
  return out;
}

/** Removes the ground between a and b, along with any sliver of ground left stranded between two pits. */
function cut(blocks: Block[], a: number, b: number): Block[] {
  const out: Block[] = [];
  for (const k of blocks) {
    if (k.x1 <= a || k.x0 >= b) {
      out.push(k);
      continue;
    }
    if (k.x0 < a) out.push({ x0: k.x0, x1: a, top: k.top });
    if (k.x1 > b) out.push({ x0: b, x1: k.x1, top: k.top });
  }
  const touches = (p: Block | undefined, q: Block) => p !== undefined && Math.abs(p.x1 - q.x0) < 1e-6;
  return out.filter((k, i) => k.x1 - k.x0 >= 1.2 || touches(out[i - 1], k) || touches(k, out[i + 1]));
}

interface Flight { jumped: boolean; jumpT: number; apexX: number; apexY: number; landX: number | null; died: boolean }

/**
 * Plays a copy of the run forward, with or without a press now, until it lands again or dies
 * (or, with `throughLanding`, for the whole `limit`).
 */
function forecast(run: RunState, world: World, withPress: boolean, limit = 4, throughLanding = false): Flight {
  const f = cloneRun(run);
  const end = f.t + limit;
  const releaseAt = f.t + RELEASE_AFTER;
  if (withPress) press(f, world);
  const out: Flight = { jumped: false, jumpT: NaN, apexX: f.x, apexY: f.y, landX: null, died: false };
  // With a press, only a landing after the jump it causes counts (a press just before touching down
  // jumps on landing). Without one, an airborne ball's next landing is the one we want.
  let left = !f.grounded && !withPress;
  const take = () => {
    for (const e of f.events) {
      if (e.type === 'jump' || e.type === 'orb' || e.type === 'pad') {
        if (!out.jumped) out.jumpT = e.t;
        out.jumped = true;
        left = true;
      }
    }
  };
  take();
  f.events.length = 0;
  while (f.t < end) {
    if (f.holding && f.t >= releaseAt) release(f);
    step(f, world);
    if (!f.grounded && f.y > out.apexY && out.landX === null) {
      out.apexY = f.y;
      out.apexX = f.x;
    }
    for (const e of f.events) if (e.type === 'land' && left) out.landX = e.x;
    take();
    f.events.length = 0;
    if (f.dead) {
      out.died = true;
      return out;
    }
    if ((out.landX !== null && !throughLanding) || f.finished) return out;
  }
  return out;
}

export function buildLevel(chart: string | ChartBar[]): BuiltLevel {
  const bars = typeof chart === 'string' ? parseChart(chart) : chart;
  const endBeat = bars.length * 4;
  const world: World = {
    blocks: [{ x0: (START_BEAT - 8) * SPEED, x1: (endBeat + 16) * SPEED, top: 0 }],
    spikes: [], pads: [], orbs: [], endX: endBeat * SPEED, floorY: 0,
  };
  const notes: Note[] = [];
  const cues: Cue[] = [];
  const run = newRun();
  let releaseAt = Infinity;

  bars.forEach((bar, bi) => {
    [...bar.cells].forEach((c, ci) => {
      if (c === '.') return;
      const beat = bi * 4 + ci / 2;
      const where = `bar ${bi + 1}, cell ${ci + 1} ("${c}")`;
      if (releaseAt < beat) {
        advanceTo(run, world, releaseAt);
        release(run);
        releaseAt = Infinity;
      }
      advanceTo(run, world, beat);
      if (run.dead) throw new ChartError(`${where}: the ideal player already died (${run.cause}) at beat ${run.t.toFixed(2)}`);
      const x = beat * SPEED;

      if (c === 'd') {
        const top = groundAt(world, x) ?? 0;
        world.blocks = raiseFrom(world.blocks, x - FOOT, top - 1);
        cues.push({ beat, kind: 'down' });
        return;
      }
      if (c === '^') {
        const top = groundAt(world, x) ?? 0;
        world.pads.push({ x: x + PAD_HALF_W - 0.01, y: top });
        const flight = forecast(run, world, false);
        if (flight.landX === null) throw new ChartError(`${where}: the pad does not land anywhere`);
        for (let sx = x + 1.5; sx <= flight.landX - 1.5 + 1e-6; sx += 1) {
          const g = groundAt(world, sx);
          if (g !== null) world.spikes.push({ x: sx, y: g });
        }
        cues.push({ beat, kind: 'pad' });
        return;
      }

      let kind: NoteKind;
      let size = 1;
      if (c === 'o') {
        if (run.grounded) throw new ChartError(`${where}: a ring needs the ball in the air`);
        kind = 'orb';
        world.orbs.push({ x, y: run.y + BALL_R });
        const skip = forecast(run, world, false);
        const take = forecast(run, world, true);
        if (take.landX === null || take.died) throw new ChartError(`${where}: the ring jump does not land`);
        const a = x + 0.5;
        const b = take.landX - 0.6;
        if (skip.landX === null || skip.landX - FOOT < a || skip.landX + FOOT > b) {
          throw new ChartError(`${where}: no room for a pit that only the ring clears`);
        }
        world.blocks = cut(world.blocks, a, b);
      } else {
        const flight = forecast(run, world, true);
        if (!flight.jumped || flight.jumpT - beat > JUMP_SLACK) throw new ChartError(`${where}: the ball is still in the air here`);
        const top = run.y;
        if (c === '_') {
          kind = 'pit';
          size = 2;
          world.blocks = cut(world.blocks, flight.apexX - 1, flight.apexX + 1);
        } else if (c === 'u') {
          kind = 'up';
          world.blocks = raiseFrom(world.blocks, flight.apexX + FOOT, top + 1);
        } else {
          kind = 'spike';
          size = Number(c);
          for (let k = 0; k < size; k++) {
            const sx = flight.apexX + k - (size - 1) / 2;
            const g = groundAt(world, sx);
            if (g !== null) world.spikes.push({ x: sx, y: g });
          }
          world.spikes.sort((p, q) => p.x - q.x);
        }
      }

      const skip = forecast(run, world, false, 2.5, true);
      if (!skip.died) throw new ChartError(`${where}: skipping this press is safe, so it is not a real note`);
      const take = forecast(run, world, true);
      if (take.died) throw new ChartError(`${where}: pressing on the beat still dies`);
      notes.push({ beat, kind, size });
      press(run, world);
      releaseAt = beat + RELEASE_AFTER;
    });
  });

  world.spikes.sort((p, q) => p.x - q.x);
  world.floorY = Math.min(...world.blocks.map((b) => b.top));
  return { world, notes, cues, bars, endBeat };
}

/** Press on every note, let go shortly after: what a perfect player does. */
export function idealInputs(level: BuiltLevel): InputEvent[] {
  return level.notes.flatMap((n): InputEvent[] => [
    { beat: n.beat, type: 'press' },
    { beat: n.beat + RELEASE_AFTER, type: 'release' },
  ]);
}

/** Plays inputs through the level. Returns the finished run. */
export function playInputs(level: BuiltLevel, inputs: InputEvent[], from: RunState = newRun(), until = Infinity): RunState {
  const run = cloneRun(from);
  const sorted = [...inputs].sort((a, b) => a.beat - b.beat);
  for (const input of sorted) {
    if (input.beat < run.t) continue;
    if (input.beat > until) break;
    advanceTo(run, level.world, input.beat);
    if (run.dead || run.finished) return run;
    if (input.type === 'press') press(run, level.world);
    else release(run);
  }
  advanceTo(run, level.world, Math.min(until, level.endBeat + 1));
  return run;
}
