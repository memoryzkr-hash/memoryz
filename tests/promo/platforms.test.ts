/** Platform adapters against a fake network: every request is recorded and answered by a route table. */
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fingerprint, pickToken, seal, unseal } from '../../src/promo/core/secrets';
import { createGitHubHost } from '../../src/promo/media/host';
import { renderBlogHtml, usedImages } from '../../src/promo/platforms/blog';
import { PlatformError, redact, request, sleep } from '../../src/promo/platforms/http';
import { createInstagram, refreshInstagramToken } from '../../src/promo/platforms/instagram';
import { createNaverExport } from '../../src/promo/platforms/naver';
import { createThreads, refreshThreadsToken } from '../../src/promo/platforms/threads';
import { createWordPress } from '../../src/promo/platforms/wordpress';
import { comment, testDraft } from './fixtures';

type Call = { method: string; url: URL; form: URLSearchParams | null; json: any; headers: Headers; body: unknown };
type Route = (c: Call) => { status?: number; body?: unknown } | undefined;
let calls: Call[];
let routes: Route[];

const fake = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  const ct = headers.get('content-type') ?? '';
  const call: Call = {
    method: init.method ?? 'GET',
    url: new URL(String(url)),
    form: init.body instanceof URLSearchParams ? init.body : null,
    json: ct.includes('json') && typeof init.body === 'string' ? JSON.parse(init.body) : null,
    headers,
    body: init.body,
  };
  calls.push(call);
  for (const r of routes) {
    const res = r(call);
    if (res) return new Response(res.body === undefined ? '' : JSON.stringify(res.body), { status: res.status ?? 200 });
  }
  return new Response(JSON.stringify({ error: { message: `no route for ${call.method} ${call.url.pathname}` } }), { status: 404 });
}) as unknown as typeof fetch;

const on = (method: string, path: string | RegExp, body: unknown, status = 200): Route => (c) =>
  c.method === method && (typeof path === 'string' ? c.url.pathname === path : path.test(c.url.pathname)) ? { body, status } : undefined;
const field = (c: Call, k: string) => c.form?.get(k) ?? c.url.searchParams.get(k);

beforeEach(() => {
  calls = [];
  routes = [];
  vi.spyOn(sleep, 'ms').mockResolvedValue(undefined);
});

describe('http', () => {
  it('turns Graph errors into PlatformError with the code, and never leaks the token', async () => {
    routes.push(on('GET', '/x', { error: { message: 'Invalid OAuth access_token=SECRET123', code: 190 } }, 400));
    const e = await request(fake, 'https://h.example/x', { query: { access_token: 'SECRET123' } }).catch((x) => x);
    expect(e).toBeInstanceOf(PlatformError);
    expect(e.code).toBe(190);
    expect(e.message).not.toContain('SECRET123');
    expect(redact('a?access_token=abc&b=1')).toBe('a?access_token=***&b=1');
  });

  it('retries GET on 5xx but not POST', async () => {
    let n = 0;
    routes.push((c) => (c.url.pathname === '/flaky' ? (++n < 2 ? { status: 502, body: {} } : { body: { ok: true } }) : undefined));
    expect(await request(fake, 'https://h.example/flaky')).toEqual({ ok: true });
    routes.unshift(on('POST', '/p', {}, 500));
    await expect(request(fake, 'https://h.example/p', { form: { a: 1 } })).rejects.toThrow('HTTP 500');
    expect(calls.filter((c) => c.url.pathname === '/p')).toHaveLength(1);
  });
});

