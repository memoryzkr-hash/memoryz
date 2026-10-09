/** The dashboard's model and GitHub backend against a fake GitHub API. */
import sodium from 'libsodium-wrappers';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/promo/core/config';
import { parseDraft, serializeDraft } from '../../src/promo/core/draft';
import { createGitHubBackend, repoFromLocation, sealForGitHub } from '../../src/promo/ui/backend';
import { automationOf, blogKindOf, describeCycle, draftsFor, platformsOf, withAutomation, type Model } from '../../src/promo/ui/model';
import { contentFrom, writePrompt } from '../../src/promo/ui/preview';
import { testDraft } from './fixtures';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const CONFIG = `# 홍보 에이전트 설정
brand:
  name: 단백한끼 # 이름
platforms:
  threads: { enabled: false }
  instagram: { enabled: true, schedule: { days: [mon], time: "19:00" } }
  naver: { enabled: false }
`;

function fakeGitHub(opts: { secrets?: string[]; runs?: { conclusion: string }[]; draftAfterRun?: () => string; afterRun?: (files: Record<string, { text: string; sha: string }>) => void } = {}) {
  const files: Record<string, { text: string; sha: string }> = {
    'main:promo/config.yml': { text: CONFIG, sha: 'c1' },
    'main:promo/brand.md': { text: '# 단백한끼', sha: 'b1' },
    'promo-data:state.json': { text: '{"version":1}', sha: 's1' },
  };
  const calls: { method: string; path: string; body: any }[] = [];
  let secrets = new Set(opts.secrets ?? []);
  let runCreated = 0;
  let polls = 0;
  const kp = { publicKey: new Uint8Array(), privateKey: new Uint8Array() };
  const f = (async (url: string, init: RequestInit = {}) => {
    await sodium.ready;
    if (!kp.publicKey.length) Object.assign(kp, sodium.crypto_box_keypair());
    const u = new URL(url);
    const path = u.pathname.replace('/repos/o/r', '');
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, path: path + u.search, body });
    const json = (v: unknown, status = 200) => new Response(v === undefined || status === 204 ? null : JSON.stringify(v), { status });
    if (path === '') return json({ default_branch: 'main' });
    if (path === '/branches/promo-data') return json({});
    if (path === '/actions/secrets' && method === 'GET') return json({ secrets: [...secrets].map((name) => ({ name })) });
    if (path === '/actions/secrets/public-key') return json({ key_id: 'k1', key: sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL) });
    if (path.startsWith('/actions/secrets/') && method === 'PUT') {
      const name = path.split('/').pop()!;
      const plain = sodium.to_string(sodium.crypto_box_seal_open(sodium.from_base64(body.encrypted_value, sodium.base64_variants.ORIGINAL), kp.publicKey, kp.privateKey));
      secrets.add(name);
      calls[calls.length - 1].body = { ...body, plain };
      return json(undefined, 201);
    }
    if (path === '/actions/variables/PROMO_ENABLED' && method === 'GET') return json({}, 404);
    if (path === '/actions/variables' && method === 'POST') return json(undefined, 201);
    if (path === '/actions/workflows/promo.yml/dispatches') {
      runCreated = Date.now();
      return json(undefined, 204);
    }
    if (path === '/actions/workflows/promo.yml/runs') return json({ workflow_runs: runCreated ? [{ id: 7, created_at: new Date(runCreated).toISOString() }] : [] });
    if (path === '/actions/runs/7') {
      polls++;
      if (polls < 2) return json({ status: 'in_progress', conclusion: null, html_url: 'h' });
      if (opts.draftAfterRun) files['promo-data:drafts/new.md'] = { text: opts.draftAfterRun(), sha: 'd1' };
      opts.afterRun?.(files);
      return json({ status: 'completed', conclusion: opts.runs?.[0]?.conclusion ?? 'success', html_url: 'https://github.com/o/r/actions/runs/7' });
    }
    if (path === '/contents/references') {
      const list = Object.keys(files).filter((k) => k.startsWith('promo-data:references/'));
      return list.length ? json(list.map((k) => ({ name: k.split('/').pop(), path: k.slice(11), type: 'file' }))) : json({}, 404);
    }
    if (path === '/contents/drafts') return json(Object.keys(files).filter((k) => k.startsWith('promo-data:drafts/')).map((k) => ({ name: k.split('/').pop(), path: k.slice(11), type: 'file' })));
    if (path.startsWith('/contents/')) {
      const p = decodeURIComponent(path.slice(10));
      const ref = method === 'PUT' ? body.branch : u.searchParams.get('ref');
      const key = `${ref}:${p}`;
      if (method === 'PUT') {
        files[key] = { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: `${key}-2` };
        return json({ content: { sha: files[key].sha } });
      }
      return files[key] ? json({ content: b64(files[key].text), sha: files[key].sha }) : json({}, 404);
    }
    return json({}, 404);
  }) as typeof fetch;
  return { f, calls, files, secrets: () => secrets };
}

