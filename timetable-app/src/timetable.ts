import type { Course, CourseDraft, Day } from './types';

export const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export const COURSE_COLORS = [
  '#F28B82',
  '#FBBC04',
  '#FFD966',
  '#81C995',
  '#78D9EC',
  '#8AB4F8',
  '#C58AF9',
  '#F6AEA9',
] as const;

export const MIN_TIME = 6 * 60;
export const MAX_TIME = 24 * 60;
export const TIME_STEP = 5;

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatRange(course: Pick<Course, 'start' | 'end'>): string {
  return `${formatTime(course.start)} - ${formatTime(course.end)}`;
}

/** JS Date#getDay()(0 = 일요일)를 월요일 시작 Day로 바꾼다. */
export function dayFromDate(date: Date): Day {
  return ((date.getDay() + 6) % 7) as Day;
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function overlaps(a: Pick<Course, 'day' | 'start' | 'end'>, b: Pick<Course, 'day' | 'start' | 'end'>): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

/** 저장 전에 입력값을 검사하고, 문제가 있으면 사용자에게 보여줄 메시지를 돌려준다. */
export function validateCourse(draft: CourseDraft, courses: Course[], editingId?: string): string | null {
  if (!draft.name.trim()) return '과목명을 입력해 주세요.';
  if (draft.start >= draft.end) return '종료 시간은 시작 시간보다 늦어야 해요.';
  if (draft.start < MIN_TIME || draft.end > MAX_TIME) {
    return `수업 시간은 ${formatTime(MIN_TIME)}부터 ${formatTime(MAX_TIME)} 사이여야 해요.`;
  }
  const clash = courses.find((c) => c.id !== editingId && overlaps(c, draft));
  if (clash) return `'${clash.name}' 수업(${DAY_LABELS[clash.day]} ${formatRange(clash)})과 시간이 겹쳐요.`;
  return null;
}

export function sortCourses(courses: Course[]): Course[] {
  return [...courses].sort((a, b) => a.day - b.day || a.start - b.start);
}

export function coursesOn(courses: Course[], day: Day): Course[] {
  return sortCourses(courses.filter((c) => c.day === day));
}

/** 그리드에 보여줄 요일: 평일은 항상, 주말은 수업이 있을 때만. */
export function visibleDays(courses: Course[]): Day[] {
  const days: Day[] = [0, 1, 2, 3, 4];
  if (courses.some((c) => c.day === 5 || c.day === 6)) days.push(5);
  if (courses.some((c) => c.day === 6)) days.push(6);
  return days;
}

/** 그리드에 보여줄 시간 범위(정시 단위). 기본 9시~18시, 수업이 벗어나면 넓힌다. */
export function hourRange(courses: Course[]): { first: number; last: number } {
  let first = 9;
  let last = 18;
  for (const c of courses) {
    first = Math.min(first, Math.floor(c.start / 60));
    last = Math.max(last, Math.ceil(c.end / 60));
  }
  return { first, last };
}

export interface TodayStatus {
  current: Course | null;
  next: Course | null;
}

export function todayStatus(courses: Course[], now: Date): TodayStatus {
  const today = coursesOn(courses, dayFromDate(now));
  const t = minutesOfDay(now);
  return {
    current: today.find((c) => c.start <= t && t < c.end) ?? null,
    next: today.find((c) => c.start > t) ?? null,
  };
}

/** 아직 쓰이지 않은 색을 우선으로 고른다. */
export function pickColor(courses: Course[]): string {
  const used = new Set(courses.map((c) => c.color));
  return COURSE_COLORS.find((c) => !used.has(c)) ?? COURSE_COLORS[courses.length % COURSE_COLORS.length];
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
