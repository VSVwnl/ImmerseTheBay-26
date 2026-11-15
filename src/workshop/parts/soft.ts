// Workshop part (tool): a gripper with chunky foam fingers. Gentle enough for fragile things, but the foam lets
// anything heavier than weight 1 slip, and like any gripper it can't hold flat, loose or big things.
import * as THREE from 'three';
import { WORKSHOP } from '../../config';
import type { ToolDef } from '../types';
import { fingerRig } from '../toolkit';

export const SOFT: ToolDef = {
  kind: 'tool',
  id: 'soft',
  label: 'Soft gripper',
  blurb: 'gentle: fragile things, nothing heavy',
  rule: (it) => {
    if (it.shape === 'flat' || it.shape === 'ring') return `Can't grip a flat ${it.name}`;
    if (it.shape === 'loose') return 'Loose bits slip through the fingers';
    if (it.size === 'big') return 'Too big for the soft fingers';
    if (it.weight > WORKSHOP.softMaxWeight) return 'Too heavy for the soft fingers';
    return null;
  },
  build: (tool, m) => {
    const G = WORKSHOP.softGap;
    const rig = fingerRig(tool, m, 0.12, G.open, G.closed);
    const foam = new THREE.MeshStandardMaterial({ color: 0x5fb8e8, roughness: 0.95, metalness: 0 });
    for (const f of rig.fingers) {
      f.material = foam;
      f.scale.set(1.9, 1.3, 1);
    }
    return rig;
  },
};
