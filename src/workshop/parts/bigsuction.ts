// Workshop part (tool): two wide suction pads on a crossbar. It holds big flat smooth things (a glass pane) that the
// normal pad is too small for, but its pads are too big to seal on anything small, and like any suction it needs a
// flat smooth surface.
import * as THREE from 'three';
import { TOOL_LEN } from '../../config';
import type { ToolDef } from '../types';
import { noFingers, stem } from '../toolkit';
import { SUCTION } from './suction';

export const BIGSUCTION: ToolDef = {
  kind: 'tool',
  id: 'bigsuction',
  label: 'Big suction',
  blurb: 'big flat things only',
  rule: (it) => {
    if (it.size !== 'big') return 'Pad too big for something this small';
    // otherwise the same surface rules as the normal pad (the size check there doesn't apply to this one)
    return SUCTION.rule({ ...it, size: 'normal' });
  },
  build: (tool, m) => {
    stem(tool, m);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.012), m.dark);
    bar.position.z = TOOL_LEN - 0.02;
    tool.add(bar);
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.9, metalness: 0 });
    const pads = new THREE.Group();
    for (const sx of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.012, 28), rubber);
      pad.rotation.x = Math.PI / 2;
      pad.position.set(sx * 0.065, 0, TOOL_LEN - 0.006);
      pads.add(pad);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.003, 6, 24), m.orange);
      ring.position.set(sx * 0.065, 0, TOOL_LEN - 0.014);
      tool.add(ring);
    }
    tool.add(pads);
    return noFingers(pads);
  },
};
