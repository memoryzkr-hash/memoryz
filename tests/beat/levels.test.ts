import { describe, expect, it } from 'vitest';
import { idealInputs, playInputs, type InputEvent } from '../../src/beat/core/chart';
import { Judge } from '../../src/beat/core/judge';
import { levelFor, STAGES } from '../../src/beat/core/levels';
import { newRun } from '../../src/beat/core/physics';

/** Every stage must forgive a press this far off the beat, early or late. */
const TOLERANCE_MS = 35;

describe.each(STAGES)('stage $name', (stage) => {
  const level = levelFor(stage);
  const ideal = idealInputs(level);

  it('builds a chart with notes in every phrase', () => {
    expect(level.notes.length).toBeGreaterThan(40);
    expect(level.bars.length).toBeGreaterThanOrEqual(32);
  });

  it('is cleared by pressing exactly on the notes, all PERFECT', () => {
    const run = playInputs(level, ideal);
    expect(run.dead).toBe(false);
    expect(run.finished).toBe(true);
    const judge = new Judge(level.notes, stage.bpm);
    for (const e of run.events) if (e.type === 'jump' || e.type === 'orb') judge.hit(e.t, e.type);
    judge.sweep(level.endBeat + 1);
    expect(judge.state.counts).toEqual({ perfect: level.notes.length, great: 0, good: 0, miss: 0 });
    expect(judge.rank()).toBe('S');
  });

  it('kills a player who never presses', () => {
    expect(playInputs(level, []).dead).toBe(true);
  });

  const shift = (TOLERANCE_MS / 60000) * stage.bpm;
  const without = (i: number): InputEvent[] => ideal.filter((_, k) => Math.floor(k / 2) !== i);
  const moved = (i: number, by: number): InputEvent[] =>
    ideal.map((e, k) => (Math.floor(k / 2) === i ? { ...e, beat: e.beat + by } : e));

  it(`needs every note, and forgives ±${TOLERANCE_MS}ms on each one`, () => {
    const problems: string[] = [];
    level.notes.forEach((note, i) => {
      const from = playInputs(level, ideal, newRun(), note.beat - 0.25);
      const until = note.beat + 4;
      const where = `bar ${Math.floor(note.beat / 4) + 1} beat ${(note.beat % 4) + 1} (${note.kind})`;
      if (!playInputs(level, without(i), from, until).dead) problems.push(`${where}: survives without pressing`);
      if (playInputs(level, moved(i, -shift), from, until).dead) problems.push(`${where}: early press dies`);
      if (playInputs(level, moved(i, shift), from, until).dead) problems.push(`${where}: late press dies`);
    });
    expect(problems).toEqual([]);
  });
});
