/** Checks Claude's JSON before anything reaches the screen (docs/assistant/03-data.md §4). */
import { isValidDate, isValidTime } from './dates';
import { LIMITS } from './rules';
import { charCount, cleanMultiLine, cleanSingleLine, truncateChars } from './text';
import type { BriefingItem, EventDraft, EventField, Source } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Compares URLs the way a person would: no #fragment, no trailing slash, case-insensitive host. */
export function urlKey(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hash = '';
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return null;
  }
}

export type BriefingResult = Pick<BriefingItem, 'status' | 'bullets' | 'sources' | 'error'>;

export const BRIEFING_ERRORS = {
  noSummary: '요약을 받지 못했어요',
  noSources: '출처를 확인하지 못했어요',
} as const;

/**
 * `searchedUrls` are the addresses that actually came back from web search in this call
 * (or, for pasted articles, the ones written in the pasted text).
 * A source Claude names that is not among them is dropped, so made-up links never show.
 * `requireSources: false` accepts a summary with no link (pasted text often has none).
 */
export function checkBriefing(input: unknown, searchedUrls: Iterable<string>, opts: { requireSources?: boolean } = {}): BriefingResult {
  if (!isObj(input)) return { status: 'error', bullets: [], sources: [], error: BRIEFING_ERRORS.noSummary };
  if (input.status === 'empty') return { status: 'empty', bullets: [], sources: [] };

  const bullets = (Array.isArray(input.bullets) ? input.bullets : [])
    .filter((b): b is string => typeof b === 'string')
    .map((b) => truncateChars(cleanSingleLine(b), LIMITS.bullet))
    .filter((b) => charCount(b) > 0)
    .slice(0, LIMITS.bullets);
  if (bullets.length === 0) return { status: 'error', bullets: [], sources: [], error: BRIEFING_ERRORS.noSummary };

  const allowed = new Set<string>();
  for (const u of searchedUrls) {
    const k = urlKey(u);
    if (k) allowed.add(k);
  }
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const s of Array.isArray(input.sources) ? input.sources : []) {
    if (!isObj(s) || typeof s.url !== 'string') continue;
    const key = urlKey(s.url);
    if (!key || !key.startsWith('https://') || !allowed.has(key) || seen.has(key)) continue;
    seen.add(key);
    const title = typeof s.title === 'string' ? cleanSingleLine(s.title) : '';
    sources.push({
      title: truncateChars(title || new URL(s.url).hostname, LIMITS.sourceTitle),
      url: s.url,
      lang: s.lang === 'ko' || s.lang === 'en' ? s.lang : 'other',
    });
    if (sources.length >= LIMITS.sources) break;
  }
  if (sources.length === 0 && opts.requireSources !== false) {
    return { status: 'error', bullets: [], sources: [], error: BRIEFING_ERRORS.noSources };
  }
  return { status: 'ok', bullets, sources };
}

export interface ParsedEvent {
  draft: EventDraft;
  uncertain: EventField[];
  interpretation: string | null;
}

const FIELDS: EventField[] = ['title', 'date', 'start', 'end', 'location', 'memo'];

/** Fills the confirm card. Bad dates/times become blank + uncertain instead of failing. */
export function checkParsedEvent(input: unknown): ParsedEvent | null {
  if (!isObj(input)) return null;
  const uncertain = new Set<EventField>(
    (Array.isArray(input.uncertain) ? input.uncertain : []).filter((f): f is EventField => FIELDS.includes(f as EventField)),
  );
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  let date = str(input.date).trim();
  if (date && !isValidDate(date)) {
    date = '';
    uncertain.add('date');
  }
  let start = str(input.start).trim();
  if (start && !isValidTime(start)) {
    start = '';
    uncertain.add('start');
  }
  let end = str(input.end).trim();
  if (end && (!isValidTime(end) || !start || end <= start)) {
    end = '';
    uncertain.add('end');
  }
  if (!date) uncertain.add('date');

  const draft: EventDraft = {
    title: truncateChars(cleanSingleLine(str(input.title)), LIMITS.eventTitle, ''),
    date,
    start,
    end,
    location: truncateChars(cleanSingleLine(str(input.location)), LIMITS.eventLocation, ''),
    memo: truncateChars(cleanMultiLine(str(input.memo)), LIMITS.eventMemo, ''),
  };
  if (!draft.title) uncertain.add('title');
  const interpretation = typeof input.interpretation === 'string' ? cleanSingleLine(input.interpretation) || null : null;
  return { draft, uncertain: [...uncertain], interpretation };
}

/** Exactly two non-empty drafts, or nothing. */
export function checkDrafts(input: unknown): [string, string] | null {
  if (!isObj(input) || !Array.isArray(input.drafts) || input.drafts.length !== 2) return null;
  const drafts = input.drafts.map((d) => (typeof d === 'string' ? truncateChars(cleanMultiLine(d), LIMITS.draft, '') : ''));
  if (drafts.some((d) => !d)) return null;
  return [drafts[0], drafts[1]];
}

/** Every http(s) address written in a piece of text, in order, without duplicates. */
export function urlsIn(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'()\[\]{}]+/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const url = raw.replace(/[.,;:!?…。、]+$/, '');
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

/** Structured-output text → object, or null if it is not JSON. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
