// Workshop challenge: a can at the right edge of the table, outside Compact reach -> green bin.
import * as THREE from 'three';
import { BIN, TABLE, WORKSHOP as W } from '../../config';
import type { ChallengeDef, ItemSpec } from '../types';
import { between } from '../util';

function makeCan(): THREE.Group {
  const g = new THREE.Group();
  const { radius: r, height: h } = W.can;
  const alu = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.3, metalness: 0.8 });
  const label = new THREE.MeshStandardMaterial({ color: 0xd6332b, roughness: 0.5, metalness: 0.1 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), alu));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.55, 32), label));
  return g;
}

export const CAN_ITEM: ItemSpec = {
  id: 'can', name: 'can', material: 'metal', shape: 'cylinder', size: 'normal', weight: 1,
  restY: TABLE.top + W.can.height / 2, radius: W.can.radius, mesh: makeCan,
};

export const FAR: ChallengeDef = {
  layout: 'far',
  name: 'Far',
  hint: 'Put the can in the green bin',
  items: [CAN_ITEM],
  steps: [{ item: 'can', goal: { kind: 'bin', pos: W.canBin.pos, w: BIN.w, d: BIN.d, h: BIN.h, color: 0x2f9e5b }, spawn: (r) => [W.can.x, CAN_ITEM.restY, between(r, W.can.spawnZ)] }],
  solutions: [{ arm: 'long', tool: 'gripper' }, { arm: 'long', tool: 'magnet' }],
};
