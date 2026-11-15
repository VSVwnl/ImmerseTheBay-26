// Robot Workshop registry: every part and challenge, each defined in its own file. To add one, write its file
// in parts/ or challenges/, list it below, and add its id to ENABLED_PARTS / ENABLED_CHALLENGES in config.
import { ENABLED_CHALLENGES, ENABLED_PARTS } from '../config';
import type { ArmDef, ChallengeDef, ItemSpec, ToolDef } from './types';
import { COMPACT } from './parts/compact';
import { LONG } from './parts/long';
import { HEAVYDUTY } from './parts/heavyduty';
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

export const ARM_DEFS: ArmDef[] = [COMPACT, LONG, HEAVYDUTY];
export const TOOL_DEFS: ToolDef[] = [GRIPPER, SUCTION, MAGNET, WIDE, SCOOP];
export const CHALLENGE_DEFS: ChallengeDef[] = [PLATE, FAR, HEAVY, WASHER, CRATE, ANVIL, MARBLES];

const byId = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x])) as Record<string, T>;
export const ARMS: Record<string, ArmDef> = byId(ARM_DEFS);
export const TOOLS: Record<string, ToolDef> = byId(TOOL_DEFS);
export const CHALLENGES: Record<string, ChallengeDef> = Object.fromEntries(CHALLENGE_DEFS.map((c) => [c.layout, c]));
/** every object any challenge brings */
export const ITEMS: Record<string, ItemSpec> = byId(CHALLENGE_DEFS.flatMap((c) => c.items));

export const partEnabled = (id: string): boolean => ENABLED_PARTS.includes(id) && (id in ARMS || id in TOOLS);

/** On when listed in ENABLED_CHALLENGES and at least one robot that solves it can be built from enabled parts. */
export function challengeAvailable(c: ChallengeDef): boolean {
  return ENABLED_CHALLENGES.includes(c.layout) && c.solutions.some((s) => partEnabled(s.arm) && partEnabled(s.tool));
}
