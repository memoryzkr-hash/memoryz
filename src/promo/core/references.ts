/** Reading the references a person picked in the dashboard (promo-data/references/*.json). */
import { REFERENCE_KINDS, type Reference } from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function cleanReference(v: unknown): Reference | null {
  if (!isObj(v)) return null;
  const url = str(v.url, 500);
  const title = str(v.title, 200);
  const excerpt = str(v.excerpt, 3000);
  if (!title && !excerpt) return null;
  if (url && !/^https?:\/\//.test(url)) return null;
  const kind = REFERENCE_KINDS.includes(v.kind as Reference['kind'] & string) ? (v.kind as Reference['kind']) : 'other';
  return {
    title: title || excerpt.split('\n')[0].slice(0, 60),
    url,
    note: str(v.note, 300),
    kind,
    source: str(v.source, 80),
    hook: str(v.hook, 200),
    structure: str(v.structure, 300),
    why: str(v.why, 300),
    popularity: str(v.popularity, 60),
    ...(excerpt ? { excerpt } : {}),
  };
}

/** Accepts a ReferenceSet ({references: [...]}) or a plain list. Unknown or broken input gives []. */
export function parseChosen(text: string | null): Reference[] {
  if (!text) return [];
  try {
    const v = JSON.parse(text);
    const list = Array.isArray(v) ? v : isObj(v) && Array.isArray(v.references) ? v.references : [];
    return list.map(cleanReference).filter((r): r is Reference => r !== null).slice(0, 8);
  } catch {
    return [];
  }
}
