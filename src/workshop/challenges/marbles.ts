// Workshop challenge: a handful of loose glass marbles -> blue bowl. Only the scoop holds them.
import * as THREE from 'three';
import { TABLE, WORKSHOP as W } from '../../config';
import type { ChallengeDef, ItemSpec } from '../types';
import { between } from '../util';

function makeMarbles(): THREE.Group {
  const g = new THREE.Group();
  const { r, spread } = W.marbles;
  const colors = [0x3fb6e8, 0xe84f8b, 0x6fd36b, 0xf2c94c, 0x9b7bf2, 0xf28a1e, 0x4fd1c5];
  const geo = new THREE.SphereGeometry(r, 12, 8);
  colors.forEach((c, i) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, metalness: 0.1 }));
    const a = (i / colors.length) * Math.PI * 2;
    const rr = i === 0 ? 0 : spread * (0.55 + 0.45 * ((i * 37) % 7) / 7);
    m.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    g.add(m);
  });
  return g;
}

export const MARBLES_ITEM: ItemSpec = {
  id: 'marbles', name: 'marbles', material: 'glass', shape: 'loose', size: 'small', weight: 1,
  restY: TABLE.top + W.marbles.r, radius: W.marbles.spread + W.marbles.r, holdDrop: -0.012, mesh: makeMarbles,
};

export const MARBLES: ChallengeDef = {
  layout: 'marbles',
  name: 'Marbles',
  hint: 'Pour the marbles into the blue bowl',
  items: [MARBLES_ITEM],
  steps: [{ item: 'marbles', goal: { kind: 'bowl', pos: W.bowl.pos, w: W.bowl.r * 1.6, d: W.bowl.r * 1.6, h: W.bowl.h, color: 0x2a6fd6 }, spawn: (r) => [between(r, W.marbles.spawnX), MARBLES_ITEM.restY, between(r, W.marbles.spawnZ)] }],
  solutions: [{ arm: 'compact', tool: 'scoop' }, { arm: 'long', tool: 'scoop' }, { arm: 'heavyduty', tool: 'scoop' }],
};
