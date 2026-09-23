import { getCard } from './cards';
import { ARENA_W, DT, relY } from './constants';
import { canDeploy } from './sim';
import { nextRandom } from './rng';
import type { CardDef, Entity, GameState, PlayCommand, Side } from './types';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface Settings {
  /** Seconds between decisions. */
  interval: number;
  /** Elixir needed before starting a push. */
  pushAt: number;
  /** Placement inaccuracy in tiles. */
  jitter: number;
  /** Chance to ignore a threat on a given decision. */
  missDefense: number;
  /** Whether it backs up its own attacking troops. */
  supports: boolean;
}

const SETTINGS: Record<Difficulty, Settings> = {
  easy: { interval: 2.0, pushAt: 10, jitter: 1.5, missDefense: 0.4, supports: false },
  normal: { interval: 1.2, pushAt: 9, jitter: 0.7, missDefense: 0.1, supports: true },
  hard: { interval: 0.6, pushAt: 8, jitter: 0.2, missDefense: 0, supports: true },
};

interface Threat {
  units: Entity[];
  x: number;
  y: number;
  hp: number;
  flying: boolean;
  swarm: boolean;
  tank: boolean;
}

/**
 * Rule-based opponent. It only reads the game state and returns PlayCommands, exactly like a
 * human player would, so the simulation stays the single source of truth.
 */
export class AiPlayer {
  private timer = 0;
  private readonly rng: { rngState: number };

  constructor(
    readonly side: Side,
    readonly difficulty: Difficulty,
    seed = 1234,
  ) {
    this.rng = { rngState: seed };
    this.timer = SETTINGS[difficulty].interval;
  }

  /** Call once per simulation tick. */
  update(state: GameState): PlayCommand | null {
    if (state.phase === 'ended') return null;
    this.timer -= DT;
    if (this.timer > 0) return null;
    this.timer = SETTINGS[this.difficulty].interval;
    return this.decide(state);
  }

  decide(state: GameState): PlayCommand | null {
    const me = state.players[this.side];
    const hand = me.deck.hand.map((id, i) => ({ card: getCard(id), i })).filter((h) => h.card.cost <= me.elixir);
    if (hand.length === 0) return null;

    const settings = SETTINGS[this.difficulty];
    const threat = this.biggestThreat(state);
    if (threat && nextRandom(this.rng) >= settings.missDefense) {
      const defense = this.defend(state, threat, hand);
      if (defense) return defense;
    }
    const finisher = this.finishTower(state, hand);
    if (finisher) return finisher;
    if (settings.supports && !threat) {
      const support = this.support(state, hand);
      if (support) return support;
    }
    if (me.elixir >= settings.pushAt) return this.push(state, hand);
    return null;
  }

  /** Backs up our own troops that are marching on the enemy with a unit behind them. */
  private support(state: GameState, hand: { card: CardDef; i: number }[]): PlayCommand | null {
    const attackers = state.entities.filter(
      (e) => e.side === this.side && e.kind === 'troop' && relY(this.side, e.y) < 24,
    );
    const hp = attackers.reduce((s, u) => s + u.hp, 0);
    if (hp < 500 || state.players[this.side].elixir < 5) return null;
    const lead = attackers.reduce((a, b) => (relY(this.side, a.y) < relY(this.side, b.y) ? a : b));
    // Prefer ranged/splash damage behind a tank; never send a second tank.
    const options = hand
      .filter((h) => h.card.type === 'troop' && h.card.unit!.targets !== 'buildings')
      .sort((a, b) => b.card.unit!.range + (b.card.unit!.splash ?? 0) - (a.card.unit!.range + (a.card.unit!.splash ?? 0)));
    if (options.length === 0) return null;
    const ry = Math.max(relY(this.side, lead.y) + 3, 18);
    return this.place(state, options[0].i, options[0].card, lead.x, relY(this.side, Math.min(ry, 28)));
  }

  /** Enemy troops that have reached (or are about to reach) our half, grouped by lane. */
  private biggestThreat(state: GameState): Threat | null {
    const enemies = state.entities.filter(
      (e) => e.side !== this.side && e.kind === 'troop' && relY(this.side, e.y) >= 12,
    );
    let best: Threat | null = null;
    for (const left of [true, false]) {
      const units = enemies.filter((e) => e.x < ARENA_W / 2 === left);
      if (units.length === 0) continue;
      const hp = units.reduce((s, u) => s + u.hp, 0);
      // Aim at the unit closest to our towers.
      const lead = units.reduce((a, b) => (relY(this.side, a.y) > relY(this.side, b.y) ? a : b));
      const t: Threat = {
        units,
        x: lead.x,
        y: lead.y,
        hp,
        flying: units.every((u) => u.stats.flying),
        swarm: units.length >= 4,
        tank: units.some((u) => u.maxHp >= 1000),
      };
      if (!best || t.hp > best.hp) best = t;
    }
    return best;
  }

