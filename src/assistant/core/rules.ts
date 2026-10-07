/** Validation rules and error wording from docs/assistant/03-data.md §3. */
import { daysBetween, isValidDate, isValidTime } from './dates';
import { charCount, checkLength, cleanMultiLine, cleanSingleLine, sameKey } from './text';
import type { EventDraft, EventField, MessageRequest, Settings, Topic } from './types';

export const LIMITS = {
  topicName: 30,
  topics: 5,
  eventTitle: 50,
  eventLocation: 100,
  eventMemo: 500,
  events: 1000,
  customRelation: 20,
  recipientName: 20,
  intent: 500,
  draft: 1000,
  bullets: 5,
  bullet: 200,
  sources: 5,
  sourceTitle: 120,
  briefingDays: 30,
  searchesMin: 1,
  searchesMax: 5,
} as const;

export const DEFAULT_SETTINGS: Settings = { searchesPerTopic: 3, briefingLanguage: 'ko+en' };

export function normalizeSettings(value: unknown): Settings {
  const v = (value ?? {}) as Partial<Settings>;
  const n = Number(v.searchesPerTopic);
  return {
    searchesPerTopic: Number.isInteger(n)
      ? Math.min(LIMITS.searchesMax, Math.max(LIMITS.searchesMin, n))
      : DEFAULT_SETTINGS.searchesPerTopic,
    briefingLanguage: v.briefingLanguage === 'ko' ? 'ko' : 'ko+en',
  };
}

// ---------- API key ----------

export type ApiKeyCheck = { ok: true; key: string } | { ok: false; message: string };

export function checkApiKey(raw: string): ApiKeyCheck {
  const key = raw.trim();
  if (!key) return { ok: false, message: '' };
  if (!key.startsWith('sk-ant-') || /\s/.test(key) || key.length < 20) {
    return { ok: false, message: 'API 키 형식이 아니에요' };
  }
  return { ok: true, key };
}

/** `sk-ant-…ab12` */
export function maskApiKey(key: string): string {
  return `sk-ant-…${key.slice(-4)}`;
}

// ---------- Topics ----------

export type TopicCheck =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'tooLong' | 'duplicate' | 'full'; message: string };

export function checkTopic(raw: string, existing: Topic[]): TopicCheck {
  const name = cleanSingleLine(raw);
  const len = checkLength(name, LIMITS.topicName);
  if (len === 'empty') return { ok: false, reason: 'empty', message: '' };
  if (len === 'tooLong') return { ok: false, reason: 'tooLong', message: '' };
  if (existing.length >= LIMITS.topics) {
    return { ok: false, reason: 'full', message: `주제는 ${LIMITS.topics}개까지예요` };
  }
  const key = sameKey(name);
  if (existing.some((t) => sameKey(t.name) === key)) {
    return { ok: false, reason: 'duplicate', message: '이미 있는 주제예요' };
  }
  return { ok: true, name };
}

// ---------- Events ----------

export interface EventValue {
  title: string;
  date: string;
  start: string | null;
  end: string | null;
  location: string | null;
  memo: string | null;
}

export interface EventCheck {
  /** Cleaned value, present only when the event can be saved. */
  value: EventValue | null;
  /** Field → message. `''` means "disable save without a message" (blank required field). */
  errors: Partial<Record<EventField, string>>;
  /** Saving is still allowed. */
  warnings: Partial<Record<EventField, string>>;
}

export function emptyDraft(): EventDraft {
  return { title: '', date: '', start: '', end: '', location: '', memo: '' };
}

export function checkEvent(draft: EventDraft, today: string, eventCount = 0): EventCheck {
  const errors: EventCheck['errors'] = {};
  const warnings: EventCheck['warnings'] = {};

  const title = cleanSingleLine(draft.title);
  const tl = checkLength(title, LIMITS.eventTitle);
  if (tl === 'empty') errors.title = '';
  else if (tl === 'tooLong') errors.title = `제목은 ${LIMITS.eventTitle}자까지예요`;

  const date = draft.date.trim();
  if (!date) errors.date = '';
  else if (!isValidDate(date)) errors.date = '날짜를 골라 주세요';
  else if (date < today) warnings.date = '이미 지난 날짜예요';

  const start = draft.start.trim();
  const end = draft.end.trim();
  if (start && !isValidTime(start)) errors.start = '시간을 다시 골라 주세요';
  if (end && !isValidTime(end)) errors.end = '시간을 다시 골라 주세요';
  else if (end && !start) errors.end = '시작 시간을 먼저 넣어 주세요';
  else if (end && start && isValidTime(start) && end <= start) errors.end = '끝 시간이 시작보다 빨라요';

  const location = cleanSingleLine(draft.location);
  if (charCount(location) > LIMITS.eventLocation) errors.location = `장소는 ${LIMITS.eventLocation}자까지예요`;

  const memo = cleanMultiLine(draft.memo);
  if (charCount(memo) > LIMITS.eventMemo) errors.memo = `메모는 ${LIMITS.eventMemo}자까지예요`;

  if (eventCount >= LIMITS.events && !errors.title) {
    errors.title = '일정이 너무 많아요. 지난 일정을 지워 주세요';
  }

  const value =
    Object.keys(errors).length === 0
      ? {
          title,
          date,
          start: start || null,
          end: end || null,
          location: location || null,
          memo: memo || null,
        }
      : null;
  return { value, errors, warnings };
}

/** Sort: date → all-day first → start time. */
export function compareEvents(a: { date: string; start: string | null }, b: { date: string; start: string | null }): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.start === b.start) return 0;
  if (a.start === null) return -1;
  if (b.start === null) return 1;
  return a.start < b.start ? -1 : 1;
}

/** Briefings older than 30 days (relative to `today`) are dropped. */
export function keepBriefing(date: string, today: string): boolean {
  return daysBetween(date, today) <= LIMITS.briefingDays;
}

// ---------- Messages ----------

export function checkMessageRequest(req: MessageRequest): { ok: boolean; message: string } {
  if (req.relation === 'custom') {
    const r = checkLength(cleanSingleLine(req.customRelation), LIMITS.customRelation);
    if (r !== 'ok') return { ok: false, message: r === 'tooLong' ? `관계는 ${LIMITS.customRelation}자까지예요` : '' };
  }
  if (charCount(cleanSingleLine(req.name)) > LIMITS.recipientName) {
    return { ok: false, message: `이름은 ${LIMITS.recipientName}자까지예요` };
  }
  const i = checkLength(cleanMultiLine(req.intent), LIMITS.intent);
  if (i !== 'ok') return { ok: false, message: i === 'tooLong' ? `${LIMITS.intent}자까지 쓸 수 있어요` : '' };
  return { ok: true, message: '' };
}
