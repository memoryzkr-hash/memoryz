import { nextRandom } from '../../core/rng';
import {
  BIKE,
  BOOST,
  CAR_KINDS,
  CRASH,
  DT,
  LANE_WIDTH,
  LANE_X,
  LANES,
  ROAD_HALF_WIDTH,
  SCORE,
  TRAFFIC,
  type CarKind,
} from './constants';

export interface RideInput {
  /** -1 = full left, +1 = full right. */
  steer: number;
  /** 0..1 */
  throttle: number;
  brake: boolean;
  boost: boolean;
}

export const NO_INPUT: RideInput = { steer: 0, throttle: 0, brake: false, boost: false };

export interface Car {
  id: number;
  kind: CarKind;
  /** Index into the renderer's paint palette. */
  paint: number;
  x: number;
  z: number;
  speed: number;
  lane: number;
  targetX: number;
  /** Smallest side gap to the bike while alongside it (for near misses). */
  minGap: number;
  passed: boolean;
}

/** A free-flying rigid body (rider or bike after a crash). Rotation is Euler XYZ in radians. */
export interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  radius: number;
}

export interface Crash {
  t: number;
  carId: number;
  impactSpeed: number;
  rider: Body;
  bike: Body;
}

export type RideEvent =
  | { type: 'nearMiss'; combo: number; points: number; side: -1 | 1 }
  | { type: 'scrape'; side: -1 | 1 }
  | { type: 'crash'; impactSpeed: number }
  | { type: 'bounce'; body: 'rider' | 'bike'; speed: number };

export interface RideState {
  rngState: number;
  time: number;
  phase: 'riding' | 'crashed';
  bike: {
    x: number;
    z: number;
    speed: number;
    lean: number;
    vx: number;
    boosting: boolean;
    scrapeCooldown: number;
  };
  boost: number;
  cars: Car[];
  nextCarId: number;
  nextSpawnZ: number;
  score: number;
  combo: number;
  comboTimer: number;
  nearMisses: number;
  bestCombo: number;
  topSpeed: number;
  crash: Crash | null;
  /** Events produced by the most recent step() calls; the caller drains this. */
  events: RideEvent[];
}

