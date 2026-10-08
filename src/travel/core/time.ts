/** "HH:mm" ↔ minutes after midnight. */

export function parseClock(s: string | null | undefined): number | null {
  if (typeof s !== 'string') return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 25:10 shows as "다음날 01:10". */
export function formatClock(min: number): string {
  const m = Math.round(min);
  const day = Math.floor(m / 1440);
  const r = ((m % 1440) + 1440) % 1440;
  const hh = String(Math.floor(r / 60)).padStart(2, '0');
  const mm = String(r % 60).padStart(2, '0');
  return `${day > 0 ? '다음날 ' : ''}${hh}:${mm}`;
}

export function formatDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}시간 ${m % 60}분` : `${h}시간`;
}
