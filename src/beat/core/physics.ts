import {
  BALL_R, DT, FALL_DEATH_Y, FOOT, GRAVITY, HIT_R, JUMP_V, LAND_EPS, ORB_REACH, ORB_V, PAD_HALF_W, PAD_V,
  PRESS_BUFFER, SPEED, SPIKE_H, SPIKE_HALF_W, START_BEAT, STEPS_PER_BEAT,
} from './constants';

/** Solid ground column: everything from `top` down is solid between x0 and x1. */
export interface Block { x0: number; x1: number; top: number }
/** Spike standing on y (its base). */
export interface Spike { x: number; y: number }
/** Jump pad lying on the ground at height y. */
export interface Pad { x: number; y: number }
/** Air ring centred at (x, y). */
export interface Orb { x: number; y: number }

export interface World {
  /** Sorted by x, never overlapping. Gaps between them are pits. */
  blocks: Block[];
  /** Sorted by x. */
  spikes: Spike[];
  pads: Pad[];
  orbs: Orb[];
  /** Reaching this x clears the level. */
  endX: number;
  /** Lowest ground top; falling well below it is a death. */
  floorY: number;
}

export type DeathCause = 'spike' | 'wall' | 'fall';

export type RunEvent =
  | { type: 'jump' | 'orb' | 'pad'; t: number; x: number; y: number; index?: number }
  | { type: 'land'; t: number; x: number; y: number; impact: number }
  | { type: 'die'; t: number; x: number; y: number; cause: DeathCause }
  | { type: 'finish'; t: number; x: number; y: number };

export interface RunState {
  /** Time in beats. x is always SPEED * t. */
  t: number;
  x: number;
  /** Bottom of the ball. */
  y: number;
  vy: number;
  grounded: boolean;
  holding: boolean;
  /** Beat of the last press not yet used for a jump. */
  pressAt: number;
  usedOrbs: number[];
  dead: boolean;
  finished: boolean;
  cause: DeathCause | null;
  /** Things that happened since the caller last emptied this list. */
  events: RunEvent[];
}

export function newRun(startBeat = START_BEAT): RunState {
  return {
    t: startBeat, x: startBeat * SPEED, y: 0, vy: 0, grounded: true, holding: false,
    pressAt: -Infinity, usedOrbs: [], dead: false, finished: false, cause: null, events: [],
  };
}

export function cloneRun(s: RunState): RunState {
  return { ...s, usedOrbs: [...s.usedOrbs], events: [] };
}

