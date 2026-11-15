// Workshop part (tool): a rubber pad: flat smooth things only.
import * as THREE from 'three';
import { TOOL_LEN } from '../../config';
import type { ToolDef } from '../types';
import { noFingers, stem } from '../toolkit';
import { an } from '../util';

export const SUCTION: ToolDef = {
  kind: 'tool',
  id: 'suction',
  label: 'Suction',
  blurb: 'lifts flat smooth things',
  rule: (it) => {
    if (it.shape === 'flat' || it.smoothTop) return null;
    if (it.suctionText) return it.suctionText;
    if (it.shape === 'ring') return 'Air leaks through the hole';
    if (it.shape === 'loose') return "Suction can't hold loose bits";
    if (it.shape === 'cylinder' || it.shape === 'round') return `Suction can't seal on ${an(it.name)}`;
    return `Suction can't hold ${an(it.name)}`;
  },
  build: (tool, m) => {
    // stem down to a flat round rubber pad whose face is at the tip point
    stem(tool, m);
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.9, metalness: 0 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.014, 32), rubber);
    pad.rotation.x = Math.PI / 2;
    pad.position.z = TOOL_LEN - 0.007;
    tool.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.004, 8, 32), m.orange);
    ring.position.z = TOOL_LEN - 0.016;
    tool.add(ring);
    return noFingers(pad);
  },
};
