import { FINGER_ANIM_S, FINGER_GAP_CLOSED, FINGER_GAP_OPEN, type Vec3 } from '../config';

/** Dimensions in the model's local tool axes. Local +Z points down, towards the tip. */
export const PALM = { size: [0.11, 0.035, 0.02] as Vec3, aboveTip: 0.055 };
export const FINGER = { size: [0.012, 0.03, 0.065] as Vec3, aboveTip: 0.012 };
export const fingerOffset = (gap: number) => gap / 2 + FINGER.size[0] / 2;

export function advanceGap(gap: number, closed: boolean, dt: number): number {
  const target = closed ? FINGER_GAP_CLOSED : FINGER_GAP_OPEN;
  const speed = (FINGER_GAP_OPEN - FINGER_GAP_CLOSED) / FINGER_ANIM_S;
  return gap + Math.sign(target - gap) * Math.min(Math.abs(target - gap), speed * dt);
}
