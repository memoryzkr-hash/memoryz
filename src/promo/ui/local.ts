/** The backend used when the screen is opened from `npm run promo:app`: everything happens on this computer. */
import type { Draft, Reference } from '../core/types';
import { BackendError, type Backend } from './backend';
import type { DraftFile, Model } from './model';

const HEAD = { 'content-type': 'application/json', 'x-promo': '1' };

async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/promo${path}`, body === undefined ? { headers: HEAD } : { method: 'POST', headers: HEAD, body: JSON.stringify(body) });
  } catch {
    throw new BackendError('로컬 앱에 연결하지 못했어요. 터미널에서 npm run promo:app이 켜져 있는지 확인해 주세요');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new BackendError(data.error ?? `오류 (HTTP ${res.status})`);
  return data as T;
}

interface Job {
  status: 'waiting' | 'running' | 'done' | 'failed';
  log: string[];
  result: unknown;
  error: string | null;
}

async function runJob<T>(start: Promise<{ id: string }>, progress: (m: string) => void, signal: AbortSignal): Promise<T> {
  const { id } = await start;
  for (;;) {
    if (signal.aborted) throw new BackendError('취소했어요');
    await new Promise((r) => setTimeout(r, 1500));
    const job = await call<Job>(`/jobs/${id}`);
    if (job.status === 'waiting') progress('앞의 작업이 끝나길 기다리는 중…');
    if (job.status === 'running') progress(job.log.at(-1)?.trim() || '시작하는 중…');
    if (job.status === 'done') return job.result as T;
    if (job.status === 'failed') throw new BackendError(job.error ?? '실패했어요');
  }
}

/** True when this page is served by the local app. */
export async function localAvailable(): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const res = await fetch('/api/promo/ping', { headers: HEAD, signal: ctl.signal });
    clearTimeout(t);
    return res.ok && ((await res.json()) as { mode?: string }).mode === 'local';
  } catch {
    return false;
  }
}

export type LocalModel = Model & { local: { schedulerEveryMin: number; busy: boolean; labels: Record<string, string> } };

export function createLocalBackend(): Backend {
  const reload = async (m: Model) => Object.assign(m, await call<LocalModel>('/model'));
  const backend: Backend = {
    kind: 'local',
    label: '이 컴퓨터',
    load: () => call<LocalModel>('/model'),
    async saveAutomation(m, ui, a) {
      await call('/automation', { ui, automation: a });
      await reload(m);
    },
    async setBlogKind(m, kind) {
      await call('/blog-kind', { kind });
      await reload(m);
    },
    async saveBrand(m, b) {
      await call('/brand', b);
      await reload(m);
    },
    async registerAccount(m, key, fields) {
      const r = await call<{ label: string; warning: string | null }>('/account', { key, fields });
      await reload(m);
      return r.warning ? `${r.label} · ${r.warning}` : r.label;
    },
    async generate(m, ui, topic, progress, signal, chosen = []) {
      const r = await runJob<{ path: string }>(call('/generate', { ui, topic, chosen }), progress, signal);
      await reload(m);
      const file = m.drafts.find((f) => f.path === r.path);
      if (!file) throw new BackendError('만든 글을 찾지 못했어요');
      return file;
    },
    async findReferences(m, ui, topic, progress, signal) {
      const before = new Set(m.references.map((r) => r.url || r.title));
      await runJob(call('/research', { ui, topic }), progress, signal);
      await reload(m);
      const fresh = m.references.filter((r) => !before.has(r.url || r.title));
      if (!fresh.length) throw new BackendError('새 레퍼런스를 찾지 못했어요. 주제를 바꿔 다시 찾아 보세요');
      return fresh;
    },
    async addReference(m, _ui, input) {
      const ref = await call<Reference>('/reference', input);
      m.references = [ref, ...m.references];
      return ref;
    },
    async saveDraft(file, draft: Draft): Promise<DraftFile> {
      await call('/draft', { path: file.path, draft });
      return { ...file, draft };
    },
    async publish(m, file, progress, signal) {
      await runJob(call('/publish', { path: file.path }), progress, signal);
      await reload(m);
      return m.drafts.find((f) => f.path === file.path) ?? file;
    },
    async markInboxDone(keys) {
      await call('/inbox-done', { keys });
    },
    runLink: () => null,
  };
  return backend;
}
