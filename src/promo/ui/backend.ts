/**
 * Everything the dashboard reads or changes goes through a Backend.
 * GitHubBackend works on the repo the agent runs in:
 *   accounts   → encrypted GitHub Actions secrets
 *   automation → promo/config.yml on the default branch (+ the PROMO_ENABLED switch)
 *   글 만들기   → the promo workflow (preview), then the new draft from promo-data
 *   지금 올리기 → the draft marked approved, then the workflow (run)
 */
import { setAutomation, setBlogKind, setBrand, setWordPressUrl } from '../core/config-edit';
import { parseConfig } from '../core/config';
import { parseDraft, serializeDraft } from '../core/draft';
import { parseState } from '../core/state';
import { cleanReference } from '../core/references';
import type { Draft, Reference, ReferenceSet } from '../core/types';
import { blogKindOf, platformsOf, slotOf, type Automation, type BlogKind, type DraftFile, type Model, type UiPlatform } from './model';

export type AccountKey = 'threads' | 'instagram' | 'wordpress' | 'claude' | 'media';

export interface BrandForm {
  name: string;
  handle: string;
  doc: string;
  review: boolean;
}

export interface Backend {
  kind: 'preview' | 'github' | 'local';
  label: string;
  load(): Promise<Model>;
  saveAutomation(m: Model, ui: UiPlatform, a: Automation): Promise<void>;
  setBlogKind(m: Model, kind: BlogKind): Promise<void>;
  saveBrand(m: Model, b: BrandForm): Promise<void>;
  /** Saves a credential; resolves with the connected account's name when the backend can tell. */
  registerAccount(m: Model, key: AccountKey, fields: Record<string, string>): Promise<string | void>;
  /** Generates one post for one platform, following the picked references first. */
  generate(m: Model, ui: UiPlatform, topic: string, progress: (msg: string) => void, signal: AbortSignal, chosen?: Reference[]): Promise<DraftFile>;
  /** Searches for popular posts on a topic and adds them to m.references. Returns the new ones. */
  findReferences(m: Model, ui: UiPlatform, topic: string, progress: (msg: string) => void, signal: AbortSignal): Promise<Reference[]>;
  /** Adds a post the person found (pasted text and/or link) to m.references, analysed where possible. */
  addReference(m: Model, ui: UiPlatform, input: { text: string; url: string }): Promise<Reference>;
  saveDraft(file: DraftFile, draft: Draft): Promise<DraftFile>;
  publish(m: Model, file: DraftFile, progress: (msg: string) => void, signal: AbortSignal): Promise<DraftFile>;
  markInboxDone(keys: string[]): Promise<void>;
  runLink(): string | null;
}

export class BackendError extends Error {}

