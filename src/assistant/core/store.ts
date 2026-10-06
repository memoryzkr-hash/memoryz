/** localStorage persistence (docs/assistant/03-data.md §2). The DOM never touches storage directly. */
import { browserTimeZone } from './dates';
import { checkEvent, checkTopic, compareEvents, DEFAULT_SETTINGS, keepBriefing, normalizeSettings, type EventCheck, type TopicCheck } from './rules';
import type { Briefing, BriefingItem, CalEvent, EventDraft, Settings, Topic } from './types';

export const KEYS = {
  apiKey: 'assistant.v1.apiKey',
  settings: 'assistant.v1.settings',
  topics: 'assistant.v1.topics',
  briefings: 'assistant.v1.briefings',
  events: 'assistant.v1.events',
} as const;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface StoreOptions {
  now?: () => Date;
  newId?: () => string;
  timeZone?: () => string;
}

export type SaveResult<T> = { ok: true; value: T } | { ok: false; reason: 'invalid' | 'storage'; message: string };

const STORAGE_FAIL = '저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrOrNull = (v: unknown) => v === null || isStr(v);

function isTopic(v: unknown): v is Topic {
  return isObj(v) && isStr(v.id) && isStr(v.name) && isStr(v.createdAt);
}

function isBriefing(v: unknown): v is Briefing {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.date) &&
    isStr(v.createdAt) &&
    Array.isArray(v.items) &&
    v.items.every((i) => isObj(i) && isStr(i.topicId) && isStr(i.topicName) && Array.isArray(i.bullets) && Array.isArray(i.sources))
  );
}

function isEvent(v: unknown): v is CalEvent {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.title) &&
    isStr(v.date) &&
    isStrOrNull(v.start) &&
    isStrOrNull(v.end) &&
    isStrOrNull(v.location) &&
    isStrOrNull(v.memo) &&
    isStr(v.timeZone)
  );
}

export class AssistantStore {
  /** Keys whose saved data could not be read; the raw text was moved to `<key>.corrupt`. */
  readonly corrupt: string[] = [];
  /** False when the browser refuses storage entirely (some private modes). */
  readonly available: boolean;

  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly timeZone: () => string;

  constructor(private readonly storage: StorageLike, opts: StoreOptions = {}) {
    this.now = opts.now ?? (() => new Date());
    this.newId = opts.newId ?? (() => crypto.randomUUID());
    this.timeZone = opts.timeZone ?? browserTimeZone;
    this.available = this.probe();
  }