describe('threads', () => {
  const T = '/v1.0';
  beforeEach(() => {
    let n = 0;
    routes.push(
      on('GET', `${T}/me`, { id: '99', username: 'danbaek.meal' }),
      (c) => (c.method === 'POST' && c.url.pathname === `${T}/me/threads` ? { body: { id: `cont${++n}` } } : undefined),
      on('GET', /\/v1\.0\/cont\d+$/, { status: 'FINISHED' }),
      (c) => (c.method === 'POST' && c.url.pathname === `${T}/me/threads_publish` ? { body: { id: `post-${field(c, 'creation_id')}` } } : undefined),
      on('GET', `${T}/post-cont1`, { permalink: 'https://www.threads.net/@danbaek.meal/post/A' }),
    );
  });

  it('publishes the first post, then chains the rest as replies', async () => {
    const r = await createThreads('tok', { fetch: fake, pollMs: 0 }).publish({ draft: testDraft(), images: [], imageFiles: [] });
    expect(r).toEqual({ id: 'post-cont1', url: 'https://www.threads.net/@danbaek.meal/post/A' });
    const creates = calls.filter((c) => c.method === 'POST' && c.url.pathname === `${T}/me/threads`);
    expect(creates.map((c) => field(c, 'media_type'))).toEqual(['TEXT', 'TEXT']);
    expect(field(creates[0], 'reply_to_id')).toBeNull();
    expect(field(creates[1], 'reply_to_id')).toBe('post-cont1');
    expect(field(creates[0], 'access_token')).toBe('tok');
  });

  it('attaches the first card when asked', async () => {
    await createThreads('tok', { fetch: fake, pollMs: 0, attachImage: true }).publish({ draft: testDraft(), images: ['https://img/1.jpg'], imageFiles: [] });
    const first = calls.find((c) => c.method === 'POST' && c.url.pathname === `${T}/me/threads`)!;
    expect(field(first, 'media_type')).toBe('IMAGE');
    expect(field(first, 'image_url')).toBe('https://img/1.jpg');
  });

  it('a rejected container is an error', async () => {
    routes.unshift(on('GET', /\/v1\.0\/cont\d+$/, { status: 'ERROR', error_message: 'text too long' }));
    await expect(createThreads('tok', { fetch: fake, pollMs: 0 }).publish({ draft: testDraft(), images: [], imageFiles: [] })).rejects.toThrow('text too long');
  });

  it('lists comments with who I already answered, skipping hidden ones', async () => {
    routes.unshift(
      on('GET', `${T}/me/threads`, { data: [{ id: 'P1', text: '글', timestamp: '2026-10-08T00:00:00+0000', permalink: 'https://t/P1' }, { id: 'OLD', text: '', timestamp: '2026-01-01T00:00:00+0000' }] }),
      on('GET', `${T}/P1/conversation`, {
        data: [
          { id: 'r1', text: '질문 있어요', username: 'minji', timestamp: '2026-10-08T01:00:00+0000', replied_to: { id: 'P1' } },
          { id: 'r2', text: '답변', username: 'danbaek.meal', timestamp: '2026-10-08T02:00:00+0000', replied_to: { id: 'r1' } },
          { id: 'r3', text: '광고', username: 'spam', timestamp: '2026-10-08T03:00:00+0000', hide_status: 'HIDDEN' },
        ],
      }),
    );
    const list = await createThreads('tok', { fetch: fake }).comments!.list({ since: new Date('2026-10-01'), scope: 'all', agentPostIds: [] });
    expect(list.map((c) => [c.id, c.repliedByMe, c.author])).toEqual([
      ['r1', true, 'minji'],
      ['r2', false, 'danbaek.meal'],
    ]);
    expect(list[0].postUrl).toBe('https://t/P1');
    expect(calls.some((c) => c.url.pathname.includes('OLD'))).toBe(false);
  });

  it('reply publishes a reply container; hide uses manage_reply', async () => {
    const t = createThreads('tok', { fetch: fake, pollMs: 0 });
    routes.unshift(on('POST', `${T}/r1/manage_reply`, { success: true }));
    await t.comments!.reply(comment({ platform: 'threads', id: 'r1', replyTo: 'r1' }), '감사해요');
    await t.comments!.hide!(comment({ platform: 'threads', id: 'r1' }));
    const create = calls.find((c) => c.method === 'POST' && c.url.pathname === `${T}/me/threads`)!;
    expect(field(create, 'reply_to_id')).toBe('r1');
    expect(field(calls.find((c) => c.url.pathname.endsWith('manage_reply'))!, 'hide')).toBe('true');
  });

  it('refreshes the long-lived token', async () => {
    routes.push(on('GET', '/refresh_access_token', { access_token: 'new', expires_in: 5183944 }));
    expect(await refreshThreadsToken('old', fake)).toEqual({ token: 'new', expiresIn: 5183944 });
    expect(calls.at(-1)!.url.searchParams.get('grant_type')).toBe('th_refresh_token');
  });
});

