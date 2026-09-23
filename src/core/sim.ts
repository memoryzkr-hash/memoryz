import { getCard } from './cards';
import { attack, applySplash, dealDamage, edgeDistance, findEntity, findTarget, isAlive } from './combat';
import {
  ARENA_H,
  ARENA_W,
  DEPLOY_TIME,
  DT,
  ELIXIR_START,
  OVERTIME,
  REGULAR_TIME,
  RIVER_BOTTOM,
  RIVER_TOP,
  TOWER_LAYOUT,
  TOWER_STATS,
  relY,
} from './constants';
import { createDeck, cycleCard } from './deck';
import { regenerateElixir } from './elixir';
import { constrain, moveToward, nextWaypoint, separate } from './movement';
import type { Entity, GameState, PlayCommand, Side, UnitStats } from './types';

export interface GameOptions {
  seed: number;
  decks: [readonly string[], readonly string[]];
}

const MAX_EVENTS = 500;

export function createGame(opts: GameOptions): GameState {
  const state: GameState = {
    tick: 0,
    time: 0,
    phase: 'regular',
    winner: null,
    entities: [],
    projectiles: [],
    players: [] as unknown as GameState['players'],
    nextId: 1,
    rngState: opts.seed | 0,
    events: [],
  };
  state.players = [0, 1].map((side) => ({
    elixir: ELIXIR_START,
    crowns: 0,
    deck: createDeck(state, opts.decks[side]),
  })) as GameState['players'];

  for (const side of [0, 1] as Side[]) {
    for (const t of TOWER_LAYOUT) {
      const stats = TOWER_STATS[t.tower];
      spawnEntity(state, side, 'tower', t.tower, t.x, relY(side, t.y), { ...stats }, 0);
      const tower = state.entities[state.entities.length - 1];
      tower.active = t.tower !== 'king';
    }
  }
  return state;
}

function spawnEntity(
  state: GameState,
  side: Side,
  kind: Entity['kind'],
  type: string,
  x: number,
  y: number,
  stats: UnitStats,
  deployTime: number,
): Entity {
  const e: Entity = {
    id: state.nextId++,
    side,
    kind,
    type,
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    stats,
    targetId: null,
    attackCooldown: stats.hitSpeed * 0.3,
    deployTimer: deployTime,
    lifetime: stats.lifetime ?? null,
    active: true,
  };
  state.entities.push(e);
  return e;
}

function princessDestroyed(state: GameState, side: Side, leftLane: boolean): boolean {
  return !state.entities.some(
    (t) => t.kind === 'tower' && t.side === side && t.type === 'princess' && t.x < ARENA_W / 2 === leftLane,
  );
}

/** Whether `side` may place `cardId` at (x, y). */
export function canDeploy(state: GameState, side: Side, cardId: string, x: number, y: number): boolean {
  const card = getCard(cardId);
  if (x < 0.5 || x > ARENA_W - 0.5 || y < 0.5 || y > ARENA_H - 0.5) return false;
  if (card.type === 'spell') return true;
  const ry = relY(side, y);
  if (ry > RIVER_TOP && ry < RIVER_BOTTOM) return false;
  const inTower = state.entities.some(
    (t) => t.kind === 'tower' && Math.hypot(t.x - x, t.y - y) < t.stats.radius,
  );
  if (inTower) return false;
  if (ry >= RIVER_BOTTOM) return true;
  // Pocket: once an enemy princess tower falls, its lane opens up to 4 tiles past the river.
  const enemy: Side = side === 0 ? 1 : 0;
  return ry >= RIVER_TOP - 4 && princessDestroyed(state, enemy, x < ARENA_W / 2);
}

/** Tries to play a card. Returns false (and changes nothing) if the play is illegal. */
export function playCard(state: GameState, cmd: PlayCommand): boolean {
  if (state.phase === 'ended') return false;
  const player = state.players[cmd.side];
  const cardId = player.deck.hand[cmd.handIndex];
  if (cardId === undefined) return false;
  const card = getCard(cardId);
  if (player.elixir < card.cost || !canDeploy(state, cmd.side, cardId, cmd.x, cmd.y)) return false;

  player.elixir -= card.cost;
  cycleCard(player.deck, cmd.handIndex);
  state.events.push({ type: 'deploy', side: cmd.side, cardId, x: cmd.x, y: cmd.y });

  if (card.type === 'spell' && card.spell) {
    const king = state.entities.find((t) => t.kind === 'tower' && t.type === 'king' && t.side === cmd.side);
    const from = king ?? { x: ARENA_W / 2, y: relY(cmd.side, ARENA_H) };
    state.projectiles.push({
      id: state.nextId++,
      side: cmd.side,
      x: from.x,
      y: from.y,
      tx: cmd.x,
      ty: cmd.y,
      targetId: null,
      speed: card.spell.travelSpeed,
      damage: card.spell.damage,
      splash: card.spell.radius,
      targets: 'all',
      towerScale: card.spell.towerScale,
      isSpell: true,
    });
    return true;
  }

  const stats = card.unit!;
  const count = card.count ?? 1;
  const kind = card.type === 'building' ? 'building' : 'troop';
  for (let i = 0; i < count; i++) {
    // Sunflower spiral keeps swarms compact and evenly spaced.
    const r = count === 1 ? 0 : stats.radius * 1.6 * Math.sqrt(i + 0.5);
    const a = i * 2.39996;
    spawnEntity(state, cmd.side, kind, card.id, cmd.x + Math.cos(a) * r, cmd.y + Math.sin(a) * r, { ...stats }, DEPLOY_TIME);
  }
  return true;
}

