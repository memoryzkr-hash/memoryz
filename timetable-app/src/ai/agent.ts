import type Anthropic from '@anthropic-ai/sdk';

import type { PlannerState, Schedule } from '../types';
import { PLANNER_INSTRUCTIONS, PLANNER_TOOLS } from './spec';
import { plannerContext, runPlannerTool } from './tools';

export interface SendDeps {
  getState: () => PlannerState;
  setState: (s: PlannerState) => void;
  weekOf: string;
  signal: AbortSignal;
  /** 답이 써지는 중간 텍스트 (지원하는 연결에서만) */
  onText?: (text: string) => void;
}

export interface SendResult {
  text: string;
  added: Schedule[];
  deleted: Schedule[];
}

/** 대화 한 개. 연결 방식마다 기록을 다르게 들고 있다. */
export interface PlannerSession {
  /** 사용자에게 보여줄 연결 이름 */
  label: string;
  send(userText: string, deps: SendDeps): Promise<SendResult>;
}

export class PlannerError extends Error {}

const MAX_ROUNDS = 8;

/** 도구 실행: 최신 상태에 적용하고 바뀐 상태를 바로 앱에 반영 */
function execTool(name: string, input: unknown, deps: SendDeps, acc: SendResult) {
  const run = runPlannerTool(name, input, deps.getState(), new Date());
  if (run.state !== deps.getState()) deps.setState(run.state);
  acc.added.push(...run.added);
  acc.deleted.push(...run.deleted);
  return run.output;
}

// ---- 1) 중계 서버 (EXPO_PUBLIC_PLANNER_API_URL) ----

type ApiMessage = Anthropic.Beta.BetaMessageParam;
type ApiBlock = Anthropic.Beta.BetaContentBlock;

function proxySession(url: string): PlannerSession {
  const messages: ApiMessage[] = [];
  return {
    label: 'AI 서버',
    async send(userText, deps) {
      const mark = messages.length;
      const acc: SendResult = { text: '', added: [], deleted: [] };
      const texts: string[] = [];
      messages.push({ role: 'user', content: userText });
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const res = await fetch(`${url.replace(/\/$/, '')}/plan`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ context: plannerContext(deps.getState(), deps.weekOf, new Date()), messages }),
            signal: deps.signal,
          });
          const data = (await res.json().catch(() => ({}))) as { content?: ApiBlock[]; stop_reason?: string; error?: string };
          if (!res.ok || !data.content) throw new PlannerError(data.error ?? `AI 서버가 응답하지 않아요 (${res.status}).`);
          // 받은 블록은 그대로 다시 보낸다 (thinking 블록 포함)
          messages.push({ role: 'assistant', content: data.content as ApiMessage['content'] });
          for (const b of data.content) if (b.type === 'text' && b.text.trim()) texts.push(b.text.trim());
          deps.onText?.(texts.join('\n\n'));
          if (data.stop_reason === 'refusal') throw new PlannerError('이 요청은 도와드리기 어려워요. 다르게 말해 주세요.');
          if (data.stop_reason !== 'tool_use') break;
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const b of data.content) {
            if (b.type !== 'tool_use') continue;
            try {
              results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(execTool(b.name, b.input, deps, acc)) });
            } catch (e) {
              results.push({ type: 'tool_result', tool_use_id: b.id, content: e instanceof Error ? e.message : String(e), is_error: true });
            }
          }
          messages.push({ role: 'user', content: results });
        }
      } catch (e) {
        // 실패한 요청은 기록에서 빼서 다음 요청이 깨지지 않게 한다 (이미 넣은 일정은 남는다)
        messages.length = mark;
        if (e instanceof PlannerError || (e instanceof Error && e.name === 'AbortError')) throw e;
        throw new PlannerError('AI 서버에 연결하지 못했어요. 서버가 켜져 있는지 확인해 주세요.');
      }
      acc.text = texts.join('\n\n');
      return acc;
    },
  };
}

// ---- 2) claude.ai 아티팩트 안에서 열렸을 때 (웹 데모) ----

interface SampleTurn {
  role: 'user' | 'assistant';
  content: string;
}
type SampleFn = (
  input: SampleTurn[],
  options: {
    signal?: AbortSignal;
    onText?: (u: { text: string }) => void;
    modelTier?: 'default' | 'complex' | 'quick';
    tools?: { name: string; description: string; inputSchema?: object; execute: (input: Record<string, unknown>) => unknown }[];
  },
) => Promise<{ text: string; truncated: boolean }>;

function sampleSession(sample: SampleFn): PlannerSession {
  const turns: SampleTurn[] = [];
  return {
    label: 'Claude',
    async send(userText, deps) {
      const acc: SendResult = { text: '', added: [], deleted: [] };
      const head = `${PLANNER_INSTRUCTIONS}\n\n현재 상황\n${plannerContext(deps.getState(), deps.weekOf, new Date())}`;
      const input: SampleTurn[] = [{ role: 'user', content: head }, ...turns.slice(-20), { role: 'user', content: userText }];
      try {
        const { text } = await sample(input, {
          signal: deps.signal,
          modelTier: 'default',
          onText: ({ text: t }) => deps.onText?.(t),
          tools: PLANNER_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.input_schema,
            execute: (args) => execTool(t.name, args, deps, acc),
          })),
        });
        acc.text = text;
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'cancelled') throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
        if (code === 'not_granted' || code === 'sampling_disabled') throw new PlannerError('Claude 사용이 허용되지 않았어요.');
        if (code === 'rate_limited') throw new PlannerError('요청이 많아요. 잠시 뒤에 다시 해 주세요.');
        throw new PlannerError((e as { text?: string }).text || 'Claude가 답하지 못했어요. 다시 시도해 주세요.');
      }
      turns.push({ role: 'user', content: userText }, { role: 'assistant', content: acc.text || '(일정을 정리했어요)' });
      return acc;
    },
  };
}

/** 쓸 수 있는 연결을 찾는다. 없으면 null. */
export async function openPlannerSession(): Promise<PlannerSession | null> {
  const url = process.env.EXPO_PUBLIC_PLANNER_API_URL;
  if (url) return proxySession(url);
  const claude = (globalThis as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
  if (claude?.use) {
    const sample = (await claude.use('sample').catch(() => null)) as SampleFn | null;
    if (sample) return sampleSession(sample);
  }
  return null;
}
