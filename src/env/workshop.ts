// Robot Workshop challenges as data: each one lists steps (an object, where it spawns, where it must go).
// A challenge is done when every step's object rests on its goal. Pure and deterministic (seeded rng only).
// To add a challenge: add its id to WorkshopLayout, an entry in WORKSHOP_TASKS, and list it in ENABLED_CHALLENGES.
import { BIN, ENABLED_CHALLENGES, TABLE, WORKSHOP, type Vec3 } from '../config';
import { ITEMS, type ItemId } from '../arm/items';
import type { Rng } from './rng';

export type WorkshopLayout = 'plate' | 'far' | 'heavy' | 'washer';

export type GoalKind = 'rack' | 'bin' | 'zone';
export interface Goal {
  kind: GoalKind;
  pos: Vec3; // center on the table top
  w: number;
  d: number;
  /** rack: height of the top; bin: wall height; zone: 0 */
  h: number;
  color: number;
}
export interface TaskStep {
  item: ItemId;
  goal: Goal;
  spawn: (rng: Rng) => Vec3;
}
export interface WorkshopTask {
  layout: WorkshopLayout;
  name: string;
  hint: string;
  steps: TaskStep[];
  /** which robots solve it, for the panel and docs (tests check the real rules) */
  solvedBy: string;
}

const between = (rng: Rng, [lo, hi]: [number, number]) => lo + rng() * (hi - lo);
const W = WORKSHOP;

export const GOALS = {
  rack: { kind: 'rack', pos: W.rack.pos, w: W.rack.w, d: W.rack.d, h: W.rack.h, color: 0xb8bcc2 } as Goal,
  greenBin: { kind: 'bin', pos: W.canBin.pos, w: BIN.w, d: BIN.d, h: BIN.h, color: 0x2f9e5b } as Goal,
  zone: { kind: 'zone', pos: W.zone.pos, w: W.zone.size, d: W.zone.size, h: 0, color: 0xffd34d } as Goal,
  tray: { kind: 'bin', pos: W.tray.pos, w: BIN.w, d: BIN.d, h: BIN.h, color: 0x4a6f96 } as Goal,
};

export const WORKSHOP_TASKS: Record<WorkshopLayout, WorkshopTask> = {
  plate: {
    layout: 'plate',
    name: 'Plate',
    hint: 'Put the plate on the rack',
    solvedBy: 'Suction, any arm',
    steps: [{ item: 'plate', goal: GOALS.rack, spawn: (r) => [between(r, W.plate.spawnX), ITEMS.plate.restY, between(r, W.plate.spawnZ)] }],
  },
  far: {
    layout: 'far',
    name: 'Far',
    hint: 'Put the can in the green bin',
    solvedBy: 'Long + Gripper',
    steps: [{ item: 'can', goal: GOALS.greenBin, spawn: (r) => [W.can.x, ITEMS.can.restY, between(r, W.can.spawnZ)] }],
  },
  heavy: {
    layout: 'heavy',
    name: 'Heavy',
    hint: 'Put the pot on the glowing zone',
    solvedBy: 'Compact + Gripper',
    steps: [{ item: 'pot', goal: GOALS.zone, spawn: (r) => [between(r, W.pot.spawnX), ITEMS.pot.restY, between(r, W.pot.spawnZ)] }],
  },
  washer: {
    layout: 'washer',
    name: 'Washer',
    hint: 'Put the steel washer in the blue tray',
    solvedBy: 'Magnet, any arm',
    steps: [{ item: 'washer', goal: GOALS.tray, spawn: (r) => [between(r, W.washer.spawnX), ITEMS.washer.restY, between(r, W.washer.spawnZ)] }],
  },
};

export const WORKSHOP_LAYOUTS = Object.keys(WORKSHOP_TASKS) as WorkshopLayout[];
export const isWorkshopLayout = (l: string): l is WorkshopLayout => l in WORKSHOP_TASKS;
/** Challenges switched on in config, in registry order. */
export const enabledWorkshopLayouts = (): WorkshopLayout[] => WORKSHOP_LAYOUTS.filter((l) => ENABLED_CHALLENGES.includes(l));

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const over = (p: Vec3, g: Goal) => Math.abs(p[0] - g.pos[0]) <= g.w / 2 && Math.abs(p[2] - g.pos[2]) <= g.d / 2;

/** Is a resting object on its own goal? */
export function onGoal(step: TaskStep, p: Vec3): boolean {
  return over(p, step.goal);
}

export function stepFor(layout: WorkshopLayout, item: ItemId): TaskStep | undefined {
  return WORKSHOP_TASKS[layout].steps.find((s) => s.item === item);
}

/** Where a released object comes to rest: straight down onto whatever goal is under it, or the table. */
export function settleOn(layout: WorkshopLayout, item: ItemId, p: Vec3): { pos: Vec3; goal: boolean; offTable: boolean } {
  const spec = ITEMS[item];
  const onTable = Math.abs(p[0] - TABLE.cx) <= TABLE.width / 2 && Math.abs(p[2] - TABLE.cz) <= TABLE.depth / 2;
  if (!onTable) return { pos: p, goal: false, offTable: true };
  const own = stepFor(layout, item);
  for (const s of WORKSHOP_TASKS[layout].steps) {
    const g = s.goal;
    if (!over(p, g)) continue;
    const mine = s === own;
    if (g.kind === 'rack') return { pos: [p[0], spec.restY + g.h, p[2]], goal: mine, offTable: false };
    if (g.kind === 'bin') {
      const mx = Math.max(0, g.w / 2 - BIN.wall - spec.radius);
      const mz = Math.max(0, g.d / 2 - BIN.wall - spec.radius);
      return { pos: [clamp(p[0], g.pos[0] - mx, g.pos[0] + mx), spec.restY, clamp(p[2], g.pos[2] - mz, g.pos[2] + mz)], goal: mine, offTable: false };
    }
    return { pos: [p[0], spec.restY, p[2]], goal: mine, offTable: false };
  }
  return { pos: [p[0], spec.restY, p[2]], goal: false, offTable: false };
}
