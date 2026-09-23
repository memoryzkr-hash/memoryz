import { DEFAULT_DECK } from '../src/core/cards';
import { createGame } from '../src/core/sim';
import type { GameState, Side } from '../src/core/types';

export function newGame(seed = 42): GameState {
  return createGame({ seed, decks: [DEFAULT_DECK, DEFAULT_DECK] });
}

/** Puts `cardId` into hand slot 0 and gives the player enough elixir to play it. */
export function forceHand(state: GameState, side: Side, cardId: string): void {
  const deck = state.players[side].deck;
  const qi = deck.queue.indexOf(cardId);
  if (qi >= 0) [deck.queue[qi], deck.hand[0]] = [deck.hand[0], deck.queue[qi]];
  else {
    const hi = deck.hand.indexOf(cardId);
    [deck.hand[hi], deck.hand[0]] = [deck.hand[0], deck.hand[hi]];
  }
  state.players[side].elixir = 10;
}

export function towers(state: GameState, side: Side) {
  return state.entities.filter((e) => e.kind === 'tower' && e.side === side);
}
