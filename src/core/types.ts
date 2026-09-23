export type Side = 0 | 1;
export type TargetKind = 'ground' | 'all' | 'buildings';

export interface UnitStats {
  hp: number;
  damage: number;
  hitSpeed: number;
  range: number;
  sightRange: number;
  speed: number;
  radius: number;
  flying: boolean;
  targets: TargetKind;
  splash?: number;
  projectileSpeed?: number;
  lifetime?: number;
}

export interface SpellStats {
  radius: number;
  damage: number;
  towerScale: number;
  travelSpeed: number;
}

export type CardType = 'troop' | 'spell' | 'building';

export interface CardDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  type: CardType;
  count?: number;
  unit?: UnitStats;
  spell?: SpellStats;
}

export type EntityKind = 'troop' | 'building' | 'tower';

export interface Entity {
  id: number;
  side: Side;
  kind: EntityKind;
  /** Card id for troops/buildings, 'king' | 'princess' for towers. */
  type: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  stats: UnitStats;
  targetId: number | null;
  attackCooldown: number;
  deployTimer: number;
  /** Remaining lifetime for buildings that decay, otherwise null. */
  lifetime: number | null;
  /** King towers stay dormant until damaged or a princess tower falls. */
  active: boolean;
}

export interface Projectile {
  id: number;
  side: Side;
  x: number;
  y: number;
  tx: number;
  ty: number;
  targetId: number | null;
  speed: number;
  damage: number;
  splash: number;
  /** What the splash can hit. */
  targets: TargetKind;
  towerScale: number;
  isSpell: boolean;
}

export interface Deck {
  hand: string[];
  queue: string[];
}

export interface PlayerState {
  elixir: number;
  crowns: number;
  deck: Deck;
}

export type GameEvent =
  | { type: 'hit'; x: number; y: number; targetId: number }
  | { type: 'death'; x: number; y: number; id: number; kind: EntityKind; side: Side }
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'deploy'; side: Side; cardId: string; x: number; y: number }
  | { type: 'towerDestroyed'; side: Side; tower: string };

export type Phase = 'regular' | 'overtime' | 'ended';

export interface GameState {
  tick: number;
  time: number;
  phase: Phase;
  winner: Side | 'draw' | null;
  entities: Entity[];
  projectiles: Projectile[];
  players: [PlayerState, PlayerState];
  nextId: number;
  rngState: number;
  /** Events produced since the renderer last drained them. */
  events: GameEvent[];
}

export interface PlayCommand {
  side: Side;
  handIndex: number;
  x: number;
  y: number;
}