describe('instagram', () => {
  beforeEach(() => {
    let n = 0;
    routes.push(
      on('GET', '/me', { user_id: '1784', username: 'danbaek.meal' }),
      (c) => (c.method === 'POST' && c.url.pathname === '/1784/media' ? { body: { id: `m${++n}` } } : undefined),
      on('GET', /^\/m\d+$/, { status_code: 'FINISHED' }),
      on('POST', '/1784/media_publish', { id: 'IGPOST' }),
      on('GET', '/IGPOST', { permalink: 'https://www.instagram.com/p/X/' }),
    );
  });

  it('publishes a carousel: children, parent with caption + hashtags, publish', async () => {
    const r = await createInstagram('tok', { fetch: fake, pollMs: 0 }).publish({ draft: testDraft(), images: ['https://i/1.jpg', 'https://i/2.jpg', 'https://i/3.jpg'], imageFiles: [] });
    expect(r).toEqual({ id: 'IGPOST', url: 'https://www.instagram.com/p/X/' });
    const creates = calls.filter((c) => c.method === 'POST' && c.url.pathname === '/1784/media');
    expect(creates).toHaveLength(4);
    expect(creates.slice(0, 3).map((c) => field(c, 'is_carousel_item'))).toEqual(['true', 'true', 'true']);
    expect(field(creates[3], 'media_type')).toBe('CAROUSEL');
    expect(field(creates[3], 'children')).toBe('m1,m2,m3');
    expect(field(creates[3], 'caption')).toBe('점심 단백질, 이렇게 채워요 👇\n\n단백질 #도시락 #단백한끼');
    expect(field(calls.find((c) => c.url.pathname === '/1784/media_publish')!, 'creation_id')).toBe('m4');
  });

  it('one image is a single post; no image is an error', async () => {
    const ig = createInstagram('tok', { fetch: fake, pollMs: 0 });
    await ig.publish({ draft: testDraft(), images: ['https://i/1.jpg'], imageFiles: [] });
    const creates = calls.filter((c) => c.method === 'POST' && c.url.pathname === '/1784/media');
    expect(creates).toHaveLength(1);
    expect(field(creates[0], 'image_url')).toBe('https://i/1.jpg');
    await expect(ig.publish({ draft: testDraft(), images: [], imageFiles: [] })).rejects.toThrow('이미지가 꼭');
  });

  it('Facebook Login host needs the user id and uses it', async () => {
    await expect(createInstagram('tok', { fetch: fake, host: 'graph.facebook.com' }).check()).rejects.toThrow('INSTAGRAM_USER_ID');
    routes.unshift(on('GET', '/555', { id: '555', username: 'brand' }));
    expect(await createInstagram('tok', { fetch: fake, host: 'graph.facebook.com', userId: '555' }).check()).toBe('@brand');
    expect(calls.at(-1)!.url.host).toBe('graph.facebook.com');
  });

  it('lists comments and follow-ups after my last answer', async () => {
    routes.unshift(
      on('GET', '/1784/media', { data: [{ id: 'M1', caption: '캡션', timestamp: '2026-10-08T00:00:00+0000', permalink: 'https://ig/M1' }] }),
      on('GET', '/M1/comments', {
        data: [
          {
            id: 'c1',
            text: '가격이요?',
            username: 'minji',
            timestamp: '2026-10-08T01:00:00+0000',
            replies: {
              data: [
                { id: 'c1a', text: '프로필 링크 확인해 주세요', username: 'danbaek.meal', timestamp: '2026-10-08T02:00:00+0000' },
                { id: 'c1b', text: '배송은요?', username: 'minji', timestamp: '2026-10-08T03:00:00+0000' },
              ],
            },
          },
          { id: 'c2', text: '스팸', username: 'bot', timestamp: '2026-10-08T01:00:00+0000', hidden: true },
        ],
      }),
    );
    const list = await createInstagram('tok', { fetch: fake }).comments!.list({ since: new Date('2026-10-01'), scope: 'all', agentPostIds: [] });
    expect(list.map((c) => [c.id, c.replyTo, c.repliedByMe])).toEqual([
      ['c1', 'c1', true],
      ['c1b', 'c1', false],
    ]);
  });

  it('reply goes to the top-level comment; hide posts hide=true', async () => {
    routes.unshift(on('POST', '/c1/replies', { id: 'r' }), on('POST', '/c1b', { success: true }));
    const ig = createInstagram('tok', { fetch: fake });
    await ig.comments!.reply(comment({ id: 'c1b', replyTo: 'c1' }), '감사해요');
    await ig.comments!.hide!(comment({ id: 'c1b' }));
    expect(field(calls.find((c) => c.url.pathname === '/c1/replies')!, 'message')).toBe('감사해요');
    expect(field(calls.find((c) => c.url.pathname === '/c1b')!, 'hide')).toBe('true');
  });

  it('refreshes the Instagram Login token', async () => {
    routes.push(on('GET', '/refresh_access_token', { access_token: 'new', expires_in: 5184000 }));
    expect((await refreshInstagramToken('old', fake)).token).toBe('new');
    expect(calls.at(-1)!.url.searchParams.get('grant_type')).toBe('ig_refresh_token');
  });
});

