/** All tuning numbers for Neon Rider. Distances in meters, speeds in m/s, times in seconds. */

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const LANES = 4;
export const LANE_WIDTH = 3.6;
export const ROAD_HALF_WIDTH = (LANES * LANE_WIDTH) / 2;
/** Center x of each lane, left to right. */
export const LANE_X = Array.from({ length: LANES }, (_, i) => -ROAD_HALF_WIDTH + LANE_WIDTH * (i + 0.5));

export const BIKE = {
  halfWidth: 0.4,
  halfLength: 1.05,
  /** Rider starts at a moderate cruise so the first second already feels fast. */
  startSpeed: 22,
  maxSpeed: 200 / 3.6,
  boostSpeed: 250 / 3.6,
  accel: 9,
  boostAccel: 16,
  brake: 22,
  coastDrag: 4,
  /** Max lean angle in radians at full steer. */
  maxLean: 0.62,
  /** How fast the lean follows the steering input (1/s). */
  leanRate: 6,
  /** Lateral speed (m/s) at full lean and top speed; scales with sqrt(speed). */
  lateralAtMax: 13,
  /** Barrier scrape: speed multiplier and the bounce-back from the rail. */
  barrierSlow: 0.7,
  barrierCooldown: 0.5,
};

export const BOOST = {
  /** Fraction of the meter used per second while boosting. */
  drainPerSec: 0.25,
  /** Meter gained per near miss. */
  perNearMiss: 0.2,
  start: 0.5,
};

export const TRAFFIC = {
  minSpeed: 15,
  maxSpeed: 31,
  spawnAhead: 260,
  despawnBehind: 40,
  /** Gap between spawns along the road at the start and at full difficulty. */
  gapStart: 70,
  gapEnd: 22,
  /** Distance (m) at which traffic reaches full density. */
  rampDistance: 6000,
  laneChangeChancePerSec: 0.05,
  laneChangeSpeed: 2.2,
  /** Cars keep this much room to the car ahead in their lane. */
  followGap: 12,
};

export const CAR_KINDS = {
  sedan: { halfWidth: 0.95, halfLength: 2.25, height: 1.45 },
  van: { halfWidth: 1.05, halfLength: 2.6, height: 2.1 },
  truck: { halfWidth: 1.25, halfLength: 4.6, height: 3.2 },
} as const;
export type CarKind = keyof typeof CAR_KINDS;

export const SCORE = {
  /** Points per meter at top speed; slower riding earns proportionally less. */
  perMeter: 1,
  nearMissDistance: 1.3,
  nearMissMinSpeed: 100 / 3.6,
  nearMissPoints: 100,
  comboWindow: 3,
};

export const CRASH = {
  gravity: 9.8,
  /** Seconds the world runs in slow motion after impact (in game time). */
  slowMoFor: 1.2,
  slowMoScale: 0.35,
  /** Seconds after impact before the WASTED banner shows. */
  wastedAfter: 0.7,
};