describe('model', () => {
  const config = parseConfig(CONFIG).config;

  it('reads each automation from its own cycle', () => {
    expect(automationOf(config, 'instagram', 'naver')).toEqual({ on: true, days: ['mon'], hour: 19 });
    expect(automationOf(config, 'threads', 'naver').on).toBe(false);
    expect(describeCycle({ days: ['mon', 'wed', 'fri'], hour: 9 })).toBe('주 3회 (월·수·금) 오전 9시');
    expect(describeCycle({ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], hour: 20 })).toBe('매일 오후 8시');
    expect(describeCycle({ days: ['sat'], hour: 12 })).toBe('매주 토 낮 12시');
  });

  it('turning the blog on switches only one kind of blog', () => {
    const c = withAutomation({ ...config, platforms: { ...config.platforms, wordpress: { ...config.platforms.wordpress, enabled: true } } }, 'blog', 'naver', { on: true, days: ['tue'], hour: 10 });
    expect(c.platforms.naver).toMatchObject({ enabled: true, schedule: [{ days: ['tue'], time: '10:00' }] });
    expect(c.platforms.wordpress.enabled).toBe(false);
    expect(platformsOf('blog', 'wordpress')).toEqual(['wordpress']);
    expect(blogKindOf({ ...config, platforms: { ...config.platforms, naver: { ...config.platforms.naver, kind: 'tistory' } } })).toBe('tistory');
  });

  it('finds the drafts that belong to one card', () => {
    const m = { drafts: [{ path: 'a', sha: null, error: null, draft: testDraft({ platforms: ['threads'] }) }, { path: 'b', sha: null, error: null, draft: testDraft({ platforms: ['naver'] }) }], blogKind: 'naver' } as unknown as Model;
    expect(draftsFor(m, 'threads').map((f) => f.path)).toEqual(['a']);
    expect(draftsFor(m, 'blog').map((f) => f.path)).toEqual(['b']);
  });

  it('guesses the repo from a GitHub Pages address', () => {
    expect(repoFromLocation({ hostname: 'memoryzkr-hash.github.io', pathname: '/memoryz/promo.html' })).toBe('memoryzkr-hash/memoryz');
    expect(repoFromLocation({ hostname: 'localhost', pathname: '/promo.html' })).toBeNull();
  });
});

describe('preview writing', () => {
  it('asks for the platform format with the brand and links', () => {
    const p = writePrompt('threads', '단백한끼', '# 브랜드 소개', '- 구독: https://x.example', '', ['지난 주제']);
    expect(p).toContain('# 브랜드 소개');
    expect(p).toContain('https://x.example');
    expect(p).toContain('"posts"');
    expect(p).toContain('지난 주제');
  });

  it('turns Claude JSON into content for one platform, ignoring junk', () => {
    expect(contentFrom('threads', { posts: ['a', '', 'b', 3 as unknown as string] })).toEqual({ blog: null, instagram: null, threads: { posts: ['a', 'b'] } });
    const blog = contentFrom('blog', { title: 't', tags: ['x'], body: 'b', cards: [{ title: 'c' }] });
    expect(blog.blog).toEqual({ title: 't', tags: ['x'], body: 'b' });
    expect(blog.instagram!.cards).toEqual([{ title: 'c', body: '' }]);
  });
});

