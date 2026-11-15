// Workshop challenge (three steps, swap tools twice): a steel washer -> tray, loose marbles -> bowl, an egg ->
// carton. Each needs a different tool (magnet, scoop, soft gripper), so the tool is swapped mid-run twice
// (allowed here without a restart, not while holding something).
import { BIN, WORKSHOP as W } from '../../config';
import type { ChallengeDef, RobotParts } from '../types';
import { between } from '../util';
import { WASHER_ITEM } from './washer';
import { MARBLES_ITEM } from './marbles';
import { EGG_ITEM } from './egg';

const C = W.cleanup;
const onTableArms = (tool: string, arms = ['compact', 'long', 'heavyduty']): RobotParts[] => arms.map((arm) => ({ arm, tool }));

export const CLEANUP: ChallengeDef = {
  layout: 'cleanup',
  name: 'Cleanup',
  hint: 'Washer to the tray, marbles to the bowl, egg to the carton: swap tools',
  items: [WASHER_ITEM, MARBLES_ITEM, EGG_ITEM],
  steps: [
    {
      item: 'washer',
      goal: { kind: 'bin', pos: C.tray, w: BIN.w, d: BIN.d, h: BIN.h, color: 0x4a6f96 },
      spawn: (r) => [between(r, C.washerX), WASHER_ITEM.restY, between(r, C.spawnZ)],
    },
    {
      item: 'marbles',
      goal: { kind: 'bowl', pos: C.bowl, w: W.bowl.r * 1.6, d: W.bowl.r * 1.6, h: W.bowl.h, color: 0x2a6fd6 },
      spawn: (r) => [between(r, C.marblesX), MARBLES_ITEM.restY, between(r, C.spawnZ)],
    },
    {
      item: 'egg',
      goal: { kind: 'carton', pos: C.carton, w: W.carton.w, d: W.carton.d, h: W.carton.h, color: 0xb9a88a },
      spawn: (r) => [between(r, C.eggX), EGG_ITEM.restY, between(r, C.spawnZ)],
    },
  ],
  solutions: [],
  swap: true,
  stepSolutions: [onTableArms('magnet'), onTableArms('scoop'), onTableArms('soft', ['compact', 'long', 'heavyduty', 'xlong'])],
};
