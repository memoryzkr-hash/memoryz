import { describe, expect, it } from 'vitest';
import { BIKE, BOOST, CAR_KINDS, CRASH, LANE_X, ROAD_HALF_WIDTH, SCORE, TICK_RATE } from '../../src/ride/core/constants';
import { isWasted, newRide, NO_INPUT, spawnGap, step, timeScale, type Car, type RideInput, type RideState } from '../../src/ride/core/sim';

const GAS: RideInput = { steer: 0, throttle: 1, brake: false, boost: false };

const run = (s: RideState, seconds: number, input: RideInput = GAS) => {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) step(s, input);
};

/** A ride with no random traffic: spawning is pushed far away so tests can place cars by hand. */
const emptyRide = (seed = 1) => {
  const s = newRide(seed);
  s.nextSpawnZ = 1e9;
  return s;
};

const car = (s: RideState, over: Partial<Car>): Car => {
  const c: Car = { id: s.nextCarId++, kind: 'sedan', paint: 0, x: LANE_X[1], z: 50, speed: 20, lane: 1, targetX: LANE_X[1], minGap: Infinity, passed: false, ...over };
  if (over.x !== undefined && over.targetX === undefined) c.targetX = over.x;
  s.cars.push(c);
  return c;
};

describe('bike', () => {
  it('accelerates toward top speed with the throttle and never beyond it', () => {
    const s = emptyRide();
    run(s, 2);
    expect(s.bike.speed).toBeGreaterThan(BIKE.startSpeed + 5);
    run(s, 30);
    expect(s.bike.speed).toBeCloseTo(BIKE.maxSpeed, 1);
  });

  it('brakes and coasts down', () => {
    const s = emptyRide();
    run(s, 1, { ...NO_INPUT, brake: true });
    expect(s.bike.speed).toBeLessThan(BIKE.startSpeed - 15);
    const coasting = emptyRide();
    run(coasting, 1, NO_INPUT);
    expect(coasting.bike.speed).toBeLessThan(BIKE.startSpeed);
    expect(coasting.bike.speed).toBeGreaterThan(s.bike.speed);
  });

  it('leans and moves the way it is steered', () => {
    const s = emptyRide();
    run(s, 0.5, { ...GAS, steer: 1 });
    expect(s.bike.lean).toBeGreaterThan(BIKE.maxLean * 0.9);
    expect(s.bike.x).toBeGreaterThan(1);
    const l = emptyRide();
    run(l, 0.5, { ...GAS, steer: -1 });
    expect(l.bike.x).toBeLessThan(-1);
  });

  it('scrapes along the barrier, slowing down but staying on the road', () => {
    const s = emptyRide();
    s.bike.speed = 40;
    run(s, 3, { ...NO_INPUT, steer: 1 });
    expect(s.phase).toBe('riding');
    expect(s.bike.x).toBeLessThan(ROAD_HALF_WIDTH);
    expect(s.events.some((e) => e.type === 'scrape')).toBe(true);
    expect(s.bike.speed).toBeLessThan(40 * BIKE.barrierSlow);
  });

  it('boosts past top speed while the meter lasts', () => {
    const s = emptyRide();
    s.bike.speed = BIKE.maxSpeed;
    s.boost = 1;
    run(s, 1, { ...GAS, boost: true });
    expect(s.bike.speed).toBeGreaterThan(BIKE.maxSpeed);
    expect(s.boost).toBeCloseTo(1 - BOOST.drainPerSec, 2);
    s.boost = 0;
    run(s, 3, { ...GAS, boost: true });
    expect(s.bike.speed).toBeCloseTo(BIKE.maxSpeed, 0);
  });

  it('scores more for the same distance at higher speed', () => {
    const slow = emptyRide();
    slow.bike.speed = 15;
    while (slow.bike.z < 200) step(slow, { ...NO_INPUT, throttle: 0.0001 });
    const fast = emptyRide();
    fast.bike.speed = BIKE.maxSpeed;
    while (fast.bike.z < 200) step(fast, GAS);
    expect(fast.score).toBeGreaterThan(slow.score * 2);
  });
});

