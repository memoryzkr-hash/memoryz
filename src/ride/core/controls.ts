import type { RideInput } from './sim';

/** One MediaPipe pose landmark in normalized image coordinates of the raw (un-mirrored) camera frame. */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/** MediaPipe Pose landmark indices we use. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
} as const;

export const POSE = {
  minVisibility: 0.5,
  /** Handlebar angle (deg) ignored around center, and the angle that means full lock. */
  deadzoneDeg: 4,
  fullLockDeg: 28,
  /** Weight of the hands' bar angle vs. the shoulders' lean in the steering angle. */
  handWeight: 0.65,
  /** Steering smoothing time constant (s). */
  smoothing: 0.08,
  /** Shoulder width grows this much (vs. calibration) when leaning in toward the camera. */
  tuckScale: 1.15,
  /** ...or the shoulders drop this many shoulder-widths in the frame (crouching). */
  tuckDrop: 0.35,
  calibrateFor: 1.5,
  /** Grip has to be gone this long before we brake, so one missed frame doesn't jolt the bike. */
  releaseGrace: 0.35,
  handsUpHold: 1,
};

export interface PoseReading {
  /** A person (both shoulders) is in view. */
  tracked: boolean;
  /** Both hands are up in front of the chest, like holding handlebars. */
  grip: boolean;
  /** Both wrists above the head. */
  handsUp: boolean;
  /** Combined bar/shoulder angle in degrees, positive = right (from the rider's point of view). */
  angleDeg: number;
  shoulderWidth: number;
  shoulderY: number;
}

const NOT_TRACKED: PoseReading = { tracked: false, grip: false, handsUp: false, angleDeg: 0, shoulderWidth: 0, shoulderY: 0 };

const visible = (p: Landmark | undefined): p is Landmark => !!p && (p.visibility ?? 1) >= POSE.minVisibility;

/** Mirror x so that "right" means the rider's right, like looking in a mirror. */
const mirrored = (p: Landmark) => ({ x: 1 - p.x, y: p.y });

/** Angle in degrees of the line from the rider's left point to their right point; positive when the right side is lower. */
function tiltDeg(left: Landmark, right: Landmark): number {
  const l = mirrored(left);
  const r = mirrored(right);
  return (Math.atan2(r.y - l.y, r.x - l.x) * 180) / Math.PI;
}

/** Turns one frame of landmarks into a reading. Pure, so it's easy to unit test. */
export function readPose(landmarks: readonly Landmark[] | null | undefined): PoseReading {
  if (!landmarks || landmarks.length < 17) return NOT_TRACKED;
  const ls = landmarks[LM.leftShoulder];
  const rs = landmarks[LM.rightShoulder];
  if (!visible(ls) || !visible(rs)) return NOT_TRACKED;

  const shoulderWidth = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const shoulderY = (ls.y + rs.y) / 2;
  const nose = landmarks[LM.nose];
  const headY = visible(nose) ? nose.y : shoulderY - shoulderWidth * 0.6;
  const lw = landmarks[LM.leftWrist];
  const rw = landmarks[LM.rightWrist];
  const shoulderAngle = tiltDeg(ls, rs);

  if (!visible(lw) || !visible(rw)) {
    return { tracked: true, grip: false, handsUp: false, angleDeg: shoulderAngle, shoulderWidth, shoulderY };
  }

  const handsUp = lw.y < headY - shoulderWidth * 0.1 && rw.y < headY - shoulderWidth * 0.1;
  // Bars sit between the chin and the belly; hands too far apart or crossed isn't a grip.
  const low = shoulderY + shoulderWidth * 2.2;
  const inZone = (w: Landmark) => w.y > headY && w.y < low;
  const spread = Math.abs(lw.x - rw.x);
  const grip = !handsUp && inZone(lw) && inZone(rw) && spread > shoulderWidth * 0.25 && spread < shoulderWidth * 3.5;

  const angleDeg = grip ? POSE.handWeight * tiltDeg(lw, rw) + (1 - POSE.handWeight) * shoulderAngle : shoulderAngle;
  return { tracked: true, grip, handsUp, angleDeg, shoulderWidth, shoulderY };
}

/** Maps an angle in degrees to -1..1 steering with a deadzone. */
export function angleToSteer(angleDeg: number): number {
  const a = Math.abs(angleDeg);
  if (a <= POSE.deadzoneDeg) return 0;
  const k = Math.min(1, (a - POSE.deadzoneDeg) / (POSE.fullLockDeg - POSE.deadzoneDeg));
  return Math.sign(angleDeg) * k;
}

export interface PoseControlsOutput {
  input: RideInput;
  reading: PoseReading;
  /** 0..1 while calibrating, 1 once done. */
  calibration: number;
  tuck: boolean;
  /** 0..1 progress of the "both hands above your head" gesture; fires `handsUpFired` once at 1. */
  handsUpProgress: number;
  handsUpFired: boolean;
}

/** Stateful wrapper: smoothing, calibration, grip grace period and the hands-up gesture. */
export class PoseControls {
  private steer = 0;
  private sinceGrip = Infinity;
  private calibTime = 0;
  private calibWidth = 0;
  private calibY = 0;
  private base: { width: number; y: number } | null = null;
  private handsUpFor = 0;
  private handsUpLatched = false;
  private last: RideInput = { steer: 0, throttle: 0, brake: false, boost: false };

  get calibrated(): boolean {
    return this.base !== null;
  }

  recalibrate(): void {
    this.base = null;
    this.calibTime = 0;
    this.calibWidth = 0;
    this.calibY = 0;
  }

  update(landmarks: readonly Landmark[] | null | undefined, dt: number): PoseControlsOutput {
    const reading = readPose(landmarks);

    // Hands-up gesture (start / restart). Latches until the hands come down again.
    let handsUpFired = false;
    if (reading.handsUp) {
      this.handsUpFor += dt;
      if (this.handsUpFor >= POSE.handsUpHold && !this.handsUpLatched) {
        this.handsUpLatched = true;
        handsUpFired = true;
      }
    } else {
      this.handsUpFor = 0;
      this.handsUpLatched = false;
    }

    if (reading.grip) {
      this.sinceGrip = 0;
      if (!this.base) {
        this.calibTime += dt;
        this.calibWidth += reading.shoulderWidth * dt;
        this.calibY += reading.shoulderY * dt;
        if (this.calibTime >= POSE.calibrateFor) {
          this.base = { width: this.calibWidth / this.calibTime, y: this.calibY / this.calibTime };
        }
      }
    } else {
      this.sinceGrip += dt;
    }

    const tuck =
      reading.grip &&
      !!this.base &&
      (reading.shoulderWidth > this.base.width * POSE.tuckScale || reading.shoulderY - this.base.y > this.base.width * POSE.tuckDrop);

    const k = 1 - Math.exp(-dt / POSE.smoothing);
    if (reading.grip) {
      this.steer += (angleToSteer(reading.angleDeg) - this.steer) * k;
      this.last = { steer: this.steer, throttle: 1, brake: false, boost: tuck };
    } else if (this.sinceGrip > POSE.releaseGrace) {
      // Hands off the bars: straighten up and brake.
      this.steer += (0 - this.steer) * k;
      this.last = { steer: this.steer, throttle: 0, brake: true, boost: false };
    }

    return {
      input: { ...this.last },
      reading,
      calibration: this.base ? 1 : Math.min(1, this.calibTime / POSE.calibrateFor),
      tuck,
      handsUpProgress: this.handsUpLatched ? 1 : Math.min(1, this.handsUpFor / POSE.handsUpHold),
      handsUpFired,
    };
  }
}
