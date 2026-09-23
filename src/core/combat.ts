import { ARENA_W } from './constants';
import type { Entity, GameState, Side, TargetKind } from './types';

export function canHit(targets: TargetKind, t: Entity): boolean {
  if (targets === 'buildings') return t.kind !== 'troop';
  if (targets === 'ground') return !t.stats.flying;
  return true;
}

/** Distance between the edges of two entities. */
export function edgeDistance(a: Entity, b: Entity): number {
  return Math.hypot(a.x - b.x, a.y - b.y) - a.stats.radius - b.stats.radius;
}

export function isAlive(e: Entity | undefined): e is Entity {
  return !!e && e.hp > 0;
}

export function findEntity(state: GameState, id: number | null): Entity | undefined {
  if (id === null) return undefined;
  return state.entities.find((e) => e.id === id);
}

/** Crown tower a troop walks to when nothing is in sight: its lane's princess tower, else the king. */
export function defaultTowerTarget(state: GameState, e: Entity): Entity | undefined {
  const leftLane = e.x < ARENA_W / 2;
  const enemyTowers = state.entities.filter((t) => t.kind === 'tower' && t.side !== e.side && isAlive(t));
  const princess = enemyTowers.find((t) => t.type === 'princess' && t.x < ARENA_W / 2 === leftLane);
  return princess ?? enemyTowers.find((t) => t.type === 'king');
}

export function findTarget(state: GameState, e: Entity): Entity | undefined {
  const reach = e.kind === 'troop' ? e.stats.sightRange : e.stats.range;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const t of state.entities) {
    if (t.side === e.side || !isAlive(t) || !canHit(e.stats.targets, t)) continue;
    const d = edgeDistance(e, t);
    if (d <= reach && d < bestD) {
      best = t;
      bestD = d;
    }
  }
  if (!best && e.kind === 'troop') best = defaultTowerTarget(state, e);
  return best;
}

export function dealDamage(state: GameState, target: Entity, amount: number): void {
  if (!isAlive(target)) return;
  target.hp -= amount;
  if (target.kind === 'tower' && target.type === 'king') target.active = true;
  state.events.push({ type: 'hit', x: target.x, y: target.y, targetId: target.id });
}

export function applySplash(
  state: GameState,
  side: Side,
  x: number,
  y: number,
  radius: number,
  damage: number,
  targets: TargetKind,
  towerScale: number,
): void {
  for (const t of state.entities) {
    if (t.side === side || !isAlive(t) || !canHit(targets, t)) continue;
    if (Math.hypot(t.x - x, t.y - y) <= radius + t.stats.radius) {
      dealDamage(state, t, t.kind === 'tower' ? damage * towerScale : damage);
    }
  }
}

export function attack(state: GameState, e: Entity, target: Entity): void {
  const s = e.stats;
  state.events.push({ type: 'attack', id: e.id, tx: target.x, ty: target.y, ranged: !!s.projectileSpeed });
  if (s.projectileSpeed) {
    state.projectiles.push({
      id: state.nextId++,
      side: e.side,
      source: e.type,
      x: e.x,
      y: e.y,
      tx: target.x,
      ty: target.y,
      targetId: target.id,
      speed: s.projectileSpeed,
      damage: s.damage,
      splash: s.splash ?? 0,
      targets: s.targets,
      towerScale: 1,
      isSpell: false,
    });
  } else if (s.splash) {
    const [x, y] = s.selfSplash ? [e.x, e.y] : [target.x, target.y];
    applySplash(state, e.side, x, y, s.splash, s.damage, s.targets, 1);
  } else {
    dealDamage(state, target, s.damage);
  }
}
