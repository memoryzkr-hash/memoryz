import { describe, expect, it } from 'vitest';
import {
  checkApiKey,
  checkEvent,
  checkMessageRequest,
  checkTopic,
  compareEvents,
  emptyDraft,
  keepBriefing,
  LIMITS,
  maskApiKey,
  normalizeSettings,
} from '../../src/assistant/core/rules';
import type { EventDraft, MessageRequest, Topic } from '../../src/assistant/core/types';

const TODAY = '2026-10-06';
const topic = (name: string, i = 0): Topic => ({ id: `t${i}`, name, createdAt: '' });
const draft = (over: Partial<EventDraft> = {}): EventDraft => ({ ...emptyDraft(), title: '민수 미팅', date: '2026-10-13', ...over });

describe('API key', () => {
  it('accepts a trimmed sk-ant- key', () => {
    expect(checkApiKey('  sk-ant-api03-abcdefghijklmnop  ')).toEqual({ ok: true, key: 'sk-ant-api03-abcdefghijklmnop' });
  });

  it.each(['abc', 'sk-abcdefghijklmnopqrstuvwxyz', 'sk-ant-short', 'sk-ant-api03 abcdefghijklmnop'])('rejects %s', (k) => {
    expect(checkApiKey(k)).toEqual({ ok: false, message: 'API 키 형식이 아니에요' });
  });

  it('blank is silent (button stays disabled)', () => {
    expect(checkApiKey('   ')).toEqual({ ok: false, message: '' });
  });

  it('shows only the last 4 characters', () => {
    expect(maskApiKey('sk-ant-api03-xyzab12')).toBe('sk-ant-…ab12');
  });
});

describe('settings', () => {
  it('defaults and clamps', () => {
    expect(normalizeSettings(undefined)).toEqual({ searchesPerTopic: 3, briefingLanguage: 'ko+en' });
    expect(normalizeSettings({ searchesPerTopic: 9, briefingLanguage: 'ko' })).toEqual({ searchesPerTopic: 5, briefingLanguage: 'ko' });
    expect(normalizeSettings({ searchesPerTopic: 0 })).toMatchObject({ searchesPerTopic: 1 });
    expect(normalizeSettings({ searchesPerTopic: 2.5, briefingLanguage: 'fr' })).toEqual({ searchesPerTopic: 3, briefingLanguage: 'ko+en' });
  });
});

