// Robot Workshop parts: which arm and which tool. Each part is defined in its own file under src/workshop/parts/
// and listed in src/workshop/registry.ts. Compact + Gripper is the standard robot and uses the original constants
// (L1, L2, SHOULDER_H, WORKSPACE) unchanged.
import { ENABLED_PARTS, SHOULDER_H } from '../config';
import { ARMS, TOOLS, ARM_DEFS, TOOL_DEFS } from '../workshop/registry';
import type { ArmKind, Links, RobotParts, ToolKind, Workspace } from '../workshop/types';
export type { ArmDef as ArmSpec, ArmKind, Links, RobotParts, ToolDef as ToolSpec, ToolKind, Workspace } from '../workshop/types';
export { ARMS, TOOLS } from '../workshop/registry';
export { COMPACT_LINKS } from '../workshop/parts/compact';
export { LONG_LINKS } from '../workshop/parts/long';

export const STANDARD_ROBOT: Readonly<RobotParts> = Object.freeze({ arm: 'compact', tool: 'gripper' });
export const ARM_KINDS: ArmKind[] = ARM_DEFS.map((a) => a.id);
export const TOOL_KINDS: ToolKind[] = TOOL_DEFS.map((t) => t.id);
export const ARM_LABEL = Object.fromEntries(ARM_KINDS.map((k) => [k, ARMS[k].label])) as Record<ArmKind, string>;
export const TOOL_LABEL = Object.fromEntries(TOOL_KINDS.map((k) => [k, TOOLS[k].label])) as Record<ToolKind, string>;

/** Parts switched on in config (ENABLED_PARTS). Switching off a part only hides it in the Workshop;
 *  the standard robot always exists. */
export const enabledArms = (): ArmKind[] => ARM_KINDS.filter((k) => ENABLED_PARTS.includes(k));
export const enabledTools = (): ToolKind[] => TOOL_KINDS.filter((k) => ENABLED_PARTS.includes(k));

/** The robot the Workshop starts with: the standard parts if switched on, else the first enabled ones. */
export function workshopStartParts(): RobotParts {
  const arms = enabledArms();
  const tools = enabledTools();
  return {
    arm: arms.includes('compact') || !arms.length ? 'compact' : arms[0],
    tool: tools.includes('gripper') || !tools.length ? 'gripper' : tools[0],
  };
}

export function linksFor(arm: ArmKind): Links {
  return (ARMS[arm] ?? ARMS.compact).links;
}

export function workspaceFor(arm: ArmKind): Workspace {
  return (ARMS[arm] ?? ARMS.compact).workspace;
}

export function payloadOf(arm: ArmKind): number {
  return (ARMS[arm] ?? ARMS.compact).payload;
}

export function shoulderHeight(links: Links): number {
  return links.shoulderH ?? SHOULDER_H;
}

export function isStandard(r: RobotParts): boolean {
  return r.arm === STANDARD_ROBOT.arm && r.tool === STANDARD_ROBOT.tool;
}

export function sameParts(a: RobotParts, b: RobotParts): boolean {
  return a.arm === b.arm && a.tool === b.tool;
}

/** Old attempt files have no arm/tool: they were made with the standard robot. Unknown names fall back too. */
export function partsOf(rec: { arm?: string; tool?: string }): RobotParts {
  return {
    arm: rec.arm && rec.arm in ARMS ? rec.arm : 'compact',
    tool: rec.tool && rec.tool in TOOLS ? rec.tool : 'gripper',
  };
}
