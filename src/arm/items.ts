// Robot Workshop objects and the grab rules. Each object carries tags; each tool has one rule that reads the
// tags and says why it can't hold the object (or null). Then the weight is checked against the arm's payload.
// The standard cubes are not items: any tool holds them and they weigh 1, so the standard robot is unaffected.
// To add an object: add its id to ItemId, give it an ITEMS entry with tags, and a mesh in scene/workshop.ts.
import { GRAB_RADIUS, TABLE, WORKSHOP, type Vec3 } from '../config';
import { payloadOf, type RobotParts, type ToolKind, type Workspace } from './parts';

export type ItemId = 'plate' | 'can' | 'pot' | 'washer' | 'crate';
export type Material = 'ceramic' | 'metal' | 'wood' | 'glass' | 'plastic';
/** flat: no sides to grip; cylinder/box/pot: has sides; ring: flat with a hole; loose: many small bits */
export type Shape = 'flat' | 'cylinder' | 'box' | 'pot' | 'ring' | 'loose';
export type Size = 'small' | 'normal' | 'big';
export type GrabFailReason = 'tool' | 'heavy' | 'reach';

export interface ItemSpec {
  id: ItemId;
  name: string;
  material: Material;
  shape: Shape;
  size: Size;
  /** compared with the arm's payload */
  weight: number;
  /** center height when resting on the table */
  restY: number;
  /** horizontal radius (keeps it inside bins) */
  radius: number;
  /** a smooth flat top suction can seal on (flat things always have one) */
  smoothTop?: boolean;
  /** render offset while held (e.g. a plate hangs under the pad) */
  holdDrop?: number;
  /** why suction fails on it, when the generic text doesn't fit */
  suctionText?: string;
}

export const ITEMS: Record<ItemId, ItemSpec> = {
  plate: {
    id: 'plate', name: 'plate', material: 'ceramic', shape: 'flat', size: 'normal', weight: 1,
    restY: TABLE.top + WORKSHOP.plate.thick / 2, radius: WORKSHOP.plate.radius, holdDrop: WORKSHOP.plate.thick / 2,
  },
  can: {
    id: 'can', name: 'can', material: 'metal', shape: 'cylinder', size: 'normal', weight: 1,
    restY: TABLE.top + WORKSHOP.can.height / 2, radius: WORKSHOP.can.radius,
  },
  pot: {
    id: 'pot', name: 'pot', material: 'metal', shape: 'pot', size: 'normal', weight: 2,
    restY: TABLE.top + WORKSHOP.pot.height / 2, radius: WORKSHOP.pot.radius,
  },
  washer: {
    id: 'washer', name: 'washer', material: 'metal', shape: 'ring', size: 'small', weight: 1,
    restY: TABLE.top + WORKSHOP.washer.thick / 2, radius: WORKSHOP.washer.radius, holdDrop: WORKSHOP.washer.thick / 2,
  },
  crate: {
    id: 'crate', name: 'crate', material: 'wood', shape: 'box', size: 'big', weight: 2,
    restY: TABLE.top + WORKSHOP.crate.size / 2, radius: WORKSHOP.crate.size / 2, suctionText: 'Air leaks through the slats',
  },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export const isItem = (id: string | null | undefined): id is ItemId => !!id && id in ITEMS;

/** One rule per tool: why this tool can't hold this object, or null if it can. */
export const TOOL_RULES: Record<ToolKind, (it: ItemSpec) => string | null> = {
  gripper: (it) => {
    if (it.shape === 'flat' || it.shape === 'ring') return `Can't grip a flat ${it.name}`;
    if (it.shape === 'loose') return 'Loose bits slip through the fingers';
    if (it.size === 'big') return 'Too big for this gripper';
    return null;
  },
  suction: (it) => {
    if (it.shape === 'flat' || it.smoothTop) return null;
    if (it.suctionText) return it.suctionText;
    if (it.shape === 'ring') return 'Air leaks through the hole';
    if (it.shape === 'loose') return "Suction can't hold loose bits";
    if (it.shape === 'cylinder') return `Suction can't seal on a ${it.name}`;
    return `Suction can't hold a ${it.name}`;
  },
  magnet: (it) => (it.material === 'metal' ? null : 'Magnet only lifts metal'),
  wide: (it) => {
    if (it.shape === 'flat' || it.shape === 'ring') return `Can't grip a flat ${it.name}`;
    if (it.shape === 'loose') return 'Loose bits slip through the fingers';
    if (it.size !== 'big') return 'Too small for the wide gripper';
    return null;
  },
};

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
    if (unreachable && hdist(tip, p) <= WORKSHOP.reachHintRadius && Math.abs(tip[1] - p[1]) <= 0.2) return id;
  }
  return null;
}