export function newRide(seed = (Math.random() * 2 ** 32) >>> 0): RideState {
  return {
    rngState: seed,
    time: 0,
    phase: 'riding',
    bike: { x: 0, z: 0, speed: BIKE.startSpeed, lean: 0, vx: 0, boosting: false, scrapeCooldown: 0 },
    boost: BOOST.start,
    cars: [],
    nextCarId: 1,
    // A short empty stretch so the rider can settle in before the first car.
    nextSpawnZ: 90,
    score: 0,
    combo: 0,
    comboTimer: 0,
    nearMisses: 0,
    bestCombo: 0,
    topSpeed: 0,
    crash: null,
    events: [],
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rand = (s: RideState, lo: number, hi: number) => lo + nextRandom(s) * (hi - lo);

/** Wall-clock multiplier the caller should apply to elapsed time (slow motion right after a crash). */
export function timeScale(state: RideState): number {
  return state.crash && state.crash.t < CRASH.slowMoFor ? CRASH.slowMoScale : 1;
}

export function isWasted(state: RideState): boolean {
  return !!state.crash && state.crash.t >= CRASH.wastedAfter;
}

/** Traffic gap for the current distance: starts sparse and tightens up. */
export function spawnGap(distance: number): number {
  const k = clamp(distance / TRAFFIC.rampDistance, 0, 1);
  return TRAFFIC.gapStart + (TRAFFIC.gapEnd - TRAFFIC.gapStart) * k;
}

/** Advances the game by one fixed tick (1/60 s). */
export function step(state: RideState, input: RideInput): void {
  state.time += DT;
  if (state.phase === 'riding') stepBike(state, input);
  stepTraffic(state);
  if (state.phase === 'riding') {
    checkCars(state);
  } else if (state.crash) {
    stepCrash(state, state.crash);
  }
}

function stepBike(state: RideState, input: RideInput): void {
  const b = state.bike;
  const steer = clamp(input.steer, -1, 1);

  // Lean follows the bars; lateral speed grows with lean and (gently) with speed.
  b.lean += (steer * BIKE.maxLean - b.lean) * Math.min(1, BIKE.leanRate * DT);
  const speedFactor = Math.sqrt(clamp(b.speed / BIKE.maxSpeed, 0, 1.3));
  b.vx = (b.lean / BIKE.maxLean) * BIKE.lateralAtMax * speedFactor;
  b.x += b.vx * DT;

  const limit = ROAD_HALF_WIDTH - BIKE.halfWidth - 0.15;
  b.scrapeCooldown = Math.max(0, b.scrapeCooldown - DT);
  if (Math.abs(b.x) > limit) {
    const side = b.x > 0 ? 1 : -1;
    b.x = side * limit;
    if (b.scrapeCooldown === 0 && b.speed > 5) {
      b.speed *= BIKE.barrierSlow;
      b.scrapeCooldown = BIKE.barrierCooldown;
      state.events.push({ type: 'scrape', side });
    }
  }

  b.boosting = input.boost && state.boost > 0 && input.throttle > 0 && !input.brake;
  if (b.boosting) {
    state.boost = Math.max(0, state.boost - BOOST.drainPerSec * DT);
    b.speed = Math.min(BIKE.boostSpeed, b.speed + BIKE.boostAccel * DT);
  } else if (input.brake) {
    b.speed = Math.max(0, b.speed - BIKE.brake * DT);
  } else if (b.speed > BIKE.maxSpeed) {
    b.speed = Math.max(BIKE.maxSpeed, b.speed - BIKE.coastDrag * 2 * DT);
  } else if (input.throttle > 0) {
    // Acceleration fades near top speed like a real engine running out of pull.
    const pull = 1 - 0.6 * (b.speed / BIKE.maxSpeed);
    b.speed = Math.min(BIKE.maxSpeed, b.speed + BIKE.accel * input.throttle * pull * DT);
  } else {
    b.speed = Math.max(0, b.speed - BIKE.coastDrag * DT);
  }
  state.topSpeed = Math.max(state.topSpeed, b.speed);

  const before = b.z;
  b.z += b.speed * DT;
  state.score += (b.z - before) * SCORE.perMeter * clamp(b.speed / BIKE.maxSpeed, 0.2, 1.25);

  if (state.combo > 0) {
    state.comboTimer -= DT;
    if (state.comboTimer <= 0) state.combo = 0;
  }
}

function laneOf(x: number): number {
  return clamp(Math.round((x + ROAD_HALF_WIDTH) / LANE_WIDTH - 0.5), 0, LANES - 1);
}

function laneIsClear(state: RideState, lane: number, z: number, room: number, except?: Car): boolean {
  return !state.cars.some((c) => c !== except && c.lane === lane && Math.abs(c.z - z) < room);
}

function nearestAhead(state: RideState, car: Car): Car | undefined {
  let best: Car | undefined;
  for (const o of state.cars) {
    if (o !== car && o.lane === car.lane && o.z >= car.z && (!best || o.z < best.z)) best = o;
  }
  return best;
}

function spawnCar(state: RideState, z: number): void {
  const r = nextRandom(state);
  const kind: CarKind = r < 0.6 ? 'sedan' : r < 0.85 ? 'van' : 'truck';
  // Never block every lane at once: try lanes in random order and skip occupied ones.
  const start = Math.floor(nextRandom(state) * LANES);
  for (let i = 0; i < LANES; i++) {
    const lane = (start + i) % LANES;
    if (!laneIsClear(state, lane, z, TRAFFIC.followGap * 2)) continue;
    const others = state.cars.filter((c) => Math.abs(c.z - z) < 14).map((c) => c.lane);
    if (new Set([...others, lane]).size >= LANES) continue;
    const speedCap = kind === 'truck' ? TRAFFIC.minSpeed + 8 : TRAFFIC.maxSpeed;
    state.cars.push({
      id: state.nextCarId++,
      kind,
      paint: Math.floor(nextRandom(state) * 6),
      x: LANE_X[lane],
      z,
      speed: rand(state, TRAFFIC.minSpeed, speedCap),
      lane,
      targetX: LANE_X[lane],
      minGap: Infinity,
      passed: false,
    });
    return;
  }
}

function stepTraffic(state: RideState): void {
  const bikeZ = state.crash ? state.crash.rider.z : state.bike.z;
  while (state.nextSpawnZ < bikeZ + TRAFFIC.spawnAhead) {
    spawnCar(state, state.nextSpawnZ);
    state.nextSpawnZ += spawnGap(state.bike.z) * rand(state, 0.6, 1.4);
  }

  const crashedId = state.crash?.carId;
  // Front to back, so each car reacts to the already-moved car ahead of it.
  state.cars.sort((a, b) => b.z - a.z);
  for (const car of state.cars) {
    const ahead = nearestAhead(state, car);
    const room = ahead ? ahead.z - car.z - CAR_KINDS[ahead.kind].halfLength - CAR_KINDS[car.kind].halfLength : Infinity;
    if (car.id === crashedId) {
      car.speed = Math.max(0, car.speed - 9 * DT);
    } else {
      // Keep a gap to the car ahead in the same lane.
      if (ahead && room < TRAFFIC.followGap && ahead.speed < car.speed) car.speed = Math.max(ahead.speed, car.speed - 12 * DT);

      const nearBike = Math.abs(car.z - state.bike.z) < 30;
      if (car.x === car.targetX && !nearBike && nextRandom(state) < TRAFFIC.laneChangeChancePerSec * DT) {
        const lane = car.lane + (nextRandom(state) < 0.5 ? -1 : 1);
        if (lane >= 0 && lane < LANES && laneIsClear(state, lane, car.z, TRAFFIC.followGap * 1.5, car)) {
          car.lane = lane;
          car.targetX = LANE_X[lane];
        }
      }
    }
    if (car.x !== car.targetX) {
      const d = car.targetX - car.x;
      const move = TRAFFIC.laneChangeSpeed * DT;
      car.x = Math.abs(d) <= move ? car.targetX : car.x + Math.sign(d) * move;
    }
    car.lane = laneOf(car.targetX);
    car.z += car.speed * DT;
    // Cars never drive through each other, however hard they would have to brake.
    if (ahead && ahead.lane === car.lane) {
      const minZ = ahead.z - CAR_KINDS[ahead.kind].halfLength - CAR_KINDS[car.kind].halfLength - 1.5;
      if (car.z > minZ) {
        car.z = minZ;
        car.speed = Math.min(car.speed, ahead.speed);
      }
    }
  }
  state.cars = state.cars.filter((c) => c.z > bikeZ - TRAFFIC.despawnBehind);
}

function checkCars(state: RideState): void {
  const b = state.bike;
  for (const car of state.cars) {
    const dims = CAR_KINDS[car.kind];
    const dz = Math.abs(b.z - car.z);
    const reachZ = BIKE.halfLength + dims.halfLength;
    const sideGap = Math.abs(b.x - car.x) - BIKE.halfWidth - dims.halfWidth;
    // A little forgiveness on the sides: clipping a mirror shouldn't end the run.
    if (dz < reachZ - 0.15 && sideGap < -0.12) {
      startCrash(state, car);
      return;
    }
    if (dz < reachZ + 0.5) car.minGap = Math.min(car.minGap, sideGap);
    if (!car.passed && car.z + dims.halfLength < b.z - BIKE.halfLength) {
      car.passed = true;
      if (car.minGap < SCORE.nearMissDistance && b.speed >= SCORE.nearMissMinSpeed) {
        state.combo += 1;
        state.comboTimer = SCORE.comboWindow;
        state.nearMisses += 1;
        state.bestCombo = Math.max(state.bestCombo, state.combo);
        const points = SCORE.nearMissPoints * state.combo;
        state.score += points;
        state.boost = Math.min(1, state.boost + BOOST.perNearMiss);
        state.events.push({ type: 'nearMiss', combo: state.combo, points, side: car.x > b.x ? 1 : -1 });
      }
    }
  }
}

function startCrash(state: RideState, car: Car): void {
  const b = state.bike;
  const rel = Math.max(4, b.speed - car.speed);
  const spin = () => rand(state, -1, 1);
  state.phase = 'crashed';
  state.combo = 0;
  state.crash = {
    t: 0,
    carId: car.id,
    impactSpeed: rel,
    // The rider is thrown up and over; the bike stays lower and tumbles sideways.
    rider: {
      x: b.x,
      y: 1.1,
      z: b.z,
      vx: b.vx * 0.6 + spin() * 2.5,
      vy: 3.5 + rel * 0.12,
      vz: car.speed + rel * 0.35,
      rx: 0,
      ry: 0,
      rz: b.lean,
      wx: -(4 + rel * 0.25),
      wy: spin() * 3,
      wz: spin() * 6,
      radius: 0.45,
    },
    bike: {
      x: b.x,
      y: 0.55,
      z: b.z,
      vx: b.vx * 0.8 + spin() * 3,
      vy: 1.5 + rel * 0.06,
      vz: car.speed + rel * 0.15,
      rx: 0,
      ry: 0,
      rz: b.lean,
      wx: spin() * 4,
      wy: spin() * 5,
      wz: (b.lean >= 0 ? 1 : -1) * (5 + rel * 0.2),
      radius: 0.5,
    },
  };
  b.speed = 0;
  b.vx = 0;
  b.boosting = false;
  state.events.push({ type: 'crash', impactSpeed: rel });
}

function stepCrash(state: RideState, crash: Crash): void {
  crash.t += DT;
  stepBody(state, crash.rider, 'rider');
  stepBody(state, crash.bike, 'bike');
}

function stepBody(state: RideState, body: Body, name: 'rider' | 'bike'): void {
  body.vy -= CRASH.gravity * DT;
  body.x += body.vx * DT;
  body.y += body.vy * DT;
  body.z += body.vz * DT;
  body.rx += body.wx * DT;
  body.ry += body.wy * DT;
  body.rz += body.wz * DT;

  // Roll over car roofs instead of passing through them.
  for (const car of state.cars) {
    const dims = CAR_KINDS[car.kind];
    if (Math.abs(body.x - car.x) < dims.halfWidth && Math.abs(body.z - car.z) < dims.halfLength) {
      const top = dims.height + body.radius;
      if (body.y < top && body.y > top - 1.2) {
        body.y = top;
        if (body.vy < 0) body.vy = -body.vy * 0.3;
        body.vz = car.speed + (body.vz - car.speed) * 0.8;
      }
    }
  }

  const wall = ROAD_HALF_WIDTH + 0.6;
  if (Math.abs(body.x) > wall) {
    body.x = Math.sign(body.x) * wall;
    body.vx = -body.vx * 0.4;
  }

  if (body.y < body.radius) {
    body.y = body.radius;
    if (body.vy < -1.5) state.events.push({ type: 'bounce', body: name, speed: -body.vy });
    if (Math.abs(body.vy) > 1.5) {
      // Each hard landing scrubs off a chunk of speed.
      body.vy = -body.vy * 0.35;
      body.vx *= 0.75;
      body.vz *= 0.75;
    } else {
      body.vy = 0;
    }
    // Sliding along the asphalt.
    const friction = Math.exp(-3.5 * DT);
    body.vx *= friction;
    body.vz *= friction;
    body.wx *= friction;
    body.wy *= friction;
    body.wz *= friction;
  }
}
