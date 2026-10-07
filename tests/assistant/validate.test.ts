import { describe, expect, it } from 'vitest';
import { BRIEFING_ERRORS, checkBriefing, checkDrafts, checkParsedEvent, parseJson, urlKey } from '../../src/assistant/core/validate';

const SEARCHED = ['https://news.example.kr/ai/1', 'https://www.theverge.com/ai', 'https://a.example/2', 'https://b.example/3', 'https://c.example/4', 'https://d.example/5'];
const src = (url: string, lang = 'ko') => ({ title: '기사', url, lang });

describe('checkBriefing', () => {
  it('keeps real sources and drops made-up, http and duplicate ones (03-data.md 잘못된 예 3)', () => {
    const res = checkBriefing(
      {
        status: 'ok',
        bullets: ['요약 1', '요약 2'],
        sources: [
          src('https://news.example.kr/ai/1'),
          src('https://www.theverge.com/ai/', 'en'), // trailing slash still matches
          src('https://made-up.example/fake'),
          src('http://news.example.kr/ai/1'),
          src('https://news.example.kr/ai/1#top'), // same page again
        ],
      },
      SEARCHED,
    );
    expect(res.status).toBe('ok');
    expect(res.sources.map((s) => s.url)).toEqual(['https://news.example.kr/ai/1', 'https://www.theverge.com/ai/']);
    expect(res.sources[1].lang).toBe('en');
  });

  it('never lets a javascript: or data: link through, even if search returned it', () => {
    const odd = ['javascript:alert(1)', 'data:text/html,hi'];
    const res = checkBriefing({ status: 'ok', bullets: ['요약'], sources: odd.map((u) => src(u)) }, odd);
    expect(res).toMatchObject({ status: 'error', sources: [] });
  });

  it('ok with no bullets is an error', () => {
    expect(checkBriefing({ status: 'ok', bullets: [], sources: [src(SEARCHED[0])] }, SEARCHED)).toMatchObject({ status: 'error', error: BRIEFING_ERRORS.noSummary });
  });

  it('only made-up sources → "출처를 확인하지 못했어요"', () => {
    const res = checkBriefing({ status: 'ok', bullets: ['요약'], sources: [src('http://made-up.news/1')] }, SEARCHED);
    expect(res).toEqual({ status: 'error', bullets: [], sources: [], error: BRIEFING_ERRORS.noSources });
  });

  it('empty status passes through', () => {
    expect(checkBriefing({ status: 'empty', bullets: ['무시'], sources: [] }, [])).toEqual({ status: 'empty', bullets: [], sources: [] });
  });

  it('caps at 5 bullets of 200 characters and 5 sources', () => {
    const res = checkBriefing({ status: 'ok', bullets: Array(7).fill('가'.repeat(250)), sources: SEARCHED.map((u) => src(u)) }, SEARCHED);
    expect(res.bullets).toHaveLength(5);
    expect([...new Intl.Segmenter().segment(res.bullets[0])]).toHaveLength(200);
    expect(res.sources).toHaveLength(5);
  });

  it('unknown language becomes other, missing title becomes the host name', () => {
    const res = checkBriefing({ status: 'ok', bullets: ['요약'], sources: [{ url: SEARCHED[0], lang: 'jp' }] }, SEARCHED);
    expect(res.sources[0]).toEqual({ title: 'news.example.kr', url: SEARCHED[0], lang: 'other' });
  });

  it.each([null, 'text', [], { status: 'ok' }])('garbage %j → error, never throws', (input) => {
    expect(checkBriefing(input, SEARCHED).status).toBe('error');
  });
});

describe('urlKey', () => {
  it('ignores fragment, trailing slash and host case', () => {
    expect(urlKey('https://News.Example.kr/a/#x')).toBe(urlKey('https://news.example.kr/a'));
    expect(urlKey('not a url')).toBeNull();
  });
});

describe('checkParsedEvent', () => {
  const base = { title: '민수 미팅', date: '2026-10-13', start: '15:00', end: null, location: '강남역', memo: null, uncertain: [], interpretation: "'다음 주 화요일'을 10월 13일로 읽었어요" };

  it('fills the confirm card', () => {
    expect(checkParsedEvent(base)).toEqual({
      draft: { title: '민수 미팅', date: '2026-10-13', start: '15:00', end: '', location: '강남역', memo: '' },
      uncertain: [],
      interpretation: "'다음 주 화요일'을 10월 13일로 읽었어요",
    });
  });

  it('a date that does not exist is blanked and marked unsure (03-data.md 잘못된 예 2)', () => {
    const res = checkParsedEvent({ ...base, date: '2026-02-30', end: '14:00' })!;
    expect(res.draft.date).toBe('');
    expect(res.draft.end).toBe('');
    expect(res.uncertain).toEqual(expect.arrayContaining(['date', 'end']));
  });

  it('missing date and title are unsure', () => {
    const res = checkParsedEvent({ ...base, title: '', date: null })!;
    expect(res.uncertain).toEqual(expect.arrayContaining(['date', 'title']));
  });

  it('bad times are blanked; unknown uncertain names ignored', () => {
    const res = checkParsedEvent({ ...base, start: '3pm', uncertain: ['location', 'nonsense'] })!;
    expect(res.draft.start).toBe('');
    expect(res.uncertain).toEqual(expect.arrayContaining(['location', 'start']));
    expect(res.uncertain).not.toContain('nonsense');
  });

  it('overlong fields are cut to the limits', () => {
    const res = checkParsedEvent({ ...base, title: '가'.repeat(80) })!;
    expect(res.draft.title).toBe('가'.repeat(50));
  });

  it('not an object → null', () => {
    expect(checkParsedEvent('민수 미팅')).toBeNull();
  });
});

describe('checkDrafts', () => {
  it('exactly two non-empty drafts', () => {
    expect(checkDrafts({ drafts: ['하나', ' 둘 '] })).toEqual(['하나', '둘']);
  });

  it.each([{ drafts: ['하나'] }, { drafts: ['하나', '둘', '셋'] }, { drafts: ['하나', '  '] }, { drafts: [1, 2] }, {}, null])('%j → null', (input) => {
    expect(checkDrafts(input)).toBeNull();
  });
});

describe('parseJson', () => {
  it('broken JSON → null', () => {
    expect(parseJson('{"drafts": [')).toBeNull();
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });
});
