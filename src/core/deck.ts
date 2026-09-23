import { shuffle } from './rng';
import type { Deck } from './types';

export const HAND_SIZE = 4;

export function createDeck(rng: { rngState: number }, cardIds: readonly string[]): Deck {
  if (cardIds.length < HAND_SIZE + 1) throw new Error('Deck needs at least 5 cards');
  const order = shuffle(rng, cardIds);
  return { hand: order.slice(0, HAND_SIZE), queue: order.slice(HAND_SIZE) };
}

/** The card that will replace the next played card. */
export function nextCard(deck: Deck): string {
  return deck.queue[0];
}

/** Plays the card at handIndex: it goes to the back of the queue and the next card takes its slot. */
export function cycleCard(deck: Deck, handIndex: number): string {
  const played = deck.hand[handIndex];
  deck.hand[handIndex] = deck.queue.shift()!;
  deck.queue.push(played);
  return played;
}
