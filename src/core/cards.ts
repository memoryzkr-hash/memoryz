import cardData from '../data/cards.json';
import type { CardDef } from './types';

export const CARDS: readonly CardDef[] = cardData as CardDef[];

const byId = new Map(CARDS.map((c) => [c.id, c]));

export function getCard(id: string): CardDef {
  const card = byId.get(id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
}

export const DECK_SIZE = 8;

export const DEFAULT_DECK: readonly string[] = [
  'knight', 'archers', 'giant', 'goblins', 'babydragon', 'skeletons', 'fireball', 'cannon',
];

/** Decks the AI picks from, each with a win condition, a spell and air defense. */
export const AI_DECKS: readonly (readonly string[])[] = [
  DEFAULT_DECK,
  ['hogrider', 'musketeer', 'valkyrie', 'skeletons', 'goblins', 'fireball', 'arrows', 'cannon'],
  ['giant', 'minipekka', 'minions', 'bomber', 'archers', 'babydragon', 'arrows', 'knight'],
];

/** Returns a legal deck: 8 distinct known cards, falling back to the default deck. */
export function sanitizeDeck(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [...DEFAULT_DECK];
  const valid = [...new Set(ids.filter((id): id is string => typeof id === 'string' && byId.has(id)))];
  return valid.length === DECK_SIZE ? valid : [...DEFAULT_DECK];
}
