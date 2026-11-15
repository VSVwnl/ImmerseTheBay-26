// Robot Workshop registry: every part and challenge, each defined in its own file. To add one, write its file
// in parts/ or challenges/, list it below, and add its id to ENABLED_PARTS / ENABLED_CHALLENGES in config.
import { ENABLED_CHALLENGES, ENABLED_PARTS } from '../config';
import type { ArmDef, ChallengeDef, ItemSpec, ToolDef } from './types';
import { COMPACT } from './parts/compact';
import { LONG } from './parts/long';
import { HEAVYDUTY } from './parts/heavyduty';
import { TALL } from './parts/tall';
import { XLONG } from './parts/xlong';
import { GRIPPER } from './parts/gripper';
import { SUCTION } from './parts/suction';
import { MAGNET } from './parts/magnet';
import { WIDE } from './parts/wide';
import { SCOOP } from './parts/scoop';
import { PLATE } from './challenges/plate';
import { FAR } from './challenges/far';
import { HEAVY } from './challenges/heavy';
import { WASHER } from './challenges/washer';
import { CRATE } from './challenges/crate';
import { ANVIL } from './challenges/anvil';
import { MARBLES } from './challenges/marbles';
import { SHELF } from './challenges/shelf';
import { CART } from './challenges/cart';
import { DINNER } from './challenges/dinner';

export const ARM_DEFS: ArmDef[] = [COMPACT, LONG, HEAVYDUTY, TALL, XLONG];
export const TOOL_DEFS: ToolDef[] = [GRIPPER, SUCTION, MAGNET, WIDE, SCOOP];
export const CHALLENGE_DEFS: ChallengeDef[] = [PLATE, FAR, HEAVY, WASHER, CRATE, ANVIL, MARBLES, SHELF, CART, DINNER];

const byId = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x])) as Record<string, T>;
export const ARMS: Record<string, ArmDef> = byId(ARM_DEFS);
export const TOOLS: Record<string, ToolDef> = byId(TOOL_DEFS);
export const CHALLENGES: Record<string, ChallengeDef> = Object.fromEntries(CHALLENGE_DEFS.map((c) => [c.layout, c]));
/** every object any challenge brings */
export const ITEMS: Record<string, ItemSpec> = byId(CHALLENGE_DEFS.flatMap((c) => c.items));

export const partEnabled = (id: string): boolean => ENABLED_PARTS.includes(id) && (id in ARMS || id in TOOLS);

const buildable = (s: { arm: string; tool: string }) => partEnabled(s.arm) && partEnabled(s.tool);

/** On when listed in ENABLED_CHALLENGES and solvable with enabled parts: some single robot solves it, or (for
 *  swap challenges) every step has a robot that can do it. */
export function challengeAvailable(c: ChallengeDef): boolean {
  if (!ENABLED_CHALLENGES.includes(c.layout)) return false;
  if (c.solutions.some(buildable)) return true;
  return !!c.swap && !!c.stepSolutions?.length && c.stepSolutions.every((rs) => rs.some(buildable));
}
