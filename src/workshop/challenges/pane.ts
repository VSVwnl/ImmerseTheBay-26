// Workshop challenge: a big glass pane lying flat (weight 1) -> wide drying rack. Flat (no gripper), glass (no
// magnet), and too big for the normal suction pad: only the big suction, on an arm that lifts weight 1.
import * as THREE from 'three';
import { TABLE, WORKSHOP as W } from '../../config';
import type { ChallengeDef, ItemSpec } from '../types';
import { between } from '../util';
import { ORANGE } from '../goals';

function makePane(): THREE.Group {
  const g = new THREE.Group();
  const { w, d, thick } = W.pane;
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6f2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.45 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w, thick, d), glass));
  // orange tape on the edges so the pane is easy to see
  const tape = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.6 });
  for (const sz of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(w, thick * 1.4, 0.008), tape);
    e.position.z = (sz * (d - 0.008)) / 2;
    g.add(e);
  }
  return g;
}

export const PANE_ITEM: ItemSpec = {
  id: 'pane', name: 'pane', material: 'glass', shape: 'flat', size: 'big', weight: 1, smoothTop: true,
  restY: TABLE.top + W.pane.thick / 2, radius: W.pane.d / 2, holdDrop: W.pane.thick / 2, mesh: makePane,
};

export const PANE: ChallengeDef = {
  layout: 'pane',
  name: 'Pane',
  hint: 'Lay the glass pane on the wide rack',
  items: [PANE_ITEM],
  steps: [
    {
      item: 'pane',
      goal: { kind: 'rack', pos: W.paneRack.pos, w: W.paneRack.w, d: W.paneRack.d, h: W.paneRack.h, color: 0xb8bcc2 },
      spawn: (r) => [between(r, W.pane.spawnX), PANE_ITEM.restY, between(r, W.pane.spawnZ)],
    },
  ],
  solutions: [
    { arm: 'compact', tool: 'bigsuction' },
    { arm: 'long', tool: 'bigsuction' },
    { arm: 'heavyduty', tool: 'bigsuction' },
  ],
};
