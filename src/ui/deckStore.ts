import { sanitizeDeck } from '../core/cards';

const KEY = 'memoryz-royale.deck';

/** The player's saved deck. Storage can be unavailable (private mode), so it always falls back. */
export function loadDeck(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitizeDeck(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeDeck(null);
  }
}

export function saveDeck(deck: readonly string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(deck));
  } catch {
    // Not persisted; the deck still applies for this session via the scene data.
  }
}
