/** Text rules from docs/assistant/03-data.md §1: count what the eye sees, never UTF-16 units. */

const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });

/** Visible characters: 한 = 1, 🙂 = 1, 👨‍👩‍👧 = 1, 🇰🇷 = 1. */
export function charCount(text: string): number {
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}

/** Cuts to at most `max` visible characters without splitting an emoji. */
export function truncateChars(text: string, max: number, ellipsis = '…'): string {
  if (charCount(text) <= max) return text;
  const out: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    if (out.length >= max - ellipsis.length) break;
    out.push(segment);
  }
  return out.join('') + ellipsis;
}

/** Topic names, titles, places: NFC, newlines become one space, trimmed. */
export function cleanSingleLine(text: string): string {
  return text.normalize('NFC').replace(/[\r\n]+/g, ' ').trim();
}

/** Memos, message bodies: NFC, CRLF → LF, trimmed. */
export function cleanMultiLine(text: string): string {
  return text.normalize('NFC').replace(/\r\n?/g, '\n').trim();
}

/** Key for "already exists": `AI 도구` and `ai  도구` are the same topic. */
export function sameKey(text: string): string {
  return cleanSingleLine(text).toLowerCase().replace(/\s+/g, ' ');
}

export type LengthCheck = 'empty' | 'tooLong' | 'ok';

export function checkLength(cleaned: string, max: number, min = 1): LengthCheck {
  const n = charCount(cleaned);
  if (n === 0 && min > 0) return 'empty';
  if (n < min) return 'empty';
  if (n > max) return 'tooLong';
  return 'ok';
}
