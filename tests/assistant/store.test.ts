import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantStore, KEYS, UndoSlot, type StorageLike } from '../../src/assistant/core/store';
import type { Briefing, BriefingItem, EventDraft } from '../../src/assistant/core/types';

const TODAY = '2026-10-06';

/** In-memory localStorage. `quota` makes writes fail once the total size passes it. */
class FakeStorage implements StorageLike {
  data = new Map<string, string>();
  quota = Infinity;
  broken = false;
  getItem(k: string) {
    if (this.broken) throw new Error('SecurityError');
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.broken) throw new Error('SecurityError');
    const size = [...this.data].reduce((n, [key, val]) => n + (key === k ? 0 : val.length), 0) + v.length;
    if (size > this.quota) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    if (this.broken) throw new Error('SecurityError');
    this.data.delete(k);
  }
}

function setup(storage = new FakeStorage()) {
  let n = 0;
  const store = new AssistantStore(storage, {
    now: () => new Date('2026-10-06T00:00:00Z'),
    newId: () => `id${++n}`,
    timeZone: () => 'Asia/Seoul',
  });
  return { storage, store };
}

const item = (topicId: string): BriefingItem => ({ topicId, topicName: topicId, status: 'ok', bullets: ['요약'], sources: [{ title: 't', url: 'https://a.kr', lang: 'ko' }] });
const briefing = (date: string, id = date): Briefing => ({ id, date, createdAt: `${date}T00:00:00Z`, language: 'ko+en', items: [item('t1')] });
const ev = (over: Partial<EventDraft> = {}): EventDraft => ({ title: '민수 미팅', date: '2026-10-13', start: '15:00', end: '', location: '강남역', memo: '', ...over });

describe('topics', () => {
  it('adds, refuses the 6th, and persists across reloads', () => {
    const { storage, store } = setup();
    for (const name of ['AI 도구', '주식', '게임 업데이트', '날씨', '여행']) expect(store.addTopic(name).ok).toBe(true);
    expect(store.addTopic('여섯째')).toMatchObject({ ok: false, message: '주제는 5개까지예요' });
    const again = setup(storage).store;
    expect(again.topics().map((t) => t.name)).toEqual(['AI 도구', '주식', '게임 업데이트', '날씨', '여행']);
  });

  it('undo cannot push past 5 topics (delete one, add another, then 되돌리기)', () => {
    const { store } = setup();
    for (const name of ['a', 'b', 'c', 'd', 'e']) store.addTopic(name);
    const removed = store.removeTopic(store.topics()[0].id)!;
    store.addTopic('f');
    expect(store.restoreTopic(removed)).toBe(false);
    expect(store.topics()).toHaveLength(5);
  });

  it('remove + restore puts it back in the same place', () => {
    const { store } = setup();
    store.addTopic('a');
    store.addTopic('b');
    store.addTopic('c');
    const removed = store.removeTopic(store.topics()[1].id)!;
    expect(store.topics().map((t) => t.name)).toEqual(['a', 'c']);
    store.restoreTopic(removed);
    expect(store.topics().map((t) => t.name)).toEqual(['a', 'b', 'c']);
  });
});

describe('corrupt data', () => {
  it('broken JSON: starts empty, keeps the original under .corrupt, reports it', () => {
    const storage = new FakeStorage();
    storage.data.set(KEYS.topics, '{not json');
    const { store } = setup(storage);
    expect(store.topics()).toEqual([]);
    expect(store.corrupt).toEqual([KEYS.topics]);
    expect(storage.data.get(`${KEYS.topics}.corrupt`)).toBe('{not json');
  });

  it('keeps the good rows when only some are broken', () => {
    const storage = new FakeStorage();
    storage.data.set(KEYS.topics, JSON.stringify([{ id: 'a', name: '좋음', createdAt: '' }, { id: 1 }]));
    const { store } = setup(storage);
    expect(store.topics().map((t) => t.name)).toEqual(['좋음']);
    expect(store.corrupt).toContain(KEYS.topics);
  });

  it('broken settings fall back to defaults', () => {
    const storage = new FakeStorage();
    storage.data.set(KEYS.settings, 'oops');
    expect(setup(storage).store.settings()).toEqual({ searchesPerTopic: 3, briefingLanguage: 'ko+en' });
  });
});

describe('storage that refuses everything (private mode)', () => {
  it('reports unavailable and never throws', () => {
    const storage = new FakeStorage();
    storage.broken = true;
    const { store } = setup(storage);
    expect(store.available).toBe(false);
    expect(store.topics()).toEqual([]);
    expect(store.apiKey()).toBeNull();
    expect(store.setApiKey('sk-ant-x')).toBe(false);
    expect(store.addTopic('주식')).toMatchObject({ ok: false, reason: 'storage' });
  });
});

