/**
 * The local app: `npm run promo:app` → http://localhost:4321
 * Serves the 홍보 자동화 screen and runs the agent on this computer:
 *   accounts   → .env (this computer only)          글 만들기 / 인기 글 찾기 / 올리기 → the agent, one job at a time
 *   automation → promo/config.yml                    every 15 minutes while the app runs → the scheduled run
 * Listens on 127.0.0.1 only, and every API call must carry the x-promo header, so other websites cannot drive it.
 */
import Anthropic from '@anthropic-ai/sdk';
import { existsSync } from 'node:fs';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { analyzeReference, MODEL } from './ai/claude';
import { setAutomation, setBlogKind, setBrand, setMediaRepo, setWordPressUrl } from './core/config-edit';
import { parseDraft, serializeDraft } from './core/draft';
import { setEnvValues } from './core/envfile';
import { cleanReference } from './core/references';
import { parseState } from './core/state';
import type { DataDir } from './core/store';
import type { Draft, Reference, ReferenceSet } from './core/types';
import { describeError } from './errors';
import { createGitHubHost } from './media/host';
import { PlatformError } from './platforms/http';
import { createInstagram } from './platforms/instagram';
import { createThreads } from './platforms/threads';
import { createWordPress } from './platforms/wordpress';
import { openRuntime } from './runtime';
import { loadConfigDir, resolvePlatforms } from './setup';
import { kindOfUrl } from './ui/backend';
import { blogKindOf, platformsOf, slotOf, type Automation, type Model, type UiPlatform } from './ui/model';

const PORT = Number(process.env.PROMO_PORT || 4321);
const ENV_FILE = '.env';
const CONFIG = () => `${process.env.PROMO_DIR || 'promo'}/config.yml`;
const BRAND = () => `${process.env.PROMO_DIR || 'promo'}/brand.md`;
const SCHEDULE_EVERY_MIN = 15;

// ---------------- jobs: one agent run at a time ----------------

export interface Job {
  id: string;
  kind: string;
  status: 'waiting' | 'running' | 'done' | 'failed';
  log: string[];
  result: unknown;
  error: string | null;
  startedAt: string;
}

const jobs = new Map<string, Job>();
let chain: Promise<unknown> = Promise.resolve();
let busy = false;

function startJob(kind: string, run: (log: (line: string) => void) => Promise<unknown>): Job {
  const job: Job = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind, status: 'waiting', log: [], result: null, error: null, startedAt: new Date().toISOString() };
  jobs.set(job.id, job);
  const log = (line: string) => {
    job.log.push(line);
    console.log(`[${kind}] ${line}`);
  };
  chain = chain.then(async () => {
    job.status = 'running';
    busy = true;
    try {
      job.result = await run(log);
      job.status = 'done';
    } catch (e) {
      job.error = describeError(e);
      job.status = 'failed';
      log(`실패: ${job.error}`);
    } finally {
      busy = false;
    }
  });
  for (const [id, j] of jobs) if (Date.now() - new Date(j.startedAt).getTime() > 3600000) jobs.delete(id);
  return job;
}

// ---------------- local files ----------------

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

async function saveEnv(updates: Record<string, string>) {
  await writeFile(ENV_FILE, setEnvValues(await readText(ENV_FILE), updates));
  await chmod(ENV_FILE, 0o600).catch(() => {});
  Object.assign(process.env, updates);
}

async function editConfig(change: (text: string) => string) {
  await writeFile(CONFIG(), change(await readText(CONFIG())));
}

async function labels(data: DataDir): Promise<Record<string, string>> {
  try {
    return JSON.parse((await data.read('accounts.json')) ?? '{}');
  } catch {
    return {};
  }
}

async function loadReferences(data: DataDir): Promise<Reference[]> {
  const names = (await data.list('references')).filter((n) => n.endsWith('.json') && !n.startsWith('picked-'));
  const ordered = [...names.filter((n) => n === 'mine.json'), ...names.filter((n) => n !== 'mine.json').sort().reverse().slice(0, 6)];
  const out: Reference[] = [];
  const seen = new Set<string>();
  for (const n of ordered) {
    let list: unknown[] = [];
    try {
      list = (JSON.parse((await data.read(`references/${n}`)) ?? '{}') as ReferenceSet).references ?? [];
    } catch {
      list = [];
    }
    for (const r of list.map(cleanReference)) {
      const key = r?.url || r?.title;
      if (r && key && !seen.has(key)) {
        seen.add(key);
        out.push(n === 'mine.json' ? { ...r, source: r.source || '직접 추가' } : r);
      }
    }
  }
  return out;
}

