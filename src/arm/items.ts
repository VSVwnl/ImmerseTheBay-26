// Robot Workshop objects and the grab rules. Each object carries tags (defined with its challenge in
// src/workshop/challenges/); each tool has one rule (in its part file) that reads the tags and says why it can't
// hold the object, or null. Then the weight is checked against the arm's payload.
// The standard cubes are not items: any tool holds them and they weigh 1, so the standard robot is unaffected.
import { GRAB_RADIUS, WORKSHOP, type Vec3 } from '../config';
import { ITEMS, TOOLS } from '../workshop/registry';
import type { ItemId, ItemSpec, RobotParts, ToolKind, Workspace } from '../workshop/types';
import { payloadOf } from './parts';
export type { ItemId, ItemSpec, Material, Shape, Size } from '../workshop/types';
export { ITEMS } from '../workshop/registry';

export type GrabFailReason = 'tool' | 'heavy' | 'reach';
export const ITEM_IDS: ItemId[] = Object.keys(ITEMS);

export const isItem = (id: string | null | undefined): id is ItemId => !!id && id in ITEMS;

/** One rule per tool: why this tool can't hold this object, or null if it can. */
export const TOOL_RULES: Record<ToolKind, (it: ItemSpec) => string | null> = Object.fromEntries(
  Object.values(TOOLS).map((t) => [t.id, t.rule]),
);

/** Why this robot can't hold this object: tool first, then weight. Null when it can. */
export function grabCheck(item: ItemSpec, robot: RobotParts): { reason: GrabFailReason; text: string } | null {
  const rule = TOOL_RULES[robot.tool];
  const toolSays = rule ? rule(item) : null;
  if (toolSays) return { reason: 'tool', text: toolSays };
  if (item.weight > payloadOf(robot.arm)) return { reason: 'heavy', text: 'Too heavy for this arm' };
  return null;
}

/** The reason code only (see grabCheck for the label text). */
export function grabRule(item: ItemSpec, robot: RobotParts): GrabFailReason | null {
  return grabCheck(item, robot)?.reason ?? null;
}

export const OUT_OF_REACH = 'Out of reach';

const hdist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Nearest item whose center is within GRAB_RADIUS of the tip, or null (same rule as the cubes). */
export function findItem(tip: Vec3, items: Partial<Record<ItemId, Vec3>>): ItemId | null {
  let best: ItemId | null = null;
  let bestD = GRAB_RADIUS;
  for (const id of ITEM_IDS) {
    const p = items[id];
    if (!p) continue;
    const d = Math.hypot(tip[0] - p[0], tip[1] - p[1], tip[2] - p[2]);
    if (d <= bestD) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

/** An item the tip is reaching toward that no tip position inside this workspace can grab. */
export function outOfReachItem(tip: Vec3, items: Partial<Record<ItemId, Vec3>>, ws: Workspace): ItemId | null {
  for (const id of ITEM_IDS) {
    const p = items[id];
    if (!p) continue;
    const closest: Vec3 = [clamp(p[0], ws.min[0], ws.max[0]), clamp(p[1], ws.min[1], ws.max[1]), clamp(p[2], ws.min[2], ws.max[2])];
    const unreachable = Math.hypot(p[0] - closest[0], p[1] - closest[1], p[2] - closest[2]) > GRAB_RADIUS;
    if (unreachable && hdist(tip, p) <= WORKSHOP.reachHintRadius && Math.abs(tip[1] - p[1]) <= WORKSHOP.reachHintDy) return id;
  }
  return null;
}
