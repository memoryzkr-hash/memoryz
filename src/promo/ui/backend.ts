/**
 * Everything the dashboard reads or changes goes through a Backend.
 * GitHubBackend works on the repo the agent runs in:
 *   accounts   → encrypted GitHub Actions secrets
 *   automation → promo/config.yml on the default branch (+ the PROMO_ENABLED switch)
 *   글 만들기   → the promo workflow (preview), then the new draft from promo-data
 *   지금 올리기 → the draft marked approved, then the workflow (run)
 */
import { parseDocument } from 'yaml';
import { parseConfig } from '../core/config';
import { parseDraft, serializeDraft } from '../core/draft';
import { parseState } from '../core/state';
import type { Draft } from '../core/types';
import { blogKindOf, platformsOf, slotOf, type Automation, type BlogKind, type DraftFile, type Model, type UiPlatform } from './model';

export type AccountKey = 'threads' | 'instagram' | 'wordpress' | 'claude';

export interface BrandForm {
  name: string;
  handle: string;
  doc: string;
  review: boolean;
}

export interface Backend {
  kind: 'preview' | 'github';
  label: string;
  load(): Promise<Model>;
  saveAutomation(m: Model, ui: UiPlatform, a: Automation): Promise<void>;
  setBlogKind(m: Model, kind: BlogKind): Promise<void>;
  saveBrand(m: Model, b: BrandForm): Promise<void>;
  registerAccount(m: Model, key: AccountKey, fields: Record<string, string>): Promise<void>;
  generate(m: Model, ui: UiPlatform, topic: string, progress: (msg: string) => void, signal: AbortSignal): Promise<DraftFile>;
  saveDraft(file: DraftFile, draft: Draft): Promise<DraftFile>;
  publish(m: Model, file: DraftFile, progress: (msg: string) => void, signal: AbortSignal): Promise<DraftFile>;
  markInboxDone(keys: string[]): Promise<void>;
  runLink(): string | null;
}

export class BackendError extends Error {}

const DATA = 'promo-data';
const SECRETS: Record<Exclude<AccountKey, 'wordpress'>, string> = { threads: 'THREADS_ACCESS_TOKEN', instagram: 'INSTAGRAM_ACCESS_TOKEN', claude: 'ANTHROPIC_API_KEY' };

const decode = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const encode = (text: string) => {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
};
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), reject(new BackendError('취소했어요'))), { once: true });
  });

/** GitHub's required encryption for Actions secrets (libsodium sealed box), loaded only when needed. */
export async function sealForGitHub(publicKeyB64: string, value: string): Promise<string> {
  const { default: sodium } = await import('libsodium-wrappers');
  await sodium.ready;
  const sealed = sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL));
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}

