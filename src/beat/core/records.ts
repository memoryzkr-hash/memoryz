import type { Rank } from './judge';

export interface StageRecord {
  /** Furthest progress in a normal-mode attempt, 0..1. */
  bestPct: number;
  clears: number;
  /** Best clear, or null before the first. */
  rank: Rank | null;
  accuracy: number;
}

export interface Settings {
  /** Added to every press and to the picture: positive = the player hears/acts late. */
  offsetMs: number;
  guide: boolean;
  practice: boolean;
  muted: boolean;
}

export const DEFAULT_SETTINGS: Settings = { offsetMs: 0, guide: true, practice: false, muted: false };

const RANK_ORDER: Record<Rank, number> = { S: 4, A: 3, B: 2, C: 1 };

export type AttemptResult = { cleared: false; pct: number } | { cleared: true; rank: Rank; accuracy: number };

/** Folds one normal-mode attempt into a stage record. `improved` is true when something got better. */
export function mergeRecord(prev: StageRecord | undefined, r: AttemptResult): { record: StageRecord; improved: boolean } {
  const rec: StageRecord = prev ? { ...prev } : { bestPct: 0, clears: 0, rank: null, accuracy: 0 };
  if (!r.cleared) {
    const improved = r.pct > rec.bestPct + 1e-9;
    if (improved) rec.bestPct = r.pct;
    return { record: rec, improved };
  }
  rec.bestPct = 1;
  rec.clears++;
  const better =
    rec.rank === null ||
    RANK_ORDER[r.rank] > RANK_ORDER[rec.rank] ||
    (r.rank === rec.rank && r.accuracy > rec.accuracy + 1e-9);
  if (better) {
    rec.rank = r.rank;
    rec.accuracy = r.accuracy;
  }
  return { record: rec, improved: better };
}

const RECORDS_KEY = 'beat-bounce.records';
const SETTINGS_KEY = 'beat-bounce.settings';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: records last for this visit only.
  }
}

export const loadRecords = (): Record<string, StageRecord> => read<Record<string, StageRecord>>(RECORDS_KEY) ?? {};
export const saveRecords = (r: Record<string, StageRecord>): void => write(RECORDS_KEY, r);
export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) });
export const saveSettings = (s: Settings): void => write(SETTINGS_KEY, s);

/** Median tap offset in ms from the sync screen, or null with too few taps. */
export function syncOffset(deltasMs: number[]): number | null {
  if (deltasMs.length < 6) return null;
  const sorted = [...deltasMs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(median / 5) * 5;
}
