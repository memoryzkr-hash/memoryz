/** The agent end to end with fake Claude, fake platforms, a fake renderer and a temp promo-data dir. */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent, draftStatus, type AgentDeps } from '../../src/promo/agent';
import { PromoAiError, type PromoAi } from '../../src/promo/ai/claude';
import { parseDraft } from '../../src/promo/core/draft';
import { DataDir } from '../../src/promo/core/store';
import type { CommentDecision, PlatformId, PromoConfig, RemoteComment } from '../../src/promo/core/types';
import type { MediaHost } from '../../src/promo/media/host';
import { PlatformError } from '../../src/promo/platforms/http';
import type { Platform } from '../../src/promo/platforms/types';
import { comment, testConfig, testContent } from './fixtures';

// Friday 2026-10-09 09:10 KST
const FRI_0910 = new Date('2026-10-09T00:10:00Z');

function fakeAi(over: Partial<PromoAi> = {}): PromoAi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    planTopic: vi.fn(async (a) => (calls.push('plan'), { topic: a.forced ?? '점심 단백질 채우기', angle: '현실 조합', pillar: '식단', keywords: ['단백질'] })),
    research: vi.fn(async () => (calls.push('research'), { references: [{ title: 'r', url: 'https://ref.example.com/a', note: '숫자 후킹' }], hooks: [], structures: [], keywords: [], hashtags: [], facts: [], avoid: [] })),
    write: vi.fn(async () => (calls.push('write'), testContent())),
    review: vi.fn(async (a) => (calls.push('review'), { content: a.content, fixed: [], unresolved: [] })),
    triageComments: vi.fn(async (a) => (calls.push('triage'), a.comments.map((c: RemoteComment): CommentDecision => decisionFor(c)))),
    ...over,
  };
}

function decisionFor(c: RemoteComment): CommentDecision {
  if (c.text.includes('광고')) return { id: c.id, category: 'spam', action: 'hide', reply: '', reason: '광고' };
  if (c.text.includes('환불')) return { id: c.id, category: 'complaint', action: 'escalate', reply: '불편을 드려 죄송해요. DM 주세요', reason: '환불 요청' };
  return { id: c.id, category: 'praise', action: 'reply', reply: '고마워요! 😊', reason: '칭찬' };
}

interface FakePlatform extends Platform {
  published: string[];
  replies: [string, string][];
  hidden: string[];
  inbox: RemoteComment[];
  failPublish: number;
}

function fakePlatform(id: PlatformId, opts: { manual?: boolean; comments?: boolean } = {}): FakePlatform {
  const p: FakePlatform = {
    id,
    published: [],
    replies: [],
    hidden: [],
    inbox: [],
    failPublish: 0,
    check: async () => 'ok',
    publish: async ({ draft }) => {
      if (p.failPublish > 0) {
        p.failPublish--;
        throw new PlatformError(`${id} 서버 오류`, 500);
      }
      p.published.push(draft.id);
      return { id: `${id}-${draft.id}`, url: `https://${id}.example/${draft.id}`, manual: opts.manual };
    },
  };
  if (opts.comments !== false && !opts.manual) {
    p.comments = {
      me: async () => 'danbaek.meal',
      list: async () => p.inbox,
      reply: async (c, text) => void p.replies.push([c.id, text]),
      hide: async (c) => void p.hidden.push(c.id),
    };
  }
  return p;
}

let root: string;
let data: DataDir;
let clock: Date;
let rendered: number;
let uploads: string[];

const host: MediaHost = {
  upload: async (dir, files) => (uploads.push(dir), files.map((f) => `https://raw.example/${dir}/${f.split('/').pop()}`)),
  check: async () => ({ repo: 'o/r', public: true }),
};

async function makeAgent(config: PromoConfig, ai: PromoAi, platforms: Partial<Record<PlatformId, Platform>>, over: Partial<AgentDeps> = {}) {
  const agent = new Agent({
    config,
    docs: { brand: '단백질 도시락 구독', faq: '', references: '', templates: { blog: '', instagram: '', threads: '' } },
    ai,
    platforms,
    data,
    renderCards: async (cards, _brand, outDir) => {
      rendered++;
      return cards.map((_, i) => join(outDir, `card-0${i + 1}.jpg`));
    },
    host,
    now: () => clock,
    log: () => {},
    notify: async () => {},
    pause: async () => {},
    dryRun: false,
    linkBase: 'https://github.com/o/r/blob/promo-data',
    ...over,
  });
  await agent.load();
  return agent;
}

