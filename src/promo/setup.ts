/** Builds the agent's dependencies from promo/ files and environment variables (docs/promo/SETUP.md). */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseConfig } from './core/config';
import { fingerprint, parseSealed, pickToken, seal, type SealedTokens } from './core/secrets';
import type { DataDir } from './core/store';
import type { BrandDocs, PromoConfig, PromoState } from './core/types';
import { describeError } from './errors';
import { createGitHubHost, type MediaHost } from './media/host';
import { createInstagram, refreshInstagramToken } from './platforms/instagram';
import { createNaverExport } from './platforms/naver';
import { createThreads, refreshThreadsToken } from './platforms/threads';
import type { Platform } from './platforms/types';
import { createWordPress } from './platforms/wordpress';

export type Env = Record<string, string | undefined>;

const REFRESH_EVERY_DAYS = 7;

export async function loadConfigDir(dir: string): Promise<{ config: PromoConfig; docs: BrandDocs; errors: string[] }> {
  const read = async (name: string) => {
    try {
      return await readFile(join(dir, name), 'utf8');
    } catch {
      return null;
    }
  };
  const yml = await read('config.yml');
  if (yml === null) {
    const { config } = parseConfig('');
    return { config, docs: emptyDocs(), errors: [`${join(dir, 'config.yml')}이(가) 없어요`] };
  }
  const { config, errors } = parseConfig(yml);
  const docs: BrandDocs = {
    brand: (await read('brand.md')) ?? '',
    faq: (await read('faq.md')) ?? '',
    references: (await read('references.md')) ?? '',
    templates: {
      blog: (await read('templates/blog.md')) ?? '',
      instagram: (await read('templates/instagram.md')) ?? '',
      threads: (await read('templates/threads.md')) ?? '',
    },
  };
  if (!docs.brand.trim()) errors.push(`${join(dir, 'brand.md')}에 브랜드 설명을 적어 주세요`);
  return { config, docs, errors };
}

const emptyDocs = (): BrandDocs => ({ brand: '', faq: '', references: '', templates: { blog: '', instagram: '', threads: '' } });

/** Which environment variables each enabled platform still needs. */
export function missingEnv(config: PromoConfig, env: Env, needsAi: boolean): string[] {
  const miss: string[] = [];
  const need = (k: string) => !env[k]?.trim() && miss.push(k);
  if (needsAi) need('ANTHROPIC_API_KEY');
  if (config.platforms.threads.enabled) need('THREADS_ACCESS_TOKEN');
  if (config.platforms.instagram.enabled) {
    need('INSTAGRAM_ACCESS_TOKEN');
    if ((env.INSTAGRAM_API_HOST ?? '').includes('facebook')) need('INSTAGRAM_USER_ID');
  }
  if (config.platforms.wordpress.enabled) {
    need('WORDPRESS_USER');
    need('WORDPRESS_APP_PASSWORD');
  }
  return miss;
}

export interface TokenOutcome {
  tokens: { threads?: string; instagram?: string };
  notes: string[];
}

/**
 * Picks each Meta token (a stored refresh beats the Secret it came from) and refreshes it weekly.
 * Refreshed tokens are only kept when PROMO_SECRET_KEY is set; otherwise the Secret is used as-is.
 */
