/**
 * The code-side half of comment handling (docs/promo/PLAN.md §5): which comments to look at,
 * and the final say on what Claude proposed. Claude suggests; these rules decide.
 */
import { charLength, findBannedWords, findUrls, isAllowedUrl } from './text';
import type { CommentAction, CommentCategory, CommentDecision, PromoConfig, PromoState, RemoteComment } from './types';

export const commentKey = (c: Pick<RemoteComment, 'platform' | 'id'>) => `${c.platform}:${c.id}`;

/** New comments worth a decision, oldest first. */
export function pendingComments(all: RemoteComment[], state: PromoState, me: Record<string, string>, since: Date): RemoteComment[] {
  return all
    .filter((c) => !state.comments[commentKey(c)])
    .filter((c) => !c.repliedByMe)
    .filter((c) => c.author.toLowerCase() !== (me[c.platform] ?? '').toLowerCase())
    .filter((c) => c.text.trim() !== '')
    .filter((c) => new Date(c.at).getTime() >= since.getTime())
    .sort((a, b) => a.at.localeCompare(b.at));
}

export interface FinalDecision {
  comment: RemoteComment;
  category: CommentCategory;
  action: CommentAction;
  reply: string;
  reason: string;
}

export interface PolicyContext {
  config: PromoConfig;
  allowedLinks: string[];
  canHide: boolean;
  canReply: boolean;
}

export function decide(comment: RemoteComment, proposal: CommentDecision | undefined, ctx: PolicyContext): FinalDecision {
  const { config } = ctx;
  if (!proposal) {
    return { comment, category: 'other', action: 'escalate', reply: '', reason: 'AI가 이 댓글을 판단하지 못했어요' };
  }
  const category = proposal.category;
  const configured = config.comments.actions[category];
  const reply = proposal.reply.trim();
  const base = { comment, category, reply, reason: proposal.reason };

  // Claude may be more careful than the config (escalate/ignore), never less.
  let action: CommentAction = configured;
  if (configured === 'reply' && (proposal.action === 'escalate' || proposal.action === 'ignore')) action = proposal.action;
  if (configured === 'hide' && proposal.action === 'escalate') action = 'escalate';

  if (action === 'reply') {
    if (!ctx.canReply) return { ...base, action: 'escalate', reason: '이 플랫폼은 자동 답글을 지원하지 않아요' };
    if (!reply) return { ...base, action: 'escalate', reason: proposal.reason || '답글을 쓰지 못했어요' };
    const problem = replyProblem(reply, config, ctx.allowedLinks);
    if (problem) return { ...base, action: 'escalate', reason: problem };
  }
  if (action === 'hide' && !ctx.canHide) return { ...base, action: 'escalate', reason: '이 플랫폼에서는 숨길 수 없어요' };
  return { ...base, action };
}

export function replyProblem(reply: string, config: PromoConfig, allowedLinks: string[]): string | null {
  if (charLength(reply) > config.comments.replyMaxChars) return `답글이 너무 길어요 (${charLength(reply)}자)`;
  const banned = findBannedWords(reply, config.content.bannedWords);
  if (banned.length) return `답글에 금지 표현이 있어요: ${banned.join(', ')}`;
  const bad = findUrls(reply).filter((u) => !isAllowedUrl(u, allowedLinks));
  if (bad.length) return `답글에 허용되지 않은 링크가 있어요: ${bad.join(', ')}`;
  return null;
}

/** Keep at most `max` replies this run; later reply decisions wait for the next run (not recorded). */
export function capReplies(decisions: FinalDecision[], max: number): { now: FinalDecision[]; later: FinalDecision[] } {
  const now: FinalDecision[] = [];
  const later: FinalDecision[] = [];
  let replies = 0;
  for (const d of decisions) {
    if (d.action === 'reply') {
      if (replies >= max) {
        later.push(d);
        continue;
      }
      replies++;
    }
    now.push(d);
  }
  return { now, later };
}
