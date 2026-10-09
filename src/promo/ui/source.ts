/**
 * Where the dashboard reads and writes. GitHub mode talks to the repo the agent runs in:
 * promo/config.yml on the default branch, records on promo-data, runs through workflow_dispatch.
 */
import { parseConfig } from '../core/config';
import { parseDraft, serializeDraft } from '../core/draft';
import { parseState } from '../core/state';
import type { Draft, PromoConfig, PromoState } from '../core/types';

export interface DraftFile {
  path: string;
  sha: string | null;
  draft: Draft | null;
  /** Why the file could not be read, when draft is null. */
  error: string | null;
}

export interface Snapshot {
  config: PromoConfig | null;
  configErrors: string[];
  state: PromoState;
  drafts: DraftFile[];
  report: string | null;
  inboxDone: string[];
  /** False until the agent has run once and created the promo-data branch. */
  hasData: boolean;
  loadedAt: Date;
}

export type WorkflowCommand = 'run' | 'post-now' | 'preview' | 'comments' | 'check';

export interface Source {
  kind: 'demo' | 'github';
  label: string;
  load(): Promise<Snapshot>;
  saveDraft(file: DraftFile, draft: Draft, message: string): Promise<DraftFile>;
  markInboxDone(keys: string[]): Promise<void>;
  runWorkflow(command: WorkflowCommand, topic: string | null): Promise<void>;
  links: {
    draft(path: string): string | null;
    config(): string | null;
    actions(): string | null;
  };
}

export class SourceError extends Error {}

const DATA_BRANCH = 'promo-data';
const MAX_DRAFTS = 40;

const decode = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const encode = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