describe('briefings', () => {
  it('one per day: saving the same date replaces it', () => {
    const { store } = setup();
    store.saveBriefing(briefing(TODAY, 'first'));
    store.saveBriefing(briefing(TODAY, 'second'));
    expect(store.briefings().map((b) => b.id)).toEqual(['second']);
  });

  it('newest first, prunes anything older than 30 days', () => {
    const { store } = setup();
    store.saveBriefing(briefing('2026-09-05'));
    store.saveBriefing(briefing('2026-09-06'));
    store.saveBriefing(briefing('2026-10-01'));
    store.saveBriefing(briefing(TODAY));
    expect(store.briefings().map((b) => b.date)).toEqual([TODAY, '2026-10-01', '2026-09-06']);
  });

  it('retrying one topic only replaces that item', () => {
    const { store } = setup();
    store.saveBriefing({ ...briefing(TODAY), items: [item('t1'), { ...item('t2'), status: 'error', bullets: [], sources: [], error: 'x' }] });
    store.updateBriefingItem(TODAY, item('t2'));
    expect(store.briefingFor(TODAY)!.items.map((i) => i.status)).toEqual(['ok', 'ok']);
  });

  it('when storage is full, drops the oldest briefing and retries once', () => {
    const { storage, store } = setup();
    // Big briefings so dropping one frees far more than the event needs.
    const big = (date: string): Briefing => ({ ...briefing(date), items: [{ ...item('t1'), bullets: ['요약'.repeat(500)] }] });
    store.saveBriefing(big('2026-10-01'));
    store.saveBriefing(big('2026-10-05'));
    storage.quota = [...storage.data.values()].join('').length + 50;
    const res = store.saveEvent(ev({ memo: '가'.repeat(60) }), TODAY, 'ai');
    expect(res.ok).toBe(true);
    expect(store.briefings().map((b) => b.date)).toEqual(['2026-10-05']);
  });

  it('never reports success after dropping the briefing it was asked to save', () => {
    const { storage, store } = setup();
    storage.quota = 10;
    expect(store.saveBriefing(briefing(TODAY))).toBe(false);
    expect(store.briefings()).toEqual([]);
  });

  it('gives up (and says so) if there is nothing left to drop', () => {
    const { storage, store } = setup();
    storage.quota = 10;
    expect(store.saveEvent(ev(), TODAY, 'ai')).toMatchObject({ ok: false, reason: 'storage' });
  });
});

describe('events', () => {
  it('creates with time zone and source, sorted on read', () => {
    const { store } = setup();
    store.saveEvent(ev({ date: '2026-10-20' }), TODAY, 'manual');
    const res = store.saveEvent(ev(), TODAY, 'ai');
    expect(res).toMatchObject({ ok: true, value: { timeZone: 'Asia/Seoul', source: 'ai', end: null, memo: null } });
    expect(store.events().map((e) => e.date)).toEqual(['2026-10-13', '2026-10-20']);
  });

  it('editing keeps id, createdAt and source', () => {
    const storage = new FakeStorage();
    const first = new AssistantStore(storage, { now: () => new Date('2026-10-06T00:00:00Z'), newId: () => 'e1', timeZone: () => 'Asia/Seoul' });
    first.saveEvent(ev(), TODAY, 'ai');
    const later = new AssistantStore(storage, { now: () => new Date('2026-10-07T00:00:00Z'), newId: () => 'other', timeZone: () => 'Europe/London' });
    const res = later.saveEvent(ev({ start: '16:00' }), TODAY, 'manual', 'e1');
    expect(res).toMatchObject({ ok: true, value: { id: 'e1', start: '16:00', source: 'ai', timeZone: 'Asia/Seoul', createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z' } });
    expect(later.events()).toHaveLength(1);
  });

  it('invalid drafts are not saved', () => {
    const { store } = setup();
    expect(store.saveEvent(ev({ start: '15:00', end: '14:00' }), TODAY, 'ai')).toEqual({ ok: false, reason: 'invalid', message: '끝 시간이 시작보다 빨라요' });
    expect(store.events()).toEqual([]);
  });

  it('remove + restore', () => {
    const { store } = setup();
    const saved = store.saveEvent(ev(), TODAY, 'ai');
    if (!saved.ok) throw new Error('save failed');
    const removed = store.removeEvent(saved.value.id)!;
    expect(store.events()).toEqual([]);
    store.restoreEvent(removed);
    store.restoreEvent(removed); // double tap on 되돌리기 does not duplicate
    expect(store.events()).toHaveLength(1);
  });
});

describe('clearAll', () => {
  it('removes key, settings, topics, briefings, events', () => {
    const { storage, store } = setup();
    store.setApiKey('sk-ant-api03-abcdefghijklmnop');
    store.addTopic('주식');
    store.saveEvent(ev(), TODAY, 'ai');
    store.clearAll();
    expect([...storage.data.keys()].filter((k) => !k.endsWith('.corrupt'))).toEqual([]);
  });
});

describe('UndoSlot', () => {
  afterEach(() => vi.useRealTimers());

  it('holds the last deleted item for 5 seconds', () => {
    vi.useFakeTimers();
    const slot = new UndoSlot<string>();
    slot.hold('a');
    vi.advanceTimersByTime(4999);
    expect(slot.take()).toBe('a');
    expect(slot.take()).toBeNull();
    slot.hold('b');
    vi.advanceTimersByTime(5000);
    expect(slot.take()).toBeNull();
  });

  it('a new delete replaces the previous one', () => {
    const slot = new UndoSlot<string>();
    slot.hold('a');
    slot.hold('b');
    expect(slot.take()).toBe('b');
  });
});
