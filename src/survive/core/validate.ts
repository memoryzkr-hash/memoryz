/** Checks Claude's analysis before it reaches the screens. Bad items are dropped, not trusted. */
import { squash } from './text';
import type { Choice, Concept, ConceptKind } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = squash(v);
  return s && s.length <= max ? s : null;
};

function checkChoice(v: unknown): Choice | null {
  if (!isObj(v)) return null;
  const question = typeof v.question === 'string' ? v.question.trim() : '';
  const why = str(v.why, 300) ?? '';
  if (!question || question.length > 400 || !Array.isArray(v.options)) return null;
  const options = v.options.map((o) => str(o, 200)).filter((o): o is string => !!o);
  if (options.length !== v.options.length || options.length < 2 || options.length > 5) return null;
  if (new Set(options).size !== options.length) return null;
  const answer = v.answer;
  if (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
  return { question, options, answer, why };
}

export function checkAnalysis(v: unknown): Concept[] {
  if (!isObj(v) || !Array.isArray(v.concepts)) return [];
  const out: Concept[] = [];
  const seen = new Set<string>();
  v.concepts.forEach((raw, order) => {
    if (!isObj(raw)) return;
    const term = str(raw.term, 60);
    const explain = str(raw.explain, 400);
    const recall = typeof raw.recall === 'string' && raw.recall.trim().length <= 300 ? raw.recall.trim() : null;
    const answer = str(raw.answer, 300);
    if (!term || !explain || !recall || !answer || seen.has(term)) return;
    const imp = typeof raw.importance === 'number' ? Math.round(raw.importance) : 3;
    const kind: ConceptKind = raw.kind === 'memorize' ? 'memorize' : 'concept';
    seen.add(term);
    out.push({
      id: `a${order}`,
      term,
      explain,
      recall,
      answer,
      importance: Math.max(1, Math.min(5, imp)),
      kind,
      mcq: checkChoice(raw.mcq),
      similar: checkChoice(raw.similar),
      order,
    });
  });
  return out;
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
