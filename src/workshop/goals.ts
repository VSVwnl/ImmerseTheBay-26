// Goal kinds shared by the Workshop challenges, and how each is drawn. Simple primitives only.
import * as THREE from 'three';
import { WORKSHOP } from '../config';
import { makeBin } from '../scene/stage';
import type { Goal, GoalKind } from './types';

export const ORANGE = 0xf28a1e;

function makeRack(g0: Goal): THREE.Group {
  const g = new THREE.Group();
  const { w, d, h } = g0;
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.8 });
  const accent = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.45 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, h, 8), steel);
      leg.position.set((sx * w) / 2, h / 2, (sz * d) / 2);
      g.add(leg);
    }
  for (let i = 0; i <= 6; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, 0.004), steel);
    bar.position.set(0, h, -d / 2 + (d * i) / 6);
    g.add(bar);
  }
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, d), accent);
    rail.position.set((sx * w) / 2, h, 0);
    g.add(rail);
  }
  return g;
}

function makeZone(g0: Goal): THREE.Object3D {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(g0.w, g0.d),
    new THREE.MeshStandardMaterial({ color: g0.color, emissive: new THREE.Color(g0.color).multiplyScalar(0.45), transparent: true, opacity: 0.55, roughness: 0.8 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.001;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function makeBowl(g0: Goal): THREE.Group {
  const g = new THREE.Group();
  const { r, h } = WORKSHOP.bowl;
  const mat = new THREE.MeshStandardMaterial({ color: g0.color, roughness: 0.4, side: THREE.DoubleSide });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.7, h, 32, 1, true), mat);
  wall.position.y = h / 2;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(r * 0.7, 32), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 8, 32), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.4 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = h;
  g.add(wall, floor, rim);
  return g;
}

function makePallet(g0: Goal): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: g0.color, roughness: 0.9 });
  const board = 0.006;
  for (const sx of [-1, 0, 1]) {
    const runner = new THREE.Mesh(new THREE.BoxGeometry(0.02, g0.h - board, g0.d), wood);
    runner.position.set((sx * (g0.w - 0.02)) / 2, (g0.h - board) / 2, 0);
    g.add(runner);
  }
  for (let i = 0; i < 5; i++) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(g0.w, board, g0.d / 5 - 0.008), wood);
    top.position.set(0, g0.h - board / 2, -g0.d / 2 + (g0.d / 5) * (i + 0.5));
    g.add(top);
  }
  return g;
}

/** Goal meshes by kind, drawn with their base on the table top at the goal's x/z. */
export const GOAL_MESHES: Record<GoalKind, (g: Goal) => THREE.Object3D> = {
  rack: makeRack,
  pallet: makePallet,
  bin: (g) => makeBin(g.color),
  zone: makeZone,
  bowl: makeBowl,
  basket: (g) => makeBin(g.color),
};