async function runOnce(config: PromoConfig, ai: PromoAi, platforms: Partial<Record<PlatformId, Platform>>, over: Partial<AgentDeps> = {}) {
  const agent = await makeAgent(config, ai, platforms, over);
  await agent.run();
  await agent.save();
  await agent.writeReport('run');
  return agent;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'promo-agent-'));
  data = new DataDir(root);
  clock = FRI_0910;
  rendered = 0;
  uploads = [];
});

describe('posting', () => {
  it('auto mode: a due slot becomes one post on every platform, once', async () => {
    const ai = fakeAi();
    const threads = fakePlatform('threads');
    const instagram = fakePlatform('instagram');
    const naver = fakePlatform('naver', { manual: true });
    const platforms = { threads, instagram, naver };
    const agent = await runOnce(testConfig(), ai, platforms);

    expect(ai.calls.slice(0, 4)).toEqual(['plan', 'research', 'write', 'review']);
    expect(threads.published).toEqual(['2026-10-09-0900']);
    expect(instagram.published).toEqual(['2026-10-09-0900']);
    expect(naver.published).toEqual(['2026-10-09-0900']);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatch(/^2026\/10\/2026-10-09-0900-[0-9a-f]{12}$/);

    const draft = parseDraft((await data.read('drafts/2026-10-09-0900.md'))!);
    expect(draft.status).toBe('published');
    expect(draft.results.naver!.status).toBe('manual');
    expect(draft.images[0]).toMatch(/^https:\/\/raw\.example\//);
    expect(agent.state.slots['2026-10-09@09:00#threads']).toBe('2026-10-09-0900');
    expect(agent.state.slots['2026-10-09@09:00#naver']).toBe('2026-10-09-0900');
    expect(agent.state.posts.map((p) => p.platform).sort()).toEqual(['instagram', 'threads']);

    const report = (await data.read('report.md'))!;
    expect(report).toContain('✅ 쓰레드 — [게시물 보기](https://threads.example/2026-10-09-0900)');
    expect(report).toContain('📝 네이버·티스토리 — [발행본 열기]');
    expect(agent.notification()).toContain('발행본 준비됨');
    expect(await data.read('.gitignore')).toBe('media/\n');

    clock = new Date('2026-10-09T00:40:00Z');
    await runOnce(testConfig(), ai, platforms);
    expect(threads.published).toHaveLength(1);
  });

  it('nothing happens outside a slot', async () => {
    clock = new Date('2026-10-10T00:10:00Z'); // Saturday
    const ai = fakeAi();
    await runOnce(testConfig(), ai, { threads: fakePlatform('threads') });
    expect(ai.calls.filter((c) => c !== 'triage')).toEqual([]);
  });

  it('uses the topic queue from config first', async () => {
    const ai = fakeAi();
    const config = testConfig((c) => (c.content.topics = ['단백질 간식 5가지']));
    const agent = await runOnce(config, ai, { threads: fakePlatform('threads') });
    expect(agent.state.topics[0].topic).toBe('단백질 간식 5가지');
  });

  it('review mode drafts only; approving on GitHub publishes the edited text', async () => {
    const config = testConfig((c) => ((c.mode = 'review'), (c.platforms.instagram.enabled = false), (c.platforms.naver.enabled = false)));
    const threads = fakePlatform('threads');
    const agent = await runOnce(config, fakeAi(), { threads });
    expect(threads.published).toEqual([]);
    expect(agent.notification()).toContain('검토할 초안');

    const file = join(root, 'drafts/2026-10-09-0900.md');
    const edited = (await readFile(file, 'utf8')).replace('status: draft', 'status: approved').replace('점심 단백질 30g 채우는 현실적인 방법 정리해 봄', '사람이 고친 첫 글');
    await writeFile(file, edited);
    let posted = '';
    threads.publish = async ({ draft }) => ((posted = draft.content.threads!.posts[0]), { id: 'x', url: null });
    clock = new Date('2026-10-09T01:10:00Z');
    await runOnce(config, fakeAi(), { threads });
    expect(posted).toBe('사람이 고친 첫 글');
    expect(parseDraft(await readFile(file, 'utf8')).status).toBe('published');
  });

  it('approved drafts with edited cards get new images', async () => {
    const config = testConfig((c) => (c.mode = 'review'));
    const instagram = fakePlatform('instagram');
    await runOnce(config, fakeAi(), { instagram });
    expect(rendered).toBe(1);
    const file = join(root, 'drafts/2026-10-09-0900.md');
    await writeFile(file, (await readFile(file, 'utf8')).replace('status: draft', 'status: approved').replace('두부, 계란, 연어도 좋아요', '두부와 계란'));
    clock = new Date('2026-10-09T01:10:00Z');
    await runOnce(config, fakeAi(), { instagram });
    expect(rendered).toBe(2);
    expect(instagram.published).toHaveLength(1);
  });

  it('blocking issues keep auto mode from publishing', async () => {
    const ai = fakeAi({
      review: async (a) => {
        const content = structuredClone(a.content);
        content.threads!.posts[0] += ' 최고의 도시락';
        return { content, fixed: [], unresolved: [{ severity: 'error', platform: 'instagram', message: '가격 확인 필요' }] };
      },
    });
    const threads = fakePlatform('threads');
    const agent = await runOnce(testConfig(), ai, { threads });
    expect(threads.published).toEqual([]);
    const draft = parseDraft((await data.read('drafts/2026-10-09-0900.md'))!);
    expect(draft.status).toBe('draft');
    expect(draft.issues.map((i) => i.message)).toEqual(expect.arrayContaining(['금지 표현 "최고"이(가) 들어 있어요', '가격 확인 필요']));
    expect(agent.notification()).toContain('검수에서 막힌 문제');
  });

  it('a failed review blocks too, a failed research does not', async () => {
    const ai = fakeAi({
      research: async () => {
        throw new PromoAiError('검색 실패');
      },
      review: async () => {
        throw new PromoAiError('검수 실패');
      },
    });
    const threads = fakePlatform('threads');
    const agent = await runOnce(testConfig(), ai, { threads });
    expect(threads.published).toEqual([]);
    expect(agent.events.some((e) => e.kind === 'warn' && e.message.includes('레퍼런스 조사를 건너뛰었어요'))).toBe(true);
    expect(parseDraft((await data.read('drafts/2026-10-09-0900.md'))!).issues.at(-1)!.message).toContain('검수 단계를 거치지 못했어요');
  });

  it('one platform failing does not stop the others; it is retried once later', async () => {
    const threads = fakePlatform('threads');
    const instagram = fakePlatform('instagram');
    instagram.failPublish = 5;
    await runOnce(testConfig(), fakeAi(), { threads, instagram });
    let draft = parseDraft((await data.read('drafts/2026-10-09-0900.md'))!);
    expect(draft.status).toBe('partial');
    expect(draft.results.instagram).toMatchObject({ status: 'failed', attempts: 1, error: 'instagram 서버 오류' });

    clock = new Date('2026-10-09T01:10:00Z');
    await runOnce(testConfig(), fakeAi(), { threads, instagram });
    clock = new Date('2026-10-09T02:10:00Z');
    await runOnce(testConfig(), fakeAi(), { threads, instagram });
    draft = parseDraft((await data.read('drafts/2026-10-09-0900.md'))!);
    expect(draft.results.instagram!.attempts).toBe(2);
    expect(threads.published).toHaveLength(1);
    expect(instagram.failPublish).toBe(3);
  });

  it('a slot whose draft cannot be made is retried once, then left alone', async () => {
    const ai = fakeAi({
      write: async () => {
        throw new PromoAiError('쓰기 실패');
      },
    });
    const threads = fakePlatform('threads');
    let agent = await runOnce(testConfig(), ai, { threads });
    expect(agent.state.slots['2026-10-09@09:00#threads']).toBe('failed:1');
    clock = new Date('2026-10-09T01:10:00Z');
    agent = await runOnce(testConfig(), ai, { threads });
    expect(agent.state.slots['2026-10-09@09:00#threads']).toBe('failed:2');
    clock = new Date('2026-10-09T02:10:00Z');
    const ai2 = fakeAi();
    await runOnce(testConfig(), ai2, { threads });
    expect(ai2.calls.filter((c) => c === 'plan')).toEqual([]);
  });

  it('missed slots: only the newest runs', async () => {
    const config = testConfig((c) => (c.schedule.slots = [{ days: ['fri'], time: '07:00' }, { days: ['fri'], time: '09:00' }]));
    const threads = fakePlatform('threads');
    const agent = await runOnce(config, fakeAi(), { threads });
    expect(threads.published).toEqual(['2026-10-09-0900']);
    expect(agent.state.slots['2026-10-09@07:00#threads']).toBe('skipped');
  });

  it('each platform keeps its own cycle; same-time platforms share one draft', async () => {
    const config = testConfig((c) => {
      c.platforms.threads.schedule = [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], time: '08:00' }];
      c.platforms.instagram.schedule = [{ days: ['fri'], time: '09:00' }];
      c.platforms.naver.schedule = [{ days: ['fri'], time: '09:00' }];
    });
    const ai = fakeAi();
    const threads = fakePlatform('threads');
    const instagram = fakePlatform('instagram');
    const naver = fakePlatform('naver', { manual: true });
    await runOnce(config, ai, { threads, instagram, naver });
    expect(threads.published).toEqual(['2026-10-09-0800-threads']);
    expect(instagram.published).toEqual(['2026-10-09-0900-instagram-naver']);
    expect(naver.published).toEqual(['2026-10-09-0900-instagram-naver']);
    // The writer only hears about the platforms of its draft.
    const writes = (ai.write as unknown as { mock: { calls: [{ config: PromoConfig }][] } }).mock.calls.map(([a]) => Object.entries(a.config.platforms).filter(([, v]) => v.enabled).map(([k]) => k));
    expect(writes).toEqual([['threads'], ['instagram', 'naver']]);
  });

  it('slots recorded before per-platform posting still count as done', async () => {
    await data.write('state.json', JSON.stringify({ version: 1, slots: { '2026-10-09@09:00': 'old' }, topics: [], posts: [], comments: {}, inbox: [], tokens: {}, lastRun: null }));
    const threads = fakePlatform('threads');
    await runOnce(testConfig(), fakeAi(), { threads });
    expect(threads.published).toEqual([]);
  });

  it('post-now for one platform writes and posts only there, even with its automation off', async () => {
    const config = testConfig((c) => (c.platforms.threads.enabled = false));
    const threads = fakePlatform('threads');
    const instagram = fakePlatform('instagram');
    const agent = await makeAgent(config, fakeAi(), { threads, instagram });
    const d = await agent.postNow(null, ['threads']);
    expect(d!.platforms).toEqual(['threads']);
    expect(threads.published).toHaveLength(1);
    expect(instagram.published).toEqual([]);
  });

  it('an unregistered account is a clear failure', async () => {
    const config = testConfig((c) => ((c.platforms.instagram.enabled = false), (c.platforms.naver.enabled = false)));
    await runOnce(config, fakeAi(), {});
    const draft = parseDraft((await data.read('drafts/2026-10-09-0900.md'))!);
    expect(draft.results.threads!.error).toBe('쓰레드 계정이 등록되지 않았어요');
  });

  it('preview (dry run) writes a draft and images but posts nothing and uploads nothing', async () => {
    const threads = fakePlatform('threads');
    const agent = await makeAgent(testConfig(), fakeAi(), { threads, instagram: fakePlatform('instagram') }, { dryRun: true, host: null });
    const draft = await agent.postNow('단백질 간식');
    expect(draft!.plan.topic).toBe('단백질 간식');
    expect(draft!.id).toBe('2026-10-09-0910-now');
    expect(draft!.images[0]).toBe('media/2026-10-09-0910-now/card-01.jpg');
    expect(threads.published).toEqual([]);
    expect(uploads).toEqual([]);
    expect(draft!.issues.some((i) => i.message.includes('공개 주소'))).toBe(false);
  });

  it('a dry run leaves state alone, so the real run still posts the slot', async () => {
    const threads = fakePlatform('threads');
    await runOnce(testConfig(), fakeAi(), { threads }, { dryRun: true, host: null });
    expect(await data.read('state.json')).toBeNull();
    await runOnce(testConfig(), fakeAi(), { threads });
    expect(threads.published).toHaveLength(1);
  });

  it('an approved preview draft gets its images uploaded before posting', async () => {
    const instagram = fakePlatform('instagram');
    const preview = await makeAgent(testConfig(), fakeAi(), { instagram }, { dryRun: true, host: null });
    const draft = await preview.postNow(null);
    const file = join(root, `drafts/${draft!.id}.md`);
    await writeFile(file, (await readFile(file, 'utf8')).replace('status: draft', 'status: approved'));
    clock = new Date('2026-10-10T00:10:00Z');
    let images: string[] = [];
    instagram.publish = async (input) => ((images = input.images), { id: 'x', url: null });
    await runOnce(testConfig(), fakeAi(), { instagram });
    expect(images[0]).toMatch(/^https:\/\/raw\.example\//);
    expect(rendered).toBe(2);
  });

  it('without an image host, Instagram is blocked with a clear reason', async () => {
    const instagram = fakePlatform('instagram');
    await runOnce(testConfig(), fakeAi(), { instagram }, { host: null });
    expect(instagram.published).toEqual([]);
    expect(parseDraft((await data.read('drafts/2026-10-09-0900.md'))!).issues.map((i) => i.message)).toContain('카드 이미지를 공개 주소에 올리지 못했어요 (GITHUB_TOKEN 확인)');
  });
});

