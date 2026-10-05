import { toKey, weekDates } from './date';
import { buildSchedule, initialState } from './planner';
import { colors } from './theme';
import type { PlannerState, ScheduleKind } from './types';

/** 웹 데모(EXPO_PUBLIC_DEMO=1)에서 처음 열 때 보여줄 피그마 예시 일정. 이번 주에 맞춰 만든다. */
export function demoState(now: Date): PlannerState {
  const base = initialState(now);
  const week = weekDates(toKey(now));
  const h = (hh: number, mm = 0) => hh * 60 + mm;
  const rows: [day: number, kind: ScheduleKind, title: string, start: number, end: number, color: string][] = [
    [0, 'fixed', '약학실험4', h(9), h(11), colors.bgWarningSubtle],
    [0, 'fixed', 'IC-PBL과 역량 개발', h(11), h(13, 30), colors.bgInfoSubtle],
    [0, 'once', '운동', h(15), h(17), colors.bgTertiary],
    [1, 'fixed', '예방 약학', h(9), h(12), colors.bgBrandSubtle],
    [1, 'fixed', '생의학(ⅠⅠⅠ)', h(12), h(13), colors.bgBrandSubtle],
    [1, 'fixed', '감염 질환 제어', h(15), h(16), colors.bgSuccessSubtle],
    [1, 'fixed', '면역학', h(17), h(18), colors.bgInfoSubtle],
    [2, 'fixed', '면역학', h(10), h(11, 30), colors.bgSuccessSubtle],
    [2, 'once', '운동', h(13), h(14), colors.bgTertiary],
    [3, 'fixed', '면역학', h(10), h(11, 30), colors.bgSuccessSubtle],
    [4, 'fixed', '약학실험4', h(9, 30), h(11, 30), colors.bgWarningSubtle],
  ];
  const schedules = rows.map(([day, kind, title, start, end, color]) =>
    buildSchedule(base.activeTimetableId, kind, title, { date: week[day], start, end }, color),
  );
  // 오늘 첫 일정은 완료로 표시해 진행 막대가 보이게
  const today = toKey(now);
  const first = schedules
    .filter((s) => (s.kind === 'fixed' ? week[s.day] === today : s.date === today))
    .sort((a, b) => a.start - b.start)[0];
  return { ...base, schedules, completions: first ? { [today]: [first.id] } : {} };
}
