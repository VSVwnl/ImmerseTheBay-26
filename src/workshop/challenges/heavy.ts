// Workshop challenge: a heavy pot (weight 2) near the robot -> glowing zone.
import * as THREE from 'three';
import { TABLE, WORKSHOP as W } from '../../config';
import type { ChallengeDef, ItemSpec } from '../types';
import { between } from '../util';
import { ORANGE } from '../goals';
function makePot(): THREE.Group {
  const g = new THREE.Group();
  const { radius: r, height: h } = W.pot;
  const iron = new THREE.MeshStandardMaterial({ color: 0x2d3036, roughness: 0.55, metalness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.45 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, h, 36), iron));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.008, 36), iron);
  lid.position.y = h / 2 + 0.004;
  g.add(lid);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), accent);
  knob.position.y = h / 2 + 0.014;
  g.add(knob);
  for (const sx of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 16, Math.PI), iron);
    handle.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    handle.position.set(sx * r, h * 0.25, 0);
    g.add(handle);
  }
  // orange weight plate on the front so "heavy" reads at a glance
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.003), accent);
  tag.position.set(0, 0, r * 0.97);
  g.add(tag);
  return g;
}

export const POT_ITEM: ItemSpec = {
  id: 'pot', name: 'pot', material: 'metal', shape: 'pot', size: 'normal', weight: 2,
  restY: TABLE.top + W.pot.height / 2, radius: W.pot.radius, mesh: makePot,
};

export const HEAVY: ChallengeDef = {
  layout: 'heavy',
  name: 'Heavy',
  hint: 'Put the pot on the glowing zone',
  items: [POT_ITEM],
  steps: [{ item: 'pot', goal: { kind: 'zone', pos: W.zone.pos, w: W.zone.size, d: W.zone.size, h: 0, color: 0xffd34d }, spawn: (r) => [between(r, W.pot.spawnX), POT_ITEM.restY, between(r, W.pot.spawnZ)] }],
  solutions: [{ arm: 'compact', tool: 'gripper' }, { arm: 'compact', tool: 'magnet' }, { arm: 'heavyduty', tool: 'gripper' }, { arm: 'heavyduty', tool: 'magnet' }],
};