describe('wordpress', () => {
  const W = '/wp-json/wp/v2';
  const files = new Map([['/tmp/card-01.jpg', new Uint8Array([1])], ['/tmp/card-02.jpg', new Uint8Array([2])]]);
  const wp = () => createWordPress('https://blog.example.com/', 'admin', 'abcd efgh', { fetch: fake, readFile: async (p) => files.get(p)! });

  it('uploads used images, resolves tags, posts HTML with a featured image', async () => {
    let media = 0;
    routes.push(
      (c) => (c.method === 'POST' && c.url.pathname === `${W}/media` ? { body: { id: 10 + ++media, source_url: `https://blog.example.com/up/${media}.jpg` } } : undefined),
      (c) => (c.method === 'GET' && c.url.pathname === `${W}/tags` ? { body: c.url.searchParams.get('search') === '단백질' ? [{ id: 7, name: '단백질' }] : [] } : undefined),
      on('POST', `${W}/tags`, { id: 8 }),
      on('POST', `${W}/posts`, { id: 123, link: 'https://blog.example.com/?p=123' }),
    );
    const d = testDraft();
    d.content.blog!.tags = ['단백질', '도시락'];
    const r = await wp().publish({ draft: d, images: [], imageFiles: ['/tmp/card-01.jpg', '/tmp/card-02.jpg', '/tmp/card-03.jpg'] });
    expect(r).toEqual({ id: '123', url: 'https://blog.example.com/?p=123' });
    const uploads = calls.filter((c) => c.url.pathname === `${W}/media`);
    expect(uploads).toHaveLength(2); // featured (1) + body {{image:2}}
    expect(uploads[0].headers.get('content-disposition')).toContain('card-01.jpg');
    const post = calls.find((c) => c.method === 'POST' && c.url.pathname === `${W}/posts`)!;
    expect(post.json.tags).toEqual([7, 8]);
    expect(post.json.featured_media).toBe(11);
    expect(post.json.content).toContain('<img src="https://blog.example.com/up/2.jpg"');
    expect(post.json.content).toContain('<h2>왜 점심 단백질일까</h2>');
    expect(post.headers.get('authorization')).toBe(`Basic ${Buffer.from('admin:abcdefgh').toString('base64')}`);
  });

  it('lists comments, marks the ones I answered, replies and marks spam', async () => {
    routes.push(
      on('GET', `${W}/users/me`, { id: 1, name: '관리자', slug: 'admin' }),
      on('GET', `${W}/comments`, [
        { id: 5, post: 123, parent: 0, author: 0, author_name: '민지', content: { rendered: '<p>좋아요 &amp; 감사</p>' }, date_gmt: '2026-10-08T01:00:00' },
        { id: 6, post: 123, parent: 5, author: 1, author_name: '관리자', content: { rendered: '<p>감사해요</p>' }, date_gmt: '2026-10-08T02:00:00' },
      ]),
      on('GET', `${W}/posts`, [{ id: 123, title: { rendered: '점심 단백질' }, link: 'https://blog.example.com/?p=123' }]),
      on('POST', `${W}/comments`, { id: 7 }),
      on('POST', `${W}/comments/5`, { id: 5 }),
    );
    const c = wp().comments!;
    const list = await c.list({ since: new Date('2026-10-01'), scope: 'all', agentPostIds: [] });
    expect(list.map((x) => [x.id, x.text, x.repliedByMe, x.author])).toEqual([
      ['5', '좋아요 & 감사', true, '민지'],
      ['6', '감사해요', false, 'admin'],
    ]);
    expect(list[0].at).toBe('2026-10-08T01:00:00Z');
    await c.reply(list[0], '고마워요');
    await c.hide!(list[0]);
    expect(calls.find((x) => x.method === 'POST' && x.url.pathname === `${W}/comments`)!.json).toEqual({ post: 123, parent: 5, content: '고마워요' });
    expect(calls.find((x) => x.url.pathname === `${W}/comments/5`)!.json).toEqual({ status: 'spam' });
  });
});

