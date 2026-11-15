// Workshop part (tool): a steel J-hook. It lifts anything that has a carrying handle, however big, as long as the
// arm is strong enough; with no handle there is nothing to hook onto.
import * as THREE from 'three';
import { TOOL_LEN } from '../../config';
import type { ToolDef } from '../types';
import { noFingers, stem } from '../toolkit';

export const HOOK: ToolDef = {
  kind: 'tool',
  id: 'hook',
  label: 'Hook',
  blurb: 'anything with a handle, nothing else',
  rule: (it) => (it.handle ? null : 'Nothing to hook onto: no handle'),
  build: (tool, m) => {
    stem(tool, m, 0.008);
    // the J: a half ring at the tip, opening sideways, with a short orange tip
    const j = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 8, 20, Math.PI), m.steel);
    j.rotation.y = Math.PI / 2;
    j.position.z = TOOL_LEN - 0.018;
    tool.add(j);
    const tipCap = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), m.orange);
    tipCap.position.set(0, 0.018, TOOL_LEN - 0.018);
    tool.add(tipCap);
    return noFingers();
  },
};
