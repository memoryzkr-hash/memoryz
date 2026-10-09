/**
 * Every Claude call lives here so tests can swap this module out.
 * The key comes from the person using the app and stays in their browser (01-scope.md 결정 사항).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { BRIEFING_ERRORS, checkBriefing, checkDrafts, checkParsedEvent, parseJson, type BriefingResult, type ParsedEvent } from './core/validate';
import type { MessageRequest, Settings } from './core/types';
import {
  BRIEFING_SYSTEM,
  briefingPrompt,
  EVENT_SCHEMA,
  EVENT_SYSTEM,
  MESSAGE_SCHEMA,
  MESSAGE_SYSTEM,
  messagePrompt,
  SUBMIT_BRIEFING_TOOL,
  todayLine,
} from './prompts';

export const MODEL = 'claude-opus-5-5';
/** On a policy decline the API retries on a fallback model inside the same call. */
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
/** Server-side search loops can pause; resume at most this many times. */
const MAX_CONTINUATIONS = 3;

export type AiErrorKind = 'auth' | 'rate' | 'network' | 'server' | 'refusal' | 'bad' | 'aborted' | 'unavailable';

export class AiError extends Error {
  constructor(readonly kind: AiErrorKind, message: string) {
    super(message);
  }
}

const MESSAGES: Record<AiErrorKind, string> = {
  auth: 'API 키가 맞지 않아요',
  rate: '잠시 후 다시 시도해 주세요',
  network: '인터넷 연결을 확인해 주세요',
  server: 'Claude 서버에 문제가 있어요. 잠시 후 다시 시도해 주세요',
  refusal: '이 요청은 처리할 수 없어요. 내용을 바꿔 다시 시도해 주세요',
  bad: '응답을 이해하지 못했어요. 다시 시도해 주세요',
  aborted: '취소했어요',
  unavailable: 'Claude를 쓸 수 없어요. 이 페이지에서 Claude 사용을 허용했는지 확인해 주세요',
};

export interface TopicBriefing {
  topic: string;
  result: BriefingResult;
}

export function aiMessage(kind: AiErrorKind): string {
  return MESSAGES[kind];
}

export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.APIUserAbortError) return new AiError('aborted', MESSAGES.aborted);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AiError('auth', MESSAGES.auth);
  }
  if (e instanceof Anthropic.RateLimitError) return new AiError('rate', MESSAGES.rate);
  if (e instanceof Anthropic.APIConnectionError) return new AiError('network', MESSAGES.network);
  if (e instanceof Anthropic.APIError) return new AiError('server', MESSAGES.server);
  if (e instanceof DOMException && e.name === 'AbortError') return new AiError('aborted', MESSAGES.aborted);
  return new AiError('bad', MESSAGES.bad);
}

export interface Ai {
  /** True when briefings search the web themselves (API key mode). */
  readonly canSearch: boolean;
  /** No-key mode: sort pasted articles into the viewer's topics. */
  briefFromText?(text: string, topics: string[], today: string, timeZone: string, signal?: AbortSignal): Promise<TopicBriefing[]>;
  /** Free check: asks for the model's info, which needs a valid key but no tokens. */
  testKey(signal?: AbortSignal): Promise<void>;
  briefTopic(topic: string, settings: Settings, today: string, timeZone: string, signal?: AbortSignal): Promise<BriefingResult>;
  parseEvent(text: string, today: string, timeZone: string, signal?: AbortSignal): Promise<ParsedEvent>;
  draftMessages(req: MessageRequest, today: string, timeZone: string, signal?: AbortSignal): Promise<[string, string]>;
}

function assertAnswered(res: BetaMessage): void {
  if (res.stop_reason === 'refusal') throw new AiError('refusal', MESSAGES.refusal);
}

function jsonText(res: BetaMessage): unknown {
  assertAnswered(res);
  if (res.stop_reason === 'max_tokens') throw new AiError('bad', MESSAGES.bad);
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  return parseJson(text);
}

export function createAi(apiKey: string): Ai {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });

  const guard = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (e) {
      throw toAiError(e);
    }
  };

  return {
    canSearch: true,

    testKey: (signal) =>
      guard(async () => {
        await client.models.retrieve(MODEL, {}, { signal });
      }),

    briefTopic: (topic, settings, today, timeZone, signal) =>
      guard(async () => {
        const messages: BetaMessageParam[] = [
          { role: 'user', content: briefingPrompt(topic, settings.briefingLanguage, today, timeZone) },
        ];
        const searched = new Set<string>();
        for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
          const res = await client.beta.messages.create(
            {
              ...FALLBACK,
              model: MODEL,
              max_tokens: 16000,
              system: BRIEFING_SYSTEM,
              tools: [
                { type: 'web_search_20260209', name: 'web_search', max_uses: settings.searchesPerTopic },
                SUBMIT_BRIEFING_TOOL,
              ],
              tool_choice: { type: 'auto' },
              messages,
            },
            { signal },
          );
          assertAnswered(res);
          for (const block of res.content) {
            if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
              for (const r of block.content) searched.add(r.url);
            }
          }
          const submit = res.content.find((b) => b.type === 'tool_use' && b.name === SUBMIT_BRIEFING_TOOL.name);
          if (submit && submit.type === 'tool_use') return checkBriefing(submit.input, searched);
          if (res.stop_reason !== 'pause_turn') break;
          messages.push({ role: 'assistant', content: res.content });
        }
        return { status: 'error', bullets: [], sources: [], error: BRIEFING_ERRORS.noSummary };
      }),

    parseEvent: (text, today, timeZone, signal) =>
      guard(async () => {
        const res = await client.beta.messages.create(
          {
            ...FALLBACK,
            model: MODEL,
            max_tokens: 4000,
            system: EVENT_SYSTEM,
            output_config: { effort: 'low', format: { type: 'json_schema', schema: EVENT_SCHEMA } },
            messages: [{ role: 'user', content: `${todayLine(today, timeZone)}\n문장: ${text}` }],
          },
          { signal },
        );
        const parsed = checkParsedEvent(jsonText(res));
        if (!parsed) throw new AiError('bad', MESSAGES.bad);
        return parsed;
      }),

    draftMessages: (req, today, timeZone, signal) =>
      guard(async () => {
        const res = await client.beta.messages.create(
          {
            ...FALLBACK,
            model: MODEL,
            max_tokens: 4000,
            system: MESSAGE_SYSTEM,
            output_config: { effort: 'low', format: { type: 'json_schema', schema: MESSAGE_SCHEMA } },
            messages: [{ role: 'user', content: `${todayLine(today, timeZone)}\n${messagePrompt(req)}` }],
          },
          { signal },
        );
        const drafts = checkDrafts(jsonText(res));
        if (!drafts) throw new AiError('bad', '초안을 받지 못했어요');
        return drafts;
      }),
  };
}
