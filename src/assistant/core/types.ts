/** Data shapes from docs/assistant/03-data.md §3. */

export type BriefingLanguage = 'ko+en' | 'ko';

export interface Settings {
  searchesPerTopic: number;
  briefingLanguage: BriefingLanguage;
}

export interface Topic {
  id: string;
  name: string;
  createdAt: string;
}

export interface Source {
  title: string;
  url: string;
  lang: 'ko' | 'en' | 'other';
}

export interface BriefingItem {
  topicId: string;
  topicName: string;
  status: 'ok' | 'empty' | 'error';
  bullets: string[];
  sources: Source[];
  error?: string;
}

export interface Briefing {
  id: string;
  date: string;
  createdAt: string;
  language: BriefingLanguage;
  items: BriefingItem[];
}

export interface CalEvent {
  id: string;
  title: string;
  date: string;
  start: string | null;
  end: string | null;
  location: string | null;
  memo: string | null;
  timeZone: string;
  source: 'ai' | 'manual';
  createdAt: string;
  updatedAt: string;
}

/** What the confirm card (S2a) edits: every field as typed, `''` when blank. */
export interface EventDraft {
  title: string;
  date: string;
  start: string;
  end: string;
  location: string;
  memo: string;
}

export type EventField = keyof EventDraft;

export type Relation = 'boss' | 'coworker' | 'friend' | 'family' | 'client' | 'custom';
export type Tone = 'polite' | 'casual';

export interface MessageRequest {
  relation: Relation;
  customRelation: string;
  name: string;
  intent: string;
  tone: Tone;
  event: CalEvent | null;
}
