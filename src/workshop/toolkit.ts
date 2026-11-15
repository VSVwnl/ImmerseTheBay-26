// Shared bits for tool meshes (Robot Workshop). Simple primitives only.
import * as THREE from 'three';
import { TOOL_LEN } from '../config';
import type { ToolMats, ToolRig } from './types';

/** A palm with two sliding fingers (the standard gripper shape). */
export function fingerRig(tool: THREE.Group, m: ToolMats, palmW: number, gapOpen: number, gapClosed: number, fingerLen = 0.065): ToolRig {
  const palm = new THREE.Mesh(new THREE.BoxGeometry(palmW, 0.035, 0.02), m.dark);
  palm.position.z = TOOL_LEN - 0.055;
  tool.add(palm);
  const fingers: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, fingerLen), m.steel);
    f.position.z = TOOL_LEN - 0.012;
    fingers.push(f);
    tool.add(f);
  }
  return { fingers, gapOpen, gapClosed, pad: null };
}

/** A thin steel stem from the wrist flange down toward the tip. */
export function stem(tool: THREE.Group, m: ToolMats, r = 0.012): void {
  const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r, TOOL_LEN - 0.07, 16), m.steel);
  s.rotation.x = Math.PI / 2;
  s.position.z = 0.06 + (TOOL_LEN - 0.07) / 2;
  tool.add(s);
}

export const noFingers = (pad: THREE.Object3D | null = null): ToolRig => ({ fingers: [], gapOpen: 0, gapClosed: 0, pad });