/** Index of the first block whose right edge is past x. */
function firstBlockAfter(blocks: Block[], x: number): number {
  let lo = 0;
  let hi = blocks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (blocks[mid].x1 <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Blocks overlapping the open range (a, b). */
export function blocksIn(world: World, a: number, b: number): Block[] {
  const out: Block[] = [];
  for (let i = firstBlockAfter(world.blocks, a); i < world.blocks.length && world.blocks[i].x0 < b; i++) out.push(world.blocks[i]);
  return out;
}

/** Height of the ground at x, or null over a pit. */
export function groundAt(world: World, x: number): number | null {
  const i = firstBlockAfter(world.blocks, x);
  const b = world.blocks[i];
  return b && b.x0 <= x ? b.top : null;
}

function firstSpikeAfter(spikes: Spike[], x: number): number {
  let lo = 0;
  let hi = spikes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (spikes[mid].x < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function hitsSpike(world: World, s: RunState): boolean {
  const cx = s.x;
  const cy = s.y + BALL_R;
  for (let i = firstSpikeAfter(world.spikes, cx - SPIKE_HALF_W - HIT_R); i < world.spikes.length; i++) {
    const sp = world.spikes[i];
    if (sp.x - SPIKE_HALF_W > cx + HIT_R) break;
    const nx = Math.max(sp.x - SPIKE_HALF_W, Math.min(cx, sp.x + SPIKE_HALF_W));
    const ny = Math.max(sp.y, Math.min(cy, sp.y + SPIKE_H));
    if ((nx - cx) ** 2 + (ny - cy) ** 2 < HIT_R * HIT_R) return true;
  }
  return false;
}

function die(s: RunState, cause: DeathCause): void {
  s.dead = true;
  s.cause = cause;
  s.events.push({ type: 'die', t: s.t, x: s.x, y: s.y, cause });
}

/** Pads, jumps and rings that can fire right now. */
function act(s: RunState, world: World): void {
  if (s.grounded) {
    for (const p of world.pads) {
      if (Math.abs(p.x - s.x) < PAD_HALF_W && Math.abs(p.y - s.y) < 1e-6) {
        s.vy = PAD_V;
        s.grounded = false;
        s.events.push({ type: 'pad', t: s.t, x: s.x, y: s.y });
        return;
      }
    }
    if (s.holding || s.pressAt >= s.t - PRESS_BUFFER) {
      s.vy = JUMP_V;
      s.grounded = false;
      s.pressAt = -Infinity;
      s.events.push({ type: 'jump', t: s.t, x: s.x, y: s.y });
    }
    return;
  }
  if (s.pressAt >= s.t - PRESS_BUFFER) {
    const cy = s.y + BALL_R;
    for (let i = 0; i < world.orbs.length; i++) {
      const o = world.orbs[i];
      if (Math.abs(o.x - s.x) > ORB_REACH || s.usedOrbs.includes(i)) continue;
      if ((o.x - s.x) ** 2 + (o.y - cy) ** 2 < ORB_REACH * ORB_REACH) {
        s.usedOrbs.push(i);
        s.vy = ORB_V;
        s.pressAt = -Infinity;
        s.events.push({ type: 'orb', t: s.t, x: s.x, y: s.y, index: i });
        return;
      }
    }
  }
}

export function press(s: RunState, world: World): void {
  if (s.dead || s.finished) return;
  s.holding = true;
  s.pressAt = s.t;
  act(s, world);
}

export function release(s: RunState): void {
  s.holding = false;
}

/** Advances one fixed step. */
export function step(s: RunState, world: World): void {
  if (s.dead || s.finished) return;
  const prevY = s.y;
  s.t = Math.round((s.t + DT) * STEPS_PER_BEAT) / STEPS_PER_BEAT;
  s.x = s.t * SPEED;
  if (!s.grounded) {
    s.y += s.vy * DT - 0.5 * GRAVITY * DT * DT;
    s.vy -= GRAVITY * DT;
  }

  const under = blocksIn(world, s.x - FOOT, s.x + FOOT);
  if (!s.grounded && s.vy <= 0) {
    let landTop = -Infinity;
    for (const b of under) if (b.top >= s.y && prevY >= b.top - LAND_EPS) landTop = Math.max(landTop, b.top);
    if (landTop > -Infinity) {
      s.events.push({ type: 'land', t: s.t, x: s.x, y: landTop, impact: -s.vy });
      s.y = landTop;
      s.vy = 0;
      s.grounded = true;
    }
  }
  for (const b of under) {
    if (b.top > s.y + 1e-6) {
      die(s, 'wall');
      return;
    }
  }
  if (s.grounded && !under.some((b) => Math.abs(b.top - s.y) < 1e-6)) {
    s.grounded = false;
    s.vy = 0;
  }

  act(s, world);

  if (hitsSpike(world, s)) {
    die(s, 'spike');
    return;
  }
  if (s.y < world.floorY + FALL_DEATH_Y) {
    die(s, 'fall');
    return;
  }
  if (s.x >= world.endX) {
    s.finished = true;
    s.events.push({ type: 'finish', t: s.t, x: s.x, y: s.y });
  }
}

/** Steps until the run reaches beat t (or ends). */
export function advanceTo(s: RunState, world: World, t: number): void {
  while (s.t < t - 1e-9 && !s.dead && !s.finished) step(s, world);
}
