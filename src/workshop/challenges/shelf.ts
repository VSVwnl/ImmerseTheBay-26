// Workshop challenge: a glass jar on a high shelf -> tall basket. Only the Tall base reaches the shelf, and the
// jar is glass with a round side, so only the gripper holds it.
import * as THREE from 'three';
import { TABLE, WORKSHOP as W } from '../../config';
import type { ChallengeDef, ItemSpec } from '../types';
import { between } from '../util';
import { ORANGE } from '../goals';

function makeJar(): THREE.Group {
  const g = new THREE.Group();
  const { r, h } = W.jar;
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6f2, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.55 });
  const honey = new THREE.MeshStandardMaterial({ color: 0xf2a72e, roughness: 0.3 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), glass));
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.88, h * 0.7, 20), honey);
  fill.position.y = -h * 0.12;
  g.add(fill);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.014, 24), new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.45 }));
  lid.position.y = h / 2 + 0.007;
  g.add(lid);
  return g;
}

/** A plank on two posts standing on the table, its top at W.shelf.top. */
function makeShelf(): THREE.Group {
  const g = new THREE.Group();
  const s = W.shelf;
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x8b8f96, roughness: 0.7, metalness: 0.1 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6 });
  const rise = s.top - TABLE.top;
  const plank = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.02, s.d), plankMat);
  plank.position.y = rise - 0.01;
  g.add(plank);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.02, rise - 0.02, 0.02), postMat);
    p.position.set((sx * (s.w - 0.02)) / 2, (rise - 0.02) / 2, -s.d / 2 + 0.01);
    g.add(p);
  }
  const lip = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.012, 0.006), new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.45 }));
  lip.position.set(0, rise + 0.006, s.d / 2);
  g.add(lip);
  g.position.set(s.pos[0], TABLE.top, s.pos[2]);
  return g;
}

export const JAR_ITEM: ItemSpec = {
  id: 'jar', name: 'jar', material: 'glass', shape: 'cylinder', size: 'normal', weight: 1,
  restY: TABLE.top + W.jar.h / 2, radius: W.jar.r, mesh: makeJar,
};

export const SHELF: ChallengeDef = {
  layout: 'shelf',
  name: 'Shelf',
  hint: 'Take the jar off the high shelf, drop it in the basket',
  items: [JAR_ITEM],
  steps: [
    {
      item: 'jar',
      goal: { kind: 'basket', pos: W.basket.pos, w: W.basket.w, d: W.basket.d, h: W.basket.h, color: 0xc89b5a },
      // the jar starts standing on the high shelf, not the table
      spawn: (r) => [between(r, W.jar.spawnX), W.shelf.top + W.jar.h / 2, between(r, W.jar.spawnZ)],
    },
  ],
  solutions: [{ arm: 'tall', tool: 'gripper' }],
  scenery: () => [makeShelf()],
};
