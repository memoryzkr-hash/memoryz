import Phaser from 'phaser';
import { ARENA_H, ARENA_W, BRIDGE_HALF_WIDTH, BRIDGE_XS, RIVER_BOTTOM, RIVER_TOP } from '../core/constants';
import { ARENA_PX_H, ARENA_PX_W, ARENA_X, ARENA_Y, COLORS, TILE, toScreen } from './layout';

/** Draws the static battlefield: checkered grass, lanes, river and bridges. */
export function drawArena(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  for (let ty = 0; ty < ARENA_H; ty++) {
    for (let tx = 0; tx < ARENA_W; tx++) {
      g.fillStyle((tx + ty) % 2 === 0 ? COLORS.grassA : COLORS.grassB);
      g.fillRect(ARENA_X + tx * TILE, ARENA_Y + ty * TILE, TILE, TILE);
    }
  }

  // Dirt paths along each lane and in front of the king towers.
  g.fillStyle(COLORS.path, 0.55);
  for (const bx of BRIDGE_XS) {
    const p = toScreen(bx - 0.6, 5);
    g.fillRect(p.x, p.y, 1.2 * TILE, 22 * TILE);
  }
  for (const y of [5, 27]) {
    const p = toScreen(3.5, y - 0.6);
    g.fillRect(p.x, p.y, 11 * TILE, 1.2 * TILE);
  }

  const river = toScreen(0, RIVER_TOP);
  g.fillStyle(COLORS.river);
  g.fillRect(river.x, river.y, ARENA_PX_W, (RIVER_BOTTOM - RIVER_TOP) * TILE);
  g.fillStyle(COLORS.riverDark, 0.6);
  for (let i = 0; i < ARENA_W; i += 2) g.fillRect(river.x + i * TILE + 6, river.y + 20 + (i % 4) * 6, 18, 3);

  for (const bx of BRIDGE_XS) {
    const p = toScreen(bx - BRIDGE_HALF_WIDTH, RIVER_TOP - 0.3);
    const w = BRIDGE_HALF_WIDTH * 2 * TILE;
    const h = (RIVER_BOTTOM - RIVER_TOP + 0.6) * TILE;
    g.fillStyle(COLORS.bridge);
    g.fillRect(p.x, p.y, w, h);
    g.lineStyle(2, 0x5c3a1a);
    for (let i = 1; i < 6; i++) g.lineBetween(p.x, p.y + (h * i) / 6, p.x + w, p.y + (h * i) / 6);
    g.strokeRect(p.x, p.y, w, h);
  }

  g.lineStyle(4, 0x000000, 0.35);
  g.strokeRect(ARENA_X, ARENA_Y, ARENA_PX_W, ARENA_PX_H);
}
