// Hardware dimensions are in metres. The recorder's origin is the centre of its pickup bar.
import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { type Vec3 } from '../config';
import { armBase, cameraAt, lampAt, type Rig, type Site, type Rail } from './mission';

const metal = (color: number, metalness = 0.35) =>
  new T.MeshStandardMaterial({ color, metalness, roughness: 0.54 });
const zinc = metal(0xa2b8b7, 0.55),
  graphite = metal(0x25373f),
  tangerine = metal(0xfe873b, 0.12);
const white = metal(0xd5dbce, 0.16),
  dark = metal(0x11242c, 0.2),
  brass = metal(0xd5af6d);
const safety = metal(0xf7b44b, 0.12);
const aqua = new T.MeshBasicMaterial({ color: 0x81e6d2 });
const luminous = new T.MeshBasicMaterial({ color: 0xfff0bc });
const v = (p: Vec3) => new T.Vector3(...p);
const O = [0, 0, 0] as Vec3;

function part(root: T.Group, geometry: T.BufferGeometry, material: T.Material, pos: Vec3): T.Mesh {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(...pos);
  root.add(mesh);
  return mesh;
}
function box(root: T.Group, s: Vec3, m: T.Material, p: Vec3) {
  return part(root, new T.BoxGeometry(...s), m, p);
}
function fairing(root: T.Group, s: Vec3, m: T.Material, p: Vec3) {
  return part(root, new RoundedBoxGeometry(s[0], s[1], s[2], 2, Math.min(...s) * 0.27), m, p);
}
function rod(root: T.Group, a: Vec3, b: Vec3, r: number, m: T.Material, segments = 12) {
  const d = v(b).sub(v(a));
  const mesh = part(root, new T.CylinderGeometry(r, r, d.length(), segments), m, O);
  mesh.position.copy(v(a).addScaledVector(d, 0.5));
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  return mesh;
}
function hose(root: T.Group, points: Vec3[], radius: number, material: T.Material) {
  return part(
    root,
    new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v)), 18, radius, 6, false),
    material,
    O,
  );
}
function plaque(root: T.Group, text: string, width: number, height: number, pos: Vec3, bg: string, fg: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg;
  g.font = '700 74px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68, 480);
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  return part(root, new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({ map: texture }), pos);
}
// Batch stationary parts by material to keep headset draw calls independent of screw/rail counts.
function batch(group: T.Group) {
  const byMaterial = new Map<T.Material, T.BufferGeometry[]>();
  for (const child of [...group.children]) {
    if (!(child instanceof T.Mesh) || Array.isArray(child.material)) continue;
    child.updateMatrix();
    let geometry: T.BufferGeometry = child.geometry;
    if (geometry.index) {
      const triangles = geometry.toNonIndexed();
      geometry.dispose();
      geometry = triangles;
    }
    geometry.applyMatrix4(child.matrix);
    const list = byMaterial.get(child.material) ?? [];
    list.push(geometry);
    byMaterial.set(child.material, list);
    group.remove(child);
  }
  for (const [material, list] of byMaterial) {
    const merged = mergeGeometries(list);
    for (const g of list) g.dispose();
    if (merged) group.add(new T.Mesh(merged, material));
  }
}