export function createGitHubSource(repo: string, token: string, f: typeof fetch = fetch.bind(globalThis)): Source {
  const api = `https://api.github.com/repos/${repo}`;
  let defaultBranch: string | null = null;

  async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await f(`${api}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...init.headers },
      });
    } catch {
      throw new SourceError('GitHub에 연결하지 못했어요. 인터넷 연결을 확인해 주세요');
    }
    if (res.status === 401) throw new SourceError('토큰이 맞지 않거나 만료됐어요. 설정에서 토큰을 다시 넣어 주세요');
    if (res.status === 403) throw new SourceError('토큰 권한이 부족해요 (Contents, Actions 읽기·쓰기 필요)');
    if (res.status === 404) throw Object.assign(new SourceError('없음'), { notFound: true });
    if (res.status === 409) throw new SourceError('다른 곳에서 먼저 바뀌었어요. 새로고침 후 다시 해 주세요');
    if (!res.ok) throw new SourceError(`GitHub 오류 (HTTP ${res.status})`);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }
  const notFound = (e: unknown) => (e as { notFound?: boolean }).notFound === true;

  async function file(path: string, ref: string): Promise<{ text: string; sha: string } | null> {
    try {
      const r = await gh<{ content: string; sha: string }>(`/contents/${path}?ref=${encodeURIComponent(ref)}`);
      return { text: decode(r.content), sha: r.sha };
    } catch (e) {
      if (notFound(e)) return null;
      throw e;
    }
  }

  async function branch(): Promise<string> {
    if (!defaultBranch) {
      try {
        defaultBranch = (await gh<{ default_branch: string }>('')).default_branch;
      } catch (e) {
        if (notFound(e)) throw new SourceError(`저장소 ${repo}을(를) 찾지 못했어요. 이름과 토큰 권한을 확인해 주세요`);
        throw e;
      }
    }
    return defaultBranch;
  }

  async function put(path: string, text: string, sha: string | null, message: string): Promise<string> {
    const r = await gh<{ content: { sha: string } }>(`/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: encode(text), branch: DATA_BRANCH, ...(sha ? { sha } : {}) }),
    });
    return r.content.sha;
  }

  return {
    kind: 'github',
    label: repo,

    async load() {
      const main = await branch();
      const cfg = await file('promo/config.yml', main);
      const parsed = cfg ? parseConfig(cfg.text) : null;
      let hasData = true;
      let listing: { name: string; path: string; sha: string; type: string }[] = [];
      try {
        listing = await gh(`/contents/drafts?ref=${DATA_BRANCH}`);
      } catch (e) {
        if (!notFound(e)) throw e;
        try {
          await gh(`/branches/${DATA_BRANCH}`);
        } catch (e2) {
          if (notFound(e2)) hasData = false;
          else throw e2;
        }
      }
      const names = listing.filter((x) => x.type === 'file' && x.name.endsWith('.md')).sort((a, b) => b.name.localeCompare(a.name)).slice(0, MAX_DRAFTS);
      const drafts = await Promise.all(
        names.map(async (x): Promise<DraftFile> => {
          const got = await file(x.path, DATA_BRANCH);
          if (!got) return { path: x.path, sha: null, draft: null, error: '파일을 찾지 못했어요' };
          try {
            return { path: x.path, sha: got.sha, draft: parseDraft(got.text), error: null };
          } catch (e) {
            return { path: x.path, sha: got.sha, draft: null, error: (e as Error).message };
          }
        }),
      );
      const [state, report, done] = hasData
        ? await Promise.all([file('state.json', DATA_BRANCH), file('report.md', DATA_BRANCH), file('inbox-done.json', DATA_BRANCH)])
        : [null, null, null];
      let inboxDone: string[] = [];
      try {
        inboxDone = done ? (JSON.parse(done.text) as string[]) : [];
      } catch {
        inboxDone = [];
      }
      return {
        config: parsed?.config ?? null,
        configErrors: cfg ? parsed!.errors : ['promo/config.yml이 기본 브랜치에 없어요'],
        state: parseState(state?.text ?? null).state,
        drafts,
        report: report?.text ?? null,
        inboxDone,
        hasData,
        loadedAt: new Date(),
      };
    },

    async saveDraft(fileRef, draft, message) {
      const sha = await put(fileRef.path, serializeDraft(draft), fileRef.sha, message);
      return { path: fileRef.path, sha, draft, error: null };
    },

    async markInboxDone(keys) {
      const cur = await file('inbox-done.json', DATA_BRANCH);
      let list: string[] = [];
      try {
        list = cur ? (JSON.parse(cur.text) as string[]) : [];
      } catch {
        list = [];
      }
      const next = [...new Set([...list, ...keys])].slice(-500);
      await put('inbox-done.json', `${JSON.stringify(next, null, 1)}\n`, cur?.sha ?? null, `dashboard: mark ${keys.length} comment(s) handled`);
    },

    async runWorkflow(command, topic) {
      const ref = await branch();
      try {
        await gh('/actions/workflows/promo.yml/dispatches', {
          method: 'POST',
          body: JSON.stringify({ ref, inputs: { command, ...(topic ? { topic } : {}) } }),
        });
      } catch (e) {
        if (notFound(e)) throw new SourceError(`기본 브랜치(${ref})에 promo.yml 워크플로가 없어요. 이 작업을 기본 브랜치에 합쳐 주세요`);
        throw e;
      }
    },

    links: {
      draft: (path) => `https://github.com/${repo}/blob/${DATA_BRANCH}/${path}`,
      config: () => `https://github.com/${repo}/edit/${defaultBranch ?? 'main'}/promo/config.yml`,
      actions: () => `https://github.com/${repo}/actions/workflows/promo.yml`,
    },
  };
}

/** owner/repo from a GitHub Pages address (owner.github.io/repo/...), else null. */
export function repoFromLocation(loc: Pick<Location, 'hostname' | 'pathname'>): string | null {
  const m = /^([\w-]+)\.github\.io$/i.exec(loc.hostname);
  const seg = loc.pathname.split('/').filter(Boolean)[0];
  return m && seg && !seg.endsWith('.html') ? `${m[1]}/${seg}` : null;
}

export { DATA_BRANCH };
export type { PromoState };