describe('GitHub backend', () => {
  it('loads config, brand, accounts and records', async () => {
    const { f } = fakeGitHub({ secrets: ['INSTAGRAM_ACCESS_TOKEN', 'ANTHROPIC_API_KEY'] });
    const m = await createGitHubBackend('o/r', 't', f, 0).load();
    expect(m.config.brand.name).toBe('단백한끼');
    expect(m.brandDoc).toBe('# 단백한끼');
    expect(m.accounts).toEqual({ threads: false, instagram: true, wordpress: false, claude: true });
    expect(m.hasData).toBe(true);
  });

  it('registers an account as an encrypted secret and creates the renewal key once', async () => {
    const { f, calls } = fakeGitHub();
    const be = createGitHubBackend('o/r', 't', f, 0);
    const m = await be.load();
    await be.registerAccount(m, 'threads', { token: 'THREADS-TOKEN-123' });
    const puts = calls.filter((c) => c.method === 'PUT' && c.path.startsWith('/actions/secrets/'));
    expect(puts.map((c) => c.path)).toEqual(['/actions/secrets/THREADS_ACCESS_TOKEN', '/actions/secrets/PROMO_SECRET_KEY']);
    expect(puts[0].body.plain).toBe('THREADS-TOKEN-123');
    expect(puts[0].body.key_id).toBe('k1');
    expect(puts[1].body.plain).toMatch(/^[0-9a-f]{64}$/);
    expect(m.accounts.threads).toBe(true);
    await be.registerAccount(m, 'instagram', { token: 'IG' });
    expect(calls.filter((c) => c.path === '/actions/secrets/PROMO_SECRET_KEY' && c.method === 'PUT')).toHaveLength(1);
  });

  it('saving an automation edits config.yml (comments kept) and turns the schedule on', async () => {
    const { f, files, calls } = fakeGitHub();
    const be = createGitHubBackend('o/r', 't', f, 0);
    const m = await be.load();
    await be.saveAutomation(m, 'threads', { on: true, days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], hour: 8 });
    const text = files['main:promo/config.yml'].text;
    expect(text).toContain('# 홍보 에이전트 설정');
    expect(text).toContain('# 이름');
    const c = parseConfig(text).config;
    expect(c.platforms.threads.enabled).toBe(true);
    expect(c.platforms.threads.schedule![0].time).toBe('08:00');
    expect(c.platforms.instagram.schedule![0].time).toBe('19:00');
    expect(m.config.platforms.threads.enabled).toBe(true);
    expect(calls.find((x) => x.path === '/actions/variables')!.body).toEqual({ name: 'PROMO_ENABLED', value: 'true' });
  });

  it('글 만들기 runs the agent for that platform and returns the new draft', async () => {
    const made = () => serializeDraft(testDraft({ id: 'new', platforms: ['instagram'], createdAt: new Date().toISOString() }));
    const { f, calls } = fakeGitHub({ draftAfterRun: made });
    const be = createGitHubBackend('o/r', 't', f, 0);
    const m = await be.load();
    const progress: string[] = [];
    const file = await be.generate(m, 'instagram', '편의점 단백질', (s) => progress.push(s), new AbortController().signal);
    expect(file.draft!.id).toBe('new');
    expect(calls.find((c) => c.path.endsWith('/dispatches'))!.body).toEqual({ ref: 'main', inputs: { command: 'preview', platform: 'instagram', topic: '편의점 단백질' } });
    expect(progress.some((p) => p.includes('글을 쓰는'))).toBe(true);
  }, 20000);

  it('a failed run is reported with its link', async () => {
    const { f } = fakeGitHub({ runs: [{ conclusion: 'failure' }] });
    const be = createGitHubBackend('o/r', 't', f, 0);
    const m = await be.load();
    await expect(be.generate(m, 'threads', '', () => {}, new AbortController().signal)).rejects.toThrow('actions/runs/7');
  }, 20000);

  it('지금 올리기 approves the draft on promo-data, then runs the agent', async () => {
    const { f, files, calls } = fakeGitHub();
    files['promo-data:drafts/x.md'] = { text: serializeDraft(testDraft({ id: 'x', platforms: ['threads'] })), sha: 'x1' };
    const be = createGitHubBackend('o/r', 't', f, 0);
    const m = await be.load();
    const file = m.drafts.find((d) => d.path === 'drafts/x.md')!;
    await be.publish(m, file, () => {}, new AbortController().signal);
    expect(parseDraft(files['promo-data:drafts/x.md'].text).status).toBe('approved');
    expect(calls.find((c) => c.path.endsWith('/dispatches'))!.body.inputs).toEqual({ command: 'run' });
  }, 20000);

  it('sealForGitHub produces a sealed box the key owner can open', async () => {
    await sodium.ready;
    const kp = sodium.crypto_box_keypair();
    const sealed = await sealForGitHub(sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL), '비밀값');
    expect(sodium.to_string(sodium.crypto_box_seal_open(sodium.from_base64(sealed, sodium.base64_variants.ORIGINAL), kp.publicKey, kp.privateKey))).toBe('비밀값');
  });

  it('인기 글 찾기 runs the research command and adds what it found to the feed', async () => {
    const found = { topic: '편의점 단백질', platform: 'instagram', createdAt: '2026-10-09T00:00:00Z', references: [{ title: '조합 공식', url: 'https://gq.example/1', kind: 'blog', source: 'GQ', hook: '공식', structure: 'a → b', why: 'w', popularity: '', note: 'n' }] };
    const { f, calls } = fakeGitHub({ afterRun: (files) => (files['promo-data:references/2026-10-09-1000-now-instagram.json'] = { text: JSON.stringify(found), sha: 'r1' }) });
    const be = createGitHubBackend('o/r', 't', f, 0);
    const m = await be.load();
    expect(m.references).toEqual([]);
    const fresh = await be.findReferences(m, 'instagram', '편의점 단백질', () => {}, new AbortController().signal);
    expect(fresh.map((r) => r.title)).toEqual(['조합 공식']);
    expect(m.references[0].url).toBe('https://gq.example/1');
    expect(calls.find((c) => c.path.endsWith('/dispatches'))!.body.inputs).toEqual({ command: 'research', platform: 'instagram', topic: '편의점 단백질' });
  }, 20000);

  it('a pasted post becomes my reference, saved to promo-data', async () => {
    const { f, files } = fakeGitHub();
    const be = createGitHubBackend('o/r', 't', f, 0);
    const m = await be.load();
    const ref = await be.addReference(m, 'threads', { text: '야근하는 날 편의점에서 이렇게 먹어 봄\n1. 계란', url: 'https://www.threads.net/@a/post/1' });
    expect(ref).toMatchObject({ title: '야근하는 날 편의점에서 이렇게 먹어 봄', kind: 'threads', source: '직접 추가' });
    expect(JSON.parse(files['promo-data:references/mine.json'].text).references[0].excerpt).toContain('1. 계란');
    const again = await be.load();
    expect(again.references[0].source).toBe('직접 추가');
  });

  it('글 만들기 with picked references saves them and passes the file to the agent', async () => {
    const made = () => serializeDraft(testDraft({ id: 'new', platforms: ['threads'], createdAt: new Date().toISOString() }));
    const { f, files, calls } = fakeGitHub({ draftAfterRun: made });
    const be = createGitHubBackend('o/r', 't', f, 0);
    const m = await be.load();
    await be.generate(m, 'threads', '', () => {}, new AbortController().signal, [{ title: '고른 글', url: 'https://a.example', note: '', hook: 'h' }]);
    const inputs = calls.find((c) => c.path.endsWith('/dispatches'))!.body.inputs;
    expect(inputs.refs).toMatch(/^references\/picked-\d+\.json$/);
    expect(JSON.parse(files[`promo-data:${inputs.refs}`].text).references[0].title).toBe('고른 글');
  }, 20000);
});


describe('preview references', () => {
  it('ships real example references with nothing invented about popularity', async () => {
    const { DEMO_REFERENCES, writePrompt } = await import('../../src/promo/ui/preview');
    expect(DEMO_REFERENCES.length).toBeGreaterThanOrEqual(6);
    for (const r of DEMO_REFERENCES) {
      expect(r.url).toMatch(/^https:\/\//);
      expect(r.popularity).toBe('');
      expect(r.hook && r.structure && r.why).toBeTruthy();
    }
    const p = writePrompt('instagram', '단백한끼', '소개', '', '', [], [DEMO_REFERENCES[0]]);
    expect(p).toContain('<references>');
    expect(p).toContain(DEMO_REFERENCES[0].hook!);
    expect(p).toContain('베끼지');
  });
});
