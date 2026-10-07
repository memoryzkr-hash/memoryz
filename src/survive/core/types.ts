/** Data shapes for 시험 생존 (docs/survive/PLAN.md). Everything here is plain JSON so it can sit in localStorage. */

/** 'concept' = understand it, 'memorize' = just remember it (numbers, names, lists). */
export type ConceptKind = 'concept' | 'memorize';

export interface Choice {
  question: string;
  options: string[];
  /** Index into options. */
  answer: number;
  /** One line shown after answering. */
  why: string;
}

export interface Concept {
  id: string;
  term: string;
  /** "20초 설명": one to three short sentences. */
  explain: string;
  /** Recall prompt; the student answers in their head. */
  recall: string;
  /** What the recall prompt and the flash card back show. */
  answer: string;
  /** 1 (skippable) … 5 (almost surely on the exam). */
  importance: number;
  kind: ConceptKind;
  mcq: Choice | null;
  /** A second problem on the same idea, asked from another angle. */
  similar: Choice | null;
  /** Position in the material, for keeping ties in reading order. */
  order: number;
}

export type MaterialSource = 'pdf' | 'text' | 'sample';
export type Analyzer = 'local' | 'claude' | 'sample';

export interface Material {
  name: string;
  pages: number;
  chars: number;
  source: MaterialSource;
  analyzer: Analyzer;
  /** Set when only part of the material fit (said out loud on the plan screen). */
  note: string | null;
}

export interface Progress {
  /** 0 … 1, how well the student holds this concept. */
  mastery: number;
  seen: boolean;
  done: boolean;
  /** Got something wrong or said 헷갈림, and has not fixed it yet. */
  shaky: boolean;
  correct: number;
  wrong: number;
}

export interface SessionLog {
  /** YYYY-MM-DD local. */
  date: string;
  seconds: number;
  steps: number;
}

export interface Exam {
  id: string;
  subject: string;
  /** Local wall time 'YYYY-MM-DDTHH:mm'. */
  examAt: string;
  createdAt: string;
  material: Material;
  concepts: Concept[];
  progress: Record<string, Progress>;
  sessions: SessionLog[];
  /** Where the 자동코스 stopped, so leaving mid-concept resumes on the same card. */
  course: CourseState | null;
}

export interface CourseState {
  /** Concept being taught now; null between concepts. */
  conceptId: string | null;
  /** Remaining cards for that concept. */
  queue: Step[];
  /** Shaky concepts to ask again once `due` cards have been answered. */
  reviews: { conceptId: string; due: number; tries: number }[];
  /** Cards answered in this course. */
  answered: number;
  /** The current concept had a miss, 모르겠음 or 헷갈림. */
  trouble: boolean;
}

export type StepKind = 'recall' | 'explain' | 'mcq' | 'flash' | 'similar';

export interface Step {
  kind: StepKind;
  conceptId: string;
  /** Second look at something the student was shaky on. */
  review: boolean;
}

/** What the student pressed. Only these four ideas exist in the UI: 답하기 · 모르겠음 · 헷갈림 · 다음. */
export type Response =
  | { type: 'knew' }
  | { type: 'missed' }
  | { type: 'unsure' }
  | { type: 'dontknow' }
  | { type: 'next' }
  | { type: 'choose'; index: number };
