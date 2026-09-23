import { describe, expect, it } from 'vitest';
import { createDeck, cycleCard, nextCard } from '../src/core/deck';
import { DEFAULT_DECK } from '../src/core/cards';

describe('deck', () => {
  it('deals 4 cards and queues the rest', () => {
    const deck = createDeck({ rngState: 1 }, DEFAULT_DECK);
    expect(deck.hand).toHaveLength(4);
    expect(deck.queue).toHaveLength(4);
    expect(new Set([...deck.hand, ...deck.queue]).size).toBe(8);
  });

  it('cycles the played card to the back of the queue', () => {
    const deck = createDeck({ rngState: 1 }, DEFAULT_DECK);
    const played = deck.hand[2];
    const next = nextCard(deck);
    cycleCard(deck, 2);
    expect(deck.hand[2]).toBe(next);
    expect(deck.queue[deck.queue.length - 1]).toBe(played);
  });
});
