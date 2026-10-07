/** ai.ts against a fake network: the real SDK runs, only fetch is replaced. No real API calls. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiError, createAi, MODEL } from '../../src/assistant/ai';
import type { MessageRequest, Settings } from '../../src/assistant/core/types';

const SETTINGS: Settings = { searchesPerTopic: 3, briefingLanguage: 'ko+en' };
const TODAY = '2026-10-06';
const TZ = 'Asia/Seoul';

type Reply = { status?: number; body: unknown };
let replies: Reply[];
let requests: { url: string; body: any; headers: Headers }[];

function message(content: unknown[], stop_reason = 'end_turn') {
  return { id: 'msg', type: 'message', role: 'assistant', model: MODEL, content, stop_reason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
}
const text = (t: string) => message([{ type: 'text', text: t }]);
const search = (urls: string[]) => [
  { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'q' } },
  { type: 'web_search_tool_result', tool_use_id: 's1', content: urls.map((url) => ({ type: 'web_search_result', url, title: 't', page_age: null, encrypted_content: 'x' })) },
];
const submit = (input: unknown) => ({ type: 'tool_use', id: 'tu', name: 'submit_briefing', input });

beforeEach(() => {
  replies = [];
  requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), body: init.body ? JSON.parse(String(init.body)) : null, headers: new Headers(init.headers) });
      const r = replies.shift();
      if (!r) throw new TypeError('fetch failed');
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const ai = () => createAi('sk-ant-test-0123456789abcdef');

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'no error';
  } catch (e) {
    expect(e).toBeInstanceOf(AiError);
    return (e as AiError).kind;
  }
}

describe('testKey', () => {
  it('asks for the model info (costs no tokens)', async () => {
    replies.push({ body: { id: MODEL, type: 'model', display_name: 'Claude', created_at: '' } });
    await ai().testKey();
    expect(requests[0].url).toContain(`/v1/models/${MODEL}`);
  });

  it('401 → auth', async () => {
    replies.push({ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'bad key' } } });
    expect(await kindOf(ai().testKey())).toBe('auth');
  });

  it('network failure → network', async () => {
    expect(await kindOf(ai().testKey())).toBe('network');
  });
});

describe('briefTopic', () => {
  it('sends web search + submit tool with the right settings and checks sources against search results', async () => {
    replies.push({
      body: message(
        [
          ...search(['https://news.example.kr/1']),
          submit({ status: 'ok', bullets: ['요약'], sources: [{ title: 'a', url: 'https://news.example.kr/1', lang: 'ko' }, { title: 'b', url: 'https://made-up.example/x', lang: 'ko' }] }),
        ],
        'tool_use',
      ),
    });
    const res = await ai().briefTopic('AI 도구', SETTINGS, TODAY, TZ);
    expect(res).toEqual({ status: 'ok', bullets: ['요약'], sources: [{ title: 'a', url: 'https://news.example.kr/1', lang: 'ko' }] });

    const req = requests[0];
    expect(req.body.model).toBe('claude-opus-5-5');
    expect(req.body.tools[0]).toEqual({ type: 'web_search_20260209', name: 'web_search', max_uses: 3 });
    expect(req.body.tools[1]).toMatchObject({ name: 'submit_briefing', strict: true });
    expect(req.body.tool_choice).toEqual({ type: 'auto' });
    expect(req.body.messages[0].content).toContain('주제: AI 도구');
    expect(req.body.messages[0].content).toContain('영어 기사');
    expect(req.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
  });

  it('resumes after pause_turn and remembers URLs from every round', async () => {
    replies.push({ body: message(search(['https://a.example/1']), 'pause_turn') });
    replies.push({ body: message([...search(['https://b.example/2']), submit({ status: 'ok', bullets: ['요약'], sources: [{ title: 'a', url: 'https://a.example/1', lang: 'en' }] })], 'tool_use') });
    const res = await ai().briefTopic('주식', SETTINGS, TODAY, TZ);
    expect(res.status).toBe('ok');
    expect(res.sources[0].url).toBe('https://a.example/1');
    expect(requests).toHaveLength(2);
    expect(requests[1].body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
  });

  it('gives up after a few pauses instead of looping forever', async () => {
    for (let i = 0; i < 10; i++) replies.push({ body: message(search([]), 'pause_turn') });
    const res = await ai().briefTopic('주식', SETTINGS, TODAY, TZ);
    expect(res.status).toBe('error');
    expect(requests.length).toBeLessThanOrEqual(4);
  });

  it('answered with text instead of the tool → error item, not a crash', async () => {
    replies.push({ body: text('요약입니다') });
    expect(await ai().briefTopic('주식', SETTINGS, TODAY, TZ)).toMatchObject({ status: 'error' });
  });

  it('refusal → refusal error', async () => {
    replies.push({ body: message([], 'refusal') });
    expect(await kindOf(ai().briefTopic('주식', SETTINGS, TODAY, TZ))).toBe('refusal');
  });

  it('429 → rate', async () => {
    replies.push({ status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } } });
    replies.push({ status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } } });
    expect(await kindOf(ai().briefTopic('주식', SETTINGS, TODAY, TZ))).toBe('rate');
  });

  it('Korean-only setting is passed on', async () => {
    replies.push({ body: message([submit({ status: 'empty', bullets: [], sources: [] })], 'tool_use') });
    const res = await ai().briefTopic('주식', { searchesPerTopic: 1, briefingLanguage: 'ko' }, TODAY, TZ);
    expect(res.status).toBe('empty');
    expect(requests[0].body.messages[0].content).toContain('한국어 기사만');
    expect(requests[0].body.tools[0].max_uses).toBe(1);
  });
});

describe('parseEvent', () => {
  it('sends today and the date rules, returns a confirm-card draft', async () => {
    replies.push({ body: text(JSON.stringify({ title: '민수 미팅', date: '2026-10-13', start: '15:00', end: null, location: '강남역', memo: null, uncertain: [], interpretation: null })) });
    const res = await ai().parseEvent('다음 주 화요일 3시 강남역에서 민수랑 미팅', TODAY, TZ);
    expect(res.draft).toMatchObject({ date: '2026-10-13', start: '15:00', location: '강남역' });
    const body = requests[0].body;
    expect(body.messages[0].content).toContain('2026-10-06 (화요일)');
    expect(body.system).toContain('다음 주 X요일');
    expect(body.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
  });

  it('broken JSON → bad', async () => {
    replies.push({ body: text('{"title": "민수') });
    expect(await kindOf(ai().parseEvent('민수 미팅', TODAY, TZ))).toBe('bad');
  });

  it('cut off by max_tokens → bad', async () => {
    replies.push({ body: message([{ type: 'text', text: '{}' }], 'max_tokens') });
    expect(await kindOf(ai().parseEvent('민수 미팅', TODAY, TZ))).toBe('bad');
  });
});

describe('draftMessages', () => {
  const req: MessageRequest = {
    relation: 'friend',
    customRelation: '',
    name: '민수',
    intent: '미팅 장소 알려 주고 늦지 말라고',
    tone: 'casual',
    event: { id: 'e', title: '민수 미팅', date: '2026-10-13', start: '16:00', end: null, location: '강남역', memo: null, timeZone: TZ, source: 'ai', createdAt: '', updatedAt: '' },
  };

  it('includes the event and returns two drafts', async () => {
    replies.push({ body: text(JSON.stringify({ drafts: ['초안 1', '초안 2'] })) });
    expect(await ai().draftMessages(req, TODAY, TZ)).toEqual(['초안 1', '초안 2']);
    const prompt = requests[0].body.messages[0].content;
    expect(prompt).toContain('친구 (민수)');
    expect(prompt).toContain('편하게');
    expect(prompt).toContain('10월 13일 (화) 16:00');
    expect(prompt).toContain('강남역');
  });

  it('one draft only → bad with the screen message', async () => {
    replies.push({ body: text(JSON.stringify({ drafts: ['하나'] })) });
    await expect(ai().draftMessages(req, TODAY, TZ)).rejects.toMatchObject({ kind: 'bad', message: '초안을 받지 못했어요' });
  });

  it('empty response → bad', async () => {
    replies.push({ body: message([]) });
    expect(await kindOf(ai().draftMessages(req, TODAY, TZ))).toBe('bad');
  });

  it('cancel → aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    replies.push({ body: text('{}') });
    expect(await kindOf(ai().draftMessages(req, TODAY, TZ, ctrl.signal))).toBe('aborted');
  });
});
