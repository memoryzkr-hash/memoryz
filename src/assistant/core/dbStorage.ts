/**
 * A localStorage look-alike backed by the artifact's database, so AssistantStore works
 * unchanged inside a Claude artifact. Each key is one private document under
 * `data/users/<viewer id>/` (private even from the artifact owner), so a person's topics,
 * briefings and events follow them across devices.
 *
 * Reads come from memory (loaded once at start); writes update memory at once and reach the
 * database in the background, one write at a time per key, coalescing bursts.
 */
import type { StorageLike } from './store';

/** The slice of the artifact `db` capability this module uses. */
export interface DocLike {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
export interface DbLike {
  collection(path: string): { doc(id: string): DocLike };
}

export interface DbStorage extends StorageLike {
  /** Resolves once every queued write has reached the database (or failed). */
  flush(): Promise<void>;
}

/** Keys that are never written to the database (the store's write probe). */
const LOCAL_ONLY = /__probe$/;

export async function createDbStorage(
  db: DbLike,
  userId: string,
  keys: readonly string[],
  onError: (key: string, error: unknown) => void = () => {},
): Promise<DbStorage> {
  const col = db.collection(`data/users/${userId}`);
  const cache = new Map<string, string>();

  await Promise.all(
    keys.map(async (key) => {
      const snap = await col.doc(key).get();
      const v = snap.exists ? snap.data()?.v : undefined;
      if (typeof v === 'string') cache.set(key, v);
    }),
  );

  /** Latest value waiting to be written per key; `null` = delete. */
  const pending = new Map<string, string | null>();
  const running = new Map<string, Promise<void>>();

  const pump = (key: string): Promise<void> => {
    const existing = running.get(key);
    if (existing) return existing;
    const job = (async () => {
      while (pending.has(key)) {
        const value = pending.get(key)!;
        pending.delete(key);
        try {
          if (value === null) await col.doc(key).delete();
          else await col.doc(key).set({ v: value });
        } catch (e) {
          onError(key, e);
        }
      }
    })().finally(() => running.delete(key));
    running.set(key, job);
    return job;
  };

  const queue = (key: string, value: string | null) => {
    if (LOCAL_ONLY.test(key)) return;
    pending.set(key, value);
    void pump(key);
  };

  return {
    getItem: (key) => cache.get(key) ?? null,
    setItem: (key, value) => {
      cache.set(key, String(value));
      queue(key, String(value));
    },
    removeItem: (key) => {
      cache.delete(key);
      queue(key, null);
    },
    async flush() {
      while (running.size) await Promise.all([...running.values()]);
    },
  };
}
