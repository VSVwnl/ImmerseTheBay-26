// Closed-form IK/FK for the 4-joint arm. The tool always points straight down.
// Pure math, no three.js, so env and tests can use it anywhere.
import { ARM_BASE, L1, L2, SHOULDER_H, TOOL_LEN, type Vec3 } from '../config';
import type { Links } from './parts';

const STD_LINKS: Links = { l1: L1, l2: L2 };

export type Joints = [number, number, number, number]; // [yaw, shoulder, elbow, wristPitch]

export interface IKResult {
  joints: Joints;
  tip: Vec3; // actual tip from FK (differs from the request when the reach was clamped)
  clamped: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Furthest wrist-to-shoulder distance the IK allows (full stretch, kept 1 cm short of straight). */
export function maxReach(links: Links = STD_LINKS): number {
  return links.l1 + links.l2 - 0.01;
}

export function shoulderPoint(): Vec3 {
  return [ARM_BASE[0], ARM_BASE[1] + SHOULDER_H, ARM_BASE[2]];
}

/**
 * yaw: rotation about Y, 0 = arm reaching toward +Z (toward the user).
 * shoulder: elevation of the upper link above horizontal.
 * elbow: interior angle between upper link and forearm (PI = straight).
 * wristPitch: rotation of the tool relative to the forearm, chosen so the tool points down.
 */
export function solveIK(target: Vec3, links: Links = STD_LINKS): IKResult {
  const { l1: L1, l2: L2 } = links;
  const S = shoulderPoint();
  const W: Vec3 = [target[0], target[1] + TOOL_LEN, target[2]];
  const dx = W[0] - S[0];
  const dz = W[2] - S[2];
  const yaw = Math.atan2(dx, dz);
  const r = Math.hypot(dx, dz);
  const h = W[1] - S[1];
  const dRaw = Math.hypot(r, h);
  const dMin = Math.abs(L1 - L2) + 0.01;
  const dMax = maxReach(links);
  const d = clamp(dRaw, dMin, dMax);
  const clamped = d !== dRaw;
  const elbow = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  const shoulder = Math.atan2(h, r) + Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const forearmAngle = shoulder - (Math.PI - elbow);
  const wristPitch = -Math.PI / 2 - forearmAngle;
  const joints: Joints = [yaw, shoulder, elbow, wristPitch];
  return { joints, tip: forwardKinematics(joints, links).tip, clamped };
}

export interface FKResult {
  shoulder: Vec3;
  elbow: Vec3;
  wrist: Vec3;
  tip: Vec3;
}

export function forwardKinematics(j: Joints, links: Links = STD_LINKS): FKResult {
  const { l1: L1, l2: L2 } = links;
  const [yaw, sh, el, wp] = j;
  const S = shoulderPoint();
  const hx = Math.sin(yaw);
  const hz = Math.cos(yaw);
  const a1 = sh;
  const E: Vec3 = [S[0] + L1 * Math.cos(a1) * hx, S[1] + L1 * Math.sin(a1), S[2] + L1 * Math.cos(a1) * hz];
  const a2 = sh - (Math.PI - el);
  const W: Vec3 = [E[0] + L2 * Math.cos(a2) * hx, E[1] + L2 * Math.sin(a2), E[2] + L2 * Math.cos(a2) * hz];
  const a3 = a2 + wp; // tool direction angle above horizontal; -PI/2 = straight down
  const T: Vec3 = [W[0] + TOOL_LEN * Math.cos(a3) * hx, W[1] + TOOL_LEN * Math.sin(a3), W[2] + TOOL_LEN * Math.cos(a3) * hz];
  return { shoulder: S, elbow: E, wrist: W, tip: T };
}
