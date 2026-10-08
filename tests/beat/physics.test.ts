import { describe, expect, it } from 'vitest';
import { GRAVITY, JUMP_V, PAD_V, PRESS_BUFFER, SPEED, START_BEAT } from '../../src/beat/core/constants';
import { advanceTo, blocksIn, groundAt, newRun, press, release, step, type RunState, type World } from '../../src/beat/core/physics';

/** Flat ground from far left to x=1000, plus whatever the test adds. */
const flat = (over: Partial<World> = {}): World => ({
  blocks: [{ x0: -100, x1: 1000, top: 0 }], spikes: [], pads: [], orbs: [], endX: 900, floorY: 0, ...over,
});

const jumpAndRide = (s: RunState, w: World, beats: number) => {
  press(s, w);
  advanceTo(s, w, s.t + 0.1);
  release(s);
  advanceTo(s, w, s.t + beats - 0.1);
};

describe('ball', () => {
  it('rolls at a constant 4 tiles per beat from the count-in', () => {
    const w = flat();
    const s = newRun();
    expect(s.t).toBe(START_BEAT);
    advanceTo(s, w, 2);
    expect(s.t).toBe(2);
    expect(s.x).toBe(2 * SPEED);
    expect(s.grounded).toBe(true);
  });

  it('stays in the air exactly one beat and peaks at 2.2 tiles', () => {
    const w = flat();
    const s = newRun(0);
    press(s, w);
    expect(s.events.map((e) => e.type)).toEqual(['jump']);
    release(s);
    let peak = 0;
    while (!s.grounded || s.t < 0.1) {
      step(s, w);
      peak = Math.max(peak, s.y);
    }
    expect(s.t).toBeCloseTo(1, 2);
    expect(peak).toBeCloseTo((JUMP_V * JUMP_V) / (2 * GRAVITY), 2);
    expect(peak).toBeCloseTo(2.2, 2);
  });

  it('keeps jumping on every landing while the button is held', () => {
    const w = flat();
    const s = newRun(0);
    press(s, w);
    advanceTo(s, w, 3.05);
    const jumps = s.events.filter((e) => e.type === 'jump').map((e) => Math.round(e.t * 100) / 100);
    expect(jumps).toEqual([0, 1, 2, 3]);
  });

  it('remembers a press made just before landing', () => {
    const w = flat();
    const s = newRun(0);
    press(s, w);
    release(s);
    advanceTo(s, w, 1 - PRESS_BUFFER / 2);
    press(s, w);
    release(s);
    advanceTo(s, w, 1.1);
    expect(s.events.filter((e) => e.type === 'jump')).toHaveLength(2);
  });

  it('forgets a press made too long before landing', () => {
    const w = flat();
    const s = newRun(0);
    press(s, w);
    release(s);
    advanceTo(s, w, 0.6);
    press(s, w);
    release(s);
    advanceTo(s, w, 1.5);
    expect(s.events.filter((e) => e.type === 'jump')).toHaveLength(1);
  });
});

describe('obstacles', () => {
  it('breaks on a spike, and clears it with a jump on time', () => {
    const w = flat({ spikes: [{ x: 6, y: 0 }] });
    const lazy = newRun(0);
    advanceTo(lazy, w, 3);
    expect(lazy.dead).toBe(true);
    expect(lazy.cause).toBe('spike');

    const jumper = newRun(0);
    advanceTo(jumper, w, 1);
    jumpAndRide(jumper, w, 2);
    expect(jumper.dead).toBe(false);
  });

  it('crashes into a step it did not jump onto, and lands on it after a jump', () => {
    const w = flat({ blocks: [{ x0: -100, x1: 10, top: 0 }, { x0: 10, x1: 1000, top: 1 }] });
    const lazy = newRun(0);
    advanceTo(lazy, w, 4);
    expect(lazy.cause).toBe('wall');

    const jumper = newRun(0);
    advanceTo(jumper, w, 2);
    jumpAndRide(jumper, w, 2);
    expect(jumper.dead).toBe(false);
    expect(jumper.grounded).toBe(true);
    expect(jumper.y).toBe(1);
  });

  it('falls into a pit and dies below the floor', () => {
    const w = flat({ blocks: [{ x0: -100, x1: 8, top: 0 }, { x0: 30, x1: 1000, top: 0 }] });
    const s = newRun(0);
    advanceTo(s, w, 6);
    expect(s.cause).toBe('fall');
  });

  it('walks off a ledge and lands on the lower ground', () => {
    const w = flat({ blocks: [{ x0: -100, x1: 4, top: 1 }, { x0: 4, x1: 1000, top: 0 }] });
    const s = newRun(0);
    s.y = 1;
    advanceTo(s, w, 2);
    expect(s.dead).toBe(false);
    expect(s.y).toBe(0);
    expect(s.events.some((e) => e.type === 'land')).toBe(true);
  });

  it('launches off a pad for 1.5 beats without any input', () => {
    const w = flat({ pads: [{ x: 4.44, y: 0 }] });
    const s = newRun(0);
    advanceTo(s, w, 1);
    expect(s.events.find((e) => e.type === 'pad')?.t).toBeCloseTo(1, 2);
    expect(s.vy).toBeCloseTo(PAD_V - GRAVITY * 0, 0);
    advanceTo(s, w, 2.45);
    expect(s.grounded).toBe(false);
    advanceTo(s, w, 2.55);
    expect(s.grounded).toBe(true);
  });

  it('jumps again from an air ring only on a press, and only once per ring', () => {
    const w = flat({ orbs: [{ x: 2, y: 2.6 }] });
    const s = newRun(0);
    press(s, w);
    release(s);
    advanceTo(s, w, 0.5);
    press(s, w);
    release(s);
    expect(s.events.filter((e) => e.type === 'orb')).toHaveLength(1);
    expect(s.vy).toBeCloseTo(JUMP_V);
    press(s, w);
    expect(s.events.filter((e) => e.type === 'orb')).toHaveLength(1);

    const passer = newRun(0);
    press(passer, w);
    release(passer);
    advanceTo(passer, w, 1.2);
    expect(passer.events.some((e) => e.type === 'orb')).toBe(false);
  });

  it('finishes at the end line', () => {
    const w = flat({ endX: 8 });
    const s = newRun(0);
    advanceTo(s, w, 5);
    expect(s.finished).toBe(true);
    expect(s.t).toBe(2);
  });
});

describe('ground queries', () => {
  const w = flat({ blocks: [{ x0: 0, x1: 4, top: 0 }, { x0: 4, x1: 6, top: 1 }, { x0: 8, x1: 12, top: 0 }] });
  it('reports the ground height, or null over a pit', () => {
    expect(groundAt(w, 2)).toBe(0);
    expect(groundAt(w, 5)).toBe(1);
    expect(groundAt(w, 7)).toBeNull();
  });
  it('lists the blocks under a span', () => {
    expect(blocksIn(w, 3.9, 4.1)).toHaveLength(2);
    expect(blocksIn(w, 6.5, 7.5)).toHaveLength(0);
  });
});
