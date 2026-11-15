// Workshop part (arm): the standard links on a column 0.3 m taller. It reaches high shelves, but its tip can't
// come down to the table, so it fails every table-top job.
import { L1, L2, SHOULDER_H, WORKSHOP } from '../../config';
import type { ArmDef, Links } from '../types';

export const TALL_LINKS: Links = Object.freeze({ l1: L1, l2: L2, shoulderH: SHOULDER_H + WORKSHOP.tallRise });

export const TALL: ArmDef = {
  kind: 'arm',
  id: 'tall',
  label: 'Tall base',
  links: TALL_LINKS,
  payload: WORKSHOP.payload.tall,
  workspace: WORKSHOP.tallWorkspace,
  blurb: 'reaches high shelves, not the table',
};
