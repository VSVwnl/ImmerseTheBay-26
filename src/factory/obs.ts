// Observation and action format (fixed; M4 depends on it).
//   image  96x96x3 uint8, upright
//   state  [tip_x, tip_y, tip_z, grip], positions scaled to [-1, 1] over the workspace, grip 0/1
//   action [target_x, target_y, target_z, grip], same scaling, absolute target
//   control 10 Hz: one step is env.step(action, 0.1)
import { WORKSPACE, type Vec3 } from '../config';
import type { Action, EnvState } from '../env/env';

export const IMG = 96;
export const CONTROL_DT = 0.1;
export const MAX_STEPS = 150;

export function normPos(p: Vec3): Vec3 {
  return [0, 1, 2].map((i) => ((p[i] - WORKSPACE.min[i]) / (WORKSPACE.max[i] - WORKSPACE.min[i])) * 2 - 1) as Vec3;
}

export function denormPos(n: Vec3): Vec3 {
  return [0, 1, 2].map((i) => WORKSPACE.min[i] + ((n[i] + 1) / 2) * (WORKSPACE.max[i] - WORKSPACE.min[i])) as Vec3;
}

export type Vec4 = [number, number, number, number];

export function stateVec(s: EnvState): Vec4 {
  return [...normPos(s.tip), s.grip] as Vec4;
}

export function actionVec(a: Action): Vec4 {
  return [...normPos(a.target), a.grip] as Vec4;
}

export function actionFromVec(v: ArrayLike<number>): Action {
  return { target: denormPos([v[0], v[1], v[2]]), grip: v[3] > 0.5 ? 1 : 0 };
}
