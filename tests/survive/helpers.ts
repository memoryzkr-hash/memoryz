import { sampleConcepts } from '../../src/survive/core/sample';
import type { Concept, Exam } from '../../src/survive/core/types';

export function makeExam(concepts: Concept[] = sampleConcepts(), examAt = '2026-10-09T09:00'): Exam {
  return {
    id: 'e1',
    subject: '약리학',
    examAt,
    createdAt: '2026-10-07T20:00:00.000Z',
    material: { name: 'x', pages: 48, chars: 1000, source: 'sample', analyzer: 'sample', note: null },
    concepts,
    progress: {},
    sessions: [],
    course: null,
  };
}

/** 2026-10-07 20:00 local. */
export const NOW = new Date(2026, 9, 7, 20, 0);
