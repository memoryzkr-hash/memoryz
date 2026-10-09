/** Small pieces shared by the dashboard views: icons, labels, time formatting, status chips. */
import { h } from '../../assistant/ui/dom';
import { localParts } from '../core/schedule';
import type { DraftStatus, PlatformId, PublishResult, Weekday } from '../core/types';

export { h, append, replaceChildren, toast } from '../../assistant/ui/dom';

const ICONS: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  drafts: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  inbox: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  history: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};

export function icon(name: keyof typeof ICONS | string): SVGSVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

export const PF_MARK: Record<PlatformId, string> = { threads: '@', instagram: 'IG', wordpress: 'WP', naver: 'N' };
export const PF_NAME: Record<PlatformId, string> = { threads: '쓰레드', instagram: '인스타그램', wordpress: '워드프레스', naver: '네이버·티스토리' };
export const WEEKDAY_KO: Record<Weekday, string> = { sun: '일', mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토' };

export const STATUS: Record<DraftStatus, { label: string; tone: 'accent' | 'ok' | 'warn' | 'bad' | 'muted'; stamp: string }> = {
  draft: { label: '검토 대기', tone: 'warn', stamp: '검토' },
  approved: { label: '승인됨 · 다음 실행 때 발행', tone: 'accent', stamp: '승인' },
  published: { label: '발행됨', tone: 'ok', stamp: '발행' },
  partial: { label: '일부 실패', tone: 'bad', stamp: '일부' },
  failed: { label: '발행 실패', tone: 'bad', stamp: '실패' },
  skip: { label: '건너뜀', tone: 'muted', stamp: '보류' },
};

export function statusChip(s: DraftStatus): HTMLElement {
  const st = STATUS[s];
  return h('span', { class: `chip ${st.tone === 'muted' ? '' : st.tone}` }, h('span', { class: 'dot' }), st.label);
}

export function pfMark(p: PlatformId, r?: PublishResult): HTMLElement {
  const tone = !r ? '' : r.status === 'ok' ? 'ok' : r.status === 'manual' ? 'manual' : 'bad';
  const what = !r ? '아직' : r.status === 'ok' ? '발행됨' : r.status === 'manual' ? '붙여넣기 대기' : '실패';
  return h('span', { class: `pfmark ${tone}`, title: `${PF_NAME[p]}: ${what}` }, PF_MARK[p]);
}

export function ago(iso: string | null, now = new Date()): string {
  if (!iso) return '아직 없음';
  const min = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.round(hr / 24)}일 전`;
}

export function inFuture(minutes: number): string {
  if (minutes < 1) return '곧';
  if (minutes < 60) return `${minutes}분 뒤`;
  const d = Math.floor(minutes / 1440);
  const hr = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d) return `${d}일 ${hr}시간 뒤`;
  return m ? `${hr}시간 ${m}분 뒤` : `${hr}시간 뒤`;
}

export function shortDate(iso: string, tz: string): { day: string; md: string; wd: string; time: string } {
  const p = localParts(new Date(iso), tz);
  const [, m, d] = p.date.split('-');
  return { day: String(Number(d)), md: `${Number(m)}월 ${Number(d)}일`, wd: WEEKDAY_KO[p.weekday], time: p.time };
}

/** Draft ids start with the local date (2026-10-09-0900 or …-1432-now). */
export function draftWhen(id: string): { day: string; md: string; wd: string; time: string } {
  const [y, m, d, hm] = id.split('-');
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const wd = WEEKDAY_KO[(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as Weekday[])[date.getUTCDay()]];
  return { day: String(Number(d)), md: `${Number(m)}월 ${Number(d)}일`, wd, time: hm ? `${hm.slice(0, 2)}:${hm.slice(2, 4)}` : '' };
}

export async function copyText(text: string, fallbackEl?: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallbackEl) {
      const r = document.createRange();
      r.selectNodeContents(fallbackEl);
      const s = getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
    }
    return false;
  }
}

export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // storage blocked: the setting lasts for this visit only
    }
  },
};

export function link(href: string, text: string, cls = ''): HTMLAnchorElement {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer', class: cls }, text);
}
