// Workshop challenge: a big plastic pail of sand (weight 2) with a carrying handle -> sandy zone. Too big for the
// gripper, squeezing it with the wide gripper would spill the sand, it's plastic (no magnet), no flat top (no
// suction): only the hook, on an arm strong enough for weight 2 (Compact or Heavy-duty).
import * as THREE from 'three';
import { TABLE, WORKSHOP as W } from '../../config';
import type { ChallengeDef, ItemSpec } from '../types';
import { between } from '../util';

function makeBucket(): THREE.Group {
  const g = new THREE.Group();
  const { r, h } = W.bucket;
  const pail = new THREE.MeshStandardMaterial({ color: 0x2a6fd6, roughness: 0.5, side: THREE.DoubleSide });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, h, 28, 1, true), pail);
  g.add(wall);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(r * 0.85, 28), pail);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -h / 2;
  g.add(bottom);
  const sand = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, 28), new THREE.MeshStandardMaterial({ color: 0xd9b36c, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = h * 0.35;
  g.add(sand);
  // the carrying handle arcs over the top (what the hook catches)
  const handle = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, 0.004, 6, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.8 }));
  handle.position.y = h / 2;
  g.add(handle);
  return g;
}

export const BUCKET_ITEM: ItemSpec = {
  id: 'bucket', name: 'bucket', material: 'plastic', shape: 'pot', size: 'big', weight: 2, handle: true, spills: true,
  restY: TABLE.top + W.bucket.h / 2, radius: W.bucket.r, holdDrop: 0.03, mesh: makeBucket,
};

export const BUCKET: ChallengeDef = {
  layout: 'bucket',
  name: 'Bucket',
  hint: 'Carry the bucket of sand to the sandy zone',
  items: [BUCKET_ITEM],
  steps: [
    {
      item: 'bucket',
      goal: { kind: 'zone', pos: W.sandZone.pos, w: W.sandZone.size, d: W.sandZone.size, h: 0, color: 0xd9b36c },
      spawn: (r) => [between(r, W.bucket.spawnX), BUCKET_ITEM.restY, between(r, W.bucket.spawnZ)],
    },
  ],
  solutions: [{ arm: 'compact', tool: 'hook' }, { arm: 'heavyduty', tool: 'hook' }],
};
