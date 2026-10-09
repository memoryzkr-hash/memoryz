/**
 * Platform limits and brand rules (docs/promo/PLAN.md §4 ④, §8).
 * normalizeContent fixes what code can fix safely; checkContent reports the rest.
 */
import { charLength, countHashtags, findBannedWords, findUrls, isAllowedUrl, threadsLength, uniqueHashtags } from './text';
import type { ContentSet, Issue, PlatformId, PromoConfig } from './types';

export const LIMITS = {
  threadsPost: 500,
  instagramCaption: 2200,
  instagramHashtags: 30,
  cardTitle: 40,
  cardBody: 220,
  blogTitle: 80,
  blogBodyMin: 600,
  blogTags: 10,
} as const;

const IMAGE_LINE = /^\{\{image:(\d+)\}\}$/;

/** Text Instagram receives: caption, blank line, hashtags. */
export function instagramCaption(caption: string, hashtags: string[]): string {
  return hashtags.length ? `${caption.trim()}\n\n${hashtags.join(' ')}` : caption.trim();
}

function hasDisclosure(text: string, disclosure: string): boolean {
  return text.toLowerCase().includes(disclosure.toLowerCase());
}

export function normalizeContent(input: ContentSet, config: PromoConfig): ContentSet {
  const c: ContentSet = structuredClone(input);
  const disclosure = config.brand.disclosure;

  if (c.threads) {
    c.threads.posts = c.threads.posts.map((p) => p.trim()).filter(Boolean).slice(0, config.platforms.threads.maxPosts);
    if (disclosure && c.threads.posts.length && !hasDisclosure(c.threads.posts[0], disclosure)) {
      c.threads.posts[0] = `${disclosure} ${c.threads.posts[0]}`;
    }
  }

  if (c.instagram) {
    const fixed = config.content.hashtags.fixed;
    const tags = uniqueHashtags([...fixed, ...c.instagram.hashtags]);
    c.instagram.hashtags = tags.slice(0, Math.min(config.content.hashtags.max, LIMITS.instagramHashtags));
    c.instagram.caption = c.instagram.caption.trim();
    if (disclosure && !hasDisclosure(c.instagram.caption, disclosure)) c.instagram.caption = `${disclosure} ${c.instagram.caption}`;
    c.instagram.cards = c.instagram.cards
      .map((card) => ({ title: card.title.trim(), body: card.body.trim() }))
      .filter((card) => card.title || card.body)
      .slice(0, config.platforms.instagram.maxCards);
  }

  if (c.blog) {
    c.blog.title = c.blog.title.trim();
    c.blog.tags = uniqueHashtags(c.blog.tags)
      .map((t) => t.slice(1))
      .slice(0, LIMITS.blogTags);
    const cards = c.instagram?.cards.length ?? 0;
    c.blog.body = c.blog.body
      .split('\n')
      .filter((line) => {
        const m = IMAGE_LINE.exec(line.trim());
        return !m || (Number(m[1]) >= 1 && Number(m[1]) <= cards);
      })
      .join('\n')
      .trim();
    if (disclosure && !hasDisclosure(c.blog.body, disclosure)) c.blog.body = `${disclosure}\n\n${c.blog.body}`;
  }
  return c;
}

/** Links the content may carry: brand links, the blog itself, and sources found in research. */
export function allowedUrls(config: PromoConfig, sourceUrls: string[]): string[] {
  const urls = [...config.brand.links.map((l) => l.url), ...sourceUrls];
  if (config.platforms.wordpress.url) urls.push(config.platforms.wordpress.url);
  return urls;
}

export function checkContent(c: ContentSet, config: PromoConfig, allowed: string[]): Issue[] {
  const issues: Issue[] = [];
  const err = (platform: PlatformId | 'all', message: string) => issues.push({ severity: 'error', platform, message });
  const warn = (platform: PlatformId | 'all', message: string) => issues.push({ severity: 'warn', platform, message });

  const texts: [PlatformId, string][] = [];
  const want = config.platforms;

  if (want.threads.enabled) {
    if (!c.threads || !c.threads.posts.length) err('threads', '쓰레드 글이 없어요');
    else {
      c.threads.posts.forEach((p, i) => {
        const n = threadsLength(p);
        if (n > LIMITS.threadsPost) err('threads', `쓰레드 ${i + 1}번 글이 ${n}자예요 (최대 ${LIMITS.threadsPost}자)`);
        texts.push(['threads', p]);
      });
    }
  }

  if (want.instagram.enabled) {
    if (!c.instagram) err('instagram', '인스타그램 글이 없어요');
    else {
      const full = instagramCaption(c.instagram.caption, c.instagram.hashtags);
      if (!c.instagram.caption) err('instagram', '인스타그램 캡션이 비어 있어요');
      if (charLength(full) > LIMITS.instagramCaption) err('instagram', `인스타그램 캡션이 ${charLength(full)}자예요 (해시태그 포함 최대 ${LIMITS.instagramCaption}자)`);
      if (countHashtags(full) > LIMITS.instagramHashtags) err('instagram', `해시태그가 ${LIMITS.instagramHashtags}개를 넘어요`);
      if (!c.instagram.cards.length) err('instagram', '카드뉴스 카드가 없어요');
      c.instagram.cards.forEach((card, i) => {
        if (charLength(card.title) > LIMITS.cardTitle) warn('instagram', `카드 ${i + 1} 제목이 길어요 (${charLength(card.title)}자, 권장 ${LIMITS.cardTitle}자 이하)`);
        if (charLength(card.body) > LIMITS.cardBody) err('instagram', `카드 ${i + 1} 본문이 이미지에 다 안 들어가요 (${charLength(card.body)}자, 최대 ${LIMITS.cardBody}자)`);
      });
      texts.push(['instagram', full]);
      c.instagram.cards.forEach((card) => texts.push(['instagram', `${card.title}\n${card.body}`]));
    }
  }

  if (want.wordpress.enabled || want.naver.enabled) {
    const p: PlatformId = want.wordpress.enabled ? 'wordpress' : 'naver';
    if (!c.blog) err(p, '블로그 글이 없어요');
    else {
      if (!c.blog.title) err(p, '블로그 제목이 비어 있어요');
      if (charLength(c.blog.title) > LIMITS.blogTitle) warn(p, `블로그 제목이 길어요 (${charLength(c.blog.title)}자)`);
      if (charLength(c.blog.body) < LIMITS.blogBodyMin) warn(p, `블로그 본문이 짧아요 (${charLength(c.blog.body)}자)`);
      texts.push([p, `${c.blog.title}\n${c.blog.body}`]);
    }
  }

  for (const [platform, text] of texts) {
    for (const w of findBannedWords(text, config.content.bannedWords)) err(platform, `금지 표현 "${w}"이(가) 들어 있어요`);
    for (const url of findUrls(text)) if (!isAllowedUrl(url, allowed)) err(platform, `허용되지 않은 링크가 있어요: ${url}`);
  }

  return dedupe(issues);
}

function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.severity}|${i.platform}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const hasBlocking = (issues: Issue[]) => issues.some((i) => i.severity === 'error');
