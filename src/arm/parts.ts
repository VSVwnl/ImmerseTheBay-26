// Robot Workshop parts: which arm and which tool. Compact + Gripper is the standard robot and uses the
// original constants (L1, L2, WORKSPACE) unchanged. Pure data, no three.js.
import { L1, L2, WORKSHOP, WORKSPACE, type Vec3 } from '../config';

export type ArmKind = 'compact' | 'long';
export type ToolKind = 'gripper' | 'suction';
export interface RobotParts {
  arm: ArmKind;
  tool: ToolKind;
}
export interface Links {
  l1: number;
  l2: number;
}
export interface Workspace {
  min: Vec3;
  max: Vec3;
}

export const STANDARD_ROBOT: Readonly<RobotParts> = Object.freeze({ arm: 'compact', tool: 'gripper' });
export const ARM_KINDS: ArmKind[] = ['compact', 'long'];
export const TOOL_KINDS: ToolKind[] = ['gripper', 'suction'];
export const ARM_LABEL: Record<ArmKind, string> = { compact: 'Compact', long: 'Long' };
export const TOOL_LABEL: Record<ToolKind, string> = { gripper: 'Gripper', suction: 'Suction' };

export const COMPACT_LINKS: Links = Object.freeze({ l1: L1, l2: L2 });
export const LONG_LINKS: Links = Object.freeze({ l1: L1 * WORKSHOP.longScale, l2: L2 * WORKSHOP.longScale });

export function linksFor(arm: ArmKind): Links {
  return arm === 'long' ? LONG_LINKS : COMPACT_LINKS;
}

export function workspaceFor(arm: ArmKind): Workspace {
  return arm === 'long' ? WORKSHOP.longWorkspace : WORKSPACE;
}

export function payloadOf(arm: ArmKind): number {
  return WORKSHOP.payload[arm];
}

export function isStandard(r: RobotParts): boolean {
  return r.arm === STANDARD_ROBOT.arm && r.tool === STANDARD_ROBOT.tool;
}

export function sameParts(a: RobotParts, b: RobotParts): boolean {
  return a.arm === b.arm && a.tool === b.tool;
}

/** Old attempt files have no arm/tool: they were made with the standard robot. */
export function partsOf(rec: { arm?: string; tool?: string }): RobotParts {
  return {
    arm: rec.arm === 'long' ? 'long' : 'compact',
    tool: rec.tool === 'suction' ? 'suction' : 'gripper',
  };
}