describe('references', () => {
  it('finds references for a topic and saves them for the dashboard feed', async () => {
    const agent = await makeAgent(testConfig(), fakeAi(), {});
    const path = await agent.findReferences('편의점 단백질', ['instagram']);
    expect(path).toBe('references/2026-10-09-0910-now-instagram.json');
    const set = JSON.parse((await data.read(path!))!);
    expect(set).toMatchObject({ topic: '편의점 단백질', platform: 'instagram' });
    expect(set.references[0].url).toBe('https://ref.example.com/a');
  });

  it('writes from the references a person picked, ahead of the search results', async () => {
    const ai = fakeAi();
    const threads = fakePlatform('threads');
    const agent = await makeAgent(testConfig(), ai, { threads });
    const picked = [{ title: '고른 글', url: 'https://picked.example/1', note: '', hook: '통념 깨기 + 숫자', structure: '공감 → 공식 → 조합 3개' }];
    await agent.postNow(null, ['threads'], picked);
    const research = (ai.write as unknown as { mock: { calls: [{ research: { references: { url: string; chosen?: boolean }[]; hooks: string[] } }][] } }).mock.calls[0][0].research;
    expect(research.references.map((r) => [r.url, !!r.chosen])).toEqual([['https://picked.example/1', true], ['https://ref.example.com/a', false]]);
    expect(research.hooks[0]).toBe('통념 깨기 + 숫자');
  });
});