export function makeVehicle() {
  const root = new T.Group();
  // Syntactic-foam float blocks, aluminium rails, twin ducted thrusters and pressure hull.
  box(root, [0.68, 0.055, 0.44], graphite, [0, 0.706, -1.2]);
  for (const sign of [-1, 1]) {
    const x = sign * 0.31;
    fairing(root, [0.19, 0.124, 0.5], tangerine, [sign * 0.24, 0.793, -1.29]);
    fairing(root, [0.165, 0.022, 0.3], safety, [sign * 0.24, 0.852, -1.31]);
    for (const z of [-1.42, -1.19]) {
      fairing(root, [0.194, 0.129, 0.019], graphite, [sign * 0.24, 0.793, z]);
      rod(root, [x, 0.52, z], [x, 0.74, z], 0.014, zinc);
    }
    rod(root, [x, 0.52, -1.49], [x, 0.52, -0.965], 0.023, zinc);
    rod(root, [x, 0.52, -0.965], [x, 0.59, -0.93], 0.023, zinc);
    rod(root, [x, 0.58, -1.44], [x, 0.71, -1.04], 0.012, zinc);
    rod(root, [x, 0.6, -1.42], [x, 0.6, -1.17], 0.079, graphite, 22);
    for (const z of [-1.39, -1.3]) rod(root, [x, 0.6, z], [x, 0.6, z + 0.011], 0.083, zinc, 24);
    // Front face of the duct, with a dark throat and visible impeller.
    rod(root, [x, 0.6, -1.17], [x, 0.6, -1.165], 0.073, zinc, 22);
    rod(root, [x, 0.6, -1.165], [x, 0.6, -1.161], 0.064, dark, 22);
    for (let a = 0; a < 4; a++) {
      const blade = box(root, [0.016, 0.102, 0.006], zinc, [x, 0.6, -1.154]);
      blade.rotation.z = (a * Math.PI) / 4;
    }
    rod(root, [x, 0.6, -1.16], [x, 0.6, -1.145], 0.019, tangerine);
    hose(
      root,
      [
        [sign * 0.16, 0.68, -1.45],
        [sign * 0.26, 0.69, -1.49],
        [sign * 0.32, 0.62, -1.38],
      ],
      0.011,
      dark,
    );
    hose(
      root,
      [
        [sign * 0.36, 0.6, -1.47],
        [sign * 0.36, 0.75, -1.51],
        [sign * 0.36, 0.87, -1.46],
        [sign * 0.36, 0.87, -1.26],
        [sign * 0.36, 0.79, -1.2],
      ],
      0.01,
      zinc,
    );
  }
  rod(root, [-0.31, 0.52, -1.4], [0.31, 0.52, -1.4], 0.015, zinc);
  rod(root, [-0.32, 0.7, -0.99], [0.32, 0.7, -0.99], 0.022, zinc);
  rod(root, [0, 0.63, -1.44], [0, 0.63, -1.02], 0.092, white, 24);
  for (const z of [-1.39, -1.08]) rod(root, [0, 0.63, z], [0, 0.63, z + 0.025], 0.095, graphite, 24);
  rod(root, [0, 0.75, -1.17], [0, 1.135, -1.17], 0.019, zinc);
  hose(
    root,
    [
      [0.044, 0.735, -1.24],
      [0.04, 0.82, -1.22],
      [0.018, 1.13, -1.18],
    ],
    0.008,
    dark,
  );
  const [cx, cy, cz] = cameraAt();
  const cameraHead = new T.Group();
  fairing(cameraHead, [0.13, 0.07, 0.093], graphite, [0, 0, -0.067]);
  rod(cameraHead, [0, 0, -0.025], [0, 0, -0.004], 0.03, zinc, 24);
  rod(cameraHead, [0, 0, -0.004], [0, 0, 0], 0.024, dark, 24);
  rod(cameraHead, [0.042, 0.017, -0.018], [0.042, 0.017, -0.015], 0.004, aqua);
  cameraHead.position.set(cx, cy, cz);
  cameraHead.lookAt(0, 0.828, -0.57);
  batch(cameraHead);
  root.add(cameraHead);
  const tag = plaque(root, 'SOUNDINGS', 0.185, 0.038, [0, 0.733, -0.974], '#1c3035', '#dbe2d8');
  tag.rotation.x = -0.12;
  plaque(root, 'R / 04', 0.087, 0.023, [0.229, 0.776, -1.036], '#e98339', '#262c2e');
  const nameplate = plaque(root, 'SOUNDINGS', 0.235, 0.04, [0.24, 0.866, -1.31], '#e9ad4a', '#1d3336');
  nameplate.rotation.x = -Math.PI / 2;
  nameplate.rotation.z = -Math.PI / 2;
  for (const rail of ['port', 'starboard'] as Rail[]) {
    const rig: Rig = { arm: rail, lamp: 'inner', aim: 'forward' };
    const [x, y, z] = armBase(rig);
    part(root, new T.CylinderGeometry(0.073, 0.082, 0.016, 8), zinc, [x, y - 0.003, z]);
    part(root, new T.CylinderGeometry(0.046, 0.048, 0.012, 6), dark, [x, y + 0.005, z]);
    for (let i = 0; i < 6; i++) {
      const a = (2 * Math.PI * i) / 6;
      part(root, new T.CylinderGeometry(0.006, 0.006, 0.009, 6), brass, [
        x + 0.06 * Math.cos(a),
        y + 0.007,
        z + 0.06 * Math.sin(a),
      ]);
    }
  }
  const small = lampAt({ arm: 'port', lamp: 'inner', aim: 'forward' });
  rod(root, [cx, cy - 0.02, cz - 0.065], [small[0], small[1] - 0.02, small[2] - 0.055], 0.016, zinc);
  box(root, [0.036, 0.018, 0.04], graphite, [small[0], small[1] - 0.016, small[2] - 0.05]);
  batch(root);
  return root;
}

