import { ARENA_H, ARENA_W } from '../core/constants';

export const GAME_W = 720;
export const GAME_H = 1280;

export const TILE = 32;
export const ARENA_X = (GAME_W - ARENA_W * TILE) / 2;
export const ARENA_Y = 56;
export const ARENA_PX_W = ARENA_W * TILE;
export const ARENA_PX_H = ARENA_H * TILE;

export const UI_Y = ARENA_Y + ARENA_PX_H + 8;

export const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', 'WenQuanYi Zen Hei', sans-serif";

export const COLORS = {
  side: [0x3b82f6, 0xef4444],
  sideDark: [0x1e3a8a, 0x7f1d1d],
  grassA: 0x5fae4f,
  grassB: 0x57a347,
  path: 0xc9b27c,
  river: 0x3aa0d8,
  riverDark: 0x2b7fb0,
  bridge: 0x8b5a2b,
  elixir: 0xd946ef,
  panel: 0x1f2433,
};

export function toScreen(x: number, y: number): { x: number; y: number } {
  return { x: ARENA_X + x * TILE, y: ARENA_Y + y * TILE };
}

export function toWorld(px: number, py: number): { x: number; y: number } {
  return { x: (px - ARENA_X) / TILE, y: (py - ARENA_Y) / TILE };
}

export function inArena(px: number, py: number): boolean {
  return px >= ARENA_X && px < ARENA_X + ARENA_PX_W && py >= ARENA_Y && py < ARENA_Y + ARENA_PX_H;
}