describe('comments', () => {
  const config = testConfig((c) => (c.schedule.slots = []));

  it('replies, hides and escalates per policy, once per comment', async () => {
    const ig = fakePlatform('instagram');
    ig.inbox = [
      comment({ id: 'a', text: '정보 고마워요' }),
      comment({ id: 'b', text: '광고 보고 오세요 http://spam.example' }),
      comment({ id: 'c', text: '환불해 주세요' }),
      comment({ id: 'd', text: '내 댓글', author: 'danbaek.meal' }),
    ];
    const ai = fakeAi();
    const agent = await runOnce(config, ai, { instagram: ig });
    expect(ig.replies).toEqual([['a', '고마워요! 😊']]);
    expect(ig.hidden).toEqual(['b']);
    expect(agent.state.inbox.map((i) => i.key)).toEqual(['instagram:c']);
    expect(await data.read('inbox.md')).toContain('추천 답글: 불편을 드려 죄송해요. DM 주세요');
    expect(agent.notification()).toContain('댓글 확인 필요');

    const ai2 = fakeAi();
    await runOnce(config, ai2, { instagram: ig });
    expect(ai2.calls).toEqual([]);
    expect(ig.replies).toHaveLength(1);
  });

  it('caps replies per run; the rest wait for the next run', async () => {
    const ig = fakePlatform('instagram');
    ig.inbox = [1, 2, 3].map((n) => comment({ id: `p${n}`, at: `2026-10-09T0${n}:00:00Z` }));
    clock = new Date('2026-10-09T04:00:00Z');
    const capped = testConfig((c) => ((c.schedule.slots = []), (c.comments.maxRepliesPerRun = 2)));
    await runOnce(capped, fakeAi(), { instagram: ig });
    expect(ig.replies.map((r) => r[0])).toEqual(['p1', 'p2']);
    await runOnce(capped, fakeAi(), { instagram: ig });
    expect(ig.replies.map((r) => r[0])).toEqual(['p1', 'p2', 'p3']);
  });

  it('a reply Claude writes with a foreign link goes to a person instead', async () => {
    const ig = fakePlatform('instagram');
    ig.inbox = [comment({ id: 'q', text: '어디서 사요?' })];
    const ai = fakeAi({ triageComments: async () => [{ id: 'q', category: 'purchase', action: 'reply', reply: '여기요 https://other.example', reason: '구매' }] });
    const agent = await runOnce(config, ai, { instagram: ig });
    expect(ig.replies).toEqual([]);
    expect(agent.state.inbox[0].reason).toContain('허용되지 않은 링크');
  });

  it('when Claude fails nothing is recorded, so the next run tries again', async () => {
    const ig = fakePlatform('instagram');
    ig.inbox = [comment()];
    const agent = await runOnce(config, fakeAi({ triageComments: async () => Promise.reject(new PromoAiError('x')) }), { instagram: ig });
    expect(agent.state.comments).toEqual({});
    await runOnce(config, fakeAi(), { instagram: ig });
    expect(ig.replies).toHaveLength(1);
  });

  it('comments marked handled in the dashboard leave the inbox', async () => {
    const ig = fakePlatform('instagram');
    ig.inbox = [comment({ id: 'c', text: '환불해 주세요' })];
    await runOnce(config, fakeAi(), { instagram: ig });
    await data.write('inbox-done.json', JSON.stringify(['instagram:c']));
    const agent = await runOnce(config, fakeAi(), { instagram: ig });
    expect(agent.state.inbox).toEqual([]);
    expect(await data.read('inbox.md')).toContain('지금은 없어요');
  });

  it('a failed reply is escalated with the error', async () => {
    const ig = fakePlatform('instagram');
    ig.inbox = [comment()];
    ig.comments!.reply = async () => {
      throw new PlatformError('Invalid OAuth access token', 400, 190);
    };
    const agent = await runOnce(config, fakeAi(), { instagram: ig });
    expect(agent.state.inbox[0].reason).toContain('토큰이 만료됐거나');
  });

  it('a platform whose comment list fails does not stop the others', async () => {
    const ig = fakePlatform('instagram');
    ig.comments!.list = async () => {
      throw new PlatformError('down', 500);
    };
    const th = fakePlatform('threads');
    th.inbox = [comment({ platform: 'threads', id: 't1' })];
    const agent = await runOnce(config, fakeAi(), { instagram: ig, threads: th });
    expect(th.replies).toHaveLength(1);
    expect(agent.events.some((e) => e.kind === 'warn' && e.message.includes('인스타그램 댓글을 가져오지 못했어요'))).toBe(true);
  });
});

describe('state', () => {
  it('a broken state.json is set aside, not fatal', async () => {
    await data.write('state.json', '{oops');
    const agent = await makeAgent(testConfig(), fakeAi(), {});
    expect(agent.events[0]).toMatchObject({ kind: 'warn' });
    expect((await data.list('.')).some((f) => f.startsWith('state.corrupt-'))).toBe(true);
  });

  it('draft status from results', () => {
    const r = (status: 'ok' | 'manual' | 'failed') => ({ status, id: null, url: null, error: null, at: '', attempts: 1 });
    expect(draftStatus([r('ok'), r('manual')])).toBe('published');
    expect(draftStatus([r('ok'), r('failed')])).toBe('partial');
    expect(draftStatus([r('failed'), undefined])).toBe('failed');
  });
});
