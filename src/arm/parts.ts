// Robot Workshop parts: which arm and which tool. Compact + Gripper is the standard robot and uses the
// original constants (L1, L2, SHOULDER_H, WORKSPACE) unchanged. Pure data, no three.js.
// To add a part: add it to ArmKind/ToolKind, give it an entry in ARMS/TOOLS, and list it in ENABLED_PARTS.
import { ENABLED_PARTS, L1, L2, SHOULDER_H, WORKSHOP, WORKSPACE, type Vec3 } from '../config';

export type ArmKind = 'compact' | 'long' | 'heavyduty';
export type ToolKind = 'gripper' | 'suction' | 'magnet' | 'wide';
export interface RobotParts {
  arm: ArmKind;
  tool: ToolKind;
}
export interface Links {
  l1: number;
  l2: number;
  /** shoulder pivot above the base; default SHOULDER_H */
  shoulderH?: number;
}
export interface Workspace {
  min: Vec3;
  max: Vec3;
}

export interface ArmSpec {
  id: ArmKind;
  label: string;
  links: Links;
  /** heaviest object weight it lifts */
  payload: number;
  /** where the tip may be commanded */
  workspace: Workspace;
  /** strength / weakness, shown on the parts panel */
  blurb: string;
  /** drawn link thickness relative to the standard arm */
  girth?: number;
}
export interface ToolSpec {
  id: ToolKind;
  label: string;
  blurb: string;
}

export const COMPACT_LINKS: Links = Object.freeze({ l1: L1, l2: L2 });
export const LONG_LINKS: Links = Object.freeze({ l1: L1 * WORKSHOP.longScale, l2: L2 * WORKSHOP.longScale });
export const HEAVY_LINKS: Links = Object.freeze({ l1: L1 * WORKSHOP.heavyScale, l2: L2 * WORKSHOP.heavyScale });

export const ARMS: Record<ArmKind, ArmSpec> = {
  compact: { id: 'compact', label: 'Compact', links: COMPACT_LINKS, payload: WORKSHOP.payload.compact, workspace: WORKSPACE, blurb: 'strong, short reach' },
  long: { id: 'long', label: 'Long', links: LONG_LINKS, payload: WORKSHOP.payload.long, workspace: WORKSHOP.longWorkspace, blurb: 'reaches far, weak' },
  heavyduty: {
    id: 'heavyduty', label: 'Heavy-duty', links: HEAVY_LINKS, payload: WORKSHOP.payload.heavyduty,
    workspace: WORKSHOP.heavyWorkspace, blurb: 'very strong, middle of the table only', girth: 1.45,
  },
};
export const TOOLS: Record<ToolKind, ToolSpec> = {
  gripper: { id: 'gripper', label: 'Gripper', blurb: 'grips things with sides' },
  suction: { id: 'suction', label: 'Suction', blurb: 'lifts flat smooth things' },
  magnet: { id: 'magnet', label: 'Magnet', blurb: 'any metal, nothing else' },
  wide: { id: 'wide', label: 'Wide gripper', blurb: 'big things only' },
};

export const STANDARD_ROBOT: Readonly<RobotParts> = Object.freeze({ arm: 'compact', tool: 'gripper' });
export const ARM_KINDS = Object.keys(ARMS) as ArmKind[];
export const TOOL_KINDS = Object.keys(TOOLS) as ToolKind[];
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
    arm: rec.arm && rec.arm in ARMS ? (rec.arm as ArmKind) : 'compact',
    tool: rec.tool && rec.tool in TOOLS ? (rec.tool as ToolKind) : 'gripper',
  };
}
