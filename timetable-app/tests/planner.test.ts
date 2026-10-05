import { describe, expect, it } from 'vitest';

import { addDays, formatDayTitle, formatWeekRange, monthMatrix, weekDates, weekday } from '../src/date';
import {
  buildSchedule,
  formatClock,
  formatDuration,
  formatStudyTime,
  initialState,
  occupiedSlots,
  retimeSchedule,
  schedulesOn,
  semesterName,
  slotOf,
  studySummary,
  toggleSlot,
} from '../src/planner';
import { reducer } from '../src/store';
import { ONCE_SCHEDULE_COLOR } from '../src/theme';
import type { PlannerState } from '../src/types';

const TUE = '2026-09-22';

function stateWith(...specs: [kind: 'fixed' | 'once', title: string, date: string, start: number, end: number][]): PlannerState {
  const base = initialState(new Date(2026, 8, 22));
  const schedules = specs.map(([kind, title, date, start, end]) =>
    buildSchedule(base.activeTimetableId, kind, title, { date, start: start * 60, end: end * 60 }, '#fff'),
  );
  return reducer(base, { type: 'addSchedules', schedules });
}

describe('date helpers', () => {
  it('uses Monday-first weeks', () => {
    expect(weekday(TUE)).toBe(1);
    expect(weekDates(TUE)[0]).toBe('2026-09-21');
    expect(weekDates(TUE)[6]).toBe('2026-09-27');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });
  it('formats titles like the design', () => {
    expect(formatDayTitle(TUE)).toBe('2026년 9월 22일 (화)');
    expect(formatWeekRange(TUE)).toBe('2026년 9월 21일~27일');
    expect(formatWeekRange('2026-09-30')).toBe('2026년 9월 28일~10월 4일');
    expect(formatWeekRange('2026-12-30')).toBe('2026년 12월 28일~2027년 1월 3일');
  });
  it('builds a Sunday-first month grid', () => {
    const weeks = monthMatrix(2026, 9);
    expect(weeks[0]).toEqual([null, null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
    expect(weeks.at(-1)?.filter(Boolean).at(-1)).toBe('2026-09-30');
  });
});

describe('formatting', () => {
  it('formats durations and clock chips', () => {
    expect(formatDuration(280)).toBe('4시간 40분');
    expect(formatDuration(120)).toBe('2시간');
    expect(formatDuration(50)).toBe('50분');
    expect(formatClock(12 * 60)).toBe('오후 12:00');
    expect(formatClock(9 * 60 + 30)).toBe('오전 09:30');
    expect(formatStudyTime(0)).toBe('00:00');
    expect(formatStudyTime(6 * 60 + 41)).toBe('6:41');
  });
});

describe('semesterName', () => {
  it('maps months to semesters', () => {
    expect(semesterName(new Date(2026, 8, 1))).toEqual({ year: 2026, name: '2학기 시간표' });
    expect(semesterName(new Date(2026, 3, 1))).toEqual({ year: 2026, name: '1학기 시간표' });
    expect(semesterName(new Date(2027, 0, 10))).toEqual({ year: 2026, name: '2학기 시간표' });
  });
});

describe('schedulesOn', () => {
  it('repeats fixed schedules weekly and shows one-off schedules only on their date', () => {
    const state = stateWith(['fixed', '면역학', TUE, 17, 18], ['once', '운동', TUE, 13, 14], ['fixed', '약학실험', '2026-09-21', 9, 11]);
    expect(schedulesOn(state, TUE).map((s) => s.title)).toEqual(['운동', '면역학']);
    expect(schedulesOn(state, addDays(TUE, 7)).map((s) => s.title)).toEqual(['면역학']);
  });
  it('only uses the active timetable', () => {
    const state = reducer(stateWith(['fixed', '면역학', TUE, 17, 18]), { type: 'addTimetable', year: 2027, name: '1학기 시간표' });
    expect(schedulesOn(state, TUE)).toEqual([]);
  });
});

describe('studySummary', () => {
  it('sums planned and completed minutes', () => {
    let state = stateWith(['fixed', 'A', TUE, 9, 12], ['fixed', 'B', TUE, 12, 13], ['once', 'C', TUE, 15, 16]);
    const [a] = schedulesOn(state, TUE);
    state = reducer(state, { type: 'toggleDone', date: TUE, id: a.id });
    expect(studySummary(state, TUE)).toEqual({ total: 300, done: 180, allDone: false });
    for (const s of schedulesOn(state, TUE).slice(1)) state = reducer(state, { type: 'toggleDone', date: TUE, id: s.id });
    expect(studySummary(state, TUE).allDone).toBe(true);
    // 완료 체크는 날짜별이라 다음 주 같은 요일에는 남지 않는다
    expect(studySummary(state, addDays(TUE, 7)).done).toBe(0);
  });
});

describe('toggleSlot', () => {
  const free = Array(30).fill(false);

  it('selects, extends and shrinks a contiguous range', () => {
    let r = toggleSlot(null, 8, free);
    expect(r).toEqual({ start: 8, end: 9 });
    r = toggleSlot(r, 10, free);
    expect(r).toEqual({ start: 8, end: 11 });
    r = toggleSlot(r, 10, free);
    expect(r).toEqual({ start: 8, end: 10 });
    r = toggleSlot(r, 8, free);
    expect(r).toEqual({ start: 9, end: 10 });
    expect(toggleSlot(r, 9, free)).toBeNull();
  });
  it('restarts the selection when a taken slot is in between', () => {
    const occupied = free.map((_, i) => i === 5);
    expect(toggleSlot({ start: 2, end: 3 }, 7, occupied)).toEqual({ start: 7, end: 8 });
    expect(toggleSlot({ start: 2, end: 3 }, 5, occupied)).toEqual({ start: 2, end: 3 });
  });
  it('marks occupied slots except the schedule being edited', () => {
    const state = stateWith(['fixed', 'A', TUE, 9, 10]);
    const [a] = state.schedules;
    expect(occupiedSlots(state.schedules).slice(0, 3)).toEqual([true, true, false]);
    expect(occupiedSlots(state.schedules, a.id).slice(0, 3)).toEqual([false, false, false]);
    expect(slotOf(13 * 60)).toBe(8);
  });
});

describe('schedule editing', () => {
  it('moves a schedule and recolors it when switching to one-off', () => {
    const [s] = stateWith(['fixed', 'A', TUE, 9, 10]).schedules;
    const moved = retimeSchedule(s, 'once', ' B ', { date: '2026-09-24', start: 600, end: 660 });
    expect(moved).toMatchObject({ id: s.id, kind: 'once', title: 'B', day: 3, date: '2026-09-24', start: 600, color: ONCE_SCHEDULE_COLOR });
  });
  it('deletes a schedule together with its completion marks', () => {
    let state = stateWith(['fixed', 'A', TUE, 9, 10]);
    const [s] = state.schedules;
    state = reducer(state, { type: 'toggleDone', date: TUE, id: s.id });
    state = reducer(state, { type: 'deleteSchedule', id: s.id });
    expect(state.schedules).toEqual([]);
    expect(state.completions[TUE]).toEqual([]);
  });
  it('never deletes the active timetable', () => {
    const state = initialState(new Date(2026, 8, 1));
    expect(reducer(state, { type: 'deleteTimetable', id: state.activeTimetableId })).toBe(state);
  });
});

describe('demoState', () => {
  it('fills the current week without overlaps', async () => {
    const { demoState } = await import('../src/demo');
    const now = new Date(2026, 9, 5, 10);
    const state = demoState(now);
    for (const d of weekDates('2026-10-05')) {
      const list = schedulesOn(state, d);
      list.forEach((s, i) => i && expect(s.start).toBeGreaterThanOrEqual(list[i - 1].end));
    }
    expect(schedulesOn(state, '2026-10-06').map((s) => s.title)).toEqual(['예방 약학', '생의학(ⅠⅠⅠ)', '감염 질환 제어', '면역학']);
    expect(studySummary(state, '2026-10-05').done).toBe(120);
  });
});
