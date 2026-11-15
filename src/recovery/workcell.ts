// The workcell uses metres and shares all interactive geometry with the simulator.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Core } from '../core';
import { ARM_BASE, BIN, CUBE_SIZE, TABLE, type Vec3 } from '../config';
import type { Incident } from './engine';

const material = (color: number, roughness = 0.65, metalness = 0.08) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(parent: THREE.Object3D, size: Vec3, pos: Vec3, mat: THREE.Material, radius = 0) {
  const geo = radius > 0 ? new RoundedBoxGeometry(...size, 2, radius) : new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function paintedPlate(width: number, height: number, paint: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function surfaceTexture() {
  return paintedPlate(1024, 600, (ctx) => {
    ctx.fillStyle = '#afb5b0';
    ctx.fillRect(0, 0, 1024, 600);
    ctx.fillStyle = '#919992';
    for (let x = 22; x < 1024; x += 30) {
      for (let y = 16; y < 600; y += 30) ctx.fillRect(x, y, 2, 2);
    }
    ctx.strokeStyle = '#8e968c';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, 996, 572);
    ctx.fillStyle = '#54605c';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('BACKLOT   /   PARCEL INDUCTION', 28, 564);
    for (let i = 0; i < 78; i++) {
      const h = i % 5 === 0 ? 10 : 4;
      ctx.fillRect(46 + i * 12, 20, 2, h);
    }
  });
}

function createCarton(cube: THREE.Mesh) {
  const pkg = material(0xc3935e, 0.95, 0);
  cube.material = pkg;
  cube.geometry = new RoundedBoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, 2, 0.0012);
  const tape = material(0xe7bc7d, 0.52);
  box(cube, [0.011, 0.0004, 0.05], [0, 0.0251, 0], tape);
  box(cube, [0.011, 0.016, 0.0004], [0, 0.017, 0.0251], tape);
  const print = paintedPlate(160, 96, (ctx) => {
    ctx.fillStyle = '#faf7ec';
    ctx.fillRect(0, 0, 160, 96);
    ctx.fillStyle = '#28302d';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('BL / 001', 10, 26);
    let x = 11;
    for (let i = 0; i < 35; i++) {
      const w = [1, 3, 2, 4, 2][i % 5];
      ctx.fillRect(x, 38, w, 40);
      x += w + 1;
    }
  });
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.027, 0.016),
    new THREE.MeshBasicMaterial({ map: print }),
  );
  label.position.set(0.003, -0.005, 0.0253);
  cube.add(label);
  cube.castShadow = true;
}

function styleRobot(root: THREE.Group) {
  const moving: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) moving.push(obj);
  });
  const metal = material(0x85918d, 0.38, 0.55);
  const casing = material(0x303b3c, 0.48, 0.38);
  for (const mesh of moving) {
    mesh.castShadow = mesh.receiveShadow = true;
    if (mesh.name.startsWith('gripper-')) continue;
    if (mesh.geometry instanceof THREE.BoxGeometry) {
      const { width: w, height: h, depth: d } = mesh.geometry.parameters;
      mesh.geometry = new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.22);
      if (d > 0.25) {
        box(mesh, [w * 1.05, h * 0.56, d * 0.48], [0, 0, 0], casing, 0.008);
        for (const side of [-1, 1]) {
          for (const z of [-0.06, -0.04, -0.02, 0]) {
            box(mesh, [0.001, h * 0.3, 0.006], [side * (w * 0.525 + 0.0006), 0, z], metal);
          }
        }
      }
    } else if (mesh.geometry instanceof THREE.CylinderGeometry && Math.abs(mesh.rotation.z) > 1) {
      const { radiusTop: r, height: h } = mesh.geometry.parameters;
      for (const side of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.74, r * 0.74, 0.003, 24), metal);
        cap.position.y = side * (h / 2 + 0.001);
        mesh.add(cap);
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.36, r * 0.36, 0.004, 6), casing);
        bolt.position.y = side * (h / 2 + 0.004);
        mesh.add(bolt);
      }
    }
  }
}

