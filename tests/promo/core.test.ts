import { describe, expect, it } from 'vitest';
import { capReplies, decide, pendingComments, replyProblem } from '../../src/promo/core/comments';
import { DEFAULT_CONFIG, parseConfig } from '../../src/promo/core/config';
import { parseDraft, serializeDraft } from '../../src/promo/core/draft';
import { allowedUrls, checkContent, hasBlocking, instagramCaption, normalizeContent } from '../../src/promo/core/rules';
import { addDays, draftIdFor, dueSlots, localParts, nextSlot, pickSlot } from '../../src/promo/core/schedule';
import { emptyState, parseState, pruneState } from '../../src/promo/core/state';
import { findUrls, isAllowedUrl, threadsLength, uniqueHashtags } from '../../src/promo/core/text';
import type { CommentDecision } from '../../src/promo/core/types';
import { comment, testConfig, testContent, testDraft } from './fixtures';

describe('parseConfig', () => {
  const minimal = 'brand:\n  name: 단백한끼\nplatforms:\n  threads: { enabled: true }\n';

  it('fills defaults around a minimal file', () => {
    const { config, errors } = parseConfig(minimal);
    expect(errors).toEqual([]);
    expect(config.timeZone).toBe('Asia/Seoul');
    expect(config.platforms.threads.enabled).toBe(true);
    expect(config.comments.actions.complaint).toBe('escalate');
  });

  it('accepts Korean weekdays and daily', () => {
    const { config, errors } = parseConfig(`${minimal}schedule:\n  slots:\n    - { days: [월, 금], time: "08:30" }\n    - { days: daily, time: "21:00" }\n`);
    expect(errors).toEqual([]);
    expect(config.schedule.slots[0]).toEqual({ days: ['mon', 'fri'], time: '08:30' });
    expect(config.schedule.slots[1].days).toHaveLength(7);
  });

  it('explains every wrong value in Korean instead of throwing', () => {
    const { errors } = parseConfig(
      'timeZone: Mars/Base\nmode: yolo\nbrand: { name: x, colors: { accent: red } }\nschedule:\n  slots: [{ days: [funday], time: "25:00" }]\n' +
        'platforms: { wordpress: { enabled: true } }\ncomments: { actions: { praise: shout, flirt: reply } }\nmedia: { repo: "no slash" }\n',
    );
    const text = errors.join('\n');
    expect(text).toContain('timeZone');
    expect(text).toContain('mode');
    expect(text).toContain('brand.colors.accent');
    expect(text).toContain('slots[0].time');
    expect(text).toContain('slots[0].days');
    expect(text).toContain('platforms.wordpress.url');
    expect(text).toContain('comments.actions.praise');
    expect(text).toContain('comments.actions.flirt');
    expect(text).toContain('media.repo');
  });

  it('broken YAML is an error; no automation switched on is fine', () => {
    expect(parseConfig('brand: [').errors[0]).toContain('읽지 못했어요');
    expect(parseConfig('brand: { name: x }').errors).toEqual([]);
  });

  it('reads a cycle per platform, falling back to the shared one', () => {
    const { config, errors } = parseConfig('brand: { name: x }\nplatforms:\n  threads: { enabled: true, schedule: { days: daily, time: "08:00" } }\n  instagram: { enabled: true, schedule: [{ days: [화, 목], time: "19:00" }] }\n');
    expect(errors).toEqual([]);
    expect(config.platforms.threads.schedule).toEqual([{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], time: '08:00' }]);
    expect(config.platforms.instagram.schedule).toEqual([{ days: ['tue', 'thu'], time: '19:00' }]);
    expect(config.platforms.naver.schedule).toBeNull();
    expect(parseConfig('brand: { name: x }\nplatforms: { threads: { schedule: { days: [x], time: "1" } } }').errors.join()).toContain('platforms.threads.schedule');
  });

  it('adds # to fixed hashtags and rejects bad links', () => {
    const { config, errors } = parseConfig(
      'brand: { name: a, links: [{ label: x, url: "ftp://x" }] }\nplatforms: { threads: { enabled: true } }\ncontent: { hashtags: { fixed: [단백한끼] } }\n',
    );
    expect(config.content.hashtags.fixed).toEqual(['#단백한끼']);
    expect(errors.join()).toContain('brand.links[0].url');
  });
});

