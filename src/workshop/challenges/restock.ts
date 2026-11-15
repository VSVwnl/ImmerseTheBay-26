// Workshop challenge (two steps, swap ARMS between): the light parcel from the side cart -> outbox, then the anvil
// -> red zone. Only the Extra-long reaches the cart and only the Heavy-duty lifts the anvil, so the arm itself has to
// be swapped mid-run (allowed in this challenge without a restart, not while holding something).
import { BIN, WORKSHOP as W } from '../../config';
import type { ChallengeDef } from '../types';
import { between } from '../util';
import { makeCart, PARCEL_ITEM } from './cart';
import { ANVIL_ITEM } from './anvil';

export const RESTOCK: ChallengeDef = {
  layout: 'restock',
  name: 'Restock',
  hint: 'Parcel from the cart to the outbox, then the anvil to the red zone: swap arms',
  items: [PARCEL_ITEM, ANVIL_ITEM],
  steps: [
    {
      item: 'parcel',
      goal: { kind: 'bin', pos: W.outbox.pos, w: BIN.w, d: BIN.d, h: BIN.h, color: 0x6f7a86 },
      spawn: (r) => [between(r, W.parcel.spawnX), PARCEL_ITEM.restY, between(r, W.parcel.spawnZ)],
    },
    {
      item: 'anvil',
      goal: { kind: 'zone', pos: W.dropZone.pos, w: W.dropZone.size, d: W.dropZone.size, h: 0, color: 0xff7b6b },
      spawn: (r) => [between(r, W.anvil.spawnX), ANVIL_ITEM.restY, between(r, W.anvil.spawnZ)],
    },
  ],
  solutions: [],
  swap: true,
  stepSolutions: [
    [{ arm: 'xlong', tool: 'gripper' }, { arm: 'xlong', tool: 'suction' }, { arm: 'xlong', tool: 'soft' }],
    [{ arm: 'heavyduty', tool: 'gripper' }, { arm: 'heavyduty', tool: 'magnet' }],
  ],
  scenery: () => [makeCart()],
};
