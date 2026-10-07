/**
 * 빠른 분석: works without any AI. Finds "용어 → 설명" pairs in lecture notes, scores how likely each is
 * to be on the exam, and writes recall / multiple-choice / reverse questions from them.
 * When the material has few definitions it falls back to fill-in-the-blank on key sentences.
 */
import { clip, hash, josa, maskTerm, rng, sentences, shuffle, squash } from './text';
import type { Choice, Concept, ConceptKind } from './types';

export const MAX_CONCEPTS = 60;

const BULLET = /^[\s•\-–—·*▪●○◦■□▶►▷◆◇✓✔☞→⇒]*(?:(?:\d{1,2}|[①-⑳]|[a-zA-Z가-하])[.)]\s*|[①-⑳]\s*)?/u;
const EMPHASIS = /중요|핵심|반드시|꼭\s|시험|출제|기출|암기|외우|★|☆|※|!!|필수/;
const STOP = new Set([
  '예', '예시', '참고', '주의', '목차', '그림', '표', '정리', '요약', '결론', '서론', '개요', '특징', '종류', '내용', '정의', '의미',
  '이것', '그것', '여기', '다음', '위', '아래', '문제', '정답', '해설', '보기', '단원', '학습목표', '목표', '출처', 'note', 'tip',
  '그리고', '그러나', '따라서', '또한', '하지만', '즉', '이는', '이때', '경우', '때문', '사용', '방법', '이유', '결과', '부분',
]);
const PARTICLE = /(으로부터|에서부터|에게서|이라는|라는|으로서|으로써|에서는|에서도|이라고|라고|에서|에게|으로|부터|까지|처럼|보다|하고|이며|이고|이다|에는|에도|와는|과는|은|는|이|가|을|를|의|에|로|와|과|도|만|요)$/;
const VERBISH = /(한다|된다|있다|없다|이다|하는|되는|하여|되어|하고|하며|했다|됐다|된|한|함|됨|하면|되면|때|경우|위해|대해|통해)$/;

interface Line {
  text: string;
  page: number;
  heading: boolean;
}

interface Found {
  term: string;
  def: string;
  sentence: string;
  page: number;
  line: number;
  emphasis: boolean;
}

