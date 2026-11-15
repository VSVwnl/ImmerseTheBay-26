// Robot Workshop challenge logic. Each challenge is data in its own file under src/workshop/challenges/: steps
// (an object, where it spawns, where it must go). A challenge is done when every step's object rests on its goal.
// Pure and deterministic (seeded rng only).
import { BIN, TABLE, type Vec3 } from '../config';
import { CHALLENGE_DEFS, CHALLENGES, challengeAvailable, ITEMS } from '../workshop/registry';
import type { ChallengeDef, Goal, ItemId, TaskStep, WorkshopLayout } from '../workshop/types';
export type { Goal, GoalKind, TaskStep, WorkshopLayout } from '../workshop/types';
export type WorkshopTask = ChallengeDef;

export const WORKSHOP_TASKS: Record<WorkshopLayout, ChallengeDef> = CHALLENGES;
export const WORKSHOP_LAYOUTS: WorkshopLayout[] = CHALLENGE_DEFS.map((c) => c.layout);
export const isWorkshopLayout = (l: string): l is WorkshopLayout => l in WORKSHOP_TASKS;
/** Challenges switched on in config and solvable with the enabled parts, in registry order. */
export const enabledWorkshopLayouts = (): WorkshopLayout[] => CHALLENGE_DEFS.filter(challengeAvailable).map((c) => c.layout);

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
  const steps = WORKSHOP_TASKS[layout].steps;
  // its own goal first, so an overlapping goal of another step can't steal it
  for (const s of own ? [own, ...steps.filter((x) => x !== own)] : steps) {
    const g = s.goal;
    if (!over(p, g)) continue;
    const mine = s === own;
    if (g.kind === 'rack' || g.kind === 'pallet') return { pos: [p[0], spec.restY + g.h, p[2]], goal: mine, offTable: false };
    if (g.kind === 'bin' || g.kind === 'basket' || g.kind === 'carton') {
      const mx = Math.max(0, g.w / 2 - BIN.wall - spec.radius);
      const mz = Math.max(0, g.d / 2 - BIN.wall - spec.radius);
      return { pos: [clamp(p[0], g.pos[0] - mx, g.pos[0] + mx), spec.restY, clamp(p[2], g.pos[2] - mz, g.pos[2] + mz)], goal: mine, offTable: false };
    }
    return { pos: [p[0], spec.restY, p[2]], goal: mine, offTable: false };
  }
  return { pos: [p[0], spec.restY, p[2]], goal: false, offTable: false };
}
