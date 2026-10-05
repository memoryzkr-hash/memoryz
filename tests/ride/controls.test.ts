import { describe, expect, it } from 'vitest';
import { angleToSteer, LM, POSE, PoseControls, readPose, type Landmark } from '../../src/ride/core/controls';

/**
 * Builds a pose in raw camera coordinates. Coordinates are given from the rider's own point of view
 * (their right = +x on screen once mirrored), then flipped back into the raw camera frame.
 */
function pose(opts: {
  leftWrist?: [number, number] | null;
  rightWrist?: [number, number] | null;
  shoulderTilt?: number;
  width?: number;
  shoulderY?: number;
}): Landmark[] {
  const w = opts.width ?? 0.3;
  const sy = opts.shoulderY ?? 0.5;
  const tilt = opts.shoulderTilt ?? 0;
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  // Mirrored (rider view) -> raw camera x.
  const put = (i: number, x: number, y: number) => (lm[i] = { x: 1 - x, y, visibility: 0.99 });
  put(LM.leftShoulder, 0.5 - w / 2, sy - tilt);
  put(LM.rightShoulder, 0.5 + w / 2, sy + tilt);
  put(LM.nose, 0.5, sy - w * 0.7);
  const lw = opts.leftWrist === undefined ? [0.5 - w * 0.6, sy + w * 0.8] : opts.leftWrist;
  const rw = opts.rightWrist === undefined ? [0.5 + w * 0.6, sy + w * 0.8] : opts.rightWrist;
  if (lw) put(LM.leftWrist, lw[0], lw[1]);
  if (rw) put(LM.rightWrist, rw[0], rw[1]);
  return lm;
}

describe('readPose', () => {
  it('needs both shoulders to track a person', () => {
    expect(readPose(null).tracked).toBe(false);
    const p = pose({});
    p[LM.leftShoulder].visibility = 0.1;
    expect(readPose(p).tracked).toBe(false);
  });

  it('recognizes a level handlebar grip', () => {
    const r = readPose(pose({}));
    expect(r.tracked).toBe(true);
    expect(r.grip).toBe(true);
    expect(r.handsUp).toBe(false);
    expect(Math.abs(r.angleDeg)).toBeLessThan(1);
  });

  it('steers right when the right hand drops (rider point of view)', () => {
    const r = readPose(pose({ leftWrist: [0.32, 0.68], rightWrist: [0.68, 0.82] }));
    expect(r.grip).toBe(true);
    expect(r.angleDeg).toBeGreaterThan(8);
    const l = readPose(pose({ leftWrist: [0.32, 0.82], rightWrist: [0.68, 0.68] }));
    expect(l.angleDeg).toBeLessThan(-8);
  });

  it('adds body lean to the steering', () => {
    const level = readPose(pose({})).angleDeg;
    const leaning = readPose(pose({ shoulderTilt: 0.05 })).angleDeg;
    expect(leaning).toBeGreaterThan(level + 2);
  });

  it('is not a grip with hands down, missing, or above the head', () => {
    expect(readPose(pose({ leftWrist: [0.3, 1.4], rightWrist: [0.7, 1.4] })).grip).toBe(false);
    expect(readPose(pose({ rightWrist: null })).grip).toBe(false);
    const up = readPose(pose({ leftWrist: [0.35, 0.1], rightWrist: [0.65, 0.1] }));
    expect(up.grip).toBe(false);
    expect(up.handsUp).toBe(true);
  });
});

describe('angleToSteer', () => {
  it('has a deadzone, is symmetric and saturates', () => {
    expect(angleToSteer(POSE.deadzoneDeg - 1)).toBe(0);
    expect(angleToSteer(15)).toBeCloseTo(-angleToSteer(-15));
    expect(angleToSteer(15)).toBeGreaterThan(0);
    expect(angleToSteer(90)).toBe(1);
    expect(angleToSteer(-90)).toBe(-1);
  });
});

describe('PoseControls', () => {
  const dt = 1 / 30;
  const feed = (c: PoseControls, lm: Landmark[] | null, seconds: number) => {
    let out = c.update(lm, dt);
    for (let t = dt; t < seconds; t += dt) out = c.update(lm, dt);
    return out;
  };

  it('throttles while gripping and smooths the steering in', () => {
    const c = new PoseControls();
    const turn = pose({ leftWrist: [0.32, 0.6], rightWrist: [0.68, 0.9] });
    const first = c.update(turn, dt);
    expect(first.input.throttle).toBe(1);
    expect(first.input.steer).toBeGreaterThan(0);
    expect(first.input.steer).toBeLessThan(0.6);
    const later = feed(c, turn, 0.5);
    expect(later.input.steer).toBeGreaterThan(0.9);
  });

  it('keeps going through a short dropout, then brakes when the hands come off', () => {
    const c = new PoseControls();
    feed(c, pose({}), 0.5);
    expect(c.update(null, 0.1).input.throttle).toBe(1);
    const off = feed(c, pose({ leftWrist: null, rightWrist: null }), 1);
    expect(off.input.throttle).toBe(0);
    expect(off.input.brake).toBe(true);
  });

  it('calibrates and then detects a tuck as boost', () => {
    const c = new PoseControls();
    const mid = feed(c, pose({}), POSE.calibrateFor / 2);
    expect(mid.calibration).toBeGreaterThan(0.3);
    expect(mid.calibration).toBeLessThan(1);
    const done = feed(c, pose({}), POSE.calibrateFor);
    expect(done.calibration).toBe(1);
    expect(done.input.boost).toBe(false);
    const closer = feed(c, pose({ width: 0.3 * 1.3 }), 0.2);
    expect(closer.tuck).toBe(true);
    expect(closer.input.boost).toBe(true);
    const crouch = feed(c, pose({ shoulderY: 0.5 + 0.3 * 0.5 }), 0.2);
    expect(crouch.input.boost).toBe(true);
  });

  it('fires the hands-up gesture once per raise', () => {
    const c = new PoseControls();
    const up = pose({ leftWrist: [0.35, 0.1], rightWrist: [0.65, 0.1] });
    let fired = 0;
    for (let t = 0; t < POSE.handsUpHold * 3; t += dt) if (c.update(up, dt).handsUpFired) fired++;
    expect(fired).toBe(1);
    feed(c, pose({}), 0.2);
    for (let t = 0; t < POSE.handsUpHold * 1.5; t += dt) if (c.update(up, dt).handsUpFired) fired++;
    expect(fired).toBe(2);
  });
});
