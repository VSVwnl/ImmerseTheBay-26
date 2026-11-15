// Workshop part (arm): the original arm: strong, short reach.
import { L1, L2, WORKSHOP, WORKSPACE } from '../../config';
import type { ArmDef, Links } from '../types';

export const COMPACT_LINKS: Links = Object.freeze({ l1: L1, l2: L2 });

export const COMPACT: ArmDef = { kind: 'arm', id: 'compact', label: 'Compact', links: COMPACT_LINKS, payload: WORKSHOP.payload.compact, workspace: WORKSPACE, blurb: 'strong, short reach' };
