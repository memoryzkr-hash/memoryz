/** Calendar dates are `YYYY-MM-DD`, times `HH:mm`, weeks run Monday → Sunday (03-data.md §1). */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
  } catch {
    return 'Asia/Seoul';
  }
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

export function isValidTime(s: unknown): s is string {
  return typeof s === 'string' && TIME_RE.test(s);
}

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(t: Date): string {
  return t.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const t = parseDate(date);
  t.setUTCDate(t.getUTCDate() + n);
  return formatDate(t);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return parseDate(date).getUTCDay();
}

export function weekdayName(date: string): string {
  return WEEKDAYS[weekday(date)];
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

/** Wall-clock parts of `instant` in `timeZone`. */
function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Today's calendar date for someone in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const p = zonedParts(now, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** The instant when the clock on the wall in `timeZone` shows `date time`. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (instant: number) => {
    const p = zonedParts(new Date(instant), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant;
  };
  // Two passes settle daylight-saving edges.
  let guess = wall - offsetAt(wall);
  guess = wall - offsetAt(guess);
  return new Date(guess);
}

/** Sunday that ends the Monday-to-Sunday week containing `date`. */
export function endOfWeek(date: string): string {
  const wd = weekday(date);
  return addDays(date, wd === 0 ? 0 : 7 - wd);
}

export type Section = 'past' | 'today' | 'week' | 'later';

/** Event list sections from 03-data.md: today / rest of this week / later / past. */
export function sectionOf(date: string, today: string): Section {
  if (date < today) return 'past';
  if (date === today) return 'today';
  if (date <= endOfWeek(today)) return 'week';
  return 'later';
}

/** `10월 13일 (화)` */
export function formatLong(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 (${weekdayName(date)})`;
}

/** `10/13 (화)` */
export function formatShort(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d} (${weekdayName(date)})`;
}
