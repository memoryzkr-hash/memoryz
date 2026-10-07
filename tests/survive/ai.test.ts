/** ai.ts against a fake network: the real SDK runs (streaming included), only fetch is replaced. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiError, createAi, MAX_TEXT_CHARS, MODEL } from '../../src/survive/ai';
import { checkAnalysis } from '../../src/survive/core/validate';

type Reply = { status?: number; sse?: string; body?: unknown };
let replies: Reply[];
let requests: { url: string; body: any }[];

function sse(text: string, stop = 'end_turn'): string {
  const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  return [
    ev('message_start', { message: { id: 'msg', type: 'message', role: 'assistant', model: MODEL, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } }),
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
    ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: text.slice(0, 20) } }),
    ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: text.slice(20) } }),
    ev('content_block_stop', { index: 0 }),
    ev('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 10 } }),
    ev('message_stop', {}),
  ].join('');
}

const choice = (answer = 0) => ({ question: '맞는 것은?', options: ['가', '나', '다', '라'], answer, why: '가가 맞아요' });
const concept = (term: string, extra: object = {}) => ({ term, importance: 4, kind: 'concept', explain: `${term} 설명이에요.`, recall: `${term}란?`, answer: `${term}의 뜻`, mcq: choice(), similar: choice(1), ...extra });
const GOOD = { concepts: [concept('반감기'), concept('청소율'), concept('분포용적', { kind: 'memorize', importance: 9 })] };

beforeEach(() => {
  replies = [];
  requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), body: init.body ? JSON.parse(String(init.body)) : null });
      const r = replies.shift();
      if (!r) throw new TypeError('fetch failed');
      if (r.sse) return new Response(r.sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const ai = () => createAi('sk-ant-test-0123456789abcdef');
const input = { subject: '약리학', text: '반감기는 농도가 절반이 되는 시간이다.', pdfBase64: null, note: null };

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'no error';
  } catch (e) {
    expect(e).toBeInstanceOf(AiError);
    return (e as AiError).kind;
  }
}

describe('analyze', () => {
  it('streams a structured answer and keeps valid concepts', async () => {
    replies.push({ sse: sse(JSON.stringify(GOOD)) });
    const concepts = await ai().analyze(input);
    expect(concepts.map((c) => c.term)).toEqual(['반감기', '청소율', '분포용적']);
    expect(concepts[2].importance).toBe(5);
    expect(concepts[2].kind).toBe('memorize');
    const body = requests[0].body;
    expect(body.model).toBe(MODEL);
    expect(body.stream).toBe(true);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.fallbacks).toBe('default');
    expect(body.messages[0].content[0].text).toContain('반감기는');
  });

  it('sends a scanned PDF as a document block', async () => {
    replies.push({ sse: sse(JSON.stringify(GOOD)) });
    await ai().analyze({ ...input, text: null, pdfBase64: 'JVBERi0x' });
    const block = requests[0].body.messages[0].content[0];
    expect(block).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0x' } });
  });

  it('refuses oversized text instead of cutting it silently', async () => {
    expect(await kindOf(ai().analyze({ ...input, text: 'ㄱ'.repeat(MAX_TEXT_CHARS + 1) }))).toBe('too-big');
    expect(requests).toHaveLength(0);
  });

  it('too few usable concepts → bad', async () => {
    replies.push({ sse: sse(JSON.stringify({ concepts: [concept('하나')] })) });
    expect(await kindOf(ai().analyze(input))).toBe('bad');
  });

  it('refusal and cut-off answers are errors, not empty plans', async () => {
    replies.push({ sse: sse('', 'refusal') });
    expect(await kindOf(ai().analyze(input))).toBe('refusal');
    replies.push({ sse: sse('{"concepts":[', 'max_tokens') });
    expect(await kindOf(ai().analyze(input))).toBe('bad');
  });

  it('maps HTTP errors', async () => {
    replies.push({ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'bad key' } } });
    expect(await kindOf(ai().analyze(input))).toBe('auth');
    expect(await kindOf(ai().analyze(input))).toBe('network');
  });

  it('testKey asks for the model info only', async () => {
    replies.push({ body: { id: MODEL, type: 'model', display_name: 'Claude', created_at: '' } });
    await ai().testKey();
    expect(requests[0].url).toContain(`/v1/models/${MODEL}`);
  });
});

describe('checkAnalysis', () => {
  it('drops broken questions but keeps the concept', () => {
    const [c] = checkAnalysis({ concepts: [concept('반감기', { mcq: { ...choice(), answer: 7 }, similar: { ...choice(), options: ['가', '가'] } })] });
    expect(c.term).toBe('반감기');
    expect(c.mcq).toBeNull();
    expect(c.similar).toBeNull();
  });

  it('drops concepts missing text, duplicates, and non-objects', () => {
    const out = checkAnalysis({ concepts: [concept('A'), concept('A'), { term: 'B' }, 'x', null, concept('C', { explain: '' })] });
    expect(out.map((c) => c.term)).toEqual(['A']);
  });

  it('rejects anything that is not the expected shape', () => {
    expect(checkAnalysis(null)).toEqual([]);
    expect(checkAnalysis({ concepts: 'no' })).toEqual([]);
  });
});