async function model(): Promise<Model & { local: { schedulerEveryMin: number; busy: boolean; labels: Record<string, string> } }> {
  const env = process.env;
  const rt = await openRuntime({ env, dryRun: true, refreshTokens: false, log: () => {} });
  const { config, errors } = await loadConfigDir(env.PROMO_DIR || 'promo');
  const drafts = await Promise.all(
    (await rt.data.list('drafts'))
      .filter((n) => n.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, 40)
      .map(async (n) => {
        const path = `drafts/${n}`;
        try {
          return { path, sha: null, draft: parseDraft((await rt.data.read(path)) ?? ''), error: null };
        } catch (e) {
          return { path, sha: null, draft: null, error: (e as Error).message };
        }
      }),
  );
  let inboxDone: string[] = [];
  try {
    inboxDone = JSON.parse((await rt.data.read('inbox-done.json')) ?? '[]');
  } catch {
    inboxDone = [];
  }
  return {
    config,
    configErrors: errors,
    brandDoc: await readText(BRAND()),
    blogKind: blogKindOf(config),
    drafts,
    state: parseState(await rt.data.read('state.json')).state,
    inboxDone,
    accounts: {
      threads: !!env.THREADS_ACCESS_TOKEN,
      instagram: !!env.INSTAGRAM_ACCESS_TOKEN,
      wordpress: !!(env.WORDPRESS_USER && env.WORDPRESS_APP_PASSWORD && config.platforms.wordpress.url),
      claude: !!env.ANTHROPIC_API_KEY,
      media: !!((config.media.repo || env.GITHUB_REPOSITORY) && (env.PROMO_MEDIA_TOKEN || env.GITHUB_TOKEN)),
    },
    hasData: true,
    references: await loadReferences(rt.data),
    local: { schedulerEveryMin: SCHEDULE_EVERY_MIN, busy, labels: await labels(rt.data) },
  };
}

/** What is wrong with the form before anything is sent out, so a typo is never saved as "확인 전". */
export function accountProblem(key: string, f: Record<string, string>): string | null {
  if (key === 'threads' || key === 'instagram') return f.token ? null : '액세스 토큰을 넣어 주세요';
  if (key === 'claude') return f.token?.startsWith('sk-') ? null : 'sk-로 시작하는 API 키를 넣어 주세요';
  if (key === 'wordpress') {
    if (!/^https?:\/\/[^\s/]+\.[^\s/]+/.test(f.url ?? '')) return '블로그 주소를 https://로 시작하게 적어 주세요';
    return f.user && f.password ? null : '아이디와 애플리케이션 비밀번호를 넣어 주세요';
  }
  if (key === 'media') return /^[\w.-]+\/[\w.-]+$/.test(f.repo ?? '') && f.token ? null : '저장소(아이디/이름)와 토큰을 넣어 주세요';
  return '모르는 계정 종류예요';
}

/** Checks a credential against the service before keeping it. Network trouble keeps it with a warning. */
async function verify(key: string, f: Record<string, string>): Promise<{ label: string; warning: string | null }> {
  try {
    if (key === 'threads') return { label: await createThreads(f.token).check(), warning: null };
    if (key === 'instagram') return { label: await createInstagram(f.token, { host: process.env.INSTAGRAM_API_HOST || undefined, userId: f.userId || process.env.INSTAGRAM_USER_ID || undefined }).check(), warning: null };
    if (key === 'wordpress') return { label: await createWordPress(f.url, f.user, f.password).check(), warning: null };
    if (key === 'claude') {
      await new Anthropic({ apiKey: f.token, maxRetries: 1 }).models.retrieve(MODEL);
      return { label: MODEL, warning: null };
    }
    if (key === 'media') {
      const r = await createGitHubHost(f.repo, 'promo-media', f.token).check();
      if (!r.public) throw new PlatformError(`${r.repo}이(가) 비공개라 인스타그램이 이미지를 못 가져가요. 공개 저장소를 적어 주세요`, 400);
      return { label: r.repo, warning: null };
    }
  } catch (e) {
    const offline = (e instanceof PlatformError && e.status === null) || e instanceof Anthropic.APIConnectionError;
    if (offline) return { label: '확인 전', warning: `인터넷 문제로 확인하지 못했지만 저장했어요: ${describeError(e)}` };
    throw e;
  }
  throw new Error('모르는 계정 종류예요');
}

// ---------------- API ----------------

type Body = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

