/** promo-data/state.json: what ran, what was posted, which comments were handled. */
import type { PromoState } from './types';

export const emptyState = (): PromoState => ({
  version: 1,
  slots: {},
  topics: [],
  posts: [],
  comments: {},
  inbox: [],
  tokens: {},
  lastRun: null,
});

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Unknown or broken files start fresh instead of crashing the scheduled run; the caller reports it. */
export function parseState(text: string | null): { state: PromoState; corrupt: boolean } {
  if (text === null) return { state: emptyState(), corrupt: false };
  try {
    const v = JSON.parse(text);
    if (!isObj(v) || v.version !== 1) return { state: emptyState(), corrupt: true };
    const base = emptyState();
    return {
      state: {
        version: 1,
        slots: isObj(v.slots) ? (v.slots as PromoState['slots']) : base.slots,
        topics: Array.isArray(v.topics) ? (v.topics as PromoState['topics']) : base.topics,
        posts: Array.isArray(v.posts) ? (v.posts as PromoState['posts']) : base.posts,
        comments: isObj(v.comments) ? (v.comments as PromoState['comments']) : base.comments,
        inbox: Array.isArray(v.inbox) ? (v.inbox as PromoState['inbox']) : base.inbox,
        tokens: isObj(v.tokens) ? (v.tokens as PromoState['tokens']) : base.tokens,
        lastRun: typeof v.lastRun === 'string' ? v.lastRun : null,
      },
      corrupt: false,
    };
  } catch {
    return { state: emptyState(), corrupt: true };
  }
}

const DAY = 86400000;

/** Keeps the file small: old handled comments, slots and topics are dropped. */
export function pruneState(s: PromoState, now: Date): PromoState {
  const cutoff = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  const commentCutoff = cutoff(60);
  const postCutoff = cutoff(90);
  return {
    ...s,
    slots: Object.fromEntries(Object.entries(s.slots).sort(([a], [b]) => b.localeCompare(a)).slice(0, 200)),
    topics: s.topics.slice(0, 60),
    posts: s.posts.filter((p) => p.at >= postCutoff),
    comments: Object.fromEntries(Object.entries(s.comments).filter(([, c]) => c.at >= commentCutoff)),
    inbox: s.inbox.filter((i) => i.at >= cutoff(30)),
  };
}
