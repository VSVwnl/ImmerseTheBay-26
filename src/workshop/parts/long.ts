// Workshop part (arm): links 35% longer: reaches the table edges, but payload 1.
import { L1, L2, WORKSHOP } from '../../config';
import type { ArmDef, Links } from '../types';

export const LONG_LINKS: Links = Object.freeze({ l1: L1 * WORKSHOP.longScale, l2: L2 * WORKSHOP.longScale });

export const LONG: ArmDef = { kind: 'arm', id: 'long', label: 'Long', links: LONG_LINKS, payload: WORKSHOP.payload.long, workspace: WORKSHOP.longWorkspace, blurb: 'reaches far, weak' };