async function api(method: string, path: string, body: Body): Promise<unknown> {
  const env = process.env;
  if (method === 'GET' && path === '/ping') return { ok: true, mode: 'local' };
  if (method === 'GET' && path === '/model') return model();
  if (method === 'GET' && path.startsWith('/jobs/')) {
    const job = jobs.get(path.slice(6));
    if (!job) throw new HttpError(404, '작업을 찾지 못했어요');
    return job;
  }
  if (method !== 'POST') throw new HttpError(404, '없는 주소예요');

  if (path === '/account') {
    const key = s(body.key);
    const f = Object.fromEntries(Object.entries((body.fields ?? {}) as Body).map(([k, v]) => [k, s(v)]));
    const missing = accountProblem(key, f);
    if (missing) throw new HttpError(400, missing);
    const { label, warning } = await verify(key, f);
    if (key === 'threads') await saveEnv({ THREADS_ACCESS_TOKEN: f.token, ...(env.PROMO_SECRET_KEY ? {} : { PROMO_SECRET_KEY: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '') }) });
    else if (key === 'instagram') await saveEnv({ INSTAGRAM_ACCESS_TOKEN: f.token, ...(f.userId ? { INSTAGRAM_USER_ID: f.userId } : {}), ...(env.PROMO_SECRET_KEY ? {} : { PROMO_SECRET_KEY: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '') }) });
    else if (key === 'wordpress') {
      await saveEnv({ WORDPRESS_USER: f.user, WORDPRESS_APP_PASSWORD: f.password });
      await editConfig((t) => setWordPressUrl(t, f.url));
    } else if (key === 'claude') await saveEnv({ ANTHROPIC_API_KEY: f.token });
    else if (key === 'media') {
      await saveEnv({ PROMO_MEDIA_TOKEN: f.token });
      await editConfig((t) => setMediaRepo(t, f.repo));
    }
    const rt = await openRuntime({ env, dryRun: true, refreshTokens: false, log: () => {} });
    await rt.data.write('accounts.json', JSON.stringify({ ...(await labels(rt.data)), [key]: label }, null, 1));
    return { label, warning };
  }
  if (path === '/automation') {
    const { config } = await loadConfigDir(env.PROMO_DIR || 'promo');
    const [p] = platformsOf(s(body.ui) as UiPlatform, blogKindOf(config));
    await editConfig((t) => setAutomation(t, p, !!(body.automation as Automation).on, slotOf(body.automation as Automation)));
    return { ok: true };
  }
  if (path === '/blog-kind') {
    await editConfig((t) => setBlogKind(t, s(body.kind) as 'naver' | 'tistory' | 'wordpress'));
    return { ok: true };
  }
  if (path === '/brand') {
    await editConfig((t) => setBrand(t, { name: s(body.name), handle: s(body.handle), review: !!body.review }));
    const doc = typeof body.doc === 'string' ? body.doc : '';
    await writeFile(BRAND(), doc.endsWith('\n') ? doc : `${doc}\n`);
    return { ok: true };
  }
  if (path === '/draft') {
    const p = s(body.path);
    if (!/^drafts\/[\w.-]+\.md$/.test(p)) throw new HttpError(400, '초안 경로가 올바르지 않아요');
    const rt = await openRuntime({ env, dryRun: true, refreshTokens: false, log: () => {} });
    await rt.data.write(p, serializeDraft(body.draft as Draft));
    return { ok: true };
  }
  if (path === '/inbox-done') {
    const rt = await openRuntime({ env, dryRun: true, refreshTokens: false, log: () => {} });
    let list: string[] = [];
    try {
      list = JSON.parse((await rt.data.read('inbox-done.json')) ?? '[]');
    } catch {
      list = [];
    }
    await rt.data.write('inbox-done.json', JSON.stringify([...new Set([...list, ...((body.keys as string[]) ?? [])])].slice(-500), null, 1));
    return { ok: true };
  }
  if (path === '/reference') {
    const text = s(body.text);
    const url = s(body.url);
    let a: Partial<Reference> = {};
    if (text && env.ANTHROPIC_API_KEY) {
      try {
        a = (await analyzeReference(env.ANTHROPIC_API_KEY, text)) as Partial<Reference>;
      } catch {
        a = {};
      }
    }
    const ref = cleanReference({ title: a.title || text.split('\n')[0].slice(0, 60) || url, ...a, url, excerpt: text, kind: a.kind ?? kindOfUrl(url), source: '직접 추가' });
    if (!ref) throw new HttpError(400, '글 내용이나 링크를 넣어 주세요');
    const rt = await openRuntime({ env, dryRun: true, refreshTokens: false, log: () => {} });
    let mine: Reference[] = [];
    try {
      mine = (JSON.parse((await rt.data.read('references/mine.json')) ?? '{}') as ReferenceSet).references ?? [];
    } catch {
      mine = [];
    }
    const set: ReferenceSet = { topic: '직접 추가', platform: 'all', createdAt: new Date().toISOString(), references: [ref, ...mine].slice(0, 100) };
    await rt.data.write('references/mine.json', JSON.stringify(set, null, 1));
    return ref;
  }

  // Long work runs as a job; the screen polls /jobs/:id.
  if (path === '/generate') {
    return startJob('글 만들기', async (log) => {
      const rt = await openRuntime({ env, dryRun: true, refreshTokens: false, log });
      const chosen = ((body.chosen as unknown[]) ?? []).map(cleanReference).filter((r): r is Reference => !!r);
      const draft = await rt.agent.postNow(s(body.topic) || null, resolvePlatforms(s(body.ui), rt.config, env), chosen);
      if (!draft) throw new Error(rt.agent.events.filter((e) => e.kind === 'warn').map((e) => (e as { message: string }).message).join(' / ') || '글을 만들지 못했어요');
      return { path: `drafts/${draft.id}.md` };
    });
  }
  if (path === '/research') {
    return startJob('인기 글 찾기', async (log) => {
      const rt = await openRuntime({ env, dryRun: true, refreshTokens: false, log });
      const file = await rt.agent.findReferences(s(body.topic) || null, resolvePlatforms(s(body.ui), rt.config, env));
      if (!file) throw new Error('레퍼런스를 찾지 못했어요');
      return { file };
    });
  }
  if (path === '/publish') {
    const p = s(body.path);
    if (!/^drafts\/[\w.-]+\.md$/.test(p)) throw new HttpError(400, '초안 경로가 올바르지 않아요');
    return startJob('올리기', async (log) => {
      const rt = await openRuntime({ env, dryRun: false, refreshTokens: true, log });
      const draft = parseDraft((await rt.data.read(p)) ?? '');
      await rt.data.write(p, serializeDraft({ ...draft, status: 'approved' }));
      await rt.agent.publishApproved();
      await rt.agent.save();
      await rt.agent.writeReport('publish');
      return { path: p };
    });
  }
  if (path === '/run') return startJob('정기 실행', (log) => scheduledRun(log));
  throw new HttpError(404, '없는 주소예요');
}

