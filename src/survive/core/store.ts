/** localStorage persistence. Screens never touch storage directly. */
import type { Exam } from './types';

export const KEYS = {
  exams: 'survive.v1.exams',
  apiKey: 'survive.v1.apiKey',
} as const;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isExam(v: unknown): v is Exam {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    typeof v.subject === 'string' &&
    typeof v.examAt === 'string' &&
    isObj(v.material) &&
    Array.isArray(v.concepts) &&
    isObj(v.progress) &&
    Array.isArray(v.sessions)
  );
}

export class SurviveStore {
  /** False when the browser refuses storage (some private modes); the app still runs for this visit. */
  readonly available: boolean;
  /** Saved data could not be read; the raw text was kept under `<key>.corrupt`. */
  corrupt = false;
  private exams: Exam[];

  constructor(private readonly storage: StorageLike) {
    this.available = this.probe();
    this.exams = this.load();
  }

  private probe(): boolean {
    try {
      this.storage.setItem('survive.v1.__probe', '1');
      this.storage.removeItem('survive.v1.__probe');
      return true;
    } catch {
      return false;
    }
  }

  private load(): Exam[] {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(KEYS.exams);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('not a list');
      const good = parsed.filter(isExam).map((e) => ({ ...e, course: e.course ?? null }));
      if (good.length !== parsed.length) this.keepCorrupt(raw);
      return good;
    } catch {
      if (raw) this.keepCorrupt(raw);
      return [];
    }
  }

  private keepCorrupt(raw: string): void {
    this.corrupt = true;
    try {
      this.storage.setItem(`${KEYS.exams}.corrupt`, raw);
    } catch {
      // Nothing more we can do; the in-memory list still works.
    }
  }

  /** Returns false when the write failed (full or blocked storage). */
  private save(): boolean {
    try {
      this.storage.setItem(KEYS.exams, JSON.stringify(this.exams));
      return true;
    } catch {
      return false;
    }
  }

  list(): Exam[] {
    return this.exams.slice();
  }

  get(id: string): Exam | undefined {
    return this.exams.find((e) => e.id === id);
  }

  /** Inserts or replaces. Newest first. */
  put(exam: Exam): boolean {
    this.exams = [exam, ...this.exams.filter((e) => e.id !== exam.id)];
    return this.save();
  }

  /** Saves in place without reordering (called after every card). */
  touch(exam: Exam): boolean {
    const i = this.exams.findIndex((e) => e.id === exam.id);
    if (i === -1) return this.put(exam);
    this.exams[i] = exam;
    return this.save();
  }

  remove(id: string): boolean {
    this.exams = this.exams.filter((e) => e.id !== id);
    return this.save();
  }

  apiKey(): string | null {
    try {
      return this.storage.getItem(KEYS.apiKey);
    } catch {
      return null;
    }
  }

  setApiKey(key: string | null): boolean {
    try {
      if (key) this.storage.setItem(KEYS.apiKey, key);
      else this.storage.removeItem(KEYS.apiKey);
      return true;
    } catch {
      return false;
    }
  }
}
