// Shared scene setup used by every mode: renderer, camera, stage, arm, world, stream light, state rendering.
import * as THREE from 'three';
import { DESKTOP_CAMERA, type Vec3 } from './config';
import { createStage, markDataset } from './scene/stage';
import { ArmModel } from './arm/arm';
import { solveIK } from './arm/ik';
import { StreamLight } from './scene/streamlight';
import { WorldManager } from './world/manager';
import type { EnvState } from './env/env';

export type Core = ReturnType<typeof createCore>;

export function createCore() {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0d10);
  const camera = new THREE.PerspectiveCamera(DESKTOP_CAMERA.fov, window.innerWidth / window.innerHeight, 0.02, 50);
  camera.position.set(...DESKTOP_CAMERA.pos);
  camera.lookAt(...DESKTOP_CAMERA.lookAt);

  const stage = createStage();
  scene.add(stage.root);
  const arm = new ArmModel();
  markDataset(arm.root);
  scene.add(arm.root);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, depthTest: false }),
  );
  marker.renderOrder = 10;
  scene.add(marker);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const world = new WorldManager();
  stage.setVideo(world.getVideo());
  world.onVideoChange = (v) => stage.setVideo(v);
  const streamLight = new StreamLight(stage.hemi, stage.sun, () => world.getVideo());

  const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const disp: Record<string, { y: number; v: number }> = {};

  function renderState(prev: EnvState, curr: EnvState, alpha: number, dt: number) {
    const tip = lerp3(prev.tip, curr.tip, alpha);
    arm.setJoints(solveIK(tip).joints);
    arm.updateGrip(curr.grip === 1, dt);
    const cubes: Partial<Record<'red' | 'blue', Vec3>> = {};
    for (const c of ['red', 'blue'] as const) {
      const b = curr.cubes[c];
      if (!b) continue;
      let p: Vec3 = b;
      const d = disp[c];
      if (curr.held === c) {
        p = lerp3(prev.cubes[c] ?? b, b, alpha);
        disp[c] = { y: p[1], v: 0 };
      } else if (d && d.y > b[1]) {
        // env drops a released cube instantly; animate it as a short fall
        d.v += 9.8 * dt;
        d.y = Math.max(b[1], d.y - d.v * dt);
        p = [b[0], d.y, b[2]];
      } else disp[c] = { y: b[1], v: 0 };
      cubes[c] = p;
    }
    stage.update(curr, cubes);
  }

  return { canvas, renderer, scene, camera, stage, arm, marker, world, streamLight, renderState };
}
