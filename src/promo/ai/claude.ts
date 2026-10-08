/**
 * Every Claude call the promo agent makes. The agent only sees the PromoAi interface,
 * so tests swap in a fake and nothing else imports the SDK.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { BrandDocs, CommentDecision, ContentSet, Issue, PromoConfig, RemoteComment, Research, TopicPlan } from '../core/types';
import { COMMENT_CATEGORIES } from '../core/types';
import {
  COMMENTS_SCHEMA,
  COMMENTS_SYSTEM,
  commentsPrompt,
  CONTENT_SCHEMA,
  PLAN_SCHEMA,
  PLAN_SYSTEM,
  planPrompt,
  RESEARCH_SYSTEM,
  researchPrompt,
  REVIEW_SCHEMA,
  REVIEW_SYSTEM,
  reviewPrompt,
  SUBMIT_RESEARCH_TOOL,
  WRITE_SYSTEM,
  writePrompt,
} from './prompts';

export const MODEL = 'claude-opus-5-5';
/** On a policy decline the API retries on a fallback model inside the same call. */
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
/** Server-side search loops can pause; resume at most this many times. */
const MAX_CONTINUATIONS = 3;

export class PromoAiError extends Error {}

export interface ReviewResult {
  content: ContentSet;
  fixed: string[];
  unresolved: Issue[];
}

export interface PromoAi {
  planTopic(a: { docs: BrandDocs; config: PromoConfig; today: string; recent: string[]; forced: string | null }): Promise<TopicPlan>;
  research(a: { docs: BrandDocs; config: PromoConfig; today: string; plan: TopicPlan }): Promise<Research>;
  write(a: { docs: BrandDocs; config: PromoConfig; today: string; plan: TopicPlan; research: Research }): Promise<ContentSet>;
  review(a: { docs: BrandDocs; config: PromoConfig; plan: TopicPlan; research: Research; content: ContentSet; codeIssues: Issue[] }): Promise<ReviewResult>;
  triageComments(a: { docs: BrandDocs; config: PromoConfig; comments: RemoteComment[] }): Promise<CommentDecision[]>;
}

function assertAnswered(res: BetaMessage): void {
  if (res.stop_reason === 'refusal') throw new PromoAiError('Claude가 이 요청을 거절했어요. 브랜드 설명이나 주제를 확인해 주세요');
  if (res.stop_reason === 'max_tokens') throw new PromoAiError('Claude 답이 너무 길어 잘렸어요');
}

function jsonOf(res: BetaMessage): unknown {
  assertAnswered(res);
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new PromoAiError('Claude 답을 읽지 못했어요');
  }
}

// ---------- shape checks (structured outputs guarantee the schema; these guard against surprises) ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function checkPlan(v: unknown): TopicPlan {
  if (!isObj(v) || !str(v.topic).trim()) throw new PromoAiError('주제를 정하지 못했어요');
  return { topic: str(v.topic).trim(), angle: str(v.angle).trim(), pillar: str(v.pillar).trim(), keywords: strs(v.keywords) };
}

export function checkContentSet(v: unknown): ContentSet {
  if (!isObj(v)) throw new PromoAiError('글을 받지 못했어요');
  const blog = isObj(v.blog) ? { title: str(v.blog.title), tags: strs(v.blog.tags), body: str(v.blog.body) } : null;
  const ig = isObj(v.instagram)
    ? {
        caption: str(v.instagram.caption),
        hashtags: strs(v.instagram.hashtags),
        cards: (Array.isArray(v.instagram.cards) ? v.instagram.cards : []).filter(isObj).map((c) => ({ title: str(c.title), body: str(c.body) })),
      }
    : null;
  const threads = isObj(v.threads) ? { posts: strs(v.threads.posts) } : null;
  if (!blog && !ig && !threads) throw new PromoAiError('글을 받지 못했어요');
  return { blog, instagram: ig, threads };
}

/** Drops references and facts whose URL never appeared in this call's search or fetch results. */
export function checkResearch(v: unknown, seen: Set<string>): Research {
  if (!isObj(v)) throw new PromoAiError('레퍼런스 조사 결과를 받지 못했어요');
  const norm = (u: string) => u.replace(/\/+$/, '');
  const known = new Set([...seen].map(norm));
  const ok = (u: string) => /^https?:\/\//.test(u) && known.has(norm(u));
  const refs = (Array.isArray(v.references) ? v.references : []).filter(isObj).map((r) => ({ title: str(r.title), url: str(r.url), note: str(r.note) }));
  const facts = (Array.isArray(v.facts) ? v.facts : []).filter(isObj).map((f) => ({ claim: str(f.claim), sourceUrl: str(f.sourceUrl) }));
  return {
    references: refs.filter((r) => ok(r.url)),
    hooks: strs(v.hooks),
    structures: strs(v.structures),
    keywords: strs(v.keywords),
    hashtags: strs(v.hashtags),
    facts: facts.filter((f) => f.claim && ok(f.sourceUrl)),
    avoid: strs(v.avoid),
  };
}

