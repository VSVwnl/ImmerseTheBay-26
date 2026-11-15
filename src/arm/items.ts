// Robot Workshop objects and the grab rules. Tags on each object are checked when a grab is attempted:
//   needsTool: the tool that can hold it (absent = any tool)
//   weight:    the grab fails when weight > the arm's payload
// The standard cubes are not items: any tool holds them and they weigh 1, so the standard robot is unaffected.
import { BIN, GRAB_RADIUS, TABLE, WORKSHOP, type Vec3 } from '../config';
import { payloadOf, type RobotParts, type ToolKind, type Workspace } from './parts';

export type ItemId = 'plate' | 'can' | 'pot';
export const ITEM_IDS: ItemId[] = ['plate', 'can', 'pot'];
export type GrabFailReason = 'tool' | 'heavy' | 'reach';

export interface ItemSpec {
  id: ItemId;
  name: string;
  needsTool?: ToolKind;
  weight: 1 | 2;
  /** center height when resting on the table */
  restY: number;
  /** horizontal radius (for keeping it inside bins) */
  radius: number;
}

export const ITEMS: Record<ItemId, ItemSpec> = {
  plate: { id: 'plate', name: 'plate', needsTool: 'suction', weight: 1, restY: TABLE.top + WORKSHOP.plate.thick / 2, radius: WORKSHOP.plate.radius },
  can: { id: 'can', name: 'can', needsTool: 'gripper', weight: 1, restY: TABLE.top + WORKSHOP.can.height / 2, radius: WORKSHOP.can.radius },
  pot: { id: 'pot', name: 'pot', needsTool: 'gripper', weight: 2, restY: TABLE.top + WORKSHOP.pot.height / 2, radius: WORKSHOP.pot.radius },
};

export const isItem = (id: string | null | undefined): id is ItemId => !!id && id in ITEMS;

/** The grab rule: null when this robot can hold this object, otherwise why not. Tool is checked before weight. */
export function grabRule(item: Pick<ItemSpec, 'needsTool' | 'weight'>, robot: RobotParts): GrabFailReason | null {
  if (item.needsTool && item.needsTool !== robot.tool) return 'tool';
  if (item.weight > payloadOf(robot.arm)) return 'heavy';
  return null;
}

/** The floating label text for a failed grab. */
export function failText(reason: GrabFailReason, item: ItemId | null): string {
  if (reason === 'heavy') return 'Too heavy for this arm';
  if (reason === 'reach') return 'Out of reach';
  if (item === 'plate') return "Can't grip a flat plate";
  if (item === 'can') return "Suction can't seal on a can";
  if (item === 'pot') return "Suction can't hold a pot";
  return 'Wrong tool';
}

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
    if (unreachable && hdist(tip, p) <= WORKSHOP.reachHintRadius && tip[1] <= p[1] + 0.15) return id;
  }
  return null;
}

const inBox = (p: Vec3, c: Vec3, w: number, d: number) => Math.abs(p[0] - c[0]) <= w / 2 && Math.abs(p[2] - c[2]) <= d / 2;

/** Is this resting position the item's goal (plate on the rack, can in the bin, pot in the zone)? */
export function inGoal(id: ItemId, p: Vec3): boolean {
  if (id === 'plate') return inBox(p, WORKSHOP.rack.pos, WORKSHOP.rack.w, WORKSHOP.rack.d);
  if (id === 'can') return inBox(p, WORKSHOP.canBin.pos, BIN.w, BIN.d);
  return inBox(p, WORKSHOP.zone.pos, WORKSHOP.zone.size, WORKSHOP.zone.size);
}

/** Where a released item comes to rest: straight down onto its goal or the table. */
export function settleItem(id: ItemId, p: Vec3): { pos: Vec3; goal: boolean; offTable: boolean } {
  const spec = ITEMS[id];
  const onTable = Math.abs(p[0] - TABLE.cx) <= TABLE.width / 2 && Math.abs(p[2] - TABLE.cz) <= TABLE.depth / 2;
  if (!onTable) return { pos: p, goal: false, offTable: true };
  if (!inGoal(id, p)) return { pos: [p[0], spec.restY, p[2]], goal: false, offTable: false };
  if (id === 'plate') return { pos: [p[0], spec.restY + WORKSHOP.rack.h, p[2]], goal: true, offTable: false };
  if (id === 'can') {
    const b = WORKSHOP.canBin.pos;
    const m = BIN.w / 2 - BIN.wall - spec.radius;
    return { pos: [clamp(p[0], b[0] - m, b[0] + m), spec.restY, clamp(p[2], b[2] - m, b[2] + m)], goal: true, offTable: false };
  }
  return { pos: [p[0], spec.restY, p[2]], goal: true, offTable: false };
}
