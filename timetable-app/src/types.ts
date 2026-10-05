/** 'YYYY-MM-DD' */
export type DateKey = string;

/** 0 = 월요일 … 6 = 일요일 */
export type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 이번 학기 고정 일정(매주 반복) 또는 일회성 일정(그날 하루). */
export type ScheduleKind = 'fixed' | 'once';

export interface Timetable {
  id: string;
  year: number;
  name: string;
}

export interface Schedule {
  id: string;
  timetableId: string;
  kind: ScheduleKind;
  title: string;
  /** kind === 'fixed' 일 때 반복 요일 */
  day: Day;
  /** kind === 'once' 일 때 날짜 */
  date: DateKey | null;
  /** 자정 기준 분 */
  start: number;
  end: number;
  color: string;
}

export interface PlannerState {
  timetables: Timetable[];
  activeTimetableId: string;
  schedules: Schedule[];
  /** 날짜별로 완료 체크한 일정 id */
  completions: Record<DateKey, string[]>;
}
