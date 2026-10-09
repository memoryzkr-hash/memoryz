import { normalizeAccount, type Account } from './core';

/** Where accounts live: the claude.ai artifact db (follows the user across devices) or this browser. */
export interface AccountStore {
  kind: 'cloud' | 'local';
  /** Calls `cb` now-ish and on every change, including other devices' writes for the cloud store. */
  subscribe(cb: (accounts: Account[]) => void, onError: (message: string) => void): void;
  save(a: Account): Promise<void>;
  remove(id: string): Promise<void>;
}

const LOCAL_KEY = 'claude-usage/accounts/v1';

export function localStore(): AccountStore {
  let listener: ((a: Account[]) => void) | null = null;
  const read = (): Account[] => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? '[]');
      return Array.isArray(raw) ? raw.map((r, i) => normalizeAccount(r, `local-${i}`, new Date())) : [];
    } catch {
      return [];
    }
  };
  const write = (list: Account[]) => {
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
    } catch {
      throw new Error('이 브라우저에 저장할 수 없어요. 개인정보 보호 모드라면 일반 창에서 열어 주세요.');
    }
    listener?.(list);
  };
  // Another tab editing the same list.
  window.addEventListener('storage', (e) => {
    if (e.key === LOCAL_KEY) listener?.(read());
  });
  return {
    kind: 'local',
    subscribe(cb) {
      listener = cb;
      cb(read());
    },
    async save(a) {
      const list = read();
      const i = list.findIndex((x) => x.id === a.id);
      if (i >= 0) list[i] = a;
      else list.push(a);
      write(list);
    },
    async remove(id) {
      write(read().filter((x) => x.id !== id));
    },
  };
}

// Minimal slice of the artifact db API this page uses.
interface Snap {
  id: string;
  data(): Record<string, unknown> | undefined;
}
interface DocRef {
  set(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface Collection {
  doc(id: string): DocRef;
  onSnapshot(next: (s: { docs: Snap[] }) => void, error?: (e: { code: string; message: string }) => void): () => void;
}
interface Db {
  collection(path: string): Collection;
}

const COLLECTION = 'accounts';

function cloudStore(db: Db): AccountStore {
  const col = db.collection(COLLECTION);
  const fail = (e: unknown): never => {
    const code = (e as { code?: string })?.code;
    if (code === 'quota_exceeded') throw new Error('저장 공간이 가득 찼어요. 쓰지 않는 계정을 지워 주세요.');
    if (code === 'invalid_argument') throw new Error('이 페이지에 저장할 권한이 없어요. 소유자 계정으로 열어 주세요.');
    throw new Error('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  };
  return {
    kind: 'cloud',
    subscribe(cb, onError) {
      col.onSnapshot(
        (s) => cb(s.docs.map((d) => normalizeAccount(d.data(), d.id, new Date()))),
        () => onError('클라우드 목록을 더 이상 받지 못해요. 페이지를 새로 고쳐 주세요.'),
      );
    },
    async save(a) {
      await col
        .doc(a.id)
        .set({ ...a })
        .catch(fail);
    },
    async remove(id) {
      await col.doc(id).delete().catch(fail);
    },
  };
}

/** Uses the artifact db when this page runs as a claude.ai artifact, else localStorage. */
export async function openStore(): Promise<AccountStore> {
  const claude = (window as unknown as { claude?: { use(name: string): Promise<unknown> } }).claude;
  if (claude?.use) {
    try {
      const db = (await claude.use('db')) as Db | null;
      if (db) return cloudStore(db);
    } catch {
      // fall through to local
    }
  }
  return localStore();
}