export function makeLamp() {
  const group = new T.Group();
  rod(group, [0, 0, -0.075], [0, 0, -0.018], 0.034, graphite, 20);
  for (const z of [-0.059, -0.045, -0.031]) rod(group, [0, 0, z], [0, 0, z + 0.005], 0.038, zinc, 20);
  rod(group, [0, 0, -0.018], [0, 0, -0.003], 0.04, tangerine, 24);
  rod(group, [0, 0, -0.003], [0, 0, 0], 0.031, luminous, 24);
  box(group, [0.023, 0.038, 0.026], graphite, [0, -0.033, -0.04]);
  batch(group);
  return group;
}

export function makeRecorder() {
  const root = new T.Group();
  // Hermetic capsule horizontal under a flat, pinchable lifting bail.
  const fallback = rod(root, [-0.052, -0.046, 0], [0.052, -0.046, 0], 0.023, safety, 20);
  root.remove(fallback);
  for (const x of [-0.054, 0.043]) rod(root, [x, -0.046, 0], [x + 0.012, -0.046, 0], 0.025, graphite, 20);
  for (const x of [-0.027, 0.027]) {
    rod(root, [x, -0.044, 0], [x, -0.005, 0], 0.005, zinc);
    rod(root, [x, -0.005, 0], [x * 0.83, 0, 0], 0.005, zinc);
  }
  rod(root, [-0.023, 0, 0], [0.023, 0, 0], 0.006, safety, 12);
  for (const x of [-0.062, -0.066, -0.07]) rod(root, [x, -0.046, 0], [x + 0.003, -0.046, 0], 0.012, zinc);
  batch(root);
  root.add(fallback);
  new GLTFLoader().load(
    '/assets/recorder-housing.glb',
    ({ scene: model }) => {
      const bounds = new T.Box3().setFromObject(model);
      const center = bounds.getCenter(new T.Vector3()),
        size = bounds.getSize(new T.Vector3());
      if (Math.min(size.x, size.y, size.z) <= 0) return;
      model.traverse((child) => {
        if (child instanceof T.Mesh) {
          if (!child.geometry.hasAttribute('normal')) child.geometry.computeVertexNormals();
          child.material = safety;
          child.castShadow = true;
          child.receiveShadow = true;
          child.layers.enable(4);
        }
      });
      model.scale.set(0.104 / size.x, 0.046 / size.y, 0.046 / size.z);
      model.position.copy(center.multiply(model.scale).negate());
      model.position.y -= 0.046;
      root.add(model);
      root.remove(fallback);
      fallback.geometry.dispose();
    },
    undefined,
    () => {
      /* The machined cylinder also fits the same bail and seals. */
    },
  );
  return root;
}

