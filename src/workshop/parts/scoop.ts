// Workshop part (tool): a shallow tray: loose bits only, nothing solid.
import * as THREE from 'three';
import { TOOL_LEN } from '../../config';
import type { ToolDef } from '../types';
import { noFingers, stem } from '../toolkit';
import { an } from '../util';

export const SCOOP: ToolDef = {
  kind: 'tool',
  id: 'scoop',
  label: 'Scoop',
  blurb: 'loose bits, nothing solid',
  rule: (it) => (it.shape === 'loose' ? null : `Can't scoop up ${an(it.name)}`),
  build: (tool, m) => {
    // stem to a shallow open tray at the tip: a flat bottom with low walls on three sides
    stem(tool, m);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.065, 0.004), m.steel);
    bottom.position.z = TOOL_LEN;
    tool.add(bottom);
    for (const [w, h, x, y] of [
      [0.075, 0.004, 0, 0.0305],
      [0.004, 0.065, 0.0355, 0],
      [0.004, 0.065, -0.0355, 0],
    ] as [number, number, number, number][]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), m.orange);
      wall.position.set(x, y, TOOL_LEN - 0.01);
      tool.add(wall);
    }
    return noFingers();
  },
};
