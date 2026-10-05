import { describe, expect, it } from 'vitest';

import { freeRanges, plannerContext, runPlannerTool } from '../src/ai/tools';
import { buildSchedule, initialState, schedulesOn } from '../src/planner';
import { reducer } from '../src/store';

const now = new Date(2026, 9, 5, 10, 10); // 월 10:10
const MON = '2026-10-05';
const TUE = '2026-10-06';

function base() {
  const s = initialState(now);
  const lecture = buildSchedule(s.activeTimetableId, 'fixed', '면역학', { date: TUE, start: 13 * 60, end: 15 * 60 }, '#fff');
  return reducer(s, { type: 'addSchedules', schedules: [lecture] });
}

describe('get_schedules', () => {
  it('lists schedules and free time, skipping the past', () => {
    const out = runPlannerTool('get_schedules', { start_date: MON, end_date: TUE }, base(), now).output as {
      date: string;
      free: string[];
      schedules: { title: string }[];
    }[];
    expect(out[0].free).toEqual(['10:30-24:00']);
    expect(out[1].schedules.map((s) => s.title)).toEqual(['면역학']);
    expect(out[1].free).toEqual(['09:00-13:00', '15:00-24:00']);
  });
  it('rejects bad dates', () => {
    expect(() => runPlannerTool('get_schedules', { start_date: '10/5', end_date: TUE }, base(), now)).toThrow();
  });
});

describe('add_schedules', () => {
  it('adds valid items and explains rejections', () => {
    const run = runPlannerTool(
      'add_schedules',
      {
        items: [
          { title: '면역학 복습', date: TUE, start: '15:00', end: '17:00', kind: 'once' },
          { title: '겹침', date: TUE, start: '14:00', end: '16:00', kind: 'once' },
          { title: '지난 시간', date: MON, start: '09:00', end: '10:00', kind: 'once' },
          { title: '15분', date: TUE, start: '18:15', end: '19:00', kind: 'once' },
          { title: '자기 자신과 겹침', date: TUE, start: '16:30', end: '18:00', kind: 'once' },
        ],
      },
      base(),
      now,
    );
    const out = run.output as { added: unknown[]; rejected: { reason: string }[] };
    expect(out.added).toHaveLength(1);
    expect(out.rejected.map((r) => r.reason)).toEqual([
      expect.stringContaining('면역학'),
      expect.stringContaining('지난'),
      expect.stringContaining('30분'),
      expect.stringContaining('면역학 복습'),
    ]);
    expect(schedulesOn(run.state, TUE).map((s) => s.title)).toEqual(['면역학', '면역학 복습']);
    // 하루 일정에도 그대로 나온다
    expect(run.added[0]).toMatchObject({ kind: 'once', date: TUE, start: 15 * 60, end: 17 * 60 });
  });
});

describe('delete_schedules', () => {
  it('deletes by id and reports unknown ids', () => {
    const state = base();
    const [lecture] = state.schedules;
    const run = runPlannerTool('delete_schedules', { ids: [lecture.id, 'nope'] }, state, now);
    expect(run.output).toEqual({ deleted: [lecture.id], missing: ['nope'] });
    expect(run.state.schedules).toEqual([]);
  });
});

describe('helpers', () => {
  it('computes free ranges', () => {
    expect(freeRanges([])).toEqual(['09:00-24:00']);
  });
  it('describes the planning context', () => {
    const ctx = plannerContext(base(), TUE, now);
    expect(ctx).toContain('지금: 2026-10-05 (월) 10:10');
    expect(ctx).toContain('화 13:00-15:00 면역학');
  });
});
