import { DAY_LABELS, weekday } from './date';
import { FIXED_SCHEDULE_COLORS, ONCE_SCHEDULE_COLOR } from './theme';
import type { DateKey, Day, PlannerState, Schedule, ScheduleKind, Timetable } from './types';

/** 시간표는 09시부터 24시까지, 30분 칸 단위로 고른다. */
export const DAY_START = 9 * 60;
export const DAY_END = 24 * 60;
export const SLOT_MINUTES = 30;
export const SLOT_COUNT = (DAY_END - DAY_START) / SLOT_MINUTES;
export const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START / 60 + i);

const pad = (n: number) => String(n).padStart(2, '0');

/** 570 → "09:30" */
export function formatHM(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** 주간 시간표 블록용: 570 → "9:30" */
export function formatShortHM(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}

export function formatRange(s: Pick<Schedule, 'start' | 'end'>): string {
  return `${formatHM(s.start)}~${formatHM(s.end)}`;
}

/** 일정 수정 시트의 시각 칩: "오후 13:00" */
export function formatClock(minutes: number): string {
  return `${minutes < 12 * 60 ? '오전' : '오후'} ${formatHM(minutes)}`;
}

/** 280 → "4시간 40분" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

/** 캘린더 날짜 아래 순 공부시간: 280 → "4:40", 0 → "00:00" */
export function formatStudyTime(minutes: number): string {
  if (!minutes) return '00:00';
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}

export function activeSchedules(state: PlannerState): Schedule[] {
  return state.schedules.filter((s) => s.timetableId === state.activeTimetableId);
}

/** 그날 보여줄 일정: 그 요일의 고정 일정 + 그날의 일회성 일정, 시작 시각 순. */
export function schedulesOn(state: PlannerState, date: DateKey): Schedule[] {
  const day = weekday(date);
  return activeSchedules(state)
    .filter((s) => (s.kind === 'fixed' ? s.day === day : s.date === date))
    .sort((a, b) => a.start - b.start);
}

export const duration = (s: Pick<Schedule, 'start' | 'end'>) => s.end - s.start;

export interface StudySummary {
  total: number;
  done: number;
  allDone: boolean;
}

export function studySummary(state: PlannerState, date: DateKey): StudySummary {
  const list = schedulesOn(state, date);
  const doneIds = new Set(state.completions[date] ?? []);
  const total = list.reduce((sum, s) => sum + duration(s), 0);
  const done = list.filter((s) => doneIds.has(s.id)).reduce((sum, s) => sum + duration(s), 0);
  return { total, done, allDone: list.length > 0 && list.every((s) => doneIds.has(s.id)) };
}

export function isDone(state: PlannerState, date: DateKey, id: string): boolean {
  return (state.completions[date] ?? []).includes(id);
}

// ---- 30분 칸 선택 ----

/** [start, end) 칸 번호 */
export interface SlotRange {
  start: number;
  end: number;
}

export const slotOf = (minutes: number) => Math.floor((minutes - DAY_START) / SLOT_MINUTES);
export const minutesOf = (slot: number) => DAY_START + slot * SLOT_MINUTES;

export function rangeToTimes(r: SlotRange): { start: number; end: number } {
  return { start: minutesOf(r.start), end: minutesOf(r.end) };
}

export function timesToRange(s: Pick<Schedule, 'start' | 'end'>): SlotRange {
  return { start: slotOf(s.start), end: Math.ceil((s.end - DAY_START) / SLOT_MINUTES) };
}

/** 그 요일(날짜)에 이미 일정이 있는 칸. exceptId 일정은 비어 있는 것으로 본다. */
export function occupiedSlots(schedules: Schedule[], exceptId?: string): boolean[] {
  const taken = Array<boolean>(SLOT_COUNT).fill(false);
  for (const s of schedules) {
    if (s.id === exceptId) continue;
    const r = timesToRange(s);
    for (let i = Math.max(0, r.start); i < Math.min(SLOT_COUNT, r.end); i++) taken[i] = true;
  }
  return taken;
}

const freeBetween = (occupied: boolean[], from: number, to: number) => {
  for (let i = from; i < to; i++) if (occupied[i]) return false;
  return true;
};

/**
 * 칸을 눌렀을 때의 새 선택 범위. 선택은 한 덩어리로 이어져야 한다.
 * - 빈 상태에서 누르면 그 칸만 선택
 * - 선택 범위 밖을 누르면 그 칸까지 늘리고, 중간에 막힌 칸이 있으면 그 칸부터 새로 선택
 * - 선택된 양 끝 칸을 누르면 그 칸만 빼고, 가운데를 누르면 시작~그 칸까지로 줄인다
 */
export function toggleSlot(range: SlotRange | null, slot: number, occupied: boolean[]): SlotRange | null {
  if (occupied[slot]) return range;
  if (!range) return { start: slot, end: slot + 1 };
  if (slot >= range.start && slot < range.end) {
    if (range.end - range.start === 1) return null;
    if (slot === range.start) return { start: slot + 1, end: range.end };
    if (slot === range.end - 1) return { start: range.start, end: slot };
    return { start: range.start, end: slot + 1 };
  }
  const start = Math.min(range.start, slot);
  const end = Math.max(range.end, slot + 1);
  return freeBetween(occupied, start, end) ? { start, end } : { start: slot, end: slot + 1 };
}

/** "화 13:00~14:00" */
export function describeSelection(day: Day, r: SlotRange): string {
  return `${DAY_LABELS[day]} ${formatRange(rangeToTimes(r))}`;
}

// ---- 일정 만들기 ----

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function scheduleColor(kind: ScheduleKind, random = Math.random): string {
  if (kind === 'once') return ONCE_SCHEDULE_COLOR;
  return FIXED_SCHEDULE_COLORS[Math.floor(random() * FIXED_SCHEDULE_COLORS.length)];
}

export interface ScheduleSlot {
  date: DateKey;
  start: number;
  end: number;
}

export function buildSchedule(
  timetableId: string,
  kind: ScheduleKind,
  title: string,
  slot: ScheduleSlot,
  color = scheduleColor(kind),
): Schedule {
  return {
    id: newId(),
    timetableId,
    kind,
    title: title.trim(),
    day: weekday(slot.date),
    date: kind === 'once' ? slot.date : null,
    start: slot.start,
    end: slot.end,
    color,
  };
}

/** 고정↔일회성으로 바꾸거나 시간을 옮길 때. date는 일정이 놓인 날짜. */
export function retimeSchedule(s: Schedule, kind: ScheduleKind, title: string, slot: ScheduleSlot): Schedule {
  const color = kind === s.kind ? s.color : scheduleColor(kind);
  return {
    ...s,
    kind,
    title: title.trim(),
    day: weekday(slot.date),
    date: kind === 'once' ? slot.date : null,
    start: slot.start,
    end: slot.end,
    color,
  };
}

// ---- 시간표(학기) ----

export function semesterName(date: Date): { year: number; name: string } {
  const m = date.getMonth() + 1;
  if (m <= 2) return { year: date.getFullYear() - 1, name: '2학기 시간표' };
  return { year: date.getFullYear(), name: m <= 8 ? '1학기 시간표' : '2학기 시간표' };
}

export function initialState(now: Date): PlannerState {
  const t: Timetable = { id: newId(), ...semesterName(now) };
  return { timetables: [t], activeTimetableId: t.id, schedules: [], completions: {} };
}

export function timetableLabel(t: Timetable): string {
  return `${t.year} ${t.name}`;
}
