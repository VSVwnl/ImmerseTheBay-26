// Pure hand/controller-to-action logic, separate from WebXR so it can be unit-tested with fake joints.
import {
  HAND_ACTIVE_MAX_Z,
  HAND_ACTIVE_MIN_Y,
  HAND_OFFSET,
  HAND_SMOOTH,
  HAND_SMOOTH_REF_HZ,
  HOME_TIP,
  PINCH_CLOSE,
  PINCH_OPEN,
  type Vec3,
} from '../config';

export interface HandSample {
  thumbTip: Vec3;
  indexTip: Vec3;
}

export interface ControllerSample {
  grip: Vec3; // grip-space position
  trigger: number; // 0..1
}

export const isActiveRegion = (p: Vec3) => p[1] > HAND_ACTIVE_MIN_Y && p[2] < HAND_ACTIVE_MAX_Z;

/** Frame-rate independent version of "blend 0.35 per frame at 72 Hz". */
export function smoothAlpha(dt: number): number {
  return 1 - Math.pow(1 - HAND_SMOOTH, Math.max(0, dt) * HAND_SMOOTH_REF_HZ);
}

export class PinchControl {
  target: Vec3 = [...HOME_TIP];
  grip: 0 | 1 = 0;
  active = false;
  pinchDist = Infinity;
  private smoothed: Vec3 | null = null;

  /** sample = null when the hand is not tracked. */
  update(sample: HandSample | null, dt: number): void {
    if (!sample) {
      this.active = false;
      this.smoothed = null;
      return;
    }
    const { thumbTip: a, indexTip: b } = sample;
    const pinch: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    this.pinchDist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (!this.smoothed) this.smoothed = pinch;
    else {
      const k = smoothAlpha(dt);
      this.smoothed = [
        this.smoothed[0] + (pinch[0] - this.smoothed[0]) * k,
        this.smoothed[1] + (pinch[1] - this.smoothed[1]) * k,
        this.smoothed[2] + (pinch[2] - this.smoothed[2]) * k,
      ];
    }
    this.active = isActiveRegion(this.smoothed);
    if (!this.active) return; // hold last target and grip
    this.target = [this.smoothed[0] + HAND_OFFSET[0], this.smoothed[1] + HAND_OFFSET[1], this.smoothed[2] + HAND_OFFSET[2]];
    if (this.grip === 0 && this.pinchDist < PINCH_CLOSE) this.grip = 1;
    else if (this.grip === 1 && this.pinchDist > PINCH_OPEN) this.grip = 0;
  }
}

export class ControllerControl {
  target: Vec3 = [...HOME_TIP];
  grip: 0 | 1 = 0;
  active = false;
  private smoothed: Vec3 | null = null;

  update(sample: ControllerSample | null, dt: number): void {
    if (!sample) {
      this.active = false;
      this.smoothed = null;
      return;
    }
    const p = sample.grip;
    if (!this.smoothed) this.smoothed = [...p];
    else {
      const k = smoothAlpha(dt);
      this.smoothed = this.smoothed.map((v, i) => v + (p[i] - v) * k) as Vec3;
    }
    this.active = isActiveRegion(this.smoothed);
    if (!this.active) return;
    this.target = [this.smoothed[0] + HAND_OFFSET[0], this.smoothed[1] + HAND_OFFSET[1], this.smoothed[2] + HAND_OFFSET[2]];
    if (this.grip === 0 && sample.trigger > 0.6) this.grip = 1;
    else if (this.grip === 1 && sample.trigger < 0.3) this.grip = 0;
  }
}