  private defend(state: GameState, threat: Threat, hand: { card: CardDef; i: number }[]): PlayCommand | null {
    let best: { i: number; score: number; card: CardDef } | null = null;
    for (const { card, i } of hand) {
      const score = this.counterScore(card, threat, state);
      if (score > 0 && (!best || score > best.score)) best = { i, score, card };
    }
    if (!best) return null;

    if (best.card.type === 'spell') {
      const c = clusterCenter(threat.units);
      return { side: this.side, handIndex: best.i, x: c.x, y: c.y };
    }
    // Place the defender between the threat and our towers, on our side of the river.
    const ownY = (ry: number) => relY(this.side, ry);
    let ry = Math.max(relY(this.side, threat.y) + 3, 18);
    if (best.card.type === 'building') ry = 21;
    if (best.card.unit && best.card.unit.range > 3) ry = Math.max(ry, 22);
    const x = best.card.type === 'building' ? (threat.x < ARENA_W / 2 ? 7 : 11) : threat.x;
    return this.place(state, best.i, best.card, x, ownY(Math.min(ry, 29)));
  }

  private counterScore(card: CardDef, threat: Threat, state: GameState): number {
    if (card.type === 'spell') {
      const c = clusterCenter(threat.units);
      const hit = threat.units.filter((u) => Math.hypot(u.x - c.x, u.y - c.y) <= (card.spell?.radius ?? 0));
      const value = hit.reduce((s, u) => s + Math.min(u.hp, card.spell!.damage), 0);
      return hit.length >= 3 || value >= 500 ? 4 : 0;
    }
    const u = card.unit!;
    if (threat.flying && u.targets === 'ground') return 0;
    if (u.targets === 'buildings') return 0;
    let score = 1;
    if (threat.swarm && u.splash) score += 3;
    if (threat.flying && u.targets === 'all') score += 3;
    if (threat.tank && (card.count ?? 1) >= 3) score += 3;
    if (threat.tank && card.type === 'building') score += 2;
    if (threat.hp < 300 && card.cost <= 2) score += 2;
    // Don't overspend on small threats.
    if (threat.hp < 300 && card.cost >= 4) score -= 1;
    if (state.players[this.side].elixir - card.cost < 1 && threat.hp < 400) score -= 1;
    return score;
  }

  /** Fireball a tower that is almost dead. */
  private finishTower(state: GameState, hand: { card: CardDef; i: number }[]): PlayCommand | null {
    const spell = hand.find((h) => h.card.type === 'spell');
    if (!spell?.card.spell) return null;
    const dmg = spell.card.spell.damage * spell.card.spell.towerScale;
    const tower = state.entities.find((t) => t.kind === 'tower' && t.side !== this.side && t.hp <= dmg);
    return tower ? { side: this.side, handIndex: spell.i, x: tower.x, y: tower.y } : null;
  }

  private push(state: GameState, hand: { card: CardDef; i: number }[]): PlayCommand | null {
    const troops = hand.filter((h) => h.card.type === 'troop');
    if (troops.length === 0) return null;
    const lane = this.weakestLane(state);
    const laneX = lane === 'left' ? 3.5 : 14.5;
    const tank = troops.find((h) => (h.card.unit?.hp ?? 0) >= 600);
    if (tank) {
      // Tanks start at the back so support can follow them across.
      return this.place(state, tank.i, tank.card, laneX, relY(this.side, 27));
    }
    const pick = troops.reduce((a, b) => (a.card.cost <= b.card.cost ? a : b));
    return this.place(state, pick.i, pick.card, laneX, relY(this.side, 20));
  }

  private weakestLane(state: GameState): 'left' | 'right' {
    const hpOf = (left: boolean) =>
      state.entities.find((t) => t.kind === 'tower' && t.side !== this.side && t.type === 'princess' && t.x < ARENA_W / 2 === left)
        ?.hp ?? 0;
    const l = hpOf(true);
    const r = hpOf(false);
    if (l === r) return nextRandom(this.rng) < 0.5 ? 'left' : 'right';
    return l < r ? 'left' : 'right';
  }

  private place(state: GameState, handIndex: number, card: CardDef, x: number, y: number): PlayCommand | null {
    const j = SETTINGS[this.difficulty].jitter;
    for (let attempt = 0; attempt < 6; attempt++) {
      const px = Math.floor(x + (nextRandom(this.rng) - 0.5) * 2 * j * (attempt + 1)) + 0.5;
      const py = Math.floor(y + (nextRandom(this.rng) - 0.5) * 2 * j * (attempt + 1)) + 0.5;
      const cx = Math.min(ARENA_W - 0.5, Math.max(0.5, px));
      if (canDeploy(state, this.side, card.id, cx, py)) return { side: this.side, handIndex, x: cx, y: py };
    }
    return null;
  }
}

function clusterCenter(units: Entity[]): { x: number; y: number } {
  const n = units.length;
  return {
    x: units.reduce((s, u) => s + u.x, 0) / n,
    y: units.reduce((s, u) => s + u.y, 0) / n,
  };
}