class PathTrace {
  private positions = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 7),
    new THREE.MeshBasicMaterial(),
    1200,
  );
  private transform = new THREE.Object3D();
  private dir = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private signature = '';
  constructor(color: number, scene: THREE.Scene) {
    (this.positions.material as THREE.MeshBasicMaterial).color.setHex(color);
    this.positions.count = 0;
    this.positions.frustumCulled = false;
    scene.add(this.positions);
  }
  color(value: number) {
    (this.positions.material as THREE.MeshBasicMaterial).color.setHex(value);
  }
  update(path: readonly Vec3[]) {
    const last = path.at(-1);
    const key = path.length + '/' + last?.join(',');
    if (this.signature === key) return;
    this.signature = key;
    const stride = Math.max(1, Math.ceil((path.length - 1) / 1200));
    let count = 0;
    for (let i = stride; i < path.length + stride - 1 && count < 1200; i += stride) {
      const a = path[i - stride],
        b = path[Math.min(i, path.length - 1)];
      if (!a || !b) break;
      this.dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = this.dir.length();
      if (len < 0.0002) continue;
      this.transform.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      this.transform.quaternion.setFromUnitVectors(this.up, this.dir.multiplyScalar(1 / len));
      this.transform.scale.set(0.0025, len, 0.0025);
      this.transform.updateMatrix();
      this.positions.setMatrixAt(count++, this.transform.matrix);
    }
    this.positions.count = count;
    this.positions.instanceMatrix.needsUpdate = true;
  }
}