  private probe(): boolean {
    try {
      const k = 'assistant.v1.__probe';
      this.storage.setItem(k, '1');
      this.storage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  private stamp(): string {
    return this.now().toISOString();
  }

  // ---------- low level ----------

  private readList<T>(key: string, guard: (v: unknown) => v is T): T[] {
    let raw: string | null;
    try {
      raw = this.storage.getItem(key);
    } catch {
      return [];
    }
    if (raw === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    const list = Array.isArray(parsed) ? parsed : [];
    const good = list.filter(guard);
    if (!Array.isArray(parsed) || good.length !== list.length) this.quarantine(key, raw, good);
    return good;
  }

  /** Never silently overwrite data we could not read: keep the original next to it. */
  private quarantine(key: string, raw: string, keep: unknown[]): void {
    if (!this.corrupt.includes(key)) this.corrupt.push(key);
    try {
      this.storage.setItem(`${key}.corrupt`, raw);
      this.storage.setItem(key, JSON.stringify(keep));
    } catch {
      // Leave the original untouched if we cannot back it up.
    }
  }

  /** Writes; on failure drops the oldest briefing and retries once. */
  private write(key: string, value: unknown): boolean {
    const json = JSON.stringify(value);
    try {
      this.storage.setItem(key, json);
      return true;
    } catch {
      // fall through
    }
    try {
      const briefings = key === KEYS.briefings ? (value as Briefing[]) : this.briefings();
      if (briefings.length === 0) return false;
      const trimmed = briefings.slice(0, -1);
      this.storage.setItem(KEYS.briefings, JSON.stringify(trimmed));
      if (key !== KEYS.briefings) this.storage.setItem(key, json);
      return true;
    } catch {
      return false;
    }
  }

  // ---------- API key & settings ----------

  apiKey(): string | null {
    try {
      return this.storage.getItem(KEYS.apiKey);
    } catch {
      return null;
    }
  }

  setApiKey(key: string): boolean {
    try {
      this.storage.setItem(KEYS.apiKey, key);
      return true;
    } catch {
      return false;
    }
  }

  clearApiKey(): void {
    try {
      this.storage.removeItem(KEYS.apiKey);
    } catch {
      // nothing stored
    }
  }

  settings(): Settings {
    try {
      const raw = this.storage.getItem(KEYS.settings);
      return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  setSettings(s: Settings): boolean {
    return this.write(KEYS.settings, normalizeSettings(s));
  }

  /** "모든 데이터 지우기" */
  clearAll(): void {
    for (const key of Object.values(KEYS)) {
      try {
        this.storage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }

  // ---------- topics ----------

  topics(): Topic[] {
    return this.readList(KEYS.topics, isTopic);
  }

  addTopic(raw: string): SaveResult<Topic> & { check?: TopicCheck } {
    const list = this.topics();
    const check = checkTopic(raw, list);
    if (!check.ok) return { ok: false, reason: 'invalid', message: check.message, check };
    const topic: Topic = { id: this.newId(), name: check.name, createdAt: this.stamp() };
    if (!this.write(KEYS.topics, [...list, topic])) return { ok: false, reason: 'storage', message: STORAGE_FAIL };
    return { ok: true, value: topic };
  }

  removeTopic(id: string): Removed<Topic> | null {
    return this.removeFrom(KEYS.topics, this.topics(), id);
  }

  restoreTopic(r: Removed<Topic>): boolean {
    return this.restoreInto(KEYS.topics, this.topics(), r);
  }

  // ---------- briefings ----------

  /** Newest first. */
  briefings(): Briefing[] {
    return this.readList(KEYS.briefings, isBriefing).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  briefingFor(date: string): Briefing | null {
    return this.briefings().find((b) => b.date === date) ?? null;
  }

  /** One briefing per day: same date replaces. Prunes anything older than 30 days. */
  saveBriefing(b: Briefing): boolean {
    const rest = this.briefings().filter((x) => x.date !== b.date && keepBriefing(x.date, b.date));
    return this.write(KEYS.briefings, [b, ...rest]);
  }

  /** "다시 시도" on one topic: replaces only that item. */
  updateBriefingItem(date: string, item: BriefingItem): Briefing | null {
    const b = this.briefingFor(date);
    if (!b) return null;
    const items = b.items.map((i) => (i.topicId === item.topicId ? item : i));
    const next = { ...b, items, createdAt: this.stamp() };
    return this.saveBriefing(next) ? next : null;
  }

  newBriefing(date: string, items: BriefingItem[]): Briefing {
    return { id: this.newId(), date, createdAt: this.stamp(), language: this.settings().briefingLanguage, items };
  }

  // ---------- events ----------

  events(): CalEvent[] {
    return this.readList(KEYS.events, isEvent).sort(compareEvents);
  }

  checkEvent(draft: EventDraft, today: string, editingId?: string): EventCheck {
    const count = this.events().filter((e) => e.id !== editingId).length;
    return checkEvent(draft, today, count);
  }

  /** Creates, or updates when `id` is given (keeps id, createdAt, source). */
  saveEvent(draft: EventDraft, today: string, source: CalEvent['source'], id?: string): SaveResult<CalEvent> {
    const check = this.checkEvent(draft, today, id);
    if (!check.value) {
      const first = Object.values(check.errors).find((m) => m) ?? '';
      return { ok: false, reason: 'invalid', message: first };
    }
    const list = this.events();
    const old = id ? list.find((e) => e.id === id) : undefined;
    const stamp = this.stamp();
    const event: CalEvent = {
      ...check.value,
      id: old?.id ?? this.newId(),
      timeZone: old?.timeZone ?? this.timeZone(),
      source: old?.source ?? source,
      createdAt: old?.createdAt ?? stamp,
      updatedAt: stamp,
    };
    const next = old ? list.map((e) => (e.id === old.id ? event : e)) : [...list, event];
    if (!this.write(KEYS.events, next)) return { ok: false, reason: 'storage', message: STORAGE_FAIL };
    return { ok: true, value: event };
  }

  removeEvent(id: string): Removed<CalEvent> | null {
    return this.removeFrom(KEYS.events, this.events(), id);
  }

  restoreEvent(r: Removed<CalEvent>): boolean {
    return this.restoreInto(KEYS.events, this.events(), r);
  }

  // ---------- undo helpers ----------

  private removeFrom<T extends { id: string }>(key: string, list: T[], id: string): Removed<T> | null {
    const index = list.findIndex((x) => x.id === id);
    if (index < 0) return null;
    const item = list[index];
    if (!this.write(key, list.filter((x) => x.id !== id))) return null;
    return { item, index };
  }

  private restoreInto<T extends { id: string }>(key: string, list: T[], r: Removed<T>): boolean {
    if (list.some((x) => x.id === r.item.id)) return true;
    const next = [...list];
    next.splice(Math.min(r.index, next.length), 0, r.item);
    return this.write(key, next);
  }
}

export interface Removed<T> {
  item: T;
  index: number;
}

/** Holds the last deleted item for 5 seconds so the toast can undo it (03-data.md "되돌리기"). */
export class UndoSlot<T> {
  private pending: { value: T; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor(private readonly ms = 5000) {}

  hold(value: T): void {
    this.clear();
    this.pending = { value, timer: setTimeout(() => (this.pending = null), this.ms) };
  }

  take(): T | null {
    if (!this.pending) return null;
    const { value } = this.pending;
    this.clear();
    return value;
  }

  clear(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }
}
