/** The dashboard's GitHub data layer against a fake API: reads promo-data, writes drafts and the inbox, starts runs. */
import { describe, expect, it } from 'vitest';
import { serializeDraft, parseDraft } from '../../src/promo/core/draft';
import { createGitHubSource, repoFromLocation } from '../../src/promo/ui/source';
import { testDraft } from './fixtures';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

function fakeGitHub(files: Record<string, string>, opts: { noDataBranch?: boolean } = {}) {
  const calls: { method: string; path: string; body: any }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace('/repos/o/r', '') + (u.search ? u.search : '');
    const method = init.method ?? 'GET';
    calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : null });
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (method === 'GET' && path === '') return json({ default_branch: 'main' });
    if (method === 'GET' && path.startsWith('/branches/')) return opts.noDataBranch ? json({}, 404) : json({});
    if (method === 'GET' && path.startsWith('/contents/drafts?')) {
      if (opts.noDataBranch) return json({}, 404);
      return json(Object.keys(files).filter((k) => k.startsWith('drafts/')).map((k) => ({ name: k.slice(7), path: k, sha: 's', type: 'file' })));
    }
    if (method === 'GET' && path.startsWith('/contents/')) {
      const p = decodeURIComponent(path.slice(10).split('?')[0]);
      return p in files ? json({ content: b64(files[p]), sha: `sha-${p}` }) : json({}, 404);
    }
    if (method === 'PUT') return json({ content: { sha: 'new-sha' } });
    if (method === 'POST' && path.endsWith('/dispatches')) return new Response(null, { status: 204 });
    return json({}, 404);
  }) as typeof fetch;
  return { f, calls };
}

describe('dashboard GitHub source', () => {
  const files = {
    'promo/config.yml': 'brand: { name: 단백한끼 }\nplatforms: { threads: { enabled: true } }\n',
    'drafts/2026-10-09-0900.md': serializeDraft(testDraft()),
    'state.json': JSON.stringify({ version: 1, slots: {}, topics: [], posts: [], comments: {}, inbox: [], tokens: {}, lastRun: '2026-10-09T00:00:00Z' }),
    'report.md': '# 기록',
  };

  it('loads config from the default branch and records from promo-data', async () => {
    const { f, calls } = fakeGitHub(files);
    const snap = await createGitHubSource('o/r', 't', f).load();
    expect(snap.config!.brand.name).toBe('단백한끼');
    expect(snap.drafts[0].draft!.plan.topic).toBe('점심 단백질 채우기');
    expect(snap.state.lastRun).toBe('2026-10-09T00:00:00Z');
    expect(snap.hasData).toBe(true);
    expect(calls.find((c) => c.path.startsWith('/contents/promo/config.yml'))!.path).toContain('ref=main');
  });

  it('a repo where the agent never ran is not an error', async () => {
    const { f } = fakeGitHub({ 'promo/config.yml': files['promo/config.yml'] }, { noDataBranch: true });
    const snap = await createGitHubSource('o/r', 't', f).load();
    expect(snap.hasData).toBe(false);
    expect(snap.drafts).toEqual([]);
  });

  it('approving writes the draft back to promo-data with its sha', async () => {
    const { f, calls } = fakeGitHub(files);
    const src = createGitHubSource('o/r', 't', f);
    const snap = await src.load();
    const file = snap.drafts[0];
    const next = await src.saveDraft(file, { ...file.draft!, status: 'approved' }, 'approve');
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.body.branch).toBe('promo-data');
    expect(put.body.sha).toBe('sha-drafts/2026-10-09-0900.md');
    expect(parseDraft(Buffer.from(put.body.content, 'base64').toString('utf8')).status).toBe('approved');
    expect(next.sha).toBe('new-sha');
  });

  it('marks inbox items and starts the workflow on the default branch', async () => {
    const { f, calls } = fakeGitHub(files);
    const src = createGitHubSource('o/r', 't', f);
    await src.markInboxDone(['instagram:c1']);
    expect(JSON.parse(Buffer.from(calls.find((c) => c.method === 'PUT')!.body.content, 'base64').toString())).toEqual(['instagram:c1']);
    await src.runWorkflow('post-now', '편의점 단백질');
    expect(calls.at(-1)!.body).toEqual({ ref: 'main', inputs: { command: 'post-now', topic: '편의점 단백질' } });
  });

  it('a bad token reads as a fixable message', async () => {
    const f = (async () => new Response('{}', { status: 401 })) as typeof fetch;
    await expect(createGitHubSource('o/r', 't', f).load()).rejects.toThrow('토큰');
  });

  it('guesses the repo from a GitHub Pages address', () => {
    expect(repoFromLocation({ hostname: 'memoryzkr-hash.github.io', pathname: '/memoryz/promo.html' })).toBe('memoryzkr-hash/memoryz');
    expect(repoFromLocation({ hostname: 'localhost', pathname: '/promo.html' })).toBeNull();
  });
});
