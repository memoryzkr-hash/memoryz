/** The local app: .env edits, config.yml edits, and the guard that keeps other websites out. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/promo/core/config';
import { setAutomation, setBlogKind, setBrand, setMediaRepo, setWordPressUrl } from '../../src/promo/core/config-edit';
import { quoteEnv, setEnvValues } from '../../src/promo/core/envfile';
import { allowed } from '../../src/promo/server';

describe('setEnvValues', () => {
  it('replaces a key in place and keeps comments and other keys', () => {
    const text = '# 내 키\nANTHROPIC_API_KEY=old\nOTHER=1\n';
    expect(setEnvValues(text, { ANTHROPIC_API_KEY: 'sk-new' })).toBe('# 내 키\nANTHROPIC_API_KEY=sk-new\nOTHER=1\n');
  });

  it('appends new keys and drops duplicates of an updated key', () => {
    const out = setEnvValues('A=1\nB=2\nA=3', { A: 'x', C: 'y' });
    expect(out).toBe('A=x\nB=2\nC=y\n');
  });

  it('starts an empty file', () => {
    expect(setEnvValues('', { THREADS_ACCESS_TOKEN: 'abc' })).toBe('THREADS_ACCESS_TOKEN=abc\n');
  });

  it('quotes values with spaces or quotes so Node reads them back', () => {
    expect(quoteEnv('abcd efgh ijkl')).toBe('"abcd efgh ijkl"');
    expect(quoteEnv('a"b')).toBe('"a\\"b"');
    expect(quoteEnv('https://blog.example.com/')).toBe('https://blog.example.com/');
  });

  it('refuses a malformed key', () => {
    expect(() => setEnvValues('', { 'BAD KEY': '1' })).toThrow();
  });
});

describe('config-edit', () => {
  const base = async () => readFile(join(import.meta.dirname, '../../promo/config.yml'), 'utf8');

  it('turns automation on with a cycle and keeps the file valid', async () => {
    const text = setAutomation(await base(), 'threads', true, { days: ['mon', 'thu'], time: '19:00' } as never);
    const { config, errors } = parseConfig(text);
    expect(errors).toEqual([]);
    expect(config.platforms.threads.enabled).toBe(true);
    expect(config.platforms.threads.schedule?.[0]).toMatchObject({ time: '19:00' });
  });

  it('a blog automates one kind at a time', async () => {
    let text = setWordPressUrl(await base(), 'https://blog.example.com/');
    text = setAutomation(text, 'wordpress', true, { days: ['mon'], time: '09:00' } as never);
    const { config } = parseConfig(text);
    expect(config.platforms.wordpress.url).toBe('https://blog.example.com');
    expect(config.platforms.wordpress.enabled).toBe(true);
    expect(config.platforms.naver.enabled).toBe(false);

    const back = parseConfig(setBlogKind(text, 'tistory')).config;
    expect(back.platforms.naver.kind).toBe('tistory');
    expect(back.platforms.naver.enabled).toBe(true);
    expect(back.platforms.wordpress.enabled).toBe(false);
  });

  it('brand and media repo', async () => {
    const text = setMediaRepo(setBrand(await base(), { name: '새 브랜드', handle: '@new', review: false }), 'me/promo-media');
    const { config, errors } = parseConfig(text);
    expect(errors).toEqual([]);
    expect(config.brand.name).toBe('새 브랜드');
    expect(config.mode).toBe('auto');
    expect(config.media.repo).toBe('me/promo-media');
  });

  it('keeps comments', async () => {
    const before = await base();
    const comment = before.split('\n').find((l) => l.trim().startsWith('#'));
    expect(comment).toBeTruthy();
    expect(setBrand(before, { name: 'x', handle: '', review: true })).toContain(comment!.trim());
  });
});

describe('local server guard', () => {
  it('needs the x-promo header', () => {
    expect(allowed({ headers: {} })).toBe(false);
    expect(allowed({ headers: { 'x-promo': '1' } })).toBe(true);
  });

  it('only from this computer', () => {
    expect(allowed({ headers: { 'x-promo': '1', origin: 'http://localhost:4321' } })).toBe(true);
    expect(allowed({ headers: { 'x-promo': '1', origin: 'http://127.0.0.1:4321' } })).toBe(true);
    expect(allowed({ headers: { 'x-promo': '1', origin: 'https://evil.example' } })).toBe(false);
    expect(allowed({ headers: { 'x-promo': '1', origin: 'http://localhost.evil.example' } })).toBe(false);
  });
});

describe('account form check', () => {
  it('names what is missing before anything is sent', async () => {
    const { accountProblem } = await import('../../src/promo/server');
    expect(accountProblem('threads', { token: '' })).toContain('토큰');
    expect(accountProblem('threads', { token: 'TH' })).toBeNull();
    expect(accountProblem('claude', { token: 'abc' })).toContain('sk-');
    expect(accountProblem('wordpress', { url: 'myblog', user: 'a', password: 'b' })).toContain('https://');
    expect(accountProblem('wordpress', { url: 'https://blog.example.com', user: 'a', password: 'b c' })).toBeNull();
    expect(accountProblem('media', { repo: 'me/media', token: 't' })).toBeNull();
    expect(accountProblem('nope', {})).toBeTruthy();
  });
});
