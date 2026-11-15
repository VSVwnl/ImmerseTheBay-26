// Workshop part (tool): the original two-finger gripper: anything with sides that isn't too big.
import { FINGER_GAP_CLOSED, FINGER_GAP_OPEN } from '../../config';
import type { ToolDef } from '../types';
import { fingerRig } from '../toolkit';

export const GRIPPER: ToolDef = {
  kind: 'tool',
  id: 'gripper',
  label: 'Gripper',
  blurb: 'grips things with sides',
  rule: (it) => {
    if (it.shape === 'flat' || it.shape === 'ring') return `Can't grip a flat ${it.name}`;
    if (it.shape === 'loose') return 'Loose bits slip through the fingers';
    if (it.size === 'big') return 'Too big for this gripper';
    return null;
  },
  build: (tool, m) => fingerRig(tool, m, 0.11, FINGER_GAP_OPEN, FINGER_GAP_CLOSED),
};