describe('blog html', () => {
  it('escapes raw HTML and places card images', () => {
    const html = renderBlogHtml({ title: 't', tags: [], body: '안녕 <script>alert(1)</script>\n\n{{image:1}}\n\n{{image:5}}' }, ['https://i/1.jpg'], [{ title: '표지 "1"', body: '' }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<figure><img src="https://i/1.jpg" alt="표지 &quot;1&quot;" /></figure>');
    expect(html).not.toContain('IMAGE_5');
    expect(usedImages('{{image:2}}\n텍스트\n{{image:2}}\n{{image:1}}')).toEqual([2, 1]);
  });
});

describe('naver export', () => {
  it('writes paste-ready HTML and Markdown and links to the Markdown', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'promo-'));
    const r = await createNaverExport(dir, 'https://github.com/o/r/blob/promo-data').publish({ draft: testDraft(), images: ['https://i/1.jpg', 'https://i/2.jpg'], imageFiles: [] });
    expect(r.manual).toBe(true);
    expect(r.url).toBe('https://github.com/o/r/blob/promo-data/exports/2026-10-09-0900-blog.md');
    const md = await readFile(join(dir, 'exports/2026-10-09-0900-blog.md'), 'utf8');
    expect(md).toContain('# 점심 단백질 30g, 도시락으로 채우는 법');
    expect(md).toContain('![1. 닭가슴살 말고도](https://i/2.jpg)');
    expect(md).toContain('태그: #단백질 ##도시락 #직장인 점심');
    const html = await readFile(join(dir, 'exports/2026-10-09-0900-blog.html'), 'utf8');
    expect(html).toContain('본문 복사');
  });
});

describe('github media host', () => {
  it('creates the branch once, uploads files and waits for raw URLs', async () => {
    routes.push(
      on('GET', '/repos/o/media/git/ref/heads/promo-media', { message: 'Not Found' }, 404),
      on('POST', '/repos/o/media/git/blobs', { sha: 'b' }),
      on('POST', '/repos/o/media/git/trees', { sha: 't' }),
      on('POST', '/repos/o/media/git/commits', { sha: 'c' }),
      on('POST', '/repos/o/media/git/refs', { ref: 'x' }),
      on('GET', /\/repos\/o\/media\/contents\//, { message: 'Not Found' }, 404),
      on('PUT', /\/repos\/o\/media\/contents\//, { content: {} }),
      (c) => (c.method === 'HEAD' && c.url.host === 'raw.githubusercontent.com' ? { status: 200 } : undefined),
    );
    const host = createGitHubHost('o/media', 'promo-media', 'ghtok', { fetch: fake, readFile: async () => new Uint8Array([255, 216]) });
    const urls = await host.upload('2026/10/2026-10-09-0900', ['/x/card-01.jpg', '/x/card-02.jpg']);
    expect(urls).toEqual([
      'https://raw.githubusercontent.com/o/media/promo-media/2026/10/2026-10-09-0900/card-01.jpg',
      'https://raw.githubusercontent.com/o/media/promo-media/2026/10/2026-10-09-0900/card-02.jpg',
    ]);
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.json).toMatchObject({ branch: 'promo-media', content: Buffer.from([255, 216]).toString('base64') });
    expect(calls.find((c) => c.url.pathname.endsWith('/git/commits'))!.json.parents).toEqual([]);
    expect(put.headers.get('authorization')).toBe('Bearer ghtok');
  });
});

describe('sealed tokens', () => {
  it('round-trips with the right key only', () => {
    const s = seal('k1', 'token-abc');
    expect(unseal('k1', s)).toBe('token-abc');
    expect(unseal('k2', s)).toBeNull();
  });

  it('uses the stored refresh only while the Secret is the one it came from', () => {
    const stored = { ...seal('key', 'refreshed'), from: fingerprint('secret-v1') };
    expect(pickToken('secret-v1', stored, 'key')).toEqual({ token: 'refreshed', refreshed: true });
    expect(pickToken('secret-v2', stored, 'key')).toEqual({ token: 'secret-v2', refreshed: false });
    expect(pickToken('secret-v1', stored, null)).toEqual({ token: 'secret-v1', refreshed: false });
  });
});
