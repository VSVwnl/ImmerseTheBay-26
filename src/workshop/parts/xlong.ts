// Workshop part (arm): links 70% longer than the standard arm and drawn thinner. It reaches past the table's
// side edges, but its payload is only 0.5, so it can lift nothing heavier than a light parcel.
import { L1, L2, WORKSHOP } from '../../config';
import type { ArmDef, Links } from '../types';

export const XLONG_LINKS: Links = Object.freeze({ l1: L1 * WORKSHOP.xlongScale, l2: L2 * WORKSHOP.xlongScale });

export const XLONG: ArmDef = {
  kind: 'arm',
  id: 'xlong',
  label: 'Extra-long',
  links: XLONG_LINKS,
  payload: WORKSHOP.payload.xlong,
  workspace: WORKSHOP.xlongWorkspace,
  blurb: 'reaches past the table, very weak',
  girth: 0.75,
};
