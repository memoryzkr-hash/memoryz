/**
 * The promo agent's run loop (docs/promo/PLAN.md §4–7). Everything outside — Claude, platforms, Chromium,
 * the image host, the clock — comes in through AgentDeps, so tests drive it with fakes.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PromoAi } from './ai/claude';
import { describeError } from './errors';
import { todayLine } from './ai/prompts';
import { capReplies, commentKey, decide, pendingComments, type FinalDecision } from './core/comments';
import { parseDraft, serializeDraft } from './core/draft';
import { allowedUrls, checkContent, hasBlocking, normalizeContent } from './core/rules';
import { draftIdFor, dueSlots, localParts, pickSlot } from './core/schedule';
import { parseState, pruneState } from './core/state';
import type { DataDir } from './core/store';
import { oneLine } from './core/text';
import {
  PLATFORM_LABELS,
  type BrandDocs,
  type Draft,
  type InboxItem,
  type Issue,
  type PlatformId,
  type PromoConfig,
  type PromoState,
  type PublishResult,
  type RemoteComment,
  type Research,
} from './core/types';
import type { CardRenderer } from './media/render';
import type { MediaHost } from './media/host';
import type { Platform } from './platforms/types';

export interface AgentDeps {
  config: PromoConfig;
  docs: BrandDocs;
  ai: PromoAi;
  platforms: Partial<Record<PlatformId, Platform>>;
  data: DataDir;
  renderCards: CardRenderer;
  /** Null when images cannot be made public (dry run, or no GitHub token). */
  host: MediaHost | null;
  now: () => Date;
  log: (line: string) => void;
  notify: (text: string) => Promise<void>;
  /** Pause between comment replies so the account does not look like a bot. */
  pause: (ms: number) => Promise<void>;
  dryRun: boolean;
  /** Web link to the promo-data branch, for report and notification links. */
  linkBase: string | null;
  /** Downloads a public image to a local file (for blogs that upload images themselves). */
  download?: (url: string, file: string) => Promise<void>;
}

const DAY = 86400000;
const RECENT_DRAFT_DAYS = 14;
const MAX_ATTEMPTS = 2;
const COMMENT_BATCH = 30;
const WEEKDAY_KO: Record<string, string> = { sun: '일요일', mon: '월요일', tue: '화요일', wed: '수요일', thu: '목요일', fri: '금요일', sat: '토요일' };

export type Event =
  | { kind: 'published'; platform: PlatformId; draftId: string; url: string | null; manual: boolean }
  | { kind: 'publishFailed'; platform: PlatformId; draftId: string; error: string }
  | { kind: 'draft'; draftId: string; topic: string; reason: string }
  | { kind: 'comment'; platform: PlatformId; action: FinalDecision['action']; author: string; text: string; reply: string; reason: string; failed?: string }
  | { kind: 'warn'; message: string }
  | { kind: 'info'; message: string };

export const cardsFingerprint = (d: Pick<Draft, 'content'>) =>
  createHash('sha1')
    .update(JSON.stringify(d.content.instagram?.cards ?? []))
    .digest('hex')
    .slice(0, 12);

