/**
 * 정밀 분석 (optional): Claude reads the material and writes the cards.
 * The key belongs to the person using the app and stays in their browser, like the 개인 비서 page.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlockParam, BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { checkAnalysis, parseJson } from './core/validate';
import type { Concept } from './core/types';
import { ANALYSIS_SCHEMA, ANALYSIS_SYSTEM, analysisPrompt } from './prompts';

export const MODEL = 'claude-opus-5-5';
/** On a policy decline the API retries on a fallback model inside the same call. */
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
/** About 300k tokens of Korean text: well inside the context window, and a cost the student can see coming. */
export const MAX_TEXT_CHARS = 600_000;
/** API limits for a PDF sent as-is (scanned PDFs with no text layer). */
export const MAX_PDF_BYTES = 30 * 1024 * 1024;
export const MAX_PDF_PAGES = 600;

export type AiErrorKind = 'auth' | 'rate' | 'network' | 'server' | 'refusal' | 'bad' | 'aborted' | 'too-big';

export class AiError extends Error {
  constructor(readonly kind: AiErrorKind, message: string) {
    super(message);
  }
}

const MESSAGES: Record<AiErrorKind, string> = {
  auth: 'API 키가 맞지 않아요',
  rate: '요청이 많아요. 잠시 후 다시 시도해 주세요',
  network: '인터넷 연결을 확인해 주세요',
  server: 'Claude 서버에 문제가 있어요. 잠시 후 다시 시도해 주세요',
  refusal: '이 자료는 분석할 수 없어요',
  bad: '분석 결과를 이해하지 못했어요. 다시 시도해 주세요',
  aborted: '취소했어요',
  'too-big': '자료가 너무 커요',
};

export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.APIUserAbortError) return new AiError('aborted', MESSAGES.aborted);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError('auth', MESSAGES.auth);
  if (e instanceof Anthropic.RateLimitError) return new AiError('rate', MESSAGES.rate);
  if (e instanceof Anthropic.APIConnectionError) return new AiError('network', MESSAGES.network);
  if (e instanceof Anthropic.APIError) return new AiError('server', MESSAGES.server);
  if (e instanceof DOMException && e.name === 'AbortError') return new AiError('aborted', MESSAGES.aborted);
  return new AiError('bad', MESSAGES.bad);
}

export interface AnalysisInput {
  subject: string;
  /** Extracted text. Preferred: cheaper and has no page limit. */
  text: string | null;
  /** Raw PDF as base64, only when it has no text layer. */
  pdfBase64: string | null;
  note: string | null;
}

export interface Ai {
  /** Free check: model info needs a valid key but no tokens. */
  testKey(signal?: AbortSignal): Promise<void>;
  analyze(input: AnalysisInput, signal?: AbortSignal): Promise<Concept[]>;
}

function readJson(res: BetaMessage): unknown {
  if (res.stop_reason === 'refusal') throw new AiError('refusal', MESSAGES.refusal);
  if (res.stop_reason === 'max_tokens') throw new AiError('bad', MESSAGES.bad);
  return parseJson(res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''));
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
    testKey: (signal) =>
      guard(async () => {
        await client.models.retrieve(MODEL, {}, { signal });
      }),

    analyze: (input, signal) =>
      guard(async () => {
        const content: BetaContentBlockParam[] = [];
        if (input.text) {
          if (input.text.length > MAX_TEXT_CHARS) throw new AiError('too-big', MESSAGES['too-big']);
          content.push({ type: 'text', text: `<자료>\n${input.text}\n</자료>` });
        } else if (input.pdfBase64) {
          content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdfBase64 } });
        } else throw new AiError('bad', MESSAGES.bad);
        content.push({ type: 'text', text: analysisPrompt(input.subject, input.note) });

        // Forty concepts with two questions each is a long answer: stream so the request never times out.
        const stream = client.beta.messages.stream(
          {
            ...FALLBACK,
            model: MODEL,
            max_tokens: 64000,
            system: ANALYSIS_SYSTEM,
            output_config: { effort: 'medium', format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } },
            messages: [{ role: 'user', content }],
          },
          { signal },
        );
        const concepts = checkAnalysis(readJson(await stream.finalMessage()));
        if (concepts.length < 3) throw new AiError('bad', '자료에서 학습할 개념을 충분히 찾지 못했어요');
        return concepts;
      }),
  };
}
