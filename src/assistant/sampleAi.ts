/**
 * No-key mode: inside a Claude artifact the page asks Claude through the viewer's own
 * Claude account (`claude.use("sample")`), so nobody types an API key. That Claude cannot
 * browse, so briefings come from articles the viewer pastes instead of a web search.
 */
import { AiError, aiMessage, type Ai, type AiErrorKind, type TopicBriefing } from './ai';
import { checkBriefing, checkDrafts, checkParsedEvent, urlsIn } from './core/validate';
import { eventSamplePrompt, messageSamplePrompt, pasteBriefingPrompt } from './prompts';

/** The slice of the artifact `sample` capability this module uses. */
export interface SampleLike {
  json(input: string, options?: { signal?: AbortSignal; cache?: boolean; modelTier?: 'quick' | 'default' | 'complex' }): Promise<unknown>;
}

/** Sample rejects with a plain `{code, message}` object; map it to the app's error kinds. */
export function fromSampleError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const kind: AiErrorKind =
    code === 'cancelled'
      ? 'aborted'
      : code === 'rate_limited'
        ? 'rate'
        : code === 'refused'
          ? 'refusal'
          : code === 'invalid_json' || code === 'empty_completion' || code === 'prompt_too_large'
            ? 'bad'
            : code === 'session_expired'
              ? 'auth'
              : ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)
                ? 'unavailable'
                : 'server';
  const message = code === 'session_expired' ? 'Claude에 다시 로그인해 주세요' : code === 'prompt_too_large' ? '글이 너무 길어요. 나눠서 붙여 넣어 주세요' : aiMessage(kind);
  return new AiError(kind, message);
}

export function createSampleAi(sample: SampleLike): Ai {
  const ask = async (prompt: string, opts: { signal?: AbortSignal; cache?: boolean }) => {
    try {
      return await sample.json(prompt, opts);
    } catch (e) {
      throw fromSampleError(e);
    }
  };

  return {
    canSearch: false,

    // Nothing to check: the viewer's Claude account is the credential.
    testKey: async () => {},

    briefTopic: async () => {
      throw new AiError('bad', '이 버전은 웹 검색을 할 수 없어요. 기사를 붙여 넣어 주세요');
    },

    async briefFromText(text, topics, today, timeZone, signal): Promise<TopicBriefing[]> {
      const raw = await ask(pasteBriefingPrompt(text, topics, today, timeZone), { signal, cache: false });
      const items = typeof raw === 'object' && raw !== null && Array.isArray((raw as { items?: unknown }).items) ? ((raw as { items: unknown[] }).items) : [];
      const urls = urlsIn(text);
      return topics.map((topic) => {
        const found = items.find((i) => typeof i === 'object' && i !== null && (i as { topic?: unknown }).topic === topic);
        const result = found ? checkBriefing(found, urls, { requireSources: false }) : { status: 'empty' as const, bullets: [], sources: [] };
        return { topic, result };
      });
    },

    async parseEvent(text, today, timeZone, signal) {
      const parsed = checkParsedEvent(await ask(eventSamplePrompt(text, today, timeZone), { signal }));
      if (!parsed) throw new AiError('bad', aiMessage('bad'));
      return parsed;
    },

    async draftMessages(req, today, timeZone, signal) {
      // "다시 쓰기" must give new drafts, so never replay a cached answer.
      const drafts = checkDrafts(await ask(messageSamplePrompt(req, today, timeZone), { signal, cache: false }));
      if (!drafts) throw new AiError('bad', '초안을 받지 못했어요');
      return drafts;
    },
  };
}
