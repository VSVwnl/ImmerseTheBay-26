// Workshop part (tool): a wide two-finger gripper: big things only.
import { TOOL_LEN, WORKSHOP } from '../../config';
import type { ToolDef } from '../types';
import { fingerRig } from '../toolkit';

export const WIDE: ToolDef = {
  kind: 'tool',
  id: 'wide',
  label: 'Wide gripper',
  blurb: 'big things only',
  rule: (it) => {
    if (it.shape === 'flat' || it.shape === 'ring') return `Can't grip a flat ${it.name}`;
    if (it.shape === 'loose') return 'Loose bits slip through the fingers';
    if (it.size !== 'big') return 'Too small for the wide gripper';
    if (it.spills) return 'Squeezing it would spill the sand';
    return null;
  },
  build: (tool, m) => {
    const W = WORKSHOP.wideGap;
    const rig = fingerRig(tool, m, W.open + 0.05, W.open, W.closed, 0.1);
    for (const f of rig.fingers) f.position.z = TOOL_LEN - 0.03; // longer fingers reach down the crate's sides
    return rig;
  },
};