export function checkReview(v: unknown): ReviewResult {
  if (!isObj(v)) throw new PromoAiError('검수 결과를 받지 못했어요');
  const platforms = ['threads', 'instagram', 'wordpress', 'naver', 'all'];
  return {
    content: checkContentSet(v.content),
    fixed: strs(v.fixed),
    unresolved: (Array.isArray(v.unresolved) ? v.unresolved : [])
      .filter(isObj)
      .filter((u) => platforms.includes(str(u.platform)) && str(u.message))
      .map((u) => ({ severity: 'error' as const, platform: str(u.platform) as Issue['platform'], message: str(u.message) })),
  };
}

export function checkDecisions(v: unknown, ids: string[]): CommentDecision[] {
  if (!isObj(v) || !Array.isArray(v.decisions)) throw new PromoAiError('댓글 판단 결과를 받지 못했어요');
  const actions = ['reply', 'hide', 'escalate', 'ignore'];
  return v.decisions
    .filter(isObj)
    .filter((d) => ids.includes(str(d.id)) && (COMMENT_CATEGORIES as string[]).includes(str(d.category)) && actions.includes(str(d.action)))
    .map((d) => ({
      id: str(d.id),
      category: str(d.category) as CommentDecision['category'],
      action: str(d.action) as CommentDecision['action'],
      reply: str(d.reply).trim(),
      reason: str(d.reason).trim(),
    }));
}

export function createPromoAi(apiKey: string): PromoAi {
  const client = new Anthropic({ apiKey, maxRetries: 2 });

  const structured = async (system: string, prompt: string, schema: Record<string, unknown>, effort: 'low' | 'medium' | 'high', maxTokens: number) => {
    const res = await client.beta.messages
      .stream({
        ...FALLBACK,
        model: MODEL,
        max_tokens: maxTokens,
        system,
        output_config: { effort, format: { type: 'json_schema', schema } },
        messages: [{ role: 'user', content: prompt }],
      })
      .finalMessage();
    return jsonOf(res);
  };

  return {
    planTopic: async (a) => checkPlan(await structured(PLAN_SYSTEM, planPrompt(a), PLAN_SCHEMA, 'low', 4000)),

    research: async (a) => {
      const messages: BetaMessageParam[] = [{ role: 'user', content: researchPrompt(a) }];
      const seen = new Set<string>();
      const { searches, fetches } = a.config.content.research;
      const tools = [
        ...(searches > 0 ? [{ type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: searches, user_location: { type: 'approximate' as const, country: 'KR' } }] : []),
        ...(fetches > 0 ? [{ type: 'web_fetch_20260209' as const, name: 'web_fetch' as const, max_uses: fetches, max_content_tokens: 20000 }] : []),
        SUBMIT_RESEARCH_TOOL,
      ];
      for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
        const res = await client.beta.messages
          .stream({
            ...FALLBACK,
            model: MODEL,
            max_tokens: 32000,
            system: RESEARCH_SYSTEM,
            output_config: { effort: 'medium' },
            tools,
            tool_choice: { type: 'auto' },
            messages,
          })
          .finalMessage();
        if (res.stop_reason === 'refusal') assertAnswered(res);
        for (const block of res.content) {
          if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) for (const r of block.content) seen.add(r.url);
          if (block.type === 'web_fetch_tool_result' && block.content.type === 'web_fetch_result') seen.add(block.content.url);
        }
        const submit = res.content.find((b) => b.type === 'tool_use' && b.name === SUBMIT_RESEARCH_TOOL.name);
        if (submit && submit.type === 'tool_use') return checkResearch(submit.input, seen);
        if (res.stop_reason !== 'pause_turn') break;
        messages.push({ role: 'assistant', content: res.content });
      }
      // Research is a help, not a must: write without references rather than skip the slot.
      return { references: [], hooks: [], structures: [], keywords: a.plan.keywords, hashtags: [], facts: [], avoid: [] };
    },

    write: async (a) => checkContentSet(await structured(WRITE_SYSTEM, writePrompt(a), CONTENT_SCHEMA, 'high', 64000)),

    review: async (a) => checkReview(await structured(REVIEW_SYSTEM, reviewPrompt(a), REVIEW_SCHEMA, 'medium', 64000)),

    triageComments: async (a) =>
      checkDecisions(
        await structured(COMMENTS_SYSTEM, commentsPrompt(a), COMMENTS_SCHEMA, 'low', 16000),
        a.comments.map((c) => c.id),
      ),
  };
}
