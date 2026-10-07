import { describe, expect, it } from 'vitest';
import { charCount, checkLength, cleanMultiLine, cleanSingleLine, sameKey, truncateChars } from '../../src/assistant/core/text';

const FAMILY = '👨‍👩‍👧';

describe('charCount: one visible character = 1 (03-data.md §1)', () => {
  it.each([
    ['한', 1],
    ['a', 1],
    ['🙂', 1],
    [FAMILY, 1],
    ['🇰🇷', 1],
    ['AI 도구', 5],
    ['', 0],
  ])('%s → %i', (text, n) => {
    expect(charCount(text)).toBe(n);
  });

  it('counts emoji the way the screen shows them, not in UTF-16 units', () => {
    const thirty = FAMILY.repeat(30);
    expect(thirty.length).toBe(240);
    expect(charCount(thirty)).toBe(30);
  });
});

describe('cleaning', () => {
  it('single line: trims and turns newlines into one space', () => {
    expect(cleanSingleLine('  민수\r\n미팅  ')).toBe('민수 미팅');
  });

  it('multi line: keeps newlines, normalizes CRLF, trims ends', () => {
    expect(cleanMultiLine('  자료 챙기기\r\n발표 10분 \n')).toBe('자료 챙기기\n발표 10분');
  });

  it('composes decomposed Hangul (macOS paste) so lengths match what is shown', () => {
    const nfd = '한글'.normalize('NFD');
    expect(nfd.length).toBe(6);
    expect(cleanSingleLine(nfd)).toBe('한글');
    expect(charCount(cleanSingleLine(nfd))).toBe(2);
  });

  it('whitespace-only is empty', () => {
    expect(checkLength(cleanSingleLine('   \n  '), 30)).toBe('empty');
  });

  it('sameKey ignores case and repeated spaces', () => {
    expect(sameKey('AI 도구')).toBe(sameKey('ai   도구'));
    expect(sameKey('AI 도구')).not.toBe(sameKey('AI도구'));
  });
});

describe('checkLength boundaries', () => {
  it('exactly max is ok, max + 1 is too long', () => {
    expect(checkLength('가'.repeat(30), 30)).toBe('ok');
    expect(checkLength('가'.repeat(31), 30)).toBe('tooLong');
    expect(checkLength(FAMILY.repeat(30), 30)).toBe('ok');
    expect(checkLength(FAMILY.repeat(31), 30)).toBe('tooLong');
  });
});

describe('truncateChars', () => {
  it('never cuts an emoji in half', () => {
    const out = truncateChars(FAMILY.repeat(10), 5);
    expect(out.endsWith('…')).toBe(true);
    expect(charCount(out)).toBe(5);
    expect(out.slice(0, -1)).toBe(FAMILY.repeat(4));
  });

  it('leaves short text alone', () => {
    expect(truncateChars('짧은 글', 10)).toBe('짧은 글');
  });

  it('can cut without an ellipsis', () => {
    expect(truncateChars('가나다라마', 3, '')).toBe('가나다');
  });
});
