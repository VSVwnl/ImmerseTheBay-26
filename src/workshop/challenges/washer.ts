// Workshop challenge: a steel washer (flat, with a hole) -> blue parts tray. Only the magnet holds it.
import * as THREE from 'three';
import { BIN, TABLE, WORKSHOP as W } from '../../config';
import type { ChallengeDef, ItemSpec } from '../types';
import { between } from '../util';

function makeWasher(): THREE.Group {
  const g = new THREE.Group();
  const { radius: r, thick: t } = W.washer;
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.25, metalness: 0.9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.68, r * 0.32, 10, 32), steel);
  ring.rotation.x = Math.PI / 2;
  ring.scale.z = t / (r * 0.64); // flatten the tube to the washer thickness
  g.add(ring);
  return g;
}

export const WASHER_ITEM: ItemSpec = {
  id: 'washer', name: 'washer', material: 'metal', shape: 'ring', size: 'small', weight: 1,
  restY: TABLE.top + W.washer.thick / 2, radius: W.washer.radius, holdDrop: W.washer.thick / 2, mesh: makeWasher,
};

export const WASHER: ChallengeDef = {
  layout: 'washer',
  name: 'Washer',
  hint: 'Put the steel washer in the blue tray',
  items: [WASHER_ITEM],
  steps: [{ item: 'washer', goal: { kind: 'bin', pos: W.tray.pos, w: BIN.w, d: BIN.d, h: BIN.h, color: 0x4a6f96 }, spawn: (r) => [between(r, W.washer.spawnX), WASHER_ITEM.restY, between(r, W.washer.spawnZ)] }],
  solutions: [{ arm: 'compact', tool: 'magnet' }, { arm: 'long', tool: 'magnet' }, { arm: 'heavyduty', tool: 'magnet' }],
};
