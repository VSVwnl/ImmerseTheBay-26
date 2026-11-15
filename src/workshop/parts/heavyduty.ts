// Workshop part (arm): links 20% shorter and thicker: payload 3, reaches only the middle of the table.
import { L1, L2, WORKSHOP } from '../../config';
import type { ArmDef, Links } from '../types';

export const HEAVY_LINKS: Links = Object.freeze({ l1: L1 * WORKSHOP.heavyScale, l2: L2 * WORKSHOP.heavyScale });

export const HEAVYDUTY: ArmDef = {
  kind: 'arm', id: 'heavyduty', label: 'Heavy-duty', links: HEAVY_LINKS, payload: WORKSHOP.payload.heavyduty,
  workspace: WORKSHOP.heavyWorkspace, blurb: 'very strong, middle of the table only', girth: 1.45,
};