describe('schedule', () => {
  const slots = [{ days: ['mon', 'wed', 'fri'] as const, time: '09:00' }].map((s) => ({ ...s, days: [...s.days] }));
  // 2026-10-09 is a Friday. 00:30Z = 09:30 KST.
  const at = (iso: string) => new Date(iso);

  it('reads the local wall clock', () => {
    expect(localParts(at('2026-10-09T00:30:00Z'), 'Asia/Seoul')).toEqual({ date: '2026-10-09', time: '09:30', weekday: 'fri' });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('a slot is due from its time until catchUpHours later, once', () => {
    const none = () => false;
    expect(dueSlots(at('2026-10-08T23:59:00Z'), 'Asia/Seoul', slots, 6, none)).toEqual([]); // 08:59
    expect(dueSlots(at('2026-10-09T00:00:00Z'), 'Asia/Seoul', slots, 6, none)).toEqual(['2026-10-09@09:00']);
    expect(dueSlots(at('2026-10-09T06:00:00Z'), 'Asia/Seoul', slots, 6, none)).toEqual(['2026-10-09@09:00']); // 15:00
    expect(dueSlots(at('2026-10-09T06:01:00Z'), 'Asia/Seoul', slots, 6, none)).toEqual([]);
    expect(dueSlots(at('2026-10-09T00:30:00Z'), 'Asia/Seoul', slots, 6, (k) => k === '2026-10-09@09:00')).toEqual([]);
  });

  it('skips days that are not listed', () => {
    expect(dueSlots(at('2026-10-10T00:30:00Z'), 'Asia/Seoul', slots, 6, () => false)).toEqual([]); // Saturday
  });

  it('a late-night slot still runs just after midnight', () => {
    const late = [{ days: ['thu' as const], time: '23:30' }];
    expect(dueSlots(at('2026-10-08T15:10:00Z'), 'Asia/Seoul', late, 6, () => false)).toEqual(['2026-10-08@23:30']); // Fri 00:10
  });

  it('runs only the newest of piled-up slots', () => {
    expect(pickSlot(['a', 'b', 'c'])).toEqual({ run: 'c', skipped: ['a', 'b'] });
    expect(pickSlot([])).toEqual({ run: null, skipped: [] });
  });

  it('finds the next slot for the countdown', () => {
    // Fri 09:30 KST → next is Mon 09:00 (Fri slot already passed)
    expect(nextSlot(at('2026-10-09T00:30:00Z'), 'Asia/Seoul', slots)).toMatchObject({ key: '2026-10-12@09:00', weekday: 'mon', minutes: 3 * 24 * 60 - 30 });
    expect(nextSlot(at('2026-10-08T23:00:00Z'), 'Asia/Seoul', slots)).toMatchObject({ key: '2026-10-09@09:00', minutes: 60 });
    expect(nextSlot(at('2026-10-09T00:30:00Z'), 'Asia/Seoul', [])).toBeNull();
  });

  it('draft ids come from the slot or the clock', () => {
    expect(draftIdFor(at('2026-10-09T00:30:00Z'), 'Asia/Seoul', '2026-10-09@09:00')).toBe('2026-10-09-0900');
    expect(draftIdFor(at('2026-10-09T05:32:00Z'), 'Asia/Seoul', null)).toBe('2026-10-09-1432-now');
  });
});

describe('text', () => {
  it('Threads counts emoji by bytes, Korean by characters', () => {
    expect(threadsLength('가나다')).toBe(3);
    expect(threadsLength('👍')).toBe(4);
    expect(threadsLength('a👍b')).toBe(6);
  });

  it('hashtags are cleaned and de-duplicated', () => {
    expect(uniqueHashtags(['단백질', '#단백질', ' #도시락 ', '#직장인 점심', '#'])).toEqual(['#단백질', '#도시락', '#직장인점심']);
  });

  it('urls: found, trailing punctuation dropped, allowed by prefix', () => {
    expect(findUrls('여기요 https://a.com/x. 그리고 (https://b.com)')).toEqual(['https://a.com/x', 'https://b.com']);
    expect(isAllowedUrl('https://a.com/x/y', ['https://a.com/x'])).toBe(true);
    expect(isAllowedUrl('https://a.com/xy', ['https://a.com/x'])).toBe(false);
    expect(isAllowedUrl('https://evil.com/?https://a.com', ['https://a.com'])).toBe(false);
  });
});

describe('rules', () => {
  const config = testConfig();
  const allowed = allowedUrls(config, []);

  it('normalize adds fixed hashtags, trims to max, cleans blog tags', () => {
    const c = normalizeContent(testContent(), config);
    expect(c.instagram!.hashtags[0]).toBe('#단백한끼');
    expect(c.instagram!.hashtags.length).toBeLessThanOrEqual(5);
    expect(c.blog!.tags).toEqual(['단백질', '도시락', '직장인점심']);
  });

  it('normalize forces the ad disclosure into every platform', () => {
    const c = normalizeContent(testContent(), testConfig((x) => (x.brand.disclosure = '#광고')));
    expect(c.threads!.posts[0].startsWith('#광고')).toBe(true);
    expect(c.threads!.posts[1].includes('#광고')).toBe(false);
    expect(c.instagram!.caption.startsWith('#광고')).toBe(true);
    expect(c.blog!.body.startsWith('#광고')).toBe(true);
  });

  it('normalize drops image lines that point past the last card', () => {
    const content = testContent();
    content.blog!.body += '\n{{image:9}}\n{{image:1}}';
    const c = normalizeContent(content, config);
    expect(c.blog!.body).not.toContain('{{image:9}}');
    expect(c.blog!.body).toContain('{{image:1}}');
  });

  it('a clean draft has no blocking issues', () => {
    const issues = checkContent(normalizeContent(testContent(), config), config, allowed);
    expect(hasBlocking(issues)).toBe(false);
  });

  it('flags long threads posts, long card text, banned words and foreign links', () => {
    const c = normalizeContent(testContent(), config);
    c.threads!.posts[1] = '가'.repeat(501);
    c.instagram!.cards[1].body = '나'.repeat(221);
    c.instagram!.caption += ' 최고의 도시락 https://evil.example.com';
    const messages = checkContent(c, config, allowed).map((i) => `${i.severity}:${i.message}`);
    expect(messages.some((m) => m.startsWith('error:쓰레드 2번 글이 501자'))).toBe(true);
    expect(messages.some((m) => m.startsWith('error:카드 2 본문'))).toBe(true);
    expect(messages).toContain('error:금지 표현 "최고"이(가) 들어 있어요');
    expect(messages).toContain('error:허용되지 않은 링크가 있어요: https://evil.example.com');
  });

  it('missing platform content is an error only when that platform is on', () => {
    const c = { ...testContent(), threads: null };
    expect(hasBlocking(checkContent(c, config, allowed))).toBe(true);
    expect(hasBlocking(checkContent(c, testConfig((x) => (x.platforms.threads.enabled = false)), allowed))).toBe(false);
  });

  it('caption counts hashtags into the 2200 limit', () => {
    expect(instagramCaption(' a ', ['#b', '#c'])).toBe('a\n\n#b #c');
    const c = normalizeContent(testContent(), config);
    c.instagram!.caption = '가'.repeat(2195);
    expect(checkContent(c, config, allowed).some((i) => i.message.includes('최대 2200자'))).toBe(true);
  });
});

describe('draft file', () => {
  it('round-trips through markdown', () => {
    const d = testDraft({ images: ['https://raw.example.com/1.jpg'], results: { threads: { status: 'ok', id: '1', url: 'u', error: null, at: 't', attempts: 1 } } });
    const back = parseDraft(serializeDraft(d));
    expect(back).toEqual(d);
  });

  it('multi-line card titles survive; a card without --- uses its first line as title', () => {
    const d = testDraft();
    d.content.instagram!.cards[0] = { title: '점심 단백질 30g,\n도시락 하나로', body: '부제\n둘째 줄' };
    expect(parseDraft(serializeDraft(d)).content.instagram!.cards[0]).toEqual(d.content.instagram!.cards[0]);
    const text = serializeDraft(testDraft()).replace('1. 닭가슴살 말고도\n---\n', '1. 닭가슴살 말고도\n');
    expect(parseDraft(text).content.instagram!.cards[1]).toEqual({ title: '1. 닭가슴살 말고도', body: '두부, 계란, 연어도 좋아요' });
  });

  it('keeps edits a person makes on GitHub', () => {
    const text = serializeDraft(testDraft())
      .replace('status: draft', 'status: approved')
      .replace('점심 단백질 30g 채우는 현실적인 방법 정리해 봄', '고친 첫 글\n두 줄로');
    const d = parseDraft(text);
    expect(d.status).toBe('approved');
    expect(d.content.threads!.posts[0]).toBe('고친 첫 글\n두 줄로');
  });

  it('a blog body with its own headings survives', () => {
    const d = parseDraft(serializeDraft(testDraft()));
    expect(d.content.blog!.body).toContain('## 왜 점심 단백질일까');
    expect(d.content.blog!.body).toContain('## 구독 안내');
  });

  it('removing a card block removes the card', () => {
    const text = serializeDraft(testDraft()).replace(/##### 📝 instagram\.card[^\n]*\n1\. 닭가슴살 말고도\n---\n두부, 계란, 연어도 좋아요\n/, '');
    expect(parseDraft(text).content.instagram!.cards.map((c) => c.title)).toEqual(['점심 단백질 30g', '구독하고 받아보세요']);
  });

  it('bad status or missing front matter is a clear error', () => {
    expect(() => parseDraft('no front matter')).toThrow('정보 부분');
    expect(() => parseDraft(serializeDraft(testDraft()).replace('status: draft', 'status: maybe'))).toThrow('status');
  });
});

describe('comment policy', () => {
  const config = testConfig();
  const ctx = { config, allowedLinks: allowedUrls(config, []), canHide: true, canReply: true };
  const proposal = (p: Partial<CommentDecision>): CommentDecision => ({ id: 'c1', category: 'praise', action: 'reply', reply: '감사합니다 😊', reason: '칭찬', ...p });

  it('picks only new comments from others, oldest first', () => {
    const state = emptyState();
    state.comments['instagram:old'] = { action: 'reply', category: 'praise', at: 'x' };
    const list = [
      comment({ id: 'b', at: '2026-10-09T03:00:00Z' }),
      comment({ id: 'a', at: '2026-10-09T02:00:00Z' }),
      comment({ id: 'old' }),
      comment({ id: 'mine', author: 'Danbaek.Meal' }),
      comment({ id: 'answered', repliedByMe: true }),
      comment({ id: 'ancient', at: '2026-09-01T00:00:00Z' }),
    ];
    const ids = pendingComments(list, state, { instagram: 'danbaek.meal' }, new Date('2026-10-02T00:00:00Z')).map((c) => c.id);
    expect(ids).toEqual(['a', 'b']);
  });

  it('config decides; Claude can only be more careful', () => {
    expect(decide(comment(), proposal({}), ctx).action).toBe('reply');
    expect(decide(comment(), proposal({ action: 'escalate' }), ctx).action).toBe('escalate');
    expect(decide(comment(), proposal({ category: 'complaint', action: 'reply' }), ctx).action).toBe('escalate');
    expect(decide(comment(), proposal({ category: 'spam', action: 'reply' }), ctx).action).toBe('hide');
    expect(decide(comment(), proposal({ category: 'other', action: 'reply' }), ctx).action).toBe('ignore');
    expect(decide(comment(), undefined, ctx).action).toBe('escalate');
  });

  it('unsafe replies go to a person', () => {
    expect(decide(comment(), proposal({ reply: '여기서 사세요 https://evil.example.com' }), ctx).reason).toContain('링크');
    expect(decide(comment(), proposal({ reply: '최고예요' }), ctx).action).toBe('escalate');
    expect(decide(comment(), proposal({ reply: '' }), ctx).action).toBe('escalate');
    expect(replyProblem('가'.repeat(201), config, [])).toContain('너무 길어요');
    expect(replyProblem('구독은 https://danbaek.example.com/subscribe 에서!', config, ctx.allowedLinks)).toBeNull();
  });

  it('a platform that cannot hide or reply escalates instead', () => {
    expect(decide(comment(), proposal({ category: 'spam' }), { ...ctx, canHide: false }).action).toBe('escalate');
    expect(decide(comment(), proposal({}), { ...ctx, canReply: false }).action).toBe('escalate');
  });

  it('caps replies per run but lets hides through', () => {
    const d = (action: 'reply' | 'hide', id: string) => ({ comment: comment({ id }), category: 'praise' as const, action, reply: '', reason: '' });
    const { now, later } = capReplies([d('reply', '1'), d('hide', '2'), d('reply', '3'), d('reply', '4')], 2);
    expect(now.map((x) => x.comment.id)).toEqual(['1', '2', '3']);
    expect(later.map((x) => x.comment.id)).toEqual(['4']);
  });
});

describe('state', () => {
  it('missing file is a fresh state; a broken one is flagged', () => {
    expect(parseState(null)).toEqual({ state: emptyState(), corrupt: false });
    expect(parseState('{nope').corrupt).toBe(true);
    expect(parseState('{"version":2}').corrupt).toBe(true);
  });

  it('pruning drops old comments and inbox items', () => {
    const s = emptyState();
    s.comments['a:1'] = { action: 'reply', category: 'praise', at: '2026-01-01T00:00:00Z' };
    s.comments['a:2'] = { action: 'reply', category: 'praise', at: '2026-10-01T00:00:00Z' };
    const p = pruneState(s, new Date('2026-10-09T00:00:00Z'));
    expect(Object.keys(p.comments)).toEqual(['a:2']);
  });

  it('default config is valid on its own except for brand and platforms', () => {
    expect(DEFAULT_CONFIG.comments.actions.spam).toBe('hide');
  });
});

describe('picked references', () => {
  it('reads a set or a list, drops broken entries and unsafe links', async () => {
    const { parseChosen } = await import('../../src/promo/core/references');
    const list = parseChosen(JSON.stringify({ references: [{ title: '좋은 글', url: 'https://a.example', kind: 'blog', hook: 'h' }, { title: 'x', url: 'javascript:alert(1)' }, { excerpt: '붙여넣은 인기 글 첫 줄\n둘째 줄' }, 3] }));
    expect(list.map((r) => [r.title, r.kind, r.url])).toEqual([
      ['좋은 글', 'blog', 'https://a.example'],
      ['붙여넣은 인기 글 첫 줄', 'other', ''],
    ]);
    expect(parseChosen('{nope')).toEqual([]);
    expect(parseChosen(null)).toEqual([]);
  });
});
