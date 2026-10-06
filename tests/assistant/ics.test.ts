import { describe, expect, it } from 'vitest';
import { buildIcs, foldLine, icsFileName } from '../../src/assistant/core/ics';
import type { CalEvent } from '../../src/assistant/core/types';

const NOW = new Date('2026-10-06T09:00:00Z');
const bytes = (s: string) => new TextEncoder().encode(s).length;
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

const event = (over: Partial<CalEvent> = {}): CalEvent => ({
  id: 'a2b9',
  title: '민수 미팅',
  date: '2026-10-13',
  start: '15:00',
  end: '16:30',
  location: '강남역 11번 출구',
  memo: null,
  timeZone: 'Asia/Seoul',
  source: 'ai',
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('buildIcs', () => {
  it('writes a timed event in UTC with CRLF line ends', () => {
    const ics = buildIcs(event(), NOW);
    expect(ics).toContain('\r\nDTSTART:20261013T060000Z\r\n');
    expect(ics).toContain('\r\nDTEND:20261013T073000Z\r\n');
    expect(ics).toContain('\r\nUID:a2b9@memoryz\r\n');
    expect(ics).toContain('\r\nDTSTAMP:20261006T090000Z\r\n');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('no end time → one hour', () => {
    expect(buildIcs(event({ end: null }), NOW)).toContain('DTEND:20261013T070000Z');
  });

  it('all-day uses VALUE=DATE and ends the next day', () => {
    const ics = buildIcs(event({ date: '2026-12-31', start: null, end: null }), NOW);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101\r\n');
  });

  it('escapes \\ ; , and newlines', () => {
    const ics = buildIcs(event({ title: 'a;b,c\\d', memo: '자료 USB\n발표 10분' }), NOW);
    expect(ics).toContain('SUMMARY:a\\;b\\,c\\\\d\r\n');
    expect(ics).toContain('DESCRIPTION:자료 USB\\n발표 10분\r\n');
  });

  it('leaves out empty location and memo', () => {
    const ics = buildIcs(event({ location: null, memo: null }), NOW);
    expect(ics).not.toContain('LOCATION');
    expect(ics).not.toContain('DESCRIPTION');
  });

  it('a 50-character Korean title folds at 75 bytes and unfolds back exactly', () => {
    const title = '가나다라마바사아자차'.repeat(5);
    const ics = buildIcs(event({ title }), NOW);
    for (const line of ics.split('\r\n')) expect(bytes(line)).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain(`SUMMARY:${title}\r\n`);
  });
});

describe('foldLine', () => {
  it('short lines stay as they are', () => {
    expect(foldLine('SUMMARY:짧음')).toBe('SUMMARY:짧음');
  });

  it('never splits a character (Korean 3 bytes, emoji 4 bytes)', () => {
    const line = 'DESCRIPTION:' + '한🙂'.repeat(40);
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(bytes(p)).toBeLessThanOrEqual(75);
      expect(p).not.toContain('�');
      // a lone surrogate would mean an emoji got cut in half
      expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(p)).toBe(false);
    }
    for (const p of parts.slice(1)) expect(p.startsWith(' ')).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('icsFileName', () => {
  it('uses the title and date', () => {
    expect(icsFileName({ title: '민수 미팅', date: '2026-10-13' })).toBe('민수-미팅-2026-10-13.ics');
  });

  it('removes characters files cannot have', () => {
    expect(icsFileName({ title: 'a/b\\c:d*e?"f<g>h|i', date: '2026-10-13' })).toBe('a-b-c-d-e-f-g-h-i-2026-10-13.ics');
  });

  it('cuts long titles at 40 characters', () => {
    expect(icsFileName({ title: '가'.repeat(60), date: '2026-10-13' })).toBe(`${'가'.repeat(40)}-2026-10-13.ics`);
  });

  it('falls back to 일정 when nothing is left', () => {
    expect(icsFileName({ title: '///', date: '2026-10-13' })).toBe('일정-2026-10-13.ics');
  });
});