/** Cards were edited after the images were made, or the images never reached a public host (preview). */
export const imagesStale = (d: Draft, canUpload: boolean) =>
  d.imagesFor !== cardsFingerprint(d) || (canUpload && d.images.some((u) => !/^https?:\/\//.test(u)));

export class Agent {
  readonly events: Event[] = [];
  state!: PromoState;

  constructor(private readonly d: AgentDeps) {}

  private get config() {
    return this.d.config;
  }

  private enabled(): PlatformId[] {
    return (Object.keys(this.config.platforms) as PlatformId[]).filter((p) => this.config.platforms[p].enabled && this.d.platforms[p]);
  }

  private warn(message: string) {
    this.events.push({ kind: 'warn', message });
    this.d.log(`⚠️ ${message}`);
  }

  async load(): Promise<void> {
    const { state, corrupt } = parseState(await this.d.data.read('state.json'));
    if (corrupt) {
      await this.d.data.write(`state.corrupt-${Date.now()}.json`, (await this.d.data.read('state.json')) ?? '');
      this.warn('state.json을 읽지 못해 새로 시작했어요 (원본은 state.corrupt-*.json으로 옮겼어요)');
    }
    this.state = state;
  }

  /** A dry run leaves no trace in state, so the real run still sees its slot as due. */
  async save(): Promise<void> {
    // Card images already live on the media branch; keep the data branch small.
    await this.d.data.write('.gitignore', 'media/\n');
    if (this.d.dryRun) return;
    this.state.lastRun = this.d.now().toISOString();
    this.state = pruneState(this.state, this.d.now());
    await this.d.data.write('state.json', `${JSON.stringify(this.state, null, 1)}\n`);
    await this.d.data.write('inbox.md', renderInbox(this.state.inbox, this.config.timeZone));
  }

  // ---------------- commands ----------------

  /** The scheduled run: approved drafts, retries, a due slot, then comments. */
  async run(): Promise<void> {
    await this.publishApproved();
    await this.retryFailed();
    // A slot that failed once gets one more try on the next run; after that it is left alone.
    const done = (k: string) => k in this.state.slots && this.state.slots[k] !== 'failed:1';
    const due = dueSlots(this.d.now(), this.config.timeZone, this.config.schedule.slots, this.config.schedule.catchUpHours, done);
    const { run, skipped } = pickSlot(due);
    for (const key of skipped) {
      this.state.slots[key] = 'skipped';
      this.warn(`밀린 슬롯 ${key}은(는) 건너뛰었어요 (가장 최근 슬롯만 올려요)`);
    }
    if (run) await this.createAndPublish(run, null);
    if (this.config.comments.enabled) await this.handleComments();
  }

  async postNow(topic: string | null): Promise<Draft | null> {
    return this.createAndPublish(null, topic);
  }

  // ---------------- posting ----------------

  private async createAndPublish(slotKey: string | null, topic: string | null): Promise<Draft | null> {
    let draft: Draft;
    try {
      draft = await this.createDraft(slotKey, topic);
    } catch (e) {
      const msg = describeError(e);
      this.warn(`글을 만들지 못했어요: ${msg}`);
      // A failed slot is retried once, not every 30 minutes forever.
      if (slotKey) this.state.slots[slotKey] = this.state.slots[slotKey] === 'failed:1' ? 'failed:2' : 'failed:1';
      return null;
    }
    const blocking = hasBlocking(draft.issues);
    if (this.d.dryRun) {
      this.events.push({ kind: 'draft', draftId: draft.id, topic: draft.plan.topic, reason: '미리보기(dry run) — 아무 데도 올리지 않았어요' });
    } else if (this.config.mode === 'review' || blocking) {
      const reason = blocking ? `검수에서 막힌 문제: ${draft.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' / ')}` : '검토 모드 — 승인하면 올라가요';
      this.events.push({ kind: 'draft', draftId: draft.id, topic: draft.plan.topic, reason });
    } else {
      await this.publishDraft(draft);
    }
    return draft;
  }

  private pickForcedTopic(topic: string | null): string | null {
    if (topic) return topic;
    const used = new Set(this.state.topics.map((t) => t.topic));
    return this.config.content.topics.find((t) => !used.has(t)) ?? null;
  }

  async createDraft(slotKey: string | null, topic: string | null): Promise<Draft> {
    const { config, docs, ai } = this.d;
    const now = this.d.now();
    const local = localParts(now, config.timeZone);
    const today = todayLine(local.date, WEEKDAY_KO[local.weekday], config.timeZone);
    let id = draftIdFor(now, config.timeZone, slotKey);
    if (await this.d.data.exists(`drafts/${id}.md`)) id = `${id}-${now.getTime().toString(36)}`;

    this.d.log(`① 주제 정하는 중…`);
    const plan = await ai.planTopic({ docs, config, today, recent: this.state.topics.slice(0, 30).map((t) => t.topic), forced: this.pickForcedTopic(topic) });
    this.d.log(`   주제: ${plan.topic}`);

    this.d.log('② 레퍼런스 조사 중…');
    let research: Research;
    try {
      research = await ai.research({ docs, config, today, plan });
    } catch (e) {
      this.warn(`레퍼런스 조사를 건너뛰었어요: ${describeError(e)}`);
      research = { references: [], hooks: [], structures: [], keywords: plan.keywords, hashtags: [], facts: [], avoid: [] };
    }
    this.d.log(`   참고 글 ${research.references.length}개, 근거 있는 사실 ${research.facts.length}개`);

    this.d.log('③ 글 쓰는 중…');
    const allowed = allowedUrls(config, research.facts.map((f) => f.sourceUrl));
    let content = normalizeContent(await ai.write({ docs, config, today, plan, research }), config);

    this.d.log('④ 검수 중…');
    let issues: Issue[] = checkContent(content, config, allowed);
    try {
      const review = await ai.review({ docs, config, plan, research, content, codeIssues: issues });
      content = normalizeContent(review.content, config);
      issues = [...checkContent(content, config, allowed), ...review.unresolved];
      for (const f of review.fixed) this.d.log(`   고침: ${f}`);
    } catch (e) {
      issues.push({ severity: 'error', platform: 'all', message: `검수 단계를 거치지 못했어요 (${describeError(e)})` });
    }

    const draft: Draft = {
      id,
      slotKey,
      status: 'draft',
      createdAt: now.toISOString(),
      plan,
      references: research.references,
      issues,
      images: [],
      imagesFor: '',
      results: {},
      content,
    };

    this.d.log('⑤ 카드 이미지 만드는 중…');
    await this.makeImages(draft);

    await this.saveDraft(draft);
    this.state.topics.unshift({ date: local.date, topic: plan.topic, draftId: id });
    if (slotKey) this.state.slots[slotKey] = id;
    return draft;
  }

  private needsImages(draft: Draft): boolean {
    const p = this.config.platforms;
    return !!draft.content.instagram?.cards.length && (p.instagram.enabled || p.wordpress.enabled || p.naver.enabled || p.threads.attachImage);
  }

  private mediaDir(draft: Draft) {
    return `media/${draft.id}`;
  }

  /** Renders the cards and makes them public. Failures become blocking issues, not crashes. */
  private async makeImages(draft: Draft): Promise<void> {
    if (!this.needsImages(draft)) return;
    draft.issues = draft.issues.filter((i) => !i.message.startsWith('카드 이미지'));
    try {
      const files = await this.d.renderCards(draft.content.instagram!.cards, this.config.brand, this.d.data.path(this.mediaDir(draft)));
      draft.imagesFor = cardsFingerprint(draft);
      if (this.d.host && !this.d.dryRun) {
        const [y, m] = draft.id.split('-');
        draft.images = await this.d.host.upload(`${y}/${m}/${draft.id}-${draft.imagesFor}`, files);
      } else {
        draft.images = files.map((f) => f.slice(this.d.data.root.length + 1));
        if (!this.d.dryRun && this.config.platforms.instagram.enabled) {
          draft.issues.push({ severity: 'error', platform: 'instagram', message: '카드 이미지를 공개 주소에 올리지 못했어요 (GITHUB_TOKEN 확인)' });
        }
      }
    } catch (e) {
      draft.images = [];
      const blocks = this.config.platforms.instagram.enabled;
      draft.issues.push({ severity: blocks ? 'error' : 'warn', platform: 'instagram', message: `카드 이미지를 만들지 못했어요: ${describeError(e)}` });
    }
  }

  private async saveDraft(draft: Draft) {
    await this.d.data.write(`drafts/${draft.id}.md`, serializeDraft(draft));
  }

  private async recentDrafts(): Promise<Draft[]> {
    const cutoff = new Date(this.d.now().getTime() - RECENT_DRAFT_DAYS * DAY).toISOString().slice(0, 10);
    const out: Draft[] = [];
    for (const name of await this.d.data.list('drafts')) {
      if (!name.endsWith('.md') || name.slice(0, 10) < cutoff) continue;
      const text = (await this.d.data.read(`drafts/${name}`))!;
      try {
        out.push(parseDraft(text));
      } catch (e) {
        this.warn(`drafts/${name}을(를) 읽지 못했어요: ${(e as Error).message}`);
      }
    }
    return out;
  }

  /** Drafts a person approved on GitHub (review mode, or ones that failed review). */
  async publishApproved(): Promise<void> {
    for (const draft of await this.recentDrafts()) {
      if (draft.status !== 'approved') continue;
      draft.content = normalizeContent(draft.content, this.config);
      const allowed = allowedUrls(this.config, draft.references.map((r) => r.url));
      // A person approved it, so earlier review notes no longer block; fresh rule breaks still do.
      draft.issues = checkContent(draft.content, this.config, allowed);
      if (hasBlocking(draft.issues)) {
        draft.status = 'draft';
        await this.saveDraft(draft);
        this.events.push({ kind: 'draft', draftId: draft.id, topic: draft.plan.topic, reason: `승인했지만 고칠 게 남았어요: ${draft.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' / ')}` });
        continue;
      }
      if (this.needsImages(draft) && imagesStale(draft, !!this.d.host)) await this.makeImages(draft);
      if (this.d.dryRun) {
        this.events.push({ kind: 'info', message: `승인된 초안 ${draft.id}은(는) 미리보기라 올리지 않았어요` });
        continue;
      }
      await this.publishDraft(draft);
    }
  }

  async retryFailed(): Promise<void> {
    if (this.d.dryRun) return;
    const cutoff = new Date(this.d.now().getTime() - 2 * DAY).toISOString();
    for (const draft of await this.recentDrafts()) {
      if ((draft.status !== 'partial' && draft.status !== 'failed') || draft.createdAt < cutoff) continue;
      const retry = this.enabled().filter((p) => draft.results[p]?.status === 'failed' && draft.results[p]!.attempts < MAX_ATTEMPTS);
      if (retry.length) await this.publishDraft(draft, retry);
    }
  }

  private async localImages(draft: Draft): Promise<string[]> {
    const dir = this.mediaDir(draft);
    const files: string[] = [];
    for (let i = 0; i < draft.images.length; i++) {
      const rel = `${dir}/card-${String(i + 1).padStart(2, '0')}.jpg`;
      const abs = this.d.data.path(rel);
      if (!existsSync(abs) && this.d.download && /^https?:\/\//.test(draft.images[i])) {
        await mkdir(this.d.data.path(dir), { recursive: true });
        await this.d.download(draft.images[i], abs);
      }
      files.push(abs);
    }
    return files;
  }

  async publishDraft(draft: Draft, only?: PlatformId[]): Promise<void> {
    const targets = (only ?? this.enabled()).filter((p) => !['ok', 'manual'].includes(draft.results[p]?.status ?? ''));
    let imageFiles: string[] = [];
    try {
      imageFiles = await this.localImages(draft);
    } catch (e) {
      this.warn(`카드 이미지를 내려받지 못했어요: ${describeError(e)}`);
    }
    for (const id of targets) {
      const platform = this.d.platforms[id]!;
      const prev = draft.results[id];
      const at = this.d.now().toISOString();
      this.d.log(`⑥ ${PLATFORM_LABELS[id]}에 올리는 중…`);
      try {
        const r = await platform.publish({ draft, images: draft.images, imageFiles });
        draft.results[id] = { status: r.manual ? 'manual' : 'ok', id: r.id, url: r.url, error: null, at, attempts: (prev?.attempts ?? 0) + 1 };
        if (!r.manual) this.state.posts.push({ draftId: draft.id, platform: id, id: r.id, url: r.url, at });
        this.events.push({ kind: 'published', platform: id, draftId: draft.id, url: r.url, manual: !!r.manual });
      } catch (e) {
        const error = describeError(e);
        draft.results[id] = { status: 'failed', id: null, url: null, error, at, attempts: (prev?.attempts ?? 0) + 1 };
        this.events.push({ kind: 'publishFailed', platform: id, draftId: draft.id, error });
      }
    }
    draft.status = draftStatus(this.enabled().map((p) => draft.results[p]));
    await this.saveDraft(draft);
  }

  // ---------------- comments ----------------

  async handleComments(): Promise<void> {
    const { config } = this;
    const since = new Date(this.d.now().getTime() - config.comments.lookbackDays * DAY);
    const collected: RemoteComment[] = [];
    const me: Record<string, string> = {};
    for (const id of this.enabled()) {
      const api = this.d.platforms[id]!.comments;
      if (!api) continue;
      try {
        me[id] = await api.me();
        const agentPostIds = this.state.posts.filter((p) => p.platform === id).map((p) => p.id);
        collected.push(...(await api.list({ since, scope: config.comments.scope, agentPostIds })));
      } catch (e) {
        this.warn(`${PLATFORM_LABELS[id]} 댓글을 가져오지 못했어요: ${describeError(e)}`);
      }
    }
    const pending = pendingComments(collected, this.state, me, since).slice(0, COMMENT_BATCH);
    if (!pending.length) {
      this.d.log('새 댓글 없음');
      return;
    }
    this.d.log(`새 댓글 ${pending.length}개 판단 중…`);
    let proposals;
    try {
      proposals = await this.d.ai.triageComments({ docs: this.d.docs, config, comments: pending });
    } catch (e) {
      this.warn(`댓글을 판단하지 못했어요 (다음 실행 때 다시 해요): ${describeError(e)}`);
      return;
    }
    const allowedLinks = allowedUrls(config, []);
    const decisions = pending.map((c) =>
      decide(
        c,
        proposals.find((p) => p.id === c.id),
        { config, allowedLinks, canReply: !!this.d.platforms[c.platform]?.comments, canHide: !!this.d.platforms[c.platform]?.comments?.hide },
      ),
    );
    const { now, later } = capReplies(decisions, config.comments.maxRepliesPerRun);
    if (later.length) this.d.log(`답글 한도(${config.comments.maxRepliesPerRun}개)를 넘은 ${later.length}개는 다음 실행으로 미뤄요`);

    let replied = 0;
    for (const dec of now) await this.applyDecision(dec, replied++ > 0);
  }

  private async applyDecision(dec: FinalDecision, pauseFirst: boolean): Promise<void> {
    const c = dec.comment;
    const api = this.d.platforms[c.platform]!.comments!;
    const at = this.d.now().toISOString();
    const record = (action: FinalDecision['action']) => (this.state.comments[commentKey(c)] = { action, category: dec.category, at });
    const event = { kind: 'comment' as const, platform: c.platform, author: c.author, text: c.text, reply: dec.reply, reason: dec.reason };

    if (dec.action === 'escalate') {
      this.escalate(dec, at);
      record('escalate');
      this.events.push({ ...event, action: 'escalate' });
      return;
    }
    if (dec.action === 'ignore') {
      record('ignore');
      this.events.push({ ...event, action: 'ignore' });
      return;
    }
    if (this.d.dryRun) {
      this.events.push({ ...event, action: dec.action, failed: '미리보기라 실제로는 하지 않았어요' });
      return;
    }
    try {
      if (dec.action === 'reply') {
        if (pauseFirst) await this.d.pause(2000 + Math.floor(Math.random() * 4000));
        await api.reply(c, dec.reply);
      } else {
        await api.hide!(c);
      }
      record(dec.action);
      this.events.push({ ...event, action: dec.action });
    } catch (e) {
      const failed = describeError(e);
      this.escalate({ ...dec, reason: `${dec.action === 'reply' ? '답글' : '숨김'} 실패: ${failed}` }, at);
      record('escalate');
      this.events.push({ ...event, action: dec.action, failed });
    }
  }

  private escalate(dec: FinalDecision, at: string) {
    const item: InboxItem = {
      key: commentKey(dec.comment),
      platform: dec.comment.platform,
      postUrl: dec.comment.postUrl,
      author: dec.comment.author,
      text: dec.comment.text,
      category: dec.category,
      suggestedReply: dec.reply,
      reason: dec.reason,
      at,
    };
    this.state.inbox = [item, ...this.state.inbox.filter((i) => i.key !== item.key)];
  }

  // ---------------- report ----------------

  report(command: string): string {
    return renderReport(this.events, {
      command,
      now: this.d.now(),
      timeZone: this.config.timeZone,
      mode: this.config.mode,
      dryRun: this.d.dryRun,
      linkBase: this.d.linkBase,
    });
  }

  /** One message for the webhook, or null when nothing needs a person's attention. */
  notification(): string | null {
    const lines: string[] = [];
    const link = (rel: string) => (this.d.linkBase ? `${this.d.linkBase}/${rel}` : rel);
    for (const e of this.events) {
      if (e.kind === 'published') lines.push(e.manual ? `📝 ${PLATFORM_LABELS[e.platform]} 발행본 준비됨 — 붙여넣고 발행해 주세요: ${e.url ?? ''}` : `✅ ${PLATFORM_LABELS[e.platform]} 발행: ${e.url ?? e.draftId}`);
      if (e.kind === 'publishFailed') lines.push(`❌ ${PLATFORM_LABELS[e.platform]} 발행 실패: ${e.error}`);
      if (e.kind === 'draft' && !this.d.dryRun) lines.push(`👀 검토할 초안 "${oneLine(e.topic, 40)}": ${e.reason} — ${link(`drafts/${e.draftId}.md`)}`);
      if (e.kind === 'comment' && e.action === 'escalate') lines.push(`💬 ${PLATFORM_LABELS[e.platform]} 댓글 확인 필요 (${e.author}): "${oneLine(e.text, 60)}" — ${e.reason}`);
      if (e.kind === 'warn') lines.push(`⚠️ ${e.message}`);
    }
    return lines.length ? [`[홍보 에이전트] ${this.config.brand.name}`, ...lines].join('\n') : null;
  }

  async writeReport(command: string): Promise<string> {
    const text = this.report(command);
    await this.d.data.write('report.md', text);
    return text;
  }
}

export function draftStatus(results: (PublishResult | undefined)[]): Draft['status'] {
  const done = results.filter((r) => r && (r.status === 'ok' || r.status === 'manual')).length;
  if (done === results.length) return 'published';
  return done > 0 ? 'partial' : 'failed';
}

const ACTION_LABELS: Record<FinalDecision['action'], string> = { reply: '답글', hide: '숨김', escalate: '사람 확인', ignore: '무시' };

export function renderReport(
  events: Event[],
  o: { command: string; now: Date; timeZone: string; mode: string; dryRun: boolean; linkBase: string | null },
): string {
  const local = localParts(o.now, o.timeZone);
  const link = (rel: string) => (o.linkBase ? `${o.linkBase}/${rel}` : rel);
  const out = [`# 홍보 에이전트 실행 기록`, '', `- ${local.date} ${local.time} (${o.timeZone}) · \`${o.command}\` · 모드 ${o.mode}${o.dryRun ? ' · **미리보기(dry run)**' : ''}`, ''];

  const posts = events.filter((e) => e.kind === 'published' || e.kind === 'publishFailed' || e.kind === 'draft');
  out.push('## 글', '');
  if (!posts.length) out.push('- 이번에는 올릴 차례가 아니었어요');
  for (const e of posts) {
    if (e.kind === 'published') out.push(`- ${e.manual ? '📝' : '✅'} ${PLATFORM_LABELS[e.platform]} — ${e.url ? `[${e.manual ? '발행본 열기' : '게시물 보기'}](${e.url})` : e.draftId}`);
    if (e.kind === 'publishFailed') out.push(`- ❌ ${PLATFORM_LABELS[e.platform]} — ${e.error} ([초안](${link(`drafts/${e.draftId}.md`)}))`);
    if (e.kind === 'draft') out.push(`- 👀 [${e.topic}](${link(`drafts/${e.draftId}.md`)}) — ${e.reason}`);
  }

  const comments = events.filter((e): e is Extract<Event, { kind: 'comment' }> => e.kind === 'comment');
  out.push('', '## 댓글', '');
  if (!comments.length) out.push('- 새 댓글 없음');
  else {
    const counts = (Object.keys(ACTION_LABELS) as FinalDecision['action'][]).map((a) => `${ACTION_LABELS[a]} ${comments.filter((c) => c.action === a && !c.failed).length}`);
    out.push(`- ${counts.join(' · ')}`, '');
    out.push('| 플랫폼 | 처리 | 댓글 | 답글 / 이유 |', '| --- | --- | --- | --- |');
    for (const c of comments) {
      const action = c.failed ? `${ACTION_LABELS[c.action]} ✗` : ACTION_LABELS[c.action];
      const detail = c.action === 'reply' && !c.failed ? c.reply : c.failed ? `${c.failed}` : c.reason;
      out.push(`| ${PLATFORM_LABELS[c.platform]} | ${action} | ${cell(`${c.author}: ${c.text}`)} | ${cell(detail)} |`);
    }
    if (comments.some((c) => c.action === 'escalate')) out.push('', `사람이 볼 댓글은 [inbox.md](${link('inbox.md')})에 모아 뒀어요.`);
  }

  const notes = events.filter((e) => e.kind === 'warn' || e.kind === 'info');
  if (notes.length) {
    out.push('', '## 알림', '');
    for (const e of notes) if (e.kind === 'warn' || e.kind === 'info') out.push(`- ${e.kind === 'warn' ? '⚠️ ' : ''}${e.message}`);
  }
  return `${out.join('\n')}\n`;
}

const cell = (s: string) => oneLine(s, 120).replace(/\|/g, '\\|');

export function renderInbox(items: InboxItem[], timeZone: string): string {
  const out = ['# 사람이 확인할 댓글', '', '에이전트가 답하지 않고 넘긴 댓글이에요. 앱에서 직접 답한 뒤 체크해 두세요. 30일이 지나면 목록에서 빠집니다.', ''];
  if (!items.length) out.push('지금은 없어요 🎉');
  for (const i of items) {
    const local = localParts(new Date(i.at), timeZone);
    out.push(
      `- [ ] **${PLATFORM_LABELS[i.platform]}** · ${local.date} ${local.time} · ${i.postUrl ? `[게시물](${i.postUrl})` : '게시물'} · 분류 \`${i.category}\``,
      `  - ${i.author}: ${oneLine(i.text, 300)}`,
      `  - 이유: ${i.reason}`,
      ...(i.suggestedReply ? [`  - 추천 답글: ${oneLine(i.suggestedReply, 300)}`] : []),
    );
  }
  return `${out.join('\n')}\n`;
}

/** Default image download for blogs, used by the CLI. */
export async function downloadTo(url: string, file: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지를 내려받지 못했어요 (HTTP ${res.status})`);
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, new Uint8Array(await res.arrayBuffer()));
}
