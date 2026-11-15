// Workshop challenge: a fragile egg -> egg carton. The hard gripper would crack it, suction can't seal on a
// curve, the magnet and scoop can't lift it and it's too small for the wide gripper: only the soft gripper works.
import * as THREE from 'three';
import { TABLE, WORKSHOP as W } from '../../config';
import type { ChallengeDef, ItemSpec } from '../types';
import { between } from '../util';

function makeEgg(): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0xf3e6cf, roughness: 0.55 });
  const egg = new THREE.Mesh(new THREE.SphereGeometry(W.egg.r, 20, 14), shell);
  egg.scale.y = W.egg.stretch;
  g.add(egg);
  return g;
}

export const EGG_ITEM: ItemSpec = {
  id: 'egg', name: 'egg', material: 'ceramic', shape: 'round', size: 'small', weight: W.egg.weight, fragile: true,
  restY: TABLE.top + W.egg.r * W.egg.stretch, radius: W.egg.r, mesh: makeEgg,
};

export const EGG: ChallengeDef = {
  layout: 'egg',
  name: 'Egg',
  hint: "Put the egg in the carton (don't crack it)",
  items: [EGG_ITEM],
  steps: [
    {
      item: 'egg',
      goal: { kind: 'carton', pos: W.carton.pos, w: W.carton.w, d: W.carton.d, h: W.carton.h, color: 0xb9a88a },
      spawn: (r) => [between(r, W.egg.spawnX), EGG_ITEM.restY, between(r, W.egg.spawnZ)],
    },
  ],
  solutions: [
    { arm: 'compact', tool: 'soft' },
    { arm: 'long', tool: 'soft' },
    { arm: 'heavyduty', tool: 'soft' },
    { arm: 'xlong', tool: 'soft' },
  ],
};
