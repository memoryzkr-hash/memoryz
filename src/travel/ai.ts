/** The one Claude call: a trip plan as JSON. Errors are shared with the assistant page. */
import Anthropic from '@anthropic-ai/sdk';
import { AiError, MODEL, toAiError, type AiErrorKind } from '../assistant/ai';
import type { PlanRequest } from './core/store';
import type { TripPlan } from './core/types';
import { checkPlan, LIMITS } from './core/validate';
import { PLAN_JSON_SHAPE, PLAN_SCHEMA, PLAN_SYSTEM, planPrompt } from './prompts';

export { AiError, MODEL };

/** On a policy decline the API retries on a fallback model inside the same call. */
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

export interface PlannerAi {
  plan(req: PlanRequest, signal?: AbortSignal): Promise<TripPlan>;
}

export function checkRequest(r: PlanRequest): string | null {
  if (!r.destination.trim()) return '여행지를 적어 주세요';
  if (r.destination.trim().length > 60) return '여행지는 60자까지 적을 수 있어요';
  if (!Number.isInteger(r.days) || r.days < 1 || r.days > LIMITS.days) return `기간은 1~${LIMITS.days}일로 정해 주세요`;
  if (!Number.isInteger(r.travelers) || r.travelers < 1 || r.travelers > LIMITS.travelers) return `인원은 1~${LIMITS.travelers}명이에요`;
  if (r.interests.length > 300) return '요청은 300자까지 적을 수 있어요';
  return null;
}

/** Keeps the traveller's own numbers and drops anything Claude made up about them. */
function finish(raw: unknown, req: PlanRequest): TripPlan {
  const plan = checkPlan({
    ...(typeof raw === 'object' && raw !== null ? raw : {}),
    destination: req.destination.trim(),
    travelers: req.travelers,
    budgetKrw: req.budgetKrw,
    id: undefined,
  });
  if (!plan) throw new AiError('bad', '쓸 수 있는 장소가 없었어요. 여행지를 더 구체적으로 적어 주세요');
  return plan;
}

/** The `sample` capability of a claude.ai artifact page: Claude on the viewer's own account. */
export interface SampleFn {
  json(input: string, options?: { signal?: AbortSignal; modelTier?: 'quick' | 'default' | 'complex'; cache?: boolean }): Promise<unknown>;
}

/** Resolves the artifact page's Claude, or null anywhere else (GitHub Pages, local dev). */
export async function findSample(): Promise<SampleFn | null> {
  const claude = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (!claude?.use) return null;
  try {
    return ((await claude.use('sample')) as SampleFn | null) ?? null;
  } catch {
    return null;
  }
}

const SAMPLE_ERRORS: Record<string, [AiErrorKind, string]> = {
  not_granted: ['auth', 'Claude 사용을 허용하지 않아서 만들 수 없어요. 샘플 여행은 그대로 쓸 수 있어요'],
  sampling_disabled: ['auth', '이 계정에서는 Claude를 쓸 수 없어요'],
  session_expired: ['auth', 'claude.ai에 다시 로그인해 주세요'],
  rate_limited: ['rate', '잠시 후 다시 시도해 주세요'],
  refused: ['refusal', '이 요청은 처리할 수 없어요. 내용을 바꿔 다시 시도해 주세요'],
  invalid_json: ['bad', '응답을 이해하지 못했어요. 다시 시도해 주세요'],
  cancelled: ['aborted', '취소했어요'],
};

export function createSamplePlanner(sample: SampleFn): PlannerAi {
  return {
    async plan(req, signal) {
      const prompt = `${PLAN_SYSTEM}\n\n아래 모양의 JSON 하나만 답하세요. 다른 글은 쓰지 마세요.\n${PLAN_JSON_SHAPE}\n\n[요청]\n${planPrompt(req)}`;
      let raw: unknown;
      try {
        raw = await sample.json(prompt, { signal, modelTier: 'default', cache: false });
      } catch (e) {
        const code = (e as { code?: string }).code ?? '';
        const [kind, message] = SAMPLE_ERRORS[code] ?? ['server', '지금은 만들 수 없어요. 잠시 후 다시 시도해 주세요'];
        throw new AiError(kind, message);
      }
      return finish(raw, req);
    },
  };
}

export function createPlannerAi(apiKey: string): PlannerAi {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  return {
    async plan(req, signal) {
      try {
        const res = await client.beta.messages.create(
          {
            ...FALLBACK,
            model: MODEL,
            max_tokens: 16000,
            system: PLAN_SYSTEM,
            output_config: { effort: 'medium', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
            messages: [{ role: 'user', content: planPrompt(req) }],
          },
          { signal },
        );
        if (res.stop_reason === 'refusal') throw new AiError('refusal', '이 요청은 처리할 수 없어요. 내용을 바꿔 다시 시도해 주세요');
        if (res.stop_reason === 'max_tokens') throw new AiError('bad', '일정이 너무 길어요. 기간을 줄여 다시 시도해 주세요');
        const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          throw new AiError('bad', '응답을 이해하지 못했어요. 다시 시도해 주세요');
        }
        return finish(raw, req);
      } catch (e) {
        throw toAiError(e);
      }
    },
  };
}
