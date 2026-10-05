// AI 계획 세우기 중계 서버. 앱이 보낸 대화를 Claude에게 전달하고 답을 돌려준다.
// API 키는 이 서버에만 두고 앱에는 넣지 않는다. 실행: npm run server (Node 22.18 이상)
import Anthropic from '@anthropic-ai/sdk';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLANNER_INSTRUCTIONS, PLANNER_TOOLS } from '../src/ai/spec.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // .env 없이 환경 변수만으로도 동작
}

const PORT = Number(process.env.PLANNER_PORT ?? 8788);
const MAX_BODY = 512 * 1024;
const client = new Anthropic();

const tools: Anthropic.Beta.BetaToolUnion[] = PLANNER_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema,
  strict: true,
}));

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new Error('요청이 너무 큽니다.');
  }
  return JSON.parse(raw || '{}');
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
  });
  res.end(JSON.stringify(data));
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST' || req.url !== '/plan') return send(res, 404, { error: 'not found' });

  try {
    const body = (await readJson(req)) as { context?: unknown; messages?: unknown };
    if (typeof body.context !== 'string' || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 80) {
      return send(res, 400, { error: 'context(문자열)와 messages(배열)가 필요합니다.' });
    }
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      return send(res, 500, { error: 'ANTHROPIC_API_KEY가 없어요. timetable-app/.env에 넣고 서버를 다시 켜 주세요.' });
    }
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: [
        { type: 'text', text: PLANNER_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: body.context.slice(0, 4000) },
      ],
      tools,
      messages: body.messages as Anthropic.Beta.BetaMessageParam[],
    });
    send(res, 200, { content: response.content, stop_reason: response.stop_reason });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return send(res, 500, { error: 'ANTHROPIC_API_KEY가 없거나 잘못됐어요. .env를 확인해 주세요.' });
    if (error instanceof Anthropic.RateLimitError) return send(res, 429, { error: '요청이 많아요. 잠시 뒤에 다시 해 주세요.' });
    if (error instanceof Anthropic.BadRequestError) return send(res, 400, { error: error.message });
    if (error instanceof Anthropic.APIError) return send(res, 502, { error: `AI 서버 오류 (${error.status})` });
    if (error instanceof SyntaxError) return send(res, 400, { error: 'JSON 형식이 아닙니다.' });
    console.error(error);
    send(res, 500, { error: error instanceof Error ? error.message : '알 수 없는 오류' });
  }
}).listen(PORT, () => {
  console.log(`AI 계획 서버: http://localhost:${PORT}  (키 ${process.env.ANTHROPIC_API_KEY ? '있음' : '없음 — .env에 ANTHROPIC_API_KEY를 넣어 주세요'})`);
});
