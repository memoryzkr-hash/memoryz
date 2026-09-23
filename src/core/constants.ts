/** Arena size in tiles. Side 0 (player) is at the bottom, side 1 (opponent) at the top. */
export const ARENA_W = 18;
export const ARENA_H = 32;

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

/** River band (ground units may only cross on bridges). */
export const RIVER_TOP = 15;
export const RIVER_BOTTOM = 17;
export const BRIDGE_XS = [3.5, 14.5] as const;
export const BRIDGE_HALF_WIDTH = 1;

export const REGULAR_TIME = 180;
export const DOUBLE_ELIXIR_AT = 120;
export const OVERTIME = 60;

export const ELIXIR_START = 5;
export const ELIXIR_MAX = 10;
export const ELIXIR_PER_SECOND = 1 / 2.8;

export const DEPLOY_TIME = 1;

/** Tower layout for side 0; side 1 is mirrored vertically. */
export const TOWER_LAYOUT = [
  { tower: 'king', x: 9, y: 28.5 },
  { tower: 'princess', x: 3.5, y: 25.5 },
  { tower: 'princess', x: 14.5, y: 25.5 },
] as const;

export const TOWER_STATS = {
  king: {
    hp: 2400, damage: 50, hitSpeed: 1.0, range: 7, sightRange: 7, speed: 0,
    radius: 1.8, flying: false, targets: 'all', projectileSpeed: 12,
  },
  princess: {
    hp: 1400, damage: 50, hitSpeed: 0.8, range: 7.5, sightRange: 7.5, speed: 0,
    radius: 1.4, flying: false, targets: 'all', projectileSpeed: 12,
  },
} as const;

/** Converts a y coordinate to the given side's point of view (own side is always the bottom). */
export function relY(side: 0 | 1, y: number): number {
  return side === 0 ? y : ARENA_H - y;
}
