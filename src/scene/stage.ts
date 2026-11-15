// Table, floor, lights, curved wall, bins, cubes and reach targets.
import * as THREE from 'three';
import { BIN, BIN_POS, CUBE_SIZE, FLOOR_RADIUS, REACH_RADIUS, TABLE, WALL } from '../config';
import type { EnvState } from '../env/env';
import type { CubeColor } from '../arm/grasp';

/** The dataset camera renders only this layer. Scene content (stage, arm, cubes, wall) is put on it;
 *  panels, hands and the target marker are not. Layers 1 and 2 are avoided because three's WebXR
 *  stereo cameras use them for per-eye content. */
export const DATASET_LAYER = 6;

export function markDataset(obj: THREE.Object3D): void {
  obj.traverse((o) => o.layers.enable(DATASET_LAYER));
}

export const COLOR = {
  red: 0xd6332b,
  blue: 0x2a6fd6,
};

export interface Stage {
  root: THREE.Group;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  wall: THREE.Mesh;
  wallTexture: THREE.VideoTexture;
  cubes: Record<CubeColor, THREE.Mesh>;
  bins: Record<CubeColor, THREE.Group>;
  reachTargets: THREE.Mesh[];
  setVideo(video: HTMLVideoElement): void;
  update(s: EnvState, cubes: Partial<Record<CubeColor, [number, number, number]>>): void;
}

function makeWallGeometry(): THREE.BufferGeometry {
  const arc = (WALL.arcDeg * Math.PI) / 180;
  // three's cylinder: x = r sin(theta), z = r cos(theta). Center the arc on -Z (theta = PI).
  const g = new THREE.CylinderGeometry(WALL.radius, WALL.radius, WALL.height, 96, 1, true, Math.PI - arc / 2, arc);
  // Seen from inside, u would run right-to-left. Flip u so the video is not mirrored.
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  uv.needsUpdate = true;
  g.translate(0, WALL.height / 2, 0);
  return g;
}

export function makeBin(color: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(BIN.w, 0.004, BIN.d), mat);
  floor.position.y = 0.002;
  g.add(floor);
  const t = BIN.wall;
  const walls: [number, number, number, number][] = [
    [BIN.w, t, 0, BIN.d / 2 - t / 2],
    [BIN.w, t, 0, -BIN.d / 2 + t / 2],
    [t, BIN.d, BIN.w / 2 - t / 2, 0],
    [t, BIN.d, -BIN.w / 2 + t / 2, 0],
  ];
  for (const [w, d, x, z] of walls) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, BIN.h, d), mat);
    m.position.set(x, BIN.h / 2, z);
    g.add(m);
  }
  return g;
}

export function createStage(): Stage {
  const root = new THREE.Group();

  const hemi = new THREE.HemisphereLight(0xdde6ff, 0x302a26, 1.4);
  hemi.name = 'hemi';
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.name = 'sun';
  sun.position.set(1.5, 3, 1.0);
  root.add(sun);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(FLOOR_RADIUS, 64),
    new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);

  // table: top slab + legs
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x8b8f96, roughness: 0.7, metalness: 0.1 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.depth), tableMat);
  top.position.set(TABLE.cx, TABLE.top - TABLE.thickness / 2, TABLE.cz);
  root.add(top);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, TABLE.top - TABLE.thickness, 0.05), legMat);
      leg.position.set(TABLE.cx + sx * (TABLE.width / 2 - 0.05), (TABLE.top - TABLE.thickness) / 2, TABLE.cz + sz * (TABLE.depth / 2 - 0.05));
      root.add(leg);
    }

  const placeholder = document.createElement('video');
  const wallTexture = new THREE.VideoTexture(placeholder);
  wallTexture.colorSpace = THREE.SRGBColorSpace;
  const wallMat = new THREE.MeshBasicMaterial({ map: wallTexture, side: THREE.BackSide, toneMapped: false });
  const wall = new THREE.Mesh(makeWallGeometry(), wallMat);
  wall.name = 'wall';
  root.add(wall);

  const bins = {
    red: makeBin(COLOR.red),
    blue: makeBin(COLOR.blue),
  };
  for (const c of ['red', 'blue'] as const) {
    bins[c].position.set(...BIN_POS[c]);
    root.add(bins[c]);
  }

  const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const cubes = {
    red: new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({ color: COLOR.red, roughness: 0.45 })),
    blue: new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({ color: COLOR.blue, roughness: 0.45 })),
  };
  root.add(cubes.red, cubes.blue);

  const reachTargets: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(REACH_RADIUS, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0x000000, transparent: true, opacity: 0.85 }),
    );
    reachTargets.push(m);
    root.add(m);
  }

  markDataset(root);
  return {
    root,
    hemi,
    sun,
    wall,
    wallTexture,
    cubes,
    bins,
    reachTargets,
    setVideo(video) {
      const old = wallMat.map;
      const tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      wallMat.map = tex;
      wallMat.needsUpdate = true;
      this.wallTexture = tex;
      old?.dispose();
    },
    update(s, cubePos) {
      for (const c of ['red', 'blue'] as const) {
        const p = cubePos[c];
        cubes[c].visible = !!p;
        if (p) cubes[c].position.set(p[0], p[1], p[2]);
      }
      bins.blue.visible = s.layout === 'sort';
      bins.red.visible = s.layout === 'place' || s.layout === 'sort'; // not in reach or the Workshop layouts
      reachTargets.forEach((m, i) => {
        const t = s.reachTargets[i];
        m.visible = s.layout === 'reach' && !!t;
        if (!t) return;
        m.position.set(t[0], t[1], t[2]);
        const mat = m.material as THREE.MeshStandardMaterial;
        if (i < s.reachIndex) {
          mat.color.setHex(0x37c871);
          mat.emissive.setHex(0x0b3a1c);
        } else if (i === s.reachIndex) {
          mat.color.setHex(0xffd34d);
          mat.emissive.setHex(0x8a6a00);
        } else {
          mat.color.setHex(0x666666);
          mat.emissive.setHex(0x000000);
        }
      });
    },
  };
}