export async function maintainTokens(env: Env, data: DataDir, state: PromoState, now: Date, opts: { refresh: boolean; config: PromoConfig }): Promise<TokenOutcome> {
  const secret = env.PROMO_SECRET_KEY?.trim() || null;
  const sealed: SealedTokens = parseSealed(await data.read('secrets.enc.json'));
  const notes: string[] = [];
  const out: TokenOutcome['tokens'] = {};
  let changed = false;

  const igLogin = !(env.INSTAGRAM_API_HOST ?? '').includes('facebook');
  const plans = [
    { key: 'threads' as const, env: env.THREADS_ACCESS_TOKEN?.trim(), on: true, refreshable: true, refresh: refreshThreadsToken },
    { key: 'instagram' as const, env: env.INSTAGRAM_ACCESS_TOKEN?.trim(), on: true, refreshable: igLogin, refresh: refreshInstagramToken },
  ];
  for (const p of plans) {
    if (!p.env || !p.on) continue;
    const picked = pickToken(p.env, sealed[p.key], secret);
    out[p.key] = picked.token;
    if (!p.refreshable || !opts.refresh) continue;
    if (!secret) {
      notes.push(`${p.key === 'threads' ? '쓰레드' : '인스타그램'} 토큰 자동 연장이 꺼져 있어요 (PROMO_SECRET_KEY 없음) — 60일마다 토큰을 새로 넣어 주세요`);
      continue;
    }
    const last = state.tokens[p.key]?.refreshedAt;
    const fresh = last && now.getTime() - new Date(last).getTime() < REFRESH_EVERY_DAYS * 86400000 && picked.refreshed;
    if (fresh) continue;
    try {
      const r = await p.refresh(picked.token);
      out[p.key] = r.token;
      sealed[p.key] = { ...seal(secret, r.token), savedAt: now.toISOString(), from: fingerprint(p.env) };
      state.tokens[p.key] = { refreshedAt: now.toISOString(), expiresAt: r.expiresIn ? new Date(now.getTime() + r.expiresIn * 1000).toISOString() : null };
      changed = true;
    } catch (e) {
      notes.push(`${p.key === 'threads' ? '쓰레드' : '인스타그램'} 토큰을 연장하지 못했어요: ${describeError(e)}`);
    }
  }
  if (changed) await data.write('secrets.enc.json', `${JSON.stringify(sealed, null, 1)}\n`);
  return { tokens: out, notes };
}

export function buildPlatforms(config: PromoConfig, env: Env, tokens: TokenOutcome['tokens'], data: DataDir, linkBase: string | null): Partial<Record<keyof PromoConfig['platforms'], Platform>> {
  const p: Partial<Record<keyof PromoConfig['platforms'], Platform>> = {};
  // An account is usable as soon as it is registered; `enabled` only decides scheduled posting.
  if (tokens.threads) p.threads = createThreads(tokens.threads, { attachImage: config.platforms.threads.attachImage });
  if (tokens.instagram) {
    p.instagram = createInstagram(tokens.instagram, { host: env.INSTAGRAM_API_HOST?.trim() || undefined, userId: env.INSTAGRAM_USER_ID?.trim() || undefined });
  }
  if (config.platforms.wordpress.url && env.WORDPRESS_USER && env.WORDPRESS_APP_PASSWORD) {
    p.wordpress = createWordPress(config.platforms.wordpress.url, env.WORDPRESS_USER, env.WORDPRESS_APP_PASSWORD, { status: config.platforms.wordpress.status });
  }
  p.naver = createNaverExport(data.root, linkBase);
  return p;
}

export function buildHost(config: PromoConfig, env: Env): MediaHost | null {
  const repo = config.media.repo || env.GITHUB_REPOSITORY;
  const token = env.PROMO_MEDIA_TOKEN || env.GITHUB_TOKEN;
  if (!repo || !token) return null;
  return createGitHubHost(repo, config.media.branch, token);
}

/** `--platform blog` means the blog in use: WordPress when it is set up, otherwise the Naver/Tistory export. */
export function resolvePlatforms(arg: string | null, config: PromoConfig, env: Env): (keyof PromoConfig['platforms'])[] {
  if (!arg || arg === 'all') return [];
  if (arg === 'blog') {
    if (config.platforms.wordpress.enabled || config.platforms.naver.enabled) return (['wordpress', 'naver'] as const).filter((p) => config.platforms[p].enabled);
    return config.platforms.wordpress.url && env.WORDPRESS_USER ? ['wordpress'] : ['naver'];
  }
  if (arg === 'threads' || arg === 'instagram' || arg === 'wordpress' || arg === 'naver') return [arg];
  throw new Error(`모르는 플랫폼이에요: ${arg} (blog, instagram, threads, all)`);
}

export function dataLinkBase(env: Env): string | null {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) return null;
  const server = env.GITHUB_SERVER_URL || 'https://github.com';
  return `${server}/${repo}/blob/${env.PROMO_DATA_BRANCH || 'promo-data'}`;
}

/** Slack and Discord both accept a JSON POST; each reads its own field. */
export async function sendWebhook(url: string | undefined, text: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, content: text.slice(0, 1900) }) });
    return res.ok ? null : `알림을 보내지 못했어요 (HTTP ${res.status})`;
  } catch (e) {
    return `알림을 보내지 못했어요 (${(e as Error).message})`;
  }
}