describe('topics', () => {
  it('30 characters ok, 31 too long', () => {
    expect(checkTopic('가'.repeat(30), [])).toMatchObject({ ok: true });
    expect(checkTopic('가'.repeat(31), [])).toMatchObject({ ok: false, reason: 'tooLong' });
  });

  it('30 family emoji are 30 characters', () => {
    expect(checkTopic('👨‍👩‍👧'.repeat(30), [])).toMatchObject({ ok: true });
  });

  it('blank and whitespace-only are empty', () => {
    expect(checkTopic('   ', [])).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('duplicates ignore case and spacing', () => {
    expect(checkTopic('ai  도구', [topic('AI 도구')])).toEqual({ ok: false, reason: 'duplicate', message: '이미 있는 주제예요' });
  });

  it('the 6th topic is refused', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map(topic);
    expect(checkTopic('여섯째', five)).toEqual({ ok: false, reason: 'full', message: '주제는 5개까지예요' });
  });

  it('stores the cleaned name', () => {
    expect(checkTopic('  반도체\n수출 ', [])).toEqual({ ok: true, name: '반도체 수출' });
  });
});

describe('events', () => {
  it('a valid event becomes a cleaned value', () => {
    const res = checkEvent(draft({ start: '15:00', location: ' 강남역 ', memo: ' 자료\r\n챙기기 ' }), TODAY);
    expect(res.errors).toEqual({});
    expect(res.value).toEqual({ title: '민수 미팅', date: '2026-10-13', start: '15:00', end: null, location: '강남역', memo: '자료\n챙기기' });
  });

  it('title and date are required (silent disable)', () => {
    const res = checkEvent(draft({ title: '  ', date: '' }), TODAY);
    expect(res.value).toBeNull();
    expect(res.errors).toEqual({ title: '', date: '' });
  });

  it('title: 50 ok, 51 too long', () => {
    expect(checkEvent(draft({ title: '가'.repeat(50) }), TODAY).value).not.toBeNull();
    expect(checkEvent(draft({ title: '가'.repeat(51) }), TODAY).errors.title).toBe('제목은 50자까지예요');
  });

  it('location 100 / memo 500 limits', () => {
    expect(checkEvent(draft({ location: '가'.repeat(101) }), TODAY).errors.location).toBeTruthy();
    expect(checkEvent(draft({ memo: '가'.repeat(500) }), TODAY).value).not.toBeNull();
    expect(checkEvent(draft({ memo: '가'.repeat(501) }), TODAY).errors.memo).toBeTruthy();
  });

  it('a date that does not exist is an error', () => {
    expect(checkEvent(draft({ date: '2026-02-30' }), TODAY).errors.date).toBe('날짜를 골라 주세요');
  });

  it('end must be after start', () => {
    expect(checkEvent(draft({ start: '15:00', end: '14:00' }), TODAY).errors.end).toBe('끝 시간이 시작보다 빨라요');
    expect(checkEvent(draft({ start: '15:00', end: '15:00' }), TODAY).errors.end).toBe('끝 시간이 시작보다 빨라요');
    expect(checkEvent(draft({ start: '15:00', end: '16:30' }), TODAY).value?.end).toBe('16:30');
  });

  it('end without start is an error', () => {
    expect(checkEvent(draft({ end: '16:00' }), TODAY).errors.end).toBe('시작 시간을 먼저 넣어 주세요');
  });

  it('no start time means all day', () => {
    expect(checkEvent(draft(), TODAY).value).toMatchObject({ start: null, end: null });
  });

  it('a past date warns but can still be saved', () => {
    const res = checkEvent(draft({ date: '2026-10-05' }), TODAY);
    expect(res.warnings.date).toBe('이미 지난 날짜예요');
    expect(res.value).not.toBeNull();
  });

  it('today is not "past"', () => {
    expect(checkEvent(draft({ date: TODAY }), TODAY).warnings.date).toBeUndefined();
  });

  it('refuses the 1001st event', () => {
    expect(checkEvent(draft(), TODAY, LIMITS.events - 1).value).not.toBeNull();
    expect(checkEvent(draft(), TODAY, LIMITS.events).errors.title).toBe('일정이 너무 많아요. 지난 일정을 지워 주세요');
  });

  it('sorts by date, all-day first, then start time', () => {
    const list = [
      { date: '2026-10-13', start: '15:00' },
      { date: '2026-10-13', start: null },
      { date: '2026-10-07', start: '09:00' },
      { date: '2026-10-13', start: '09:30' },
    ];
    expect([...list].sort(compareEvents)).toEqual([
      { date: '2026-10-07', start: '09:00' },
      { date: '2026-10-13', start: null },
      { date: '2026-10-13', start: '09:30' },
      { date: '2026-10-13', start: '15:00' },
    ]);
  });
});

describe('briefing retention', () => {
  it('keeps 30 days back, drops 31', () => {
    expect(keepBriefing('2026-09-06', TODAY)).toBe(true);
    expect(keepBriefing('2026-09-05', TODAY)).toBe(false);
  });
});

describe('message request', () => {
  const req = (over: Partial<MessageRequest> = {}): MessageRequest => ({
    relation: 'boss',
    customRelation: '',
    name: '',
    intent: '내일 오후 반차 쓴다고',
    tone: 'polite',
    event: null,
    ...over,
  });

  it('needs something to say', () => {
    expect(checkMessageRequest(req({ intent: '   ' })).ok).toBe(false);
    expect(checkMessageRequest(req()).ok).toBe(true);
  });

  it('custom relation must be written, 20 characters max', () => {
    expect(checkMessageRequest(req({ relation: 'custom' })).ok).toBe(false);
    expect(checkMessageRequest(req({ relation: 'custom', customRelation: '동아리 선배' })).ok).toBe(true);
    expect(checkMessageRequest(req({ relation: 'custom', customRelation: '가'.repeat(21) })).ok).toBe(false);
  });

  it('intent 500 ok, 501 too long; name 20 max', () => {
    expect(checkMessageRequest(req({ intent: '가'.repeat(500) })).ok).toBe(true);
    expect(checkMessageRequest(req({ intent: '가'.repeat(501) })).ok).toBe(false);
    expect(checkMessageRequest(req({ name: '가'.repeat(21) })).ok).toBe(false);
  });
});
