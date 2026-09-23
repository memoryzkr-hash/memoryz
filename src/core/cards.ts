import cardData from '../data/cards.json';
import type { CardDef } from './types';

export const CARDS: readonly CardDef[] = cardData as CardDef[];

const byId = new Map(CARDS.map((c) => [c.id, c]));

export function getCard(id: string): CardDef {
  const card = byId.get(id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
}

export const DEFAULT_DECK: readonly string[] = CARDS.map((c) => c.id);
