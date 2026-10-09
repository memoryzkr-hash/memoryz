/** iCalendar export for sharing an event (docs/assistant/03-data.md §5). */
import { addDays, zonedToUtc } from './dates';
import { truncateChars } from './text';
import type { CalEvent } from './types';

const encoder = new TextEncoder();

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds at 75 UTF-8 bytes, never inside a character (한글 = 3 bytes, emoji = 4). */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      out.push(current);
      current = ' ';
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n');
}

export function buildIcs(event: CalEvent, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//memoryz//assistant//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@memoryz`,
    `DTSTAMP:${utcStamp(now)}`,
  ];
  if (event.start) {
    const start = zonedToUtc(event.date, event.start, event.timeZone);
    const end = event.end ? zonedToUtc(event.date, event.end, event.timeZone) : new Date(start.getTime() + 3_600_000);
    lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
  } else {
    const compact = (d: string) => d.replace(/-/g, '');
    lines.push(`DTSTART;VALUE=DATE:${compact(event.date)}`, `DTEND;VALUE=DATE:${compact(addDays(event.date, 1))}`);
  }
  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.memo) lines.push(`DESCRIPTION:${escapeText(event.memo)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** `민수-미팅-2026-10-13.ics` */
export function icsFileName(event: Pick<CalEvent, 'title' | 'date'>): string {
  const base = event.title
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${truncateChars(base, 40, '') || '일정'}-${event.date}.ics`;
}

/**
 * A link that opens Google Calendar with the event filled in. Works anywhere a plain link
 * works (also inside a Claude artifact, where file downloads are blocked) and can be pasted
 * into a message so the other person can add it too.
 */
export function googleCalendarUrl(event: CalEvent): string {
  let dates: string;
  if (event.start) {
    const start = zonedToUtc(event.date, event.start, event.timeZone);
    const end = event.end ? zonedToUtc(event.date, event.end, event.timeZone) : new Date(start.getTime() + 3_600_000);
    dates = `${utcStamp(start)}/${utcStamp(end)}`;
  } else {
    const compact = (d: string) => d.replace(/-/g, '');
    dates = `${compact(event.date)}/${compact(addDays(event.date, 1))}`;
  }
  const params = new URLSearchParams({ action: 'TEMPLATE', text: event.title, dates });
  if (event.location) params.set('location', event.location);
  if (event.memo) params.set('details', event.memo);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