const DATA = 'promo-data';
const SECRETS: Record<Exclude<AccountKey, 'wordpress' | 'media'>, string> = { threads: 'THREADS_ACCESS_TOKEN', instagram: 'INSTAGRAM_ACCESS_TOKEN', claude: 'ANTHROPIC_API_KEY' };

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

  async function editConfig(m: Model, message: string, edit: (text: string) => string) {
    const ref = await branch();
    const cur = await read('promo/config.yml', ref);
    const text = edit(cur?.text ?? '');
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

  /** The newest few search batches plus the person's own, newest first, without repeats. */
  async function loadReferences(): Promise<Reference[]> {
    let listing: { name: string; path: string; type: string }[] = [];
    try {
      listing = await gh(`/contents/references?ref=${DATA}`);
    } catch (e) {
      if (!notFound(e)) throw e;
      return [];
    }
    const files = listing.filter((x) => x.type === 'file' && x.name.endsWith('.json') && !x.name.startsWith('picked-'));
    const ordered = [...files.filter((x) => x.name === 'mine.json'), ...files.filter((x) => x.name !== 'mine.json').sort((a, b) => b.name.localeCompare(a.name)).slice(0, 6)];
    const out: Reference[] = [];
    const seen = new Set<string>();
    for (const x of ordered) {
      const got = await read(x.path, DATA);
      let list: unknown[] = [];
      try {
        list = got ? ((JSON.parse(got.text) as ReferenceSet).references ?? []) : [];
      } catch {
        list = [];
      }
      for (const r of list.map(cleanReference)) {
        const key = r?.url || r?.title;
        if (r && key && !seen.has(key)) {
          seen.add(key);
          out.push(x.name === 'mine.json' ? { ...r, source: r.source || '직접 추가' } : r);
        }
      }
    }
    return out;
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
          // GitHub Actions brings its own token, and the repository's images are public when the repo is.
          media: true,
        },
        hasData,
        references: hasData ? await loadReferences() : [],
      };
    },

    async saveAutomation(m, ui, a) {
      const [p] = platformsOf(ui, m.blogKind);
      await editConfig(m, `dashboard: ${ui} automation ${a.on ? 'on' : 'off'}`, (t) => setAutomation(t, p, a.on, slotOf(a)));
      if (a.on) await switchOn();
    },

    async setBlogKind(m, kind) {
      await editConfig(m, `dashboard: blog is ${kind}`, (t) => setBlogKind(t, kind));
    },

    async saveBrand(m, b) {
      const ref = await branch();
      await editConfig(m, 'dashboard: brand', (t) => setBrand(t, b));
      const cur = await read('promo/brand.md', ref);
      await write('promo/brand.md', b.doc.endsWith('\n') ? b.doc : `${b.doc}\n`, cur?.sha ?? null, ref, 'dashboard: brand description');
      m.brandDoc = b.doc;
    },

    async registerAccount(m, key, fields) {
      if (key === 'wordpress') {
        await putSecret('WORDPRESS_USER', fields.user);
        await putSecret('WORDPRESS_APP_PASSWORD', fields.password);
        await editConfig(m, 'dashboard: wordpress address', (t) => setWordPressUrl(t, fields.url));
        m.accounts.wordpress = true;
        return;
      }
      if (key === 'media') return;
      await putSecret(SECRETS[key], fields.token);
      if (key === 'threads' || key === 'instagram') {
        // The key that lets the agent renew 60-day Meta tokens by itself.
        const names = await secretNames();
        if (!names.has('PROMO_SECRET_KEY')) await putSecret('PROMO_SECRET_KEY', randomKey());
      }
      m.accounts[key] = true;
    },

    async generate(m, ui, topic, progress, signal, chosen = []) {
      let refs: string | null = null;
      if (chosen.length) {
        refs = `references/picked-${Date.now()}.json`;
        const set: ReferenceSet = { topic, platform: ui, createdAt: new Date().toISOString(), references: chosen };
        await write(refs, `${JSON.stringify(set, null, 1)}\n`, null, DATA, `dashboard: pick ${chosen.length} reference(s)`);
      }
      const since = await dispatch({ command: 'preview', platform: ui, ...(topic ? { topic } : {}), ...(refs ? { refs } : {}) });
      progress('에이전트를 깨우는 중…');
      await waitRun(since, progress, signal, '레퍼런스를 찾고 글을 쓰는');
      m.drafts = await loadDrafts();
      const targets = platformsOf(ui, m.blogKind);
      const made = m.drafts.find((x) => x.draft && new Date(x.draft.createdAt).getTime() >= since && x.draft.platforms.some((p) => targets.includes(p)));
      if (!made) throw new BackendError('글이 만들어지지 않았어요. 실행 기록을 확인해 주세요');
      return made;
    },

    async findReferences(m, ui, topic, progress, signal) {
      const since = await dispatch({ command: 'research', platform: ui, ...(topic ? { topic } : {}) });
      progress('에이전트를 깨우는 중…');
      await waitRun(since, progress, signal, '인기 글을 찾는');
      const all = await loadReferences();
      const fresh = all.filter((r) => !m.references.some((x) => x.url && x.url === r.url));
      m.references = all;
      if (!fresh.length) throw new BackendError('새 레퍼런스를 찾지 못했어요. 주제를 바꿔 다시 찾아 보세요');
      return fresh;
    },

    async addReference(m, _ui, input) {
      // No Claude in the browser here: the pasted text goes in as-is and the writer analyses it.
      const ref = cleanReference({ title: input.text.split('\n')[0].slice(0, 60) || input.url, url: input.url, excerpt: input.text, kind: kindOfUrl(input.url), source: '직접 추가' });
      if (!ref) throw new BackendError('글 내용이나 링크를 넣어 주세요');
      const cur = await read('references/mine.json', DATA);
      let mine: Reference[] = [];
      try {
        mine = cur ? (JSON.parse(cur.text) as ReferenceSet).references : [];
      } catch {
        mine = [];
      }
      const set: ReferenceSet = { topic: '직접 추가', platform: 'all', createdAt: new Date().toISOString(), references: [ref, ...mine].slice(0, 100) };
      await write('references/mine.json', `${JSON.stringify(set, null, 1)}\n`, cur?.sha ?? null, DATA, 'dashboard: add a reference');
      m.references = [ref, ...m.references];
      return ref;
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

export function kindOfUrl(url: string): Reference['kind'] {
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/threads\.(net|com)/i.test(url)) return 'threads';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'video';
  if (/blog\.naver|tistory|brunch|velog|medium|wordpress|blogspot/i.test(url)) return 'blog';
  return 'other';
}

/** owner/repo from a GitHub Pages address (owner.github.io/repo/...), else null. */
export function repoFromLocation(loc: Pick<Location, 'hostname' | 'pathname'>): string | null {
  const m = /^([\w-]+)\.github\.io$/i.exec(loc.hostname);
  const seg = loc.pathname.split('/').filter(Boolean)[0];
  return m && seg && !seg.endsWith('.html') ? `${m[1]}/${seg}` : null;
}
