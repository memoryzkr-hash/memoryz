import { DOUBLE_ELIXIR_AT, ELIXIR_MAX, ELIXIR_PER_SECOND } from './constants';
import type { GameState } from './types';

export function elixirMultiplier(state: GameState): number {
  return state.phase === 'overtime' || state.time >= DOUBLE_ELIXIR_AT ? 2 : 1;
}

export function regenerateElixir(state: GameState, dt: number): void {
  const gain = ELIXIR_PER_SECOND * elixirMultiplier(state) * dt;
  for (const p of state.players) p.elixir = Math.min(ELIXIR_MAX, p.elixir + gain);
}