export function dressWorkcell(core: Core) {
  const { scene, stage, arm, renderer, camera } = core;
  const ivory = material(0xd7d9c9),
    dark = material(0x35423f),
    silver = material(0xa5afa7, 0.46, 0.44);
  scene.background = new THREE.Color(0xacb5ae);
  scene.fog = new THREE.FogExp2(0xafb8b1, 0.24);
  stage.wall.visible = false;
  core.streamLight.enabled = false;
  const studio = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio, 0.025).texture;
  scene.environmentIntensity = 0.42;
  pmrem.dispose();
  studio.dispose();
  stage.hemi.color.setHex(0xfff4df);
  stage.hemi.groundColor.setHex(0x6f817f);
  stage.hemi.intensity = 1.3;
  stage.sun.color.setHex(0xffead0);
  stage.sun.intensity = 2.4;
  stage.sun.position.set(-1.4, 3.4, 0.9);
  stage.sun.target.position.set(0, 0.76, -0.7);
  scene.add(stage.sun.target);
  stage.sun.castShadow = true;
  stage.sun.shadow.mapSize.set(1024, 1024);
  Object.assign(stage.sun.shadow.camera, {
    left: -1.2,
    right: 1.2,
    top: 1.2,
    bottom: -1.2,
    near: 0.1,
    far: 8,
  });
  stage.sun.shadow.normalBias = 0.0015;
  stage.sun.shadow.bias = -0.00015;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  for (const item of stage.root.children) {
    if (!(item instanceof THREE.Mesh)) continue;
    if (item.geometry instanceof THREE.CircleGeometry) {
      item.material = material(0x8d9990);
      item.receiveShadow = true;
    }
    if (item.geometry instanceof THREE.BoxGeometry && item.geometry.parameters.width === TABLE.width) {
      item.material = dark;
      item.castShadow = item.receiveShadow = true;
    }
  }
  const tabletop = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE.width, TABLE.depth),
    new THREE.MeshStandardMaterial({ map: surfaceTexture(), roughness: 0.85 }),
  );
  tabletop.rotation.x = -Math.PI / 2;
  tabletop.position.set(TABLE.cx, TABLE.top + 0.0004, TABLE.cz);
  tabletop.receiveShadow = true;
  scene.add(tabletop);
  box(scene, [1.19, 0.022, 0.018], [0, 0.713, -0.401], silver);
  for (const x of [-0.54, 0.54]) {
    box(scene, [0.034, 0.032, 0.63], [x, 0.3, -0.75], dark);
    for (const z of [-0.45, -1.05]) box(scene, [0.067, 0.025, 0.067], [x, 0.016, z], dark, 0.005);
  }
  box(scene, [1.1, 0.036, 0.032], [0, 0.3, -1.045], dark);
  box(
    scene,
    [0.245, 0.012, 0.14],
    [ARM_BASE[0], TABLE.top + 0.006, ARM_BASE[2]],
    material(0x5d6964, 0.5, 0.28),
  );

  const grid = new THREE.GridHelper(12, 48, 0x8b9890, 0x97a399);
  grid.position.y = 0.001;
  scene.add(grid);
  camera.fov = 32;
  camera.position.set(1.02, 1.61, 0.62);
  camera.lookAt(-0.03, 1.025, -0.77);
  camera.updateProjectionMatrix();
  styleRobot(arm.root);
  createCarton(stage.cubes.red);
  stage.bins.red.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.material = material(0xedb72d, 0.66);
      o.receiveShadow = o.castShadow = true;
    }
  });
  const trayLabel = paintedPlate(256, 64, (ctx) => {
    ctx.fillStyle = '#dfb23a';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#282c26';
    ctx.font = 'bold 33px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('OUTFEED', 128, 44);
  });
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.108, 0.025),
    new THREE.MeshBasicMaterial({ map: trayLabel }),
  );
  plate.position.set(0, 0.044, BIN.d / 2 + 0.0006);
  stage.bins.red.add(plate);

  // A recessed tote with raised rim and molded ribs. Every outside surface stays inside its box.
  const tote = new THREE.Group();
  const cobalt = material(0x2a65c2, 0.48),
    rim = material(0x4489ea, 0.42),
    lining = material(0x1d478b, 0.75);
  box(tote, [1, 0.83, 1], [0, 0.415, 0], cobalt, 0.025);
  box(tote, [0.88, 0.022, 0.83], [0, 0.834, 0], lining);
  for (const side of [-1, 1]) {
    box(tote, [1, 0.16, 0.07], [0, 0.92, side * 0.465], rim, 0.008);
    box(tote, [0.06, 0.16, 0.87], [side * 0.47, 0.92, 0], rim, 0.008);
    for (const x of [-0.38, -0.2, 0, 0.2, 0.38])
      box(tote, [0.022, 0.61, 0.014], [x, 0.42, side * 0.493], rim, 0.002);
  }
  scene.add(tote);
  tote.visible = false;

  // A large diffused window and distant shelves give the workcell a warehouse context.
  const shell = new THREE.Group();
  scene.add(shell);
  box(shell, [12, 3.5, 0.12], [0, 1.6, -4.8], ivory);
  const glass = material(0xb5cdc8, 0.34, 0.14);
  for (let i = -4; i < 4; i++) box(shell, [0.59, 1.03, 0.012], [(i + 0.5) * 0.61, 1.94, -4.72], glass);
  for (let i = -4; i <= 4; i++) {
    box(shell, [0.025, 1.05, 0.03], [i * 0.61, 1.94, -4.7], silver);
  }
  for (const y of [1.4, 2.47]) box(shell, [5.2, 0.025, 0.03], [0, y, -4.69], silver);
  for (const x of [-2.45, 2.2]) {
    const shelf = material(0x70847d);
    for (const y of [0.3, 0.84, 1.4]) {
      box(shell, [1.12, 0.026, 0.36], [x, y, -3.25], shelf);
      for (let i = 0; i < 3; i++) {
        const h = [0.21, 0.29, 0.25][i];
        box(
          shell,
          [0.22 + i * 0.016, h, 0.23],
          [x - 0.35 + i * 0.34, y + h / 2 + 0.014, -3.24],
          material([0xab9a7f, 0xb39e7c, 0x9d8f75][i]),
        );
      }
    }
    for (const sx of [-0.54, 0.54]) box(shell, [0.035, 1.65, 0.035], [x + sx, 0.825, -3.1], shelf);
  }
  shell.traverse((o) => {
    o.castShadow = o.receiveShadow = false;
  });
  const failure = new PathTrace(0xf04c35, scene);
  const recovery = new PathTrace(0x007e71, scene);
  const contact = new THREE.Group();
  scene.add(contact);
  const hitMat = new THREE.MeshBasicMaterial({ color: 0xf04b34 });
  contact.add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 10), hitMat));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.002, 8, 48), hitMat);
  contact.add(ring);
  const callout = paintedPlate(256, 64, (ctx) => {
    ctx.fillStyle = '#a32517';
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('CONTACT', 128, 45);
  });
  const flag = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: callout, depthTest: false, toneMapped: false }),
  );
  flag.scale.set(0.108, 0.027, 1);
  flag.position.set(0, 0.053, 0);
  flag.renderOrder = 4;
  contact.add(flag);
  contact.visible = false;

  return {
    showStream(visible: boolean) {
      stage.wall.visible = visible;
      shell.visible = !visible;
      (stage.wall.material as THREE.MeshBasicMaterial).fog = false;
    },
    update(
      incident: Incident | null,
      failed: readonly Vec3[],
      corrected: readonly Vec3[],
      contactPoint: Vec3 | null,
      hitOnReplay = false,
    ) {
      tote.visible = !!incident;
      if (incident) {
        const { min, max } = incident.obstacle;
        tote.position.set((min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2);
        tote.scale.set(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
      }
      failure.update(failed);
      recovery.color(hitOnReplay ? 0xd58a10 : 0x007e71);
      recovery.update(corrected);
      contact.visible = !!contactPoint;
      if (contactPoint) {
        contact.position.set(...contactPoint);
        ring.quaternion.copy(camera.quaternion);
      }
    },
  };
}
