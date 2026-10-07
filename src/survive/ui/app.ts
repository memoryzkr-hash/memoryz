/** What every screen can reach. */
import type { Ai } from '../ai';
import type { SurviveStore } from '../core/store';

export interface Draft {
  subject: string;
  examAt: string;
  file: File | null;
  text: string;
  sample: boolean;
  useClaude: boolean;
}

export interface SessionSummary {
  seconds: number;
  cards: number;
  correct: number;
  finished: number;
  before: number;
  after: number;
  /** Ran out of route, not out of time. */
  routeDone: boolean;
}

export type View =
  | { name: 'home' }
  | { name: 'create'; draft?: Partial<Draft> }
  | { name: 'analyze'; draft: Draft }
  | { name: 'plan'; examId: string; fresh?: boolean }
  | { name: 'course'; examId: string; goalMinutes: number }
  | { name: 'done'; examId: string; summary: SessionSummary };

export interface App {
  readonly store: SurviveStore;
  now(): Date;
  go(view: View, opts?: { replace?: boolean }): void;
  /** null until a key is saved. */
  ai(): Ai | null;
  resetAi(): void;
}
