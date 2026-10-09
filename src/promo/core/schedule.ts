/** Which posting slots are due right now, in the brand's time zone (docs/promo/PLAN.md §4). */
import { WEEKDAYS, type Slot, type Weekday } from './types';

export interface LocalParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  weekday: Weekday;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function localParts(now: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return { date, time: `${get('hour')}:${get('minute')}`, weekday: weekdayOf(date) };
}

export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Minutes on a wall clock that ignores DST; fine for comparing a slot with "now" in one zone. */
function wallMinutes(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, mi) / 60000;
}

export const slotKey = (date: string, time: string) => `${date}@${time}`;

/**
 * Slots whose time has passed within the last `catchUpHours` and that have not run yet, oldest first.
 * Looks at yesterday too so a 23:30 slot still runs if the scheduler fires after midnight.
 */
export function dueSlots(now: Date, timeZone: string, slots: Slot[], catchUpHours: number, done: (key: string) => boolean): string[] {
  const local = localParts(now, timeZone);
  const nowMin = wallMinutes(local.date, local.time);
  const due: { key: string; at: number }[] = [];
  for (const date of [addDays(local.date, -1), local.date]) {
    const weekday = weekdayOf(date);
    for (const slot of slots) {
      if (!slot.days.includes(weekday)) continue;
      const at = wallMinutes(date, slot.time);
      const key = slotKey(date, slot.time);
      if (at <= nowMin && nowMin - at <= catchUpHours * 60 && !done(key) && !due.some((d) => d.key === key)) due.push({ key, at });
    }
  }
  return due.sort((a, b) => a.at - b.at).map((d) => d.key);
}

/** When missed slots pile up (e.g. Actions was off), only the newest one runs; older ones are marked skipped. */
export function pickSlot(due: string[]): { run: string | null; skipped: string[] } {
  if (!due.length) return { run: null, skipped: [] };
  return { run: due[due.length - 1], skipped: due.slice(0, -1) };
}

/** Draft ids look like 2026-10-09-0900 (slot) or 2026-10-09-1432-now (manual). */
export function draftIdFor(now: Date, timeZone: string, slot: string | null): string {
  if (slot) return slot.replace('@', '-').replace(':', '');
  const local = localParts(now, timeZone);
  return `${local.date}-${local.time.replace(':', '')}-now`;
}

/** The next slot at or after `now` (within 8 days), for the dashboard countdown. */
export function nextSlot(now: Date, timeZone: string, slots: Slot[]): { key: string; date: string; time: string; weekday: Weekday; minutes: number } | null {
  if (!slots.length) return null;
  const local = localParts(now, timeZone);
  const nowMin = wallMinutes(local.date, local.time);
  let best: { key: string; date: string; time: string; weekday: Weekday; minutes: number } | null = null;
  for (let d = 0; d <= 7; d++) {
    const date = addDays(local.date, d);
    const weekday = weekdayOf(date);
    for (const slot of slots) {
      if (!slot.days.includes(weekday)) continue;
      const minutes = wallMinutes(date, slot.time) - nowMin;
      if (minutes < 0) continue;
      if (!best || minutes < best.minutes) best = { key: slotKey(date, slot.time), date, time: slot.time, weekday, minutes };
    }
    if (best) return best;
  }
  return best;
}
