// Workshop challenge: an iron anvil (weight 3) -> red zone. Only the Heavy-duty arm lifts it.
import * as THREE from 'three';
import { TABLE, WORKSHOP as W } from '../../config';
import type { ChallengeDef, ItemSpec } from '../types';
import { between } from '../util';
import { ORANGE } from '../goals';
function makeAnvil(): THREE.Group {
  const g = new THREE.Group();
  const { w, h, d } = W.anvil;
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.3, d), iron);
  base.position.y = -h / 2 + h * 0.15;
  const waist = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, h * 0.35, d * 0.7), iron);
  waist.position.y = -h / 2 + h * 0.475;
  const face = new THREE.Mesh(new THREE.BoxGeometry(w * 0.75, h * 0.35, d), iron);
  face.position.set(-w * 0.05, h / 2 - h * 0.175, 0);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(d * 0.42, w * 0.35, 16), iron);
  horn.rotation.z = -Math.PI / 2;
  horn.position.set(w * 0.48, h / 2 - h * 0.175, 0);
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.002), new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.5 }));
  tag.position.set(0, -h / 2 + h * 0.15, d / 2 + 0.001);
  g.add(base, waist, face, horn, tag);
  return g;
}

export const ANVIL_ITEM: ItemSpec = {
  id: 'anvil', name: 'anvil', material: 'metal', shape: 'box', size: 'normal', weight: 3,
  restY: TABLE.top + W.anvil.h / 2, radius: W.anvil.w / 2, suctionText: "Suction can't seal on rough iron", mesh: makeAnvil,
};

export const ANVIL: ChallengeDef = {
  layout: 'anvil',
  name: 'Anvil',
  hint: 'Move the anvil onto the red zone',
  items: [ANVIL_ITEM],
  steps: [{ item: 'anvil', goal: { kind: 'zone', pos: W.dropZone.pos, w: W.dropZone.size, d: W.dropZone.size, h: 0, color: 0xff7b6b }, spawn: (r) => [between(r, W.anvil.spawnX), ANVIL_ITEM.restY, between(r, W.anvil.spawnZ)] }],
  solutions: [{ arm: 'heavyduty', tool: 'gripper' }, { arm: 'heavyduty', tool: 'magnet' }],
};
