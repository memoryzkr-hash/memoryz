import { CAR_KINDS, LANE_X, ROAD_HALF_WIDTH } from './constants';
import type { RideInput, RideState } from './sim';

/**
 * A simple driver for the title-screen background: picks the lane with the most free road ahead
 * and steers toward it. Not perfect on purpose — it just has to look like someone riding.
 */
export function autopilot(state: RideState): RideInput {
  const b = state.bike;
  const look = 70;
  let bestX = b.x;
  let bestRoom = -Infinity;
  for (const lx of LANE_X) {
    let room = look;
    for (const c of state.cars) {
      const dz = c.z - b.z;
      if (dz < -3 || dz > look) continue;
      if (Math.abs(c.x - lx) < CAR_KINDS[c.kind].halfWidth + 0.9) room = Math.min(room, dz);
    }
    // Prefer staying put unless another lane is clearly better.
    const score = room - Math.abs(lx - b.x) * 2.5;
    if (score > bestRoom) {
      bestRoom = score;
      bestX = lx;
    }
  }
  const target = Math.max(-ROAD_HALF_WIDTH + 1, Math.min(ROAD_HALF_WIDTH - 1, bestX));
  const steer = Math.max(-1, Math.min(1, (target - b.x) * 0.6 - b.vx * 0.12));
  return { steer, throttle: 1, brake: bestRoom < 18 && b.speed > 25, boost: false };
}
