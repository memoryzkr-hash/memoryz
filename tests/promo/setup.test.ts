/** setup.ts: the example promo/ folder is valid, missing secrets are named, tokens are refreshed weekly. */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyState } from '../../src/promo/core/state';
import { DataDir } from '../../src/promo/core/store';
import { dataLinkBase, loadConfigDir, maintainTokens, missingEnv } from '../../src/promo/setup';
import { testConfig } from './fixtures';

describe('example promo/ folder', () => {
  it('loads without errors', async () => {
    const { errors, config, docs } = await loadConfigDir(join(import.meta.dirname, '../../promo'));
    expect(errors).toEqual([]);
    expect(config.brand.name).toBeTruthy();
    expect(docs.templates.blog).toContain('제목');
  });

  it('a missing folder is one clear error', async () => {
    expect((await loadConfigDir('/nope')).errors[0]).toContain('config.yml');
  });
});

describe('missingEnv', () => {
  it('names exactly what each enabled platform needs', () => {
    const config = testConfig((c) => (c.platforms.wordpress = { enabled: true, url: 'https://b', status: 'publish' }));
    expect(missingEnv(config, {}, true)).toEqual(['ANTHROPIC_API_KEY', 'THREADS_ACCESS_TOKEN', 'INSTAGRAM_ACCESS_TOKEN', 'WORDPRESS_USER', 'WORDPRESS_APP_PASSWORD']);
    expect(missingEnv(config, { INSTAGRAM_API_HOST: 'graph.facebook.com' }, false)).toContain('INSTAGRAM_USER_ID');
  });

  it('links to the promo-data branch on GitHub', () => {
    expect(dataLinkBase({ GITHUB_REPOSITORY: 'o/r' })).toBe('https://github.com/o/r/blob/promo-data');
    expect(dataLinkBase({})).toBeNull();
  });
});

describe('maintainTokens', () => {
  let data: DataDir;
  let refreshCalls: string[];
  const config = testConfig();
  const now = new Date('2026-10-09T00:00:00Z');

  beforeEach(async () => {
    data = new DataDir(await mkdtemp(join(tmpdir(), 'promo-tok-')));
    refreshCalls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = new URL(url);
        const old = u.searchParams.get('access_token')!;
        refreshCalls.push(`${u.host}:${old}`);
        return new Response(JSON.stringify({ access_token: `${old}+r`, expires_in: 5184000 }));
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const env = { THREADS_ACCESS_TOKEN: 'th1', INSTAGRAM_ACCESS_TOKEN: 'ig1', PROMO_SECRET_KEY: 'k' };

  it('refreshes, stores encrypted, and reuses the refresh for a week', async () => {
    const state = emptyState();
    const a = await maintainTokens(env, data, state, now, { refresh: true, config });
    expect(a.tokens).toEqual({ threads: 'th1+r', instagram: 'ig1+r' });
    expect(refreshCalls).toEqual(['graph.threads.net:th1', 'graph.instagram.com:ig1']);
    const file = (await data.read('secrets.enc.json'))!;
    expect(file).not.toContain('th1');
    expect(state.tokens.threads!.expiresAt).toBe('2026-12-08T00:00:00.000Z');

    const b = await maintainTokens(env, data, state, new Date('2026-10-12T00:00:00Z'), { refresh: true, config });
    expect(b.tokens).toEqual({ threads: 'th1+r', instagram: 'ig1+r' });
    expect(refreshCalls).toHaveLength(2);

    await maintainTokens(env, data, state, new Date('2026-10-17T00:00:00Z'), { refresh: true, config });
    expect(refreshCalls.slice(2)).toEqual(['graph.threads.net:th1+r', 'graph.instagram.com:ig1+r']);
  });

  it('a new Secret replaces the stored refresh', async () => {
    const state = emptyState();
    await maintainTokens(env, data, state, now, { refresh: true, config });
    const r = await maintainTokens({ ...env, THREADS_ACCESS_TOKEN: 'th2' }, data, state, new Date('2026-10-10T00:00:00Z'), { refresh: false, config });
    expect(r.tokens.threads).toBe('th2');
    expect(r.tokens.instagram).toBe('ig1+r');
  });

  it('without PROMO_SECRET_KEY it uses the Secret and says refresh is off', async () => {
    const r = await maintainTokens({ THREADS_ACCESS_TOKEN: 'th1' }, data, emptyState(), now, { refresh: true, config });
    expect(r.tokens).toEqual({ threads: 'th1' });
    expect(refreshCalls).toEqual([]);
    expect(r.notes[0]).toContain('PROMO_SECRET_KEY');
  });

  it('Facebook Login tokens are not refreshed; a failed refresh is a note, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'token too new' } }), { status: 400 })));
    const r = await maintainTokens({ ...env, INSTAGRAM_API_HOST: 'graph.facebook.com' }, data, emptyState(), now, { refresh: true, config });
    expect(r.tokens).toEqual({ threads: 'th1', instagram: 'ig1' });
    expect(r.notes).toEqual(['쓰레드 토큰을 연장하지 못했어요: token too new']);
  });
});
