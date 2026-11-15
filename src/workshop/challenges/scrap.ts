// Workshop challenge (two steps, one robot): a steel washer near the robot -> blue tray, then a can at the far
// right edge -> green bin. Parts can't be swapped mid-way (a change restarts it), so the question is which single
// robot does both: the washer needs the magnet, the can needs the Long arm's reach. Only Long + Magnet.
import { BIN, WORKSHOP as W } from '../../config';
import type { ChallengeDef } from '../types';
import { between } from '../util';
import { WASHER_ITEM } from './washer';
import { CAN_ITEM } from './far';

export const SCRAP: ChallengeDef = {
  layout: 'scrap',
  name: 'Scrap',
  hint: 'Washer to the blue tray, can to the green bin: one robot',
  items: [WASHER_ITEM, CAN_ITEM],
  steps: [
    {
      item: 'washer',
      goal: { kind: 'bin', pos: W.tray.pos, w: BIN.w, d: BIN.d, h: BIN.h, color: 0x4a6f96 },
      spawn: (r) => [between(r, W.scrap.washerX), WASHER_ITEM.restY, between(r, W.scrap.washerZ)],
    },
    {
      item: 'can',
      goal: { kind: 'bin', pos: W.canBin.pos, w: BIN.w, d: BIN.d, h: BIN.h, color: 0x2f9e5b },
      spawn: (r) => [W.can.x, CAN_ITEM.restY, between(r, W.can.spawnZ)],
    },
  ],
  solutions: [{ arm: 'long', tool: 'magnet' }],
};
