/** travel ai.ts against a fake network: the real SDK runs, only fetch is replaced. No real API calls. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiError, checkRequest, createPlannerAi, MODEL } from '../../src/travel/ai';
import { DEFAULT_REQUEST, type PlanRequest } from '../../src/travel/core/store';
import { PLAN_SCHEMA, planPrompt } from '../../src/travel/prompts';

type Reply = { status?: number; body: unknown };
let replies: Reply[];
let requests: { body: any; headers: Headers }[];

const message = (text: string, stop_reason = 'end_turn') => ({
  id: 'msg', type: 'message', role: 'assistant', model: MODEL, content: [{ type: 'text', text }], stop_reason, stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});

const REQ: PlanRequest = { ...DEFAULT_REQUEST, destination: '부산', days: 1, travelers: 3, budgetKrw: 300000, interests: '바다, 회' };
const PLAN = {
  title: '부산 바다 하루',
  region: 'KR',
  lodgingPerNight: 120000,
  tips: ['동백섬 산책로는 해 질 녘이 예뻐요'],
  days: [
    {
      label: '1일차',
      start: '09:30',
      stops: [
        { name: '부산역', lat: 35.1151, lng: 129.0414, kind: 'station', stayMin: 0, cost: 0, modeIn: 'auto', open: null, close: null, note: null },
        { name: '해운대해수욕장', lat: 35.1587, lng: 129.1604, kind: 'nature', stayMin: 90, cost: 0, modeIn: 'subway', open: null, close: null, note: null },
        { name: '어디인지 모름', lat: 999, lng: 129, kind: 'sight', stayMin: 30, cost: 0, modeIn: 'walk', open: null, close: null, note: null },
      ],
    },
  ],
};

beforeEach(() => {
  replies = [];
  requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      requests.push({ body: init.body ? JSON.parse(String(init.body)) : null, headers: new Headers(init.headers) });
      const r = replies.shift();
      if (!r) throw new TypeError('fetch failed');
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const ai = () => createPlannerAi('sk-ant-test-0123456789abcdef');

describe('planner ai', () => {
  it('asks for JSON with the schema and keeps the traveller’s own numbers', async () => {
    replies.push({ body: message(JSON.stringify(PLAN)) });
    const plan = await ai().plan(REQ);
    const body = requests[0].body;
    expect(body.model).toBe(MODEL);
    expect(body.output_config.format).toEqual({ type: 'json_schema', schema: PLAN_SCHEMA });
    expect(body.fallbacks).toBe('default');
    expect(requests[0].headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(body.messages[0].content).toContain('부산');
    expect(body.messages[0].content).toContain('300,000원');

    expect(plan.destination).toBe('부산');
    expect(plan.travelers).toBe(3);
    expect(plan.budgetKrw).toBe(300000);
    expect(plan.days[0].stops.map((s) => s.name)).toEqual(['부산역', '해운대해수욕장']); // bad position dropped
  });

  it('turns failures into friendly errors', async () => {
    replies.push({ body: message('not json') });
    await expect(ai().plan(REQ)).rejects.toMatchObject({ kind: 'bad' });

    replies.push({ body: message('{}', 'refusal') });
    await expect(ai().plan(REQ)).rejects.toMatchObject({ kind: 'refusal' });

    replies.push({ body: message(JSON.stringify({ ...PLAN, days: [] })) });
    await expect(ai().plan(REQ)).rejects.toBeInstanceOf(AiError);

    replies.push({ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'bad key' } } });
    await expect(ai().plan(REQ)).rejects.toMatchObject({ kind: 'auth' });

    await expect(ai().plan(REQ)).rejects.toMatchObject({ kind: 'network' });
  });

  it('checks the form before calling', () => {
    expect(checkRequest(REQ)).toBeNull();
    expect(checkRequest({ ...REQ, destination: ' ' })).toMatch(/여행지/);
    expect(checkRequest({ ...REQ, days: 0 })).toMatch(/기간/);
    expect(checkRequest({ ...REQ, travelers: 9 })).toMatch(/인원/);
    expect(planPrompt({ ...REQ, budgetKrw: null, interests: '' })).not.toMatch(/예산|관심사/);
  });
});
