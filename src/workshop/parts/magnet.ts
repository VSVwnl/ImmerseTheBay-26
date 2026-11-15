// Workshop part (tool): an electromagnet: any metal, nothing else.
import * as THREE from 'three';
import { TOOL_LEN } from '../../config';
import type { ToolDef } from '../types';
import { noFingers, stem } from '../toolkit';

export const MAGNET: ToolDef = {
  kind: 'tool',
  id: 'magnet',
  label: 'Magnet',
  blurb: 'any metal, nothing else',
  rule: (it) => (it.material === 'metal' ? null : 'Magnet only lifts metal'),
  build: (tool, m) => {
    // stem to a red electromagnet puck with a steel face at the tip point
    stem(tool, m);
    const red = new THREE.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.5, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 28), red);
    body.rotation.x = Math.PI / 2;
    body.position.z = TOOL_LEN - 0.022;
    tool.add(body);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.007, 28), m.steel);
    face.rotation.x = Math.PI / 2;
    face.position.z = TOOL_LEN - 0.0035;
    tool.add(face);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.003, 6, 28), m.orange);
    coil.position.z = TOOL_LEN - 0.03;
    tool.add(coil);
    return noFingers(face);
  },
};
