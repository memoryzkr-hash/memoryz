import { ARENA_H, ARENA_W, BRIDGE_HALF_WIDTH, BRIDGE_XS, RIVER_BOTTOM, RIVER_TOP } from './constants';
import type { Entity } from './types';

interface Point {
  x: number;
  y: number;
}

/** -1 = inside the river band, 0 = bottom half, 1 = top half. */
function half(y: number): -1 | 0 | 1 {
  if (y >= RIVER_BOTTOM) return 0;
  if (y <= RIVER_TOP) return 1;
  return -1;
}

export function onBridge(x: number): boolean {
  return BRIDGE_XS.some((bx) => Math.abs(x - bx) <= BRIDGE_HALF_WIDTH);
}

function nearestBridge(x: number): number {
  return BRIDGE_XS.reduce((best, bx) => (Math.abs(x - bx) < Math.abs(x - best) ? bx : best));
}

/** Where a unit should walk next to reach (tx, ty), routing ground units over a bridge. */
export function nextWaypoint(e: Entity, tx: number, ty: number): Point {
  const target = { x: tx, y: ty };
  if (e.stats.flying) return target;
  const from = half(e.y);
  const to = half(ty);
  if (from === to) return target;

  if (from === -1) {
    // On a bridge: keep going to the far bank on the target's side.
    if (to === -1) return target;
    return { x: nearestBridge(e.x), y: to === 1 ? RIVER_TOP - 0.05 : RIVER_BOTTOM + 0.05 };
  }

  const bx = BRIDGE_XS.reduce((best, b) =>
    Math.abs(e.x - b) + Math.abs(tx - b) < Math.abs(e.x - best) + Math.abs(tx - best) ? b : best,
  );
  const entryY = from === 0 ? RIVER_BOTTOM + 0.05 : RIVER_TOP - 0.05;
  if (Math.abs(e.x - bx) < 0.5 && Math.abs(e.y - entryY) < 0.5) {
    return { x: bx, y: from === 0 ? RIVER_TOP - 0.05 : RIVER_BOTTOM + 0.05 };
  }
  return { x: bx, y: entryY };
}

export function moveToward(e: Entity, p: Point, dist: number): void {
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const len = Math.hypot(dx, dy);
  if (len <= dist) {
    e.x = p.x;
    e.y = p.y;
  } else {
    e.x += (dx / len) * dist;
    e.y += (dy / len) * dist;
  }
}

/** Keeps entities inside the arena and ground units out of the water. */
export function constrain(e: Entity, prevX: number, prevY: number): void {
  const r = e.stats.radius;
  e.x = Math.min(ARENA_W - r, Math.max(r, e.x));
  e.y = Math.min(ARENA_H - r, Math.max(r, e.y));
  if (!e.stats.flying && half(e.y) === -1 && !onBridge(e.x)) {
    if (half(prevY) === -1 && onBridge(prevX)) {
      // Slid sideways off a bridge: snap back to its edge.
      const bx = nearestBridge(prevX);
      e.x = Math.min(bx + BRIDGE_HALF_WIDTH, Math.max(bx - BRIDGE_HALF_WIDTH, e.x));
    } else {
      e.y = prevY < (RIVER_TOP + RIVER_BOTTOM) / 2 ? Math.min(prevY, RIVER_TOP) : Math.max(prevY, RIVER_BOTTOM);
      e.x = prevX;
    }
  }
}

/** Pushes overlapping units apart. Buildings and towers never move. */
export function separate(entities: Entity[]): void {
  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];
      if (a.stats.flying !== b.stats.flying) continue;
      const aFixed = a.kind !== 'troop';
      const bFixed = b.kind !== 'troop';
      if (aFixed && bFixed) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minD = a.stats.radius + b.stats.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) continue;
      const d = Math.sqrt(d2) || 0.001;
      const overlap = minD - d;
      const nx = d2 === 0 ? 1 : dx / d;
      const ny = d2 === 0 ? 0 : dy / d;
      const aShare = aFixed ? 0 : bFixed ? 1 : b.maxHp / (a.maxHp + b.maxHp);
      const bShare = 1 - aShare;
      // Soften the push so crowds settle instead of jittering.
      const k = 0.5;
      a.x -= nx * overlap * aShare * k;
      a.y -= ny * overlap * aShare * k;
      b.x += nx * overlap * bShare * k;
      b.y += ny * overlap * bShare * k;
    }
  }
}
