// Workshop challenge (two steps, swap tools between): the plate onto the rack, then the heavy pot onto the zone.
// No single robot does both: the plate needs Suction, the pot needs a Gripper or Magnet on a strong arm. Parts can
// be swapped mid-challenge without a restart (not while holding something); the swaps are recorded and replayed.
import { WORKSHOP as W } from '../../config';
import type { ChallengeDef } from '../types';
import { between } from '../util';
import { PLATE_ITEM } from './plate';
import { POT_ITEM } from './heavy';

const D = W.dinner;

export const DINNER: ChallengeDef = {
  layout: 'dinner',
  name: 'Dinner',
  hint: 'Plate on the rack, then pot on the zone: swap tools between',
  items: [PLATE_ITEM, POT_ITEM],
  steps: [
    {
      item: 'plate',
      goal: { kind: 'rack', pos: D.rack, w: W.rack.w, d: W.rack.d, h: W.rack.h, color: 0xb8bcc2 },
      spawn: (r) => [between(r, D.plateX), PLATE_ITEM.restY, between(r, D.spawnZ)],
    },
    {
      item: 'pot',
      goal: { kind: 'zone', pos: D.zone, w: W.zone.size, d: W.zone.size, h: 0, color: 0xffd34d },
      spawn: (r) => [between(r, D.potX), POT_ITEM.restY, between(r, D.spawnZ)],
    },
  ],
  solutions: [],
  swap: true,
  stepSolutions: [
    [{ arm: 'compact', tool: 'suction' }, { arm: 'long', tool: 'suction' }, { arm: 'heavyduty', tool: 'suction' }],
    [
      { arm: 'compact', tool: 'gripper' },
      { arm: 'compact', tool: 'magnet' },
      { arm: 'heavyduty', tool: 'gripper' },
      { arm: 'heavyduty', tool: 'magnet' },
    ],
  ],
};