const badgeTexture = (site: Site) => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#eadbae';
  g.fillRect(0, 0, 128, 128);
  g.lineWidth = 12;
  g.strokeStyle = '#17272b';
  g.fillStyle = '#17272b';
  g.lineJoin = 'round';
  if (site === 'canyon') {
    g.beginPath();
    g.arc(64, 64, 34, 0, Math.PI * 2);
    g.stroke();
  } else if (site === 'mirror') {
    g.fillRect(37, 27, 16, 74);
    g.fillRect(75, 27, 16, 74);
  } else {
    g.beginPath();
    g.moveTo(64, 23);
    g.lineTo(102, 94);
    g.lineTo(26, 94);
    g.closePath();
    g.stroke();
  }
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
};

export function makeSource(site: Site, anchor: Vec3, hx: number, hz: number, lip: number) {
  const root = new T.Group();
  root.position.set(...anchor);
  const y = site === 'dock' ? -0.047 : lip - anchor[1];
  const floorY = -0.078;
  box(root, [hx * 2 + 0.025, 0.014, hz * 2 + 0.025], graphite, [0, floorY, 0]);
  for (const x of [-hx * 0.8, hx * 0.8])
    for (const z of [-hz * 0.8, hz * 0.8]) {
      rod(root, [x, 0.44 - anchor[1], z], [x, floorY, z], 0.005, graphite);
    }
  if (site !== 'dock') {
    // Slender open frame around a grip accessible from above.
    for (const x of [-hx, hx]) {
      for (const z of [-hz, hz]) rod(root, [x, floorY, z], [x, y, z], 0.005, zinc);
      rod(root, [x, y, -hz], [x, y, hz], 0.005, zinc);
    }
    for (const z of [-hz, hz]) rod(root, [-hx, y, z], [hx, y, z], 0.005, zinc);
  }
  const plate = part(
    root,
    new T.PlaneGeometry(0.064, 0.064),
    new T.MeshStandardMaterial({
      map: badgeTexture(site),
      side: T.DoubleSide,
      roughness: 0.84,
      metalness: 0.02,
    }),
    [anchor[0] >= 0 ? -hx - 0.016 : hx + 0.016, site === 'dock' ? -0.013 : 0.013, -0.012],
  );
  plate.quaternion.setFromUnitVectors(
    new T.Vector3(0, 0, 1),
    new T.Vector3(-anchor[0], 0.35, -0.59).normalize(),
  );
  batch(root);
  return root;
}

export function makeCradle(anchor: Vec3, hx: number, hz: number) {
  const root = new T.Group();
  root.position.set(...anchor);
  const y = -0.067;
  box(root, [hx * 2 + 0.02, 0.014, hz * 2 + 0.02], graphite, [0, y, 0]);
  for (const x of [-hx * 0.8, hx * 0.8])
    for (const z of [-hz * 0.8, hz * 0.8]) {
      rod(root, [x, 0.44 - anchor[1], z], [x, y, z], 0.005, graphite);
    }
  for (const x of [-hx, hx]) {
    box(root, [0.007, 0.032, hz * 2 + 0.015], safety, [x, y + 0.018, 0]);
    box(root, [0.012, 0.005, hz * 2 + 0.015], aqua, [x, y + 0.035, 0]);
  }
  for (const z of [-hz, hz]) box(root, [hx * 2, 0.025, 0.007], zinc, [0, y + 0.011, z]);
  const marker = plaque(root, 'CRADLE', hx * 1.8, 0.035, [0, y + 0.009, 0], '#25494b', '#b9f9e0');
  marker.rotation.x = -Math.PI / 2;
  marker.rotation.z = Math.PI;
  batch(root);
  return root;
}
