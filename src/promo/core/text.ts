/** Counting and cleaning helpers for post text. */

const PICTO = /\p{Extended_Pictographic}|‍|️/u;
const encoder = new TextEncoder();

/** Threads counts emoji by their UTF-8 bytes; everything else counts as one. Errs on the long side. */
export function threadsLength(text: string): number {
  let n = 0;
  for (const ch of text) n += PICTO.test(ch) ? encoder.encode(ch).length : 1;
  return n;
}

/** Characters as people see them (Instagram, blog titles, comment replies). */
export function charLength(text: string): number {
  return [...text].length;
}

export function normalizeHashtag(tag: string): string | null {
  const t = tag.trim().replace(/^#+/, '').replace(/[\s#.,!?'"()[\]{}<>]+/g, '');
  return t ? `#${t}` : null;
}

export function uniqueHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = normalizeHashtag(raw);
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

export function countHashtags(text: string): number {
  return (text.match(/(^|\s)#[^\s#]+/gu) ?? []).length;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

export function findUrls(text: string): string[] {
  return (text.match(URL_RE) ?? []).map((u) => u.replace(/[.,!?]+$/, ''));
}

/** A URL is allowed when it starts with one of the allowed URLs (so a path under a site is fine). */
export function isAllowedUrl(url: string, allowed: string[]): boolean {
  const norm = (u: string) => u.replace(/\/+$/, '').toLowerCase();
  return allowed.some((a) => {
    const base = norm(a);
    const u = norm(url);
    return u === base || u.startsWith(`${base}/`) || u.startsWith(`${base}?`) || u.startsWith(`${base}#`);
  });
}

export function findBannedWords(text: string, banned: string[]): string[] {
  const lower = text.toLowerCase();
  return banned.filter((w) => w && lower.includes(w.toLowerCase()));
}

export function slugify(text: string, max = 40): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max)
      .replace(/-+$/, '') || 'post'
  );
}

export function oneLine(text: string, max = 80): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return charLength(t) > max ? `${[...t].slice(0, max - 1).join('')}…` : t;
}
