import type { DateKey, Day } from './types';

export const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;
const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function weekday(key: DateKey): Day {
  return ((fromKey(key).getDay() + 6) % 7) as Day;
}

/** key가 속한 주의 월요일부터 일요일까지 */
export function weekDates(key: DateKey): DateKey[] {
  const monday = addDays(key, -weekday(key));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 2026년 9월 22일 (화) */
export function formatDayTitle(key: DateKey): string {
  const d = fromKey(key);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_LABELS[weekday(key)]})`;
}

/** 2026년 9월 21일~27일, 달이나 해가 바뀌면 끝 날짜에도 붙인다. */
export function formatWeekRange(key: DateKey): string {
  const days = weekDates(key);
  const a = fromKey(days[0]);
  const b = fromKey(days[6]);
  const head = `${a.getFullYear()}년 ${a.getMonth() + 1}월 ${a.getDate()}일`;
  if (a.getFullYear() !== b.getFullYear()) return `${head}~${b.getFullYear()}년 ${b.getMonth() + 1}월 ${b.getDate()}일`;
  if (a.getMonth() !== b.getMonth()) return `${head}~${b.getMonth() + 1}월 ${b.getDate()}일`;
  return `${head}~${b.getDate()}일`;
}

/** 2026.09.22 */
export function formatDots(key: DateKey): string {
  return key.replace(/-/g, '.');
}

/** 일요일 시작 달력. 해당 달이 아닌 칸은 null. */
export function monthMatrix(year: number, month: number): (DateKey | null)[][] {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (DateKey | null)[] = Array(first.getDay()).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toKey(new Date(year, month - 1, d)));
  while (cells.length % 7) cells.push(null);
  const weeks: (DateKey | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
