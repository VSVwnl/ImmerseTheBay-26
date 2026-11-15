// Workshop challenge: a big slatted wooden crate (weight 2) -> wooden pallet. Needs the wide gripper and a strong arm.
import * as THREE from 'three';
import { TABLE, WORKSHOP as W } from '../../config';
import type { ChallengeDef, ItemSpec } from '../types';
import { between } from '../util';

function makeCrate(): THREE.Group {
  const g = new THREE.Group();
  const s = W.crate.size;
  const wood = new THREE.MeshStandardMaterial({ color: 0xb07a42, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x7a5129, roughness: 0.9 });
  const core = new THREE.Mesh(new THREE.BoxGeometry(s * 0.94, s * 0.94, s * 0.94), dark);
  g.add(core);
  // slats on four sides and the top (the gaps are why suction fails)
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * s * 0.33;
    for (const [w, h, d, x, y, z] of [
      [s, s * 0.22, 0.008, 0, off, s / 2],
      [s, s * 0.22, 0.008, 0, off, -s / 2],
      [0.008, s * 0.22, s, s / 2, off, 0],
      [0.008, s * 0.22, s, -s / 2, off, 0],
      [s, 0.008, s * 0.22, 0, s / 2, off],
    ] as [number, number, number, number, number, number][]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
      slat.position.set(x, y, z);
      g.add(slat);
    }
  }
  return g;
}

export const CRATE_ITEM: ItemSpec = {
  id: 'crate', name: 'crate', material: 'wood', shape: 'box', size: 'big', weight: 2,
  restY: TABLE.top + W.crate.size / 2, radius: W.crate.size / 2, suctionText: 'Air leaks through the slats', mesh: makeCrate,
};

export const CRATE: ChallengeDef = {
  layout: 'crate',
  name: 'Crate',
  hint: 'Put the big crate on the pallet',
  items: [CRATE_ITEM],
  steps: [{ item: 'crate', goal: { kind: 'pallet', pos: W.pallet.pos, w: W.pallet.w, d: W.pallet.d, h: W.pallet.h, color: 0x9a6b3c }, spawn: (r) => [between(r, W.crate.spawnX), CRATE_ITEM.restY, between(r, W.crate.spawnZ)] }],
  solutions: [{ arm: 'compact', tool: 'wide' }, { arm: 'heavyduty', tool: 'wide' }],
};
