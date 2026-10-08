/** The one Claude call: a trip plan as JSON. Errors are shared with the assistant page. */
import Anthropic from '@anthropic-ai/sdk';
import { AiError, MODEL, toAiError } from '../assistant/ai';
import type { PlanRequest } from './core/store';
import type { TripPlan } from './core/types';
import { checkPlan, LIMITS } from './core/validate';
import { PLAN_SCHEMA, PLAN_SYSTEM, planPrompt } from './prompts';

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
        const plan = checkPlan({
          ...(raw as object),
          destination: req.destination.trim(),
          travelers: req.travelers,
          budgetKrw: req.budgetKrw,
          // Claude's own id (if any) is never trusted.
          id: undefined,
        });
        if (!plan) throw new AiError('bad', '쓸 수 있는 장소가 없었어요. 여행지를 더 구체적으로 적어 주세요');
        return plan;
      } catch (e) {
        throw toAiError(e);
      }
    },
  };
}