const randomKey = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function createGitHubBackend(repo: string, token: string, f: typeof fetch = fetch.bind(globalThis), pollMs = 8000): Backend {
  const api = `https://api.github.com/repos/${repo}`;
  let main: string | null = null;

  async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await f(`${api}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...init.headers } });
    } catch {
      throw new BackendError('GitHub에 연결하지 못했어요. 인터넷 연결을 확인해 주세요');
    }
    if (res.status === 401) throw new BackendError('GitHub 토큰이 맞지 않거나 만료됐어요. 설정에서 다시 넣어 주세요');
    if (res.status === 403) throw new BackendError('GitHub 토큰 권한이 부족해요 (Contents·Actions·Secrets·Variables 읽기·쓰기)');
    if (res.status === 404) throw Object.assign(new BackendError('없음'), { notFound: true });
    if (res.status === 409) throw new BackendError('다른 곳에서 먼저 바뀌었어요. 새로고침한 뒤 다시 해 주세요');
    if (res.status === 422) throw new BackendError('GitHub가 요청을 받아들이지 않았어요. 입력값을 확인해 주세요');
    if (!res.ok) throw new BackendError(`GitHub 오류 (HTTP ${res.status})`);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  const notFound = (e: unknown) => (e as { notFound?: boolean }).notFound === true;

  async function branch() {
    if (!main) {
      try {
        main = (await gh<{ default_branch: string }>('')).default_branch;
      } catch (e) {
        if (notFound(e)) throw new BackendError(`저장소 ${repo}을(를) 찾지 못했어요. 이름과 토큰을 확인해 주세요`);
        throw e;
      }
    }
    return main;
  }

  async function read(path: string, ref: string) {
    try {
      const r = await gh<{ content: string; sha: string }>(`/contents/${path}?ref=${encodeURIComponent(ref)}`);
      return { text: decode(r.content), sha: r.sha };
    } catch (e) {
      if (notFound(e)) return null;
      throw e;
    }
  }

  async function write(path: string, text: string, sha: string | null, ref: string, message: string) {
    const r = await gh<{ content: { sha: string } }>(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content: encode(text), branch: ref, ...(sha ? { sha } : {}) }) });
    return r.content.sha;
  }

  async function editConfig(m: Model, message: string, edit: (doc: ReturnType<typeof parseDocument>) => void) {
    const ref = await branch();
    const cur = await read('promo/config.yml', ref);
    const doc = parseDocument(cur?.text ?? '');
    edit(doc);
    const text = doc.toString();
    await write('promo/config.yml', text, cur?.sha ?? null, ref, message);
    const parsed = parseConfig(text);
    m.config = parsed.config;
    m.configErrors = parsed.errors;
    m.blogKind = blogKindOf(m.config);
  }

  async function putSecret(name: string, value: string) {
    const key = await gh<{ key_id: string; key: string }>('/actions/secrets/public-key');
    await gh(`/actions/secrets/${name}`, { method: 'PUT', body: JSON.stringify({ encrypted_value: await sealForGitHub(key.key, value), key_id: key.key_id }) });
  }

  async function secretNames(): Promise<Set<string>> {
    const r = await gh<{ secrets: { name: string }[] }>('/actions/secrets?per_page=100');
    return new Set(r.secrets.map((s) => s.name));
  }

  /** Scheduled runs start only when this repository variable is "true". */
  async function switchOn() {
    try {
      await gh('/actions/variables/PROMO_ENABLED');
      await gh('/actions/variables/PROMO_ENABLED', { method: 'PATCH', body: JSON.stringify({ name: 'PROMO_ENABLED', value: 'true' }) });
    } catch (e) {
      if (!notFound(e)) throw e;
      await gh('/actions/variables', { method: 'POST', body: JSON.stringify({ name: 'PROMO_ENABLED', value: 'true' }) });
    }
  }

  async function dispatch(inputs: Record<string, string>): Promise<number> {
    const since = Date.now() - 5000;
    try {
      await gh('/actions/workflows/promo.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: await branch(), inputs }) });
    } catch (e) {
      if (notFound(e)) throw new BackendError('저장소 기본 브랜치에 홍보 에이전트 워크플로가 없어요');
      throw e;
    }
    return since;
  }

  /** Waits for the workflow run started after `since` to finish. */
  async function waitRun(since: number, progress: (m: string) => void, signal: AbortSignal, verb: string) {
    let runId: number | null = null;
    const started = Date.now();
    for (let i = 0; i < 200; i++) {
      await sleep(i === 0 ? 3000 : pollMs, signal);
      const min = Math.floor((Date.now() - started) / 60000);
      if (!runId) {
        const r = await gh<{ workflow_runs: { id: number; created_at: string }[] }>('/actions/workflows/promo.yml/runs?event=workflow_dispatch&per_page=10');
        runId = r.workflow_runs.filter((x) => new Date(x.created_at).getTime() >= since).sort((a, b) => a.created_at.localeCompare(b.created_at)).pop()?.id ?? null;
        progress('에이전트를 깨우는 중…');
        continue;
      }
      const run = await gh<{ status: string; conclusion: string | null; html_url: string }>(`/actions/runs/${runId}`);
      if (run.status === 'completed') {
        if (run.conclusion !== 'success') throw new BackendError(`에이전트 실행이 실패했어요. 실행 기록에서 이유를 확인해 주세요: ${run.html_url}`);
        return;
      }
      progress(run.status === 'queued' ? '차례를 기다리는 중…' : `${verb} 중… ${min ? `${min}분째` : '방금 시작'} (보통 2~5분)`);
    }
    throw new BackendError('시간이 너무 오래 걸려요. 잠시 뒤 새로고침해 보세요');
  }

  async function loadDrafts(): Promise<DraftFile[]> {
    let listing: { name: string; path: string; type: string }[] = [];
    try {
      listing = await gh(`/contents/drafts?ref=${DATA}`);
    } catch (e) {
      if (!notFound(e)) throw e;
    }
    const names = listing.filter((x) => x.type === 'file' && x.name.endsWith('.md')).sort((a, b) => b.name.localeCompare(a.name)).slice(0, 40);
    return Promise.all(
      names.map(async (x): Promise<DraftFile> => {
        const got = await read(x.path, DATA);
        if (!got) return { path: x.path, sha: null, draft: null, error: '파일을 찾지 못했어요' };
        try {
          return { path: x.path, sha: got.sha, draft: parseDraft(got.text), error: null };
        } catch (e) {
          return { path: x.path, sha: got.sha, draft: null, error: (e as Error).message };
        }
      }),
    );
  }

  const backend: Backend = {
    kind: 'github',
    label: repo,

    async load() {
      const ref = await branch();
      const [cfg, brand, names] = await Promise.all([read('promo/config.yml', ref), read('promo/brand.md', ref), secretNames().catch(() => new Set<string>())]);
      const parsed = parseConfig(cfg?.text ?? '');
      let hasData = true;
      try {
        await gh(`/branches/${DATA}`);
      } catch (e) {
        if (!notFound(e)) throw e;
        hasData = false;
      }
      const [drafts, state, done] = hasData ? await Promise.all([loadDrafts(), read('state.json', DATA), read('inbox-done.json', DATA)]) : [[], null, null];
      let inboxDone: string[] = [];
      try {
        inboxDone = done ? JSON.parse(done.text) : [];
      } catch {
        inboxDone = [];
      }
      return {
        config: parsed.config,
        configErrors: cfg ? parsed.errors : ['promo/config.yml이 없어요'],
        brandDoc: brand?.text ?? '',
        blogKind: blogKindOf(parsed.config),
        drafts,
        state: parseState(state?.text ?? null).state,
        inboxDone,
        accounts: {
          threads: names.has('THREADS_ACCESS_TOKEN'),
          instagram: names.has('INSTAGRAM_ACCESS_TOKEN'),
          wordpress: names.has('WORDPRESS_USER') && names.has('WORDPRESS_APP_PASSWORD'),
          claude: names.has('ANTHROPIC_API_KEY'),
        },
        hasData,
      };
    },

    async saveAutomation(m, ui, a) {
      const [p] = platformsOf(ui, m.blogKind);
      await editConfig(m, `dashboard: ${ui} automation ${a.on ? 'on' : 'off'}`, (doc) => {
        doc.setIn(['platforms', p, 'enabled'], a.on);
        doc.setIn(['platforms', p, 'schedule'], doc.createNode(slotOf(a), { flow: true }));
        if (ui === 'blog') doc.setIn(['platforms', p === 'wordpress' ? 'naver' : 'wordpress', 'enabled'], false);
      });
      if (a.on) await switchOn();
    },

    async setBlogKind(m, kind) {
      await editConfig(m, `dashboard: blog is ${kind}`, (doc) => {
        if (kind !== 'wordpress') {
          doc.setIn(['platforms', 'naver', 'kind'], kind);
          doc.setIn(['platforms', 'wordpress', 'url'], '');
          if (doc.getIn(['platforms', 'wordpress', 'enabled'])) {
            doc.setIn(['platforms', 'wordpress', 'enabled'], false);
            doc.setIn(['platforms', 'naver', 'enabled'], true);
          }
        }
      });
    },

    async saveBrand(m, b) {
      const ref = await branch();
      await editConfig(m, 'dashboard: brand', (doc) => {
        doc.setIn(['brand', 'name'], b.name);
        doc.setIn(['brand', 'handle'], b.handle);
        doc.setIn(['mode'], b.review ? 'review' : 'auto');
      });
      const cur = await read('promo/brand.md', ref);
      await write('promo/brand.md', b.doc.endsWith('\n') ? b.doc : `${b.doc}\n`, cur?.sha ?? null, ref, 'dashboard: brand description');
      m.brandDoc = b.doc;
    },

    async registerAccount(m, key, fields) {
      if (key === 'wordpress') {
        await putSecret('WORDPRESS_USER', fields.user);
        await putSecret('WORDPRESS_APP_PASSWORD', fields.password);
        await editConfig(m, 'dashboard: wordpress address', (doc) => doc.setIn(['platforms', 'wordpress', 'url'], fields.url.replace(/\/+$/, '')));
        m.accounts.wordpress = true;
        return;
      }
      await putSecret(SECRETS[key], fields.token);
      if (key === 'threads' || key === 'instagram') {
        // The key that lets the agent renew 60-day Meta tokens by itself.
        const names = await secretNames();
        if (!names.has('PROMO_SECRET_KEY')) await putSecret('PROMO_SECRET_KEY', randomKey());
      }
      m.accounts[key] = true;
    },

    async generate(m, ui, topic, progress, signal) {
      const since = await dispatch({ command: 'preview', platform: ui, ...(topic ? { topic } : {}) });
      progress('에이전트를 깨우는 중…');
      await waitRun(since, progress, signal, '레퍼런스를 찾고 글을 쓰는');
      m.drafts = await loadDrafts();
      const targets = platformsOf(ui, m.blogKind);
      const made = m.drafts.find((x) => x.draft && new Date(x.draft.createdAt).getTime() >= since && x.draft.platforms.some((p) => targets.includes(p)));
      if (!made) throw new BackendError('글이 만들어지지 않았어요. 실행 기록을 확인해 주세요');
      return made;
    },

    async saveDraft(file, draft) {
      const sha = await write(file.path, serializeDraft(draft), file.sha, DATA, `dashboard: ${draft.status} ${draft.id}`);
      return { path: file.path, sha, draft, error: null };
    },

    async publish(m, file, progress, signal) {
      const approved = await backend.saveDraft(file, { ...file.draft!, status: 'approved' });
      const since = await dispatch({ command: 'run' });
      progress('올릴 준비 중…');
      await waitRun(since, progress, signal, '올리는');
      const got = await read(file.path, DATA);
      const next = got ? { path: file.path, sha: got.sha, draft: parseDraft(got.text), error: null } : approved;
      m.drafts = m.drafts.map((x) => (x.path === file.path ? next : x));
      return next;
    },

    async markInboxDone(keys) {
      const cur = await read('inbox-done.json', DATA);
      let list: string[] = [];
      try {
        list = cur ? JSON.parse(cur.text) : [];
      } catch {
        list = [];
      }
      await write('inbox-done.json', `${JSON.stringify([...new Set([...list, ...keys])].slice(-500), null, 1)}\n`, cur?.sha ?? null, DATA, 'dashboard: comments handled');
    },

    runLink: () => `https://github.com/${repo}/actions/workflows/promo.yml`,
  };
  return backend;
}

/** owner/repo from a GitHub Pages address (owner.github.io/repo/...), else null. */
export function repoFromLocation(loc: Pick<Location, 'hostname' | 'pathname'>): string | null {
  const m = /^([\w-]+)\.github\.io$/i.exec(loc.hostname);
  const seg = loc.pathname.split('/').filter(Boolean)[0];
  return m && seg && !seg.endsWith('.html') ? `${m[1]}/${seg}` : null;
}
