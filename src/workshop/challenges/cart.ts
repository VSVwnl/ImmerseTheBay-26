// Workshop challenge: a light parcel on a side cart past the table's edge -> outbox on the table. Only the
// Extra-long arm reaches the cart, and it can lift only light things; the parcel weighs 0.5.
import * as THREE from 'three';
import { BIN, TABLE, WORKSHOP as W } from '../../config';
import type { ChallengeDef, ItemSpec } from '../types';
import { between } from '../util';
import { ORANGE } from '../goals';

function makeParcel(): THREE.Group {
  const g = new THREE.Group();
  const s = W.parcel.size;
  const card = new THREE.MeshStandardMaterial({ color: 0xc9a46b, roughness: 0.9 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), card));
  const tape = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.6 });
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(s * 1.01, 0.002, s * 0.25), tape);
  t1.position.y = s / 2;
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.002, s * 0.6, s * 0.25), tape);
  t2.position.set(s / 2, s * 0.2, 0);
  g.add(t1, t2);
  return g;
}

/** A small wheeled cart, its top level with the table top. */
function makeCart(): THREE.Group {
  const g = new THREE.Group();
  const c = W.cart;
  const top = new THREE.MeshStandardMaterial({ color: 0x8b8f96, roughness: 0.7, metalness: 0.1 });
  const leg = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(c.w, 0.03, c.d), top);
  slab.position.y = -0.015;
  g.add(slab);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.02, TABLE.top - 0.08, 0.02), leg);
      l.position.set((sx * (c.w - 0.03)) / 2, -(TABLE.top - 0.08) / 2 - 0.03, (sz * (c.d - 0.03)) / 2);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.015, 16), leg);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set((sx * (c.w - 0.03)) / 2, -TABLE.top + 0.025, (sz * (c.d - 0.03)) / 2);
      g.add(l, wheel);
    }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, c.d), new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.45 }));
  rail.position.set(c.w / 2, 0.01, 0);
  g.add(rail);
  g.position.set(c.pos[0], TABLE.top, c.pos[2]);
  return g;
}

export const PARCEL_ITEM: ItemSpec = {
  id: 'parcel', name: 'parcel', material: 'paper', shape: 'box', size: 'normal', weight: 0.5, smoothTop: true,
  restY: TABLE.top + W.parcel.size / 2, radius: W.parcel.size / 2, mesh: makeParcel,
};

export const CART: ChallengeDef = {
  layout: 'cart',
  name: 'Cart',
  hint: 'Bring the parcel from the side cart to the outbox',
  items: [PARCEL_ITEM],
  steps: [
    {
      item: 'parcel',
      goal: { kind: 'bin', pos: W.outbox.pos, w: BIN.w, d: BIN.d, h: BIN.h, color: 0x6f7a86 },
      spawn: (r) => [between(r, W.parcel.spawnX), PARCEL_ITEM.restY, between(r, W.parcel.spawnZ)],
    },
  ],
  solutions: [{ arm: 'xlong', tool: 'gripper' }, { arm: 'xlong', tool: 'suction' }, { arm: 'xlong', tool: 'soft' }],
  scenery: () => [makeCart()],
};
