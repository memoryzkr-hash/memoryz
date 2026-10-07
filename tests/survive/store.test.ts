import { describe, expect, it } from 'vitest';
import { KEYS, SurviveStore, type StorageLike } from '../../src/survive/core/store';
import { makeExam } from './helpers';

function mem(init: Record<string, string> = {}, failWrites = false): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (failWrites && !k.endsWith('.corrupt')) throw new Error('quota');
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
}

describe('SurviveStore', () => {
  it('saves and reloads exams with progress', () => {
    const s = mem();
    const store = new SurviveStore(s);
    const exam = makeExam();
    exam.progress.s0 = { mastery: 0.5, seen: true, done: false, shaky: false, correct: 1, wrong: 0 };
    expect(store.put(exam)).toBe(true);
    const again = new SurviveStore(s);
    expect(again.get('e1')?.progress.s0.mastery).toBe(0.5);
    expect(again.list()).toHaveLength(1);
  });

  it('keeps the newest first and removes', () => {
    const store = new SurviveStore(mem());
    store.put({ ...makeExam(), id: 'a' });
    store.put({ ...makeExam(), id: 'b' });
    expect(store.list().map((e) => e.id)).toEqual(['b', 'a']);
    store.touch({ ...makeExam(), id: 'a', subject: '바뀜' });
    expect(store.list().map((e) => e.id)).toEqual(['b', 'a']);
    store.remove('b');
    expect(store.list().map((e) => e.subject)).toEqual(['바뀜']);
  });

  it('broken JSON is kept aside, not thrown away', () => {
    const s = mem({ [KEYS.exams]: '{oops' });
    const store = new SurviveStore(s);
    expect(store.list()).toEqual([]);
    expect(store.corrupt).toBe(true);
    expect(s.data.get(`${KEYS.exams}.corrupt`)).toBe('{oops');
  });

  it('a full disk reports failure but the app keeps working in memory', () => {
    const store = new SurviveStore(mem({}, true));
    expect(store.available).toBe(false);
    expect(store.put(makeExam())).toBe(false);
    expect(store.get('e1')).toBeDefined();
  });

  it('stores and clears the API key', () => {
    const store = new SurviveStore(mem());
    expect(store.apiKey()).toBeNull();
    store.setApiKey('sk-ant-x');
    expect(store.apiKey()).toBe('sk-ant-x');
    store.setApiKey(null);
    expect(store.apiKey()).toBeNull();
  });
});
