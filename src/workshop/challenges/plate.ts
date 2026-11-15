// Workshop challenge: a flat plate near the robot -> rack. Suction with any arm that reaches the table.
import * as THREE from 'three';
import { TABLE, WORKSHOP as W } from '../../config';
import type { ChallengeDef, ItemSpec } from '../types';
import { between } from '../util';

function makePlate(): THREE.Group {
  const g = new THREE.Group();
  const { radius: r, thick: t } = W.plate;
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.35 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, t, 40), white));
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(r * 0.93, t * 0.28, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0x2a6fd6, roughness: 0.4 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = t / 2;
  g.add(rim);
  return g;
}

export const PLATE_ITEM: ItemSpec = {
  id: 'plate', name: 'plate', material: 'ceramic', shape: 'flat', size: 'normal', weight: 1,
  restY: TABLE.top + W.plate.thick / 2, radius: W.plate.radius, holdDrop: W.plate.thick / 2, mesh: makePlate,
};

export const PLATE: ChallengeDef = {
  layout: 'plate',
  name: 'Plate',
  hint: 'Put the plate on the rack',
  items: [PLATE_ITEM],
  steps: [{ item: 'plate', goal: { kind: 'rack', pos: W.rack.pos, w: W.rack.w, d: W.rack.d, h: W.rack.h, color: 0xb8bcc2 }, spawn: (r) => [between(r, W.plate.spawnX), PLATE_ITEM.restY, between(r, W.plate.spawnZ)] }],
  solutions: [{ arm: 'compact', tool: 'suction' }, { arm: 'long', tool: 'suction' }, { arm: 'heavyduty', tool: 'suction' }],
};