async function scheduledRun(log: (line: string) => void) {
  const rt = await openRuntime({ env: process.env, dryRun: false, refreshTokens: true, log });
  await rt.agent.run();
  await rt.agent.save();
  await rt.agent.writeReport('run');
  return { events: rt.agent.events.length };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Body> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) throw new HttpError(413, '보낸 내용이 너무 커요');
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, '요청을 읽지 못했어요');
  }
}

/** Requests from other websites cannot set x-promo (that would need a CORS preflight we never answer). */
export function allowed(req: Pick<IncomingMessage, 'headers'>): boolean {
  if (req.headers['x-promo'] !== '1') return false;
  const origin = req.headers.origin;
  return !origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

async function main() {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'mpa', logLevel: 'warn' });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/promo/')) {
      if (!allowed(req)) return send(res, 403, { error: '이 화면에서만 쓸 수 있어요' });
      try {
        const body = req.method === 'POST' ? await readBody(req) : {};
        send(res, 200, await api(req.method ?? 'GET', url.pathname.slice('/api/promo'.length), body));
      } catch (e) {
        send(res, e instanceof HttpError ? e.status : 400, { error: e instanceof HttpError ? e.message : describeError(e) });
      }
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(302, { location: '/promo.html' });
      res.end();
      return;
    }
    vite.middlewares(req, res);
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n  홍보 자동화가 켜졌어요 → http://localhost:${PORT}\n  이 창을 닫으면 멈춰요. 켜 둔 동안 ${SCHEDULE_EVERY_MIN}분마다 올릴 차례와 새 댓글을 확인해요.\n`);
  });
  // The schedule: the agent itself decides whether anything is due.
  const tick = () => {
    if (!busy) startJob('정기 실행', (log) => scheduledRun(log));
  };
  setTimeout(tick, 60_000);
  setInterval(tick, SCHEDULE_EVERY_MIN * 60_000);
}

if (process.argv[1]?.endsWith('server.ts')) {
  main().catch((e) => {
    console.error(`시작하지 못했어요: ${describeError(e)}`);
    process.exit(1);
  });
}
