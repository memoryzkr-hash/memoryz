import { describe, expect, it } from 'vitest';
import { analyzeText, estimatePages, toImportance } from '../../src/survive/core/extract';
import { hasBatchim, josa, maskTerm, sentences } from '../../src/survive/core/text';
import { NOTES } from './fixtures';

describe('text helpers', () => {
  it('picks the right particle', () => {
    expect(josa('약동학', '이란/란')).toBe('약동학이란');
    expect(josa('리간드', '이란/란')).toBe('리간드란');
    expect(josa('‘ATP’', '이/가')).toBe('‘ATP’가');
    expect(hasBatchim('세포')).toBe(false);
    expect(hasBatchim('발효')).toBe(false);
    expect(hasBatchim('회로')).toBe(false);
    expect(hasBatchim('과정')).toBe(true);
  });

  it('splits sentences and masks the answer', () => {
    expect(sentences('가는 나이다. 다는 라이다.\n• 마: 바')).toEqual(['가는 나이다.', '다는 라이다.', '• 마: 바']);
    expect(maskTerm('해당과정은 해당과정이다', '해당과정')).toBe('○○은 ○○이다');
  });

  it('spreads importance over 1…5', () => {
    const levels = toImportance(Array.from({ length: 20 }, (_, i) => i));
    expect(Math.max(...levels)).toBe(5);
    expect(Math.min(...levels)).toBe(1);
    expect(levels[19]).toBe(5);
    expect(levels[0]).toBe(1);
  });

  it('estimates pages for pasted text', () => {
    expect(estimatePages(10)).toBe(1);
    expect(estimatePages(15000)).toBe(10);
  });
});

describe('빠른 분석 (lecture notes)', () => {
  const { concepts, method } = analyzeText([NOTES]);
  const terms = concepts.map((c) => c.term);

  it('finds the defined terms in colon, 란 and 는…이다 forms', () => {
    expect(method).toBe('definitions');
    for (const t of ['세포 호흡', '해당과정', '기질 수준 인산화', '시트르산 회로', '아세틸 CoA', '전자전달계', '산화적 인산화', 'ATP 합성효소', '화학삼투', '발효', '젖산 발효', '알코올 발효']) {
      expect(terms).toContain(t);
    }
  });

  it('does not take headings, goals or clauses as terms', () => {
    for (const bad of ['학습목표', '1. 세포 호흡의 개요', '★ 시험에 자주 나옴', '※ 반드시 암기']) expect(terms).not.toContain(bad);
    expect(terms.every((t) => t.length <= 30)).toBe(true);
  });

  it('ranks frequently mentioned and emphasised terms higher', () => {
    const imp = (t: string) => concepts.find((c) => c.term === t)!.importance;
    expect(imp('세포 호흡')).toBeGreaterThanOrEqual(imp('알코올 발효'));
    expect(imp('전자전달계')).toBeGreaterThanOrEqual(imp('화학삼투'));
  });

  it('every concept has a recall prompt and valid choice questions', () => {
    for (const c of concepts) {
      expect(c.recall.length).toBeGreaterThan(3);
      expect(c.answer.length).toBeGreaterThan(3);
      for (const q of [c.mcq, c.similar]) {
        if (!q) continue;
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(new Set(q.options).size).toBe(q.options.length);
        expect(q.options[q.answer]).toBeDefined();
      }
      expect(c.mcq).not.toBeNull();
      // The reverse question must not print the answer in its own text.
      if (c.similar) expect(c.similar.question.includes(`“${c.term}`)).toBe(false);
    }
  });

  it('marks numbers and lists as 암기', () => {
    expect(concepts.find((c) => c.term === '최종 전자 수용체')?.kind).toBe('memorize');
    expect(concepts.find((c) => c.term === '산화적 인산화')?.kind).toBe('concept');
  });

  it('gives the same questions every time (stable shuffles)', () => {
    expect(analyzeText([NOTES]).concepts).toEqual(concepts);
  });
});

describe('빠른 분석 (plain prose fallback)', () => {
  const prose = Array.from({ length: 6 }, () =>
    '광합성 과정에서 엽록체는 빛에너지를 흡수한다. 엽록체 안의 틸라코이드 막에서 물이 분해되고 산소가 발생한다. 캘빈 회로에서 이산화탄소가 고정되어 포도당이 만들어진다. 엽록체의 스트로마에서 캘빈 회로가 진행된다.',
  ).join('\n');

  it('falls back to fill-in-the-blank cards', () => {
    const { concepts, method } = analyzeText([prose]);
    expect(method).toBe('cloze');
    expect(concepts.length).toBeGreaterThanOrEqual(3);
    const c = concepts[0];
    expect(c.recall).toContain('( ? )');
    expect(c.mcq?.options).toContain(c.term);
    expect(c.similar).toBeNull();
  });

  it('empty material gives nothing rather than junk', () => {
    expect(analyzeText(['']).concepts).toEqual([]);
    expect(analyzeText(['12\n13\n- 14 -']).concepts).toEqual([]);
  });
});