function updateEntity(state: GameState, e: Entity): void {
  if (e.deployTimer > 0) {
    e.deployTimer -= DT;
    return;
  }
  if (e.lifetime !== null && e.stats.lifetime) {
    e.lifetime -= DT;
    e.hp -= (e.maxHp * DT) / e.stats.lifetime;
  }
  if (!e.active) return;

  e.attackCooldown = Math.max(0, e.attackCooldown - DT);
  let target = findEntity(state, e.targetId);
  if (!isAlive(target) || edgeDistance(e, target) > e.stats.range) target = findTarget(state, e);
  e.targetId = target?.id ?? null;
  if (!target) return;

  if (edgeDistance(e, target) <= e.stats.range) {
    if (e.attackCooldown <= 0) {
      attack(state, e, target);
      e.attackCooldown = e.stats.hitSpeed;
    }
  } else if (e.stats.speed > 0) {
    moveToward(e, nextWaypoint(e, target.x, target.y), e.stats.speed * DT);
  }
}

function updateProjectiles(state: GameState): void {
  const remaining = [];
  for (const p of state.projectiles) {
    const target = findEntity(state, p.targetId);
    if (isAlive(target)) {
      p.tx = target.x;
      p.ty = target.y;
    }
    const d = Math.hypot(p.tx - p.x, p.ty - p.y);
    const step = p.speed * DT;
    if (d > step) {
      p.x += ((p.tx - p.x) / d) * step;
      p.y += ((p.ty - p.y) / d) * step;
      remaining.push(p);
      continue;
    }
    if (p.splash > 0) {
      applySplash(state, p.side, p.tx, p.ty, p.splash, p.damage, p.targets, p.towerScale);
      state.events.push({ type: 'explosion', x: p.tx, y: p.ty, radius: p.splash });
    } else if (isAlive(target)) {
      dealDamage(state, target, p.damage);
    }
  }
  state.projectiles = remaining;
}

function removeDead(state: GameState): void {
  const alive: Entity[] = [];
  for (const e of state.entities) {
    if (e.hp > 0) {
      alive.push(e);
      continue;
    }
    state.events.push({ type: 'death', x: e.x, y: e.y, id: e.id, kind: e.kind, side: e.side });
    if (e.kind !== 'tower') continue;
    const other: Side = e.side === 0 ? 1 : 0;
    state.events.push({ type: 'towerDestroyed', side: e.side, tower: e.type });
    if (e.type === 'king') {
      state.players[other].crowns = 3;
      endGame(state, other);
    } else {
      state.players[other].crowns += 1;
      const king = state.entities.find((t) => t.kind === 'tower' && t.type === 'king' && t.side === e.side);
      if (king) king.active = true;
    }
  }
  state.entities = alive;
}

function endGame(state: GameState, winner: Side | 'draw'): void {
  state.phase = 'ended';
  state.winner = winner;
}

/** Lowest crown-tower HP loses when overtime ends level. */
function tiebreak(state: GameState): Side | 'draw' {
  const minHp = (side: Side) =>
    Math.min(...state.entities.filter((t) => t.kind === 'tower' && t.side === side).map((t) => t.hp));
  const a = minHp(0);
  const b = minHp(1);
  if (a === b) return 'draw';
  return a > b ? 0 : 1;
}

function updateClock(state: GameState): void {
  if (state.phase === 'ended') return;
  const [p0, p1] = state.players;
  if (state.phase === 'regular' && state.time >= REGULAR_TIME) {
    if (p0.crowns !== p1.crowns) endGame(state, p0.crowns > p1.crowns ? 0 : 1);
    else state.phase = 'overtime';
  } else if (state.phase === 'overtime') {
    if (p0.crowns !== p1.crowns) endGame(state, p0.crowns > p1.crowns ? 0 : 1);
    else if (state.time >= REGULAR_TIME + OVERTIME) endGame(state, tiebreak(state));
  }
}

/** Remaining seconds in the current phase. */
export function timeLeft(state: GameState): number {
  const end = state.phase === 'regular' ? REGULAR_TIME : REGULAR_TIME + OVERTIME;
  return Math.max(0, end - state.time);
}

/** Advances the simulation by one fixed tick. */
export function step(state: GameState): void {
  if (state.phase === 'ended') return;
  state.tick++;
  state.time = state.tick * DT;
  regenerateElixir(state, DT);

  const prev = state.entities.map((e) => [e.x, e.y] as const);
  for (const e of state.entities) updateEntity(state, e);
  separate(state.entities);
  state.entities.forEach((e, i) => constrain(e, prev[i][0], prev[i][1]));

  updateProjectiles(state);
  removeDead(state);
  updateClock(state);

  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
}