function toLines(pages: string[]): Line[] {
  const out: Line[] = [];
  pages.forEach((p, page) => {
    for (const raw of p.split(/\n/)) {
      const text = squash(raw);
      if (!text || /^\d+$/.test(text) || /^-?\s*\d+\s*-?$/.test(text)) continue;
      const heading =
        text.length <= 40 &&
        !/[.。]$/.test(text) &&
        !/다$/.test(text) &&
        (/^(제\s*\d+\s*[장절편]|[IVXⅠ-Ⅹ]+[.)]|\d+(\.\d+)*[.)]?\s|[■□▣◆#])/.test(text) || text.length <= 18);
      out.push({ text, page, heading });
    }
  });
  return out;
}

function cleanTerm(raw: string): string | null {
  let t = squash(raw.replace(BULLET, ''));
  t = t.replace(/^["'“‘「『<\[(]+|["'”’」』>\]]+$/gu, '').trim();
  if (t.length < 2 && !/^[A-Z]$/.test(t)) return null;
  if (t.length > 30) return null;
  if (t.split(' ').length > 5) return null;
  if (/^[\d\s.,%~\-]+$/.test(t)) return null;
  if (/[.?!。]/.test(t.replace(/\(.*\)/, ''))) return null;
  if (STOP.has(t.toLowerCase())) return null;
  // "★ 시험에 자주 나옴: …" is a sticky note, not a term.
  if (/[★☆※!]/.test(t) || EMPHASIS.test(t)) return null;
  // "광합성 과정에서 엽록체" is the start of a clause, not a name.
  if (t.split(' ').slice(0, -1).some((w) => /(에서|에게|으로|에는|부터|까지|하는|되는|에)$/.test(w))) return null;
  const last = t.split(' ').pop() ?? t;
  if (VERBISH.test(last) && !/\)$/.test(t)) return null;
  return t;
}

function cleanDef(raw: string): string | null {
  // "…하는 과정이다." → "…하는 과정": answers read like flash-card backs, not sentences.
  const d = squash(raw)
    .replace(/^[-–—:：,]\s*/, '')
    .replace(/\s*(이다|입니다|임)\.?$/u, '')
    .replace(/[.。]$/u, '');
  if (d.length < 6 || d.length > 400) return null;
  if (!/[가-힣A-Za-z]/.test(d)) return null;
  return d;
}

const DEF_VERBS = '(?:말한다|의미한다|뜻한다|일컫는다|가리킨다|정의된다|정의한다|이다)';
const IS_DEF = new RegExp(`^(.{1,30}?)(?:은|는)\\s+(.{4,}?${DEF_VERBS})[.。]?$`, 'u');
const RAN_DEF = /^(.{1,30}?)(?:이란|란|라 함은|이라 함은)\s+(.{4,})$/u;
const COLON_DEF = /^([^:：]{1,40}?)\s*[:：]\s*(.{4,})$/u;
const DASH_DEF = /^(.{1,30}?)\s+[-–—=]\s+(.{4,})$/u;
const EN_DEF = /^([A-Za-z][A-Za-z0-9\- ]{1,40}?)\s+(?:is|are|refers to|means)\s+(?:an?\s+|the\s+)?(.{6,})$/u;

function findDefinitions(lines: Line[]): Found[] {
  const found: Found[] = [];
  lines.forEach((line, i) => {
    const near = [lines[i - 1]?.text ?? '', line.text].join(' ');
    const emphasis = EMPHASIS.test(near);
    const tryAdd = (termRaw: string, defRaw: string, sentence: string) => {
      const term = cleanTerm(termRaw);
      const def = cleanDef(defRaw);
      if (!term || !def) return false;
      found.push({ term, def, sentence: squash(sentence), page: line.page, line: i, emphasis });
      return true;
    };
    const body = line.text.replace(BULLET, '');
    // Colon lines in notes ("리간드: 수용체에 결합하는 물질") are the strongest signal.
    const colon = COLON_DEF.exec(body);
    if (colon && !/^https?$/i.test(colon[1]) && tryAdd(colon[1], colon[2], `${colon[1]}: ${colon[2]}`)) return;
    for (const s of sentences(body)) {
      const ran = RAN_DEF.exec(s);
      if (ran && tryAdd(ran[1], ran[2], s)) continue;
      const is = IS_DEF.exec(s);
      if (is && tryAdd(is[1], is[2], s)) continue;
      const en = EN_DEF.exec(s);
      if (en && tryAdd(en[1], en[2], s)) continue;
    }
    const dash = DASH_DEF.exec(body);
    if (dash) tryAdd(dash[1], dash[2], body);
  });
  return found;
}

function countOccurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  const core = needle.replace(/\s*\(.*\)\s*$/, '').trim() || needle;
  const h = /[A-Za-z]/.test(core) ? hay.toLowerCase() : hay;
  const n = /[A-Za-z]/.test(core) ? core.toLowerCase() : core;
  let count = 0;
  for (let i = h.indexOf(n); i !== -1; i = h.indexOf(n, i + n.length)) count++;
  return count;
}

function kindOf(def: string): ConceptKind {
  if (/\d/.test(def)) return 'memorize';
  if ((def.match(/[,·ㆍ、]/g) ?? []).length >= 2) return 'memorize';
  if (def.length < 18) return 'memorize';
  return 'concept';
}

/** Spreads raw scores over 1…5 by rank so every exam has a few 5s and some skippable 1s. */
export function toImportance(scores: number[]): number[] {
  if (scores.length === 0) return [];
  if (scores.length < 5) return scores.map((s) => (s >= Math.max(...scores) ? 4 : 3));
  const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
  const out = new Array<number>(scores.length);
  order.forEach(({ i }, rank) => {
    const q = rank / scores.length;
    out[i] = q < 0.15 ? 5 : q < 0.4 ? 4 : q < 0.7 ? 3 : q < 0.9 ? 2 : 1;
  });
  return out;
}

function recallFor(term: string, kind: ConceptKind): string {
  const t = `‘${term}’`;
  return kind === 'memorize' ? `${t} — 외워야 할 내용은?` : `${josa(t, '이란/란')} 무엇일까요?`;
}

function pickDistractors(pool: string[], correct: string, count: number, seed: number): string[] {
  const seen = new Set([correct]);
  const out: string[] = [];
  for (const p of shuffle(pool, rng(seed))) {
    if (out.length >= count) break;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function choice(question: string, correct: string, distractors: string[], why: string, seed: number): Choice | null {
  if (distractors.length === 0) return null;
  const options = shuffle([correct, ...distractors], rng(seed ^ 0x9e3779b9));
  return { question, options, answer: options.indexOf(correct), why };
}

/** Adds the multiple-choice and reverse questions, using the other concepts as wrong answers. */
export function withQuestions(concepts: Omit<Concept, 'mcq' | 'similar'>[]): Concept[] {
  return concepts.map((c) => {
    const seed = hash(c.term);
    const others = concepts.filter((o) => o.id !== c.id);
    const sameKind = others.filter((o) => o.kind === c.kind);
    const pool = (sameKind.length >= 3 ? sameKind : others).map((o) => clip(o.answer, 70));
    const termPool = (sameKind.length >= 3 ? sameKind : others).map((o) => o.term);
    if (c.answer === c.term) {
      // Fill-in-the-blank concept: the choice question reuses the blank, with other key words as options.
      const mcq = choice(c.recall, c.term, pickDistractors(termPool, c.term, 3, seed), `정답: ${c.term}`, seed);
      return { ...c, mcq, similar: null };
    }
    const answerText = clip(c.answer, 70);
    const mcq = choice(`‘${c.term}’에 대한 설명으로 맞는 것은?`, answerText, pickDistractors(pool, answerText, 3, seed), `‘${c.term}’ = ${clip(c.answer, 90)}`, seed);
    const masked = clip(maskTerm(c.answer, c.term), 110);
    const similar =
      masked.includes('○○') || !masked.includes(c.term)
        ? choice(`다음 설명에 해당하는 것은?\n“${masked}”`, c.term, pickDistractors(termPool, c.term, 3, seed + 1), `${c.term}: ${clip(c.answer, 80)}`, seed + 1)
        : null;
    return { ...c, mcq, similar };
  });
}

/** Fill-in-the-blank fallback for material written as plain prose. */
function clozeConcepts(lines: Line[], skip: Set<string>): Omit<Concept, 'mcq' | 'similar'>[] {
  const all = lines.map((l) => l.text).join('\n');
  const sents = sentences(all).filter((s) => s.length >= 15 && s.length <= 160);
  const freq = new Map<string, number>();
  const tokensOf = (s: string) =>
    s
      .split(/[\s,·()[\]{}"'“”‘’:;/]+/)
      .map((w) => w.replace(/[.!?。]+$/, '').replace(PARTICLE, ''))
      .filter((w) => w.length >= 2 && w.length <= 15 && /[가-힣A-Za-z]/.test(w) && !STOP.has(w.toLowerCase()) && !VERBISH.test(w) && !/^\d/.test(w));
  for (const s of sents) for (const w of new Set(tokensOf(s))) freq.set(w, (freq.get(w) ?? 0) + 1);
  const keywords = [...freq.entries()]
    .filter(([w, n]) => n >= 2 && !skip.has(w))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 40);
  const used = new Set<string>();
  const out: Omit<Concept, 'mcq' | 'similar'>[] = [];
  for (const [word, n] of keywords) {
    const sentence = sents
      .filter((s) => s.includes(word) && !used.has(s))
      .sort((a, b) => (EMPHASIS.test(b) ? 1 : 0) - (EMPHASIS.test(a) ? 1 : 0) || Math.abs(a.length - 70) - Math.abs(b.length - 70))[0];
    if (!sentence) continue;
    used.add(sentence);
    const blanked = sentence.split(word).join('( ? )');
    out.push({
      id: `k${out.length}-${hash(word).toString(36)}`,
      term: word,
      explain: sentence,
      recall: `빈칸에 들어갈 말은?\n${blanked}`,
      answer: word,
      importance: Math.log(1 + n) + (EMPHASIS.test(sentence) ? 1.5 : 0),
      kind: 'memorize',
      order: all.indexOf(sentence),
    });
  }
  return out;
}

export interface Analysis {
  concepts: Concept[];
  /** How the questions were made, for the plan screen. */
  method: 'definitions' | 'cloze' | 'mixed';
}

export function analyzeText(pages: string[]): Analysis {
  const lines = toLines(pages);
  const full = lines.map((l) => l.text).join('\n');
  const headings = lines.filter((l) => l.heading).map((l) => l.text).join('\n');
  const byTerm = new Map<string, Found & { extra: number }>();
  const found = findDefinitions(lines);
  const defLines = new Set(found.map((f) => f.line));
  for (const f of found) {
    const key = f.term.toLowerCase().replace(/\s+/g, '');
    const prev = byTerm.get(key);
    if (prev) {
      prev.extra++;
      prev.emphasis ||= f.emphasis;
    } else byTerm.set(key, { ...f, extra: 0 });
  }

  let raw: Omit<Concept, 'mcq' | 'similar'>[] = [...byTerm.values()].map((f, i) => {
    const kind = kindOf(f.def);
    const occ = countOccurrences(full, f.term);
    const score = 1 + Math.log(1 + occ) * 1.2 + (f.emphasis ? 1.5 : 0) + (countOccurrences(headings, f.term) > 0 ? 1 : 0) + f.extra * 0.5;
    // A follow-up line on the same page that uses the term makes the 20초 설명 less bare.
    // Skip lines that define something else: that concept gets its own card.
    const follow = lines
      .slice(f.line + 1, f.line + 4)
      .find((l, k) => l.page === f.page && l.text.length <= 120 && !l.heading && !defLines.has(f.line + 1 + k) && countOccurrences(l.text, f.term) > 0);
    const tidy = (t: string) =>
      squash(
        t
          .replace(BULLET, '')
          .replace(/[★☆※]/g, '')
          .replace(/^[^:：]{0,20}(중요|핵심|시험|출제|기출|암기|필수)[^:：]{0,12}[:：]\s*/u, ''),
      );
    const base = f.sentence.length <= 160 ? tidy(f.sentence) : `${f.term}: ${clip(f.def, 150)}`;
    return {
      id: `c${i}-${hash(f.term).toString(36)}`,
      term: f.term,
      explain: follow && base.length + follow.text.length < 220 ? `${base} ${tidy(follow.text)}` : base,
      recall: recallFor(f.term, kind),
      answer: clip(f.def, 140),
      importance: score,
      kind,
      order: f.line,
    };
  });

  let method: Analysis['method'] = 'definitions';
  if (raw.length < 6) {
    const cloze = clozeConcepts(lines, new Set(raw.map((c) => c.term)));
    method = raw.length ? 'mixed' : 'cloze';
    raw = raw.concat(cloze.slice(0, Math.max(0, 24 - raw.length)));
  }

  raw = raw.sort((a, b) => b.importance - a.importance).slice(0, MAX_CONCEPTS);
  const levels = toImportance(raw.map((c) => c.importance));
  raw = raw.map((c, i) => ({ ...c, importance: levels[i] })).sort((a, b) => a.order - b.order);
  return { concepts: withQuestions(raw), method };
}

/** Rough page count for pasted text: about 1,500 characters per printed page of notes. */
export function estimatePages(chars: number): number {
  return Math.max(1, Math.round(chars / 1500));
}