describe('traffic', () => {
  it('spawns ahead of the bike, despawns behind, and gets denser with distance', () => {
    const s = newRide(42);
    run(s, 1);
    expect(s.cars.length).toBeGreaterThan(0);
    for (const c of s.cars) expect(c.z).toBeGreaterThan(s.bike.z);
    expect(spawnGap(10000)).toBeLessThan(spawnGap(0));
  });

  it('never fills every lane side by side', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = newRide(seed);
      s.bike.z = 8000; // full density
      s.nextSpawnZ = 8090;
      run(s, 0.1, NO_INPUT);
      for (const c of s.cars) {
        const lanes = new Set(s.cars.filter((o) => Math.abs(o.z - c.z) < 6).map((o) => o.lane));
        expect(lanes.size).toBeLessThan(4);
      }
    }
  });

  it('is deterministic for a seed', () => {
    const a = newRide(7);
    const b = newRide(7);
    run(a, 10, { ...GAS, steer: 0.3 });
    run(b, 10, { ...GAS, steer: 0.3 });
    expect(a.cars).toEqual(b.cars);
    expect(a.score).toBe(b.score);
  });

  it('slows a car down behind a slower one in its lane', () => {
    const s = emptyRide();
    const front = car(s, { z: 100, speed: 15 });
    const back = car(s, { z: 92, speed: 30 });
    run(s, 2, NO_INPUT);
    expect(back.speed).toBeLessThanOrEqual(front.speed + 0.5);
  });
});

describe('near misses', () => {
  it('awards a combo when passing a car closely at speed', () => {
    const s = emptyRide();
    s.bike.speed = SCORE.nearMissMinSpeed + 10;
    const gap = 0.6;
    const x = BIKE.halfWidth + CAR_KINDS.sedan.halfWidth + gap;
    car(s, { x, z: 20, speed: 10 });
    car(s, { x: -x, z: 45, speed: 10 });
    run(s, 4);
    const misses = s.events.filter((e) => e.type === 'nearMiss');
    expect(misses).toHaveLength(2);
    expect(s.combo).toBe(2);
    expect(s.bestCombo).toBe(2);
    expect(s.score).toBeGreaterThan(SCORE.nearMissPoints * 3);
  });

  it('does not count wide or slow passes', () => {
    const wide = emptyRide();
    wide.bike.speed = 40;
    car(wide, { x: 4, z: 20, speed: 10 });
    run(wide, 3);
    expect(wide.nearMisses).toBe(0);

    const slow = emptyRide();
    slow.bike.speed = 15;
    car(slow, { x: BIKE.halfWidth + CAR_KINDS.sedan.halfWidth + 0.5, z: 10, speed: 2 });
    run(slow, 3, { ...NO_INPUT, throttle: 0.0001 });
    expect(slow.nearMisses).toBe(0);
  });

  it('drops the combo after the window', () => {
    const s = emptyRide();
    s.combo = 3;
    s.comboTimer = SCORE.comboWindow;
    run(s, SCORE.comboWindow + 0.1);
    expect(s.combo).toBe(0);
  });
});

describe('crash', () => {
  it('crashes into a car, throws rider and bike, slows time and ends WASTED', () => {
    const s = emptyRide();
    s.bike.speed = 40;
    car(s, { x: 0, z: 25, speed: 15 });
    run(s, 2);
    expect(s.phase).toBe('crashed');
    expect(s.events.some((e) => e.type === 'crash')).toBe(true);
    const crash = s.crash!;
    expect(timeScale(s)).toBe(crash.t < CRASH.slowMoFor ? CRASH.slowMoScale : 1);

    // Rider flies up first, then everything lands and comes to rest on the road.
    let peak = 0;
    for (let i = 0; i < 10 * TICK_RATE; i++) {
      step(s, GAS);
      peak = Math.max(peak, crash.rider.y);
    }
    expect(peak).toBeGreaterThan(2);
    expect(isWasted(s)).toBe(true);
    expect(crash.rider.y).toBeCloseTo(crash.rider.radius, 1);
    expect(crash.bike.y).toBeCloseTo(crash.bike.radius, 1);
    expect(Math.abs(crash.rider.vz)).toBeLessThan(10);
    expect(Math.abs(crash.rider.x)).toBeLessThan(ROAD_HALF_WIDTH + 1);
    // Inputs no longer move the bike.
    expect(s.bike.speed).toBe(0);
  });

  it('forgives a clipped mirror', () => {
    const s = emptyRide();
    s.bike.speed = 40;
    car(s, { x: BIKE.halfWidth + CAR_KINDS.sedan.halfWidth - 0.08, z: 20, speed: 10 });
    run(s, 2);
    expect(s.phase).toBe('riding');
  });
});
