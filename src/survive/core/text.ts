/** Korean text helpers shared by the local analyzer and the screens. */

/** True when the last Hangul syllable has a final consonant. Latin/digits: guessed from common endings. */
export function hasBatchim(word: string): boolean {
  const w = word.trim().replace(/[\s)"'”’\]]+$/u, '');
  const last = w.charCodeAt(w.length - 1);
  if (last >= 0xac00 && last <= 0xd7a3) return (last - 0xac00) % 28 !== 0;
  if (/[0-9]$/.test(w)) return /[013678]$/.test(w);
  // Acronyms are read letter by letter: only 엘·엠·엔·알 end in a consonant.
  if (/[A-Z]{2,}$/.test(w)) return /[LMNR]$/.test(w);
  return /[bcdgklmnpqt]$/i.test(w);
}

/** josa('리간드', '이/가') → '리간드가'. Pairs: 이/가, 은/는, 을/를, 과/와, 이란/란, (이)라는. */
export function josa(word: string, pair: '이/가' | '은/는' | '을/를' | '과/와' | '이란/란'): string {
  const [withB, without] = pair.split('/');
  return word + (hasBatchim(word) ? withB : without);
}

export function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function clip(s: string, max: number): string {
  const t = squash(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut) + '…';
}

/** Splits prose into sentences. Lines that look like bullets stay whole. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = squash(raw);
    if (!line) continue;
    const parts = line.split(/(?<=[.!?。])\s+(?=\S)/u);
    for (const p of parts) if (p.trim()) out.push(p.trim());
  }
  return out;
}

/** Stable 32-bit hash (FNV-1a) so shuffles do not change between visits. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Hides the term inside its own description so the reverse question does not give itself away. */
export function maskTerm(text: string, term: string): string {
  const core = term.replace(/\s*\(.*\)\s*$/, '').trim();
  const words = [term, core].filter((w, i, all) => w.length >= 1 && all.indexOf(w) === i);
  let out = text;
  for (const w of words) out = out.split(w).join('○○');
  return out;
}
