// Renderer, scene, loop, mode switch (app / factory / eval).
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { DESKTOP_CAMERA, PANELS, WORLD_DEFAULT_MODE, type Vec3 } from './config';
import { createStage, markDataset } from './scene/stage';
import { ArmModel } from './arm/arm';
import { solveIK } from './arm/ik';
import { DesktopInput } from './input/desktop';
import { XRInput } from './input/xr';
import { Challenges, CHALLENGES, type ChallengeResult } from './tasks/challenges';
import { newSessionId, type AttemptRecord, type InputKind } from './tasks/recorder';
import { Panel, type PanelContent } from './ui/panels';
import { sfx, unlockAudio } from './ui/sound';
import { BUTTON_WORLDS, type WorldDef } from './world/world';
import { WorldManager } from './world/manager';
import type { Action, EnvState } from './env/env';

// ---------- renderer / scene ----------
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

// ---------- world ----------
const params = new URLSearchParams(location.search);
const world = new WorldManager();
stage.setVideo(world.getVideo());
world.onVideoChange = (v) => stage.setVideo(v);
let worldDef: WorldDef = BUTTON_WORLDS[0];
void world.setWorld(worldDef, 'fresh');
// connect to Orbis on the first user gesture when a key exists (?orbis=0 disables)
const autoConnect = params.get('orbis') !== '0';
void world.probe().then(() => updateToolbar());

function selectWorld(def: WorldDef) {
  worldDef = def;
  void world.setWorld(def, WORLD_DEFAULT_MODE);
}

let gestured = false;
function onGesture() {
  unlockAudio();
  if (!gestured) {
    gestured = true;
    void world.getVideo().play().catch(() => {});
    if (autoConnect) void world.connect().then(updateToolbar);
  }
}
window.addEventListener('pointerdown', onGesture);

// ---------- inputs ----------
const desktop = new DesktopInput(
  canvas,
  camera,
  (i) => {
    if (BUTTON_WORLDS[i]) selectWorld(BUTTON_WORLDS[i]);
  },
  onGesture,
);
const xr = new XRInput(renderer);
scene.add(xr.group);

let inputKind: InputKind = 'mouse';
function currentAction(): Action {
  if (xr.presenting) {
    const a = xr.action();
    if (a) {
      inputKind = xr.mode === 'controller' ? 'controller' : 'hand';
      return a;
    }
  }
  inputKind = 'mouse';
  return desktop.action();
}

// ---------- challenges ----------
const sessionId = newSessionId();
const records: AttemptRecord[] = [];
let flash: { color: string; until: number } | null = null;
let lastResult: ChallengeResult | null = null;

async function postLog(rec: AttemptRecord) {
  try {
    const r = await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rec),
    });
    if (!r.ok) console.warn('log failed', await r.text());
  } catch (e) {
    console.warn('log failed', e);
  }
}

const challenges = new Challenges({
  sessionId,
  world: () => (worldDef ? { id: worldDef.id, prompt: worldDef.prompt } : null),
  input: () => inputKind,
  seed: () => Math.floor(Math.random() * 1e9),
  onEvent: (e) => {
    switch (e.type) {
      case 'countdown':
        if (e.n === 3) desktop.grip = 0; // every challenge starts with the gripper open
        sfx.tick();
        break;
      case 'go':
        sfx.go();
        break;
      case 'progress':
        sfx.ding();
        break;
      case 'success':
        sfx.success();
        lastResult = e.result;
        flash = { color: 'rgba(40,160,90,0.92)', until: performance.now() + 900 };
        break;
      case 'fail':
        sfx.fail();
        lastResult = e.result;
        flash = { color: 'rgba(170,50,40,0.92)', until: performance.now() + 900 };
        break;
      case 'attempt':
        records.push(e.record);
        void postLog(e.record);
        break;
      case 'results':
        break;
    }
  },
});

// ---------- panels ----------
const hud = document.getElementById('hud')!;
const panels: Record<string, Panel> = {};
function onPress(panel: string, id: string) {
  sfx.click();
  onGesture();
  if (panel === 'world') {
    const def = BUTTON_WORLDS.find((w) => w.id === id);
    if (def) selectWorld(def);
    return;
  }
  if (id === 'start' || id === 'again') challenges.start();
  if (id === 'stop') challenges.abort();
}
panels.world = new Panel('world', PANELS.world.w, PANELS.world.h, PANELS.world.pos, onPress, hud);
panels.status = new Panel('status', PANELS.status.w, PANELS.status.h, PANELS.status.pos, onPress, hud);
panels.side = new Panel('side', PANELS.side.w, PANELS.side.h, PANELS.side.pos, onPress, hud);
for (const p of Object.values(panels)) scene.add(p.mesh);

const fmt = (r: ChallengeResult) =>
  `${r.name.padEnd(6)} ${(r.timeS.toFixed(1) + 's').padStart(6)} ${r.success ? 'OK  ' : 'FAIL'} drops ${r.drops}  ${r.pathLengthM.toFixed(2)}m`;

function updatePanels(now: number) {
  const st = world.status();
  panels.world.set({
    title: 'Worlds',
    lines: [{ text: `wall: ${st}${st === 'stub' && world.lastError ? ' (live failed)' : ''}`, size: 22, color: st === 'live' ? '#5fe08f' : st === 'loading' ? '#ffd34d' : '#c9d3dd' }],
    buttons: BUTTON_WORLDS.map((w, i) => ({ id: w.id, label: `${i + 1} ${w.label}`, active: w.id === world.current()?.id })),
    cols: 2,
  });

  const ph = challenges.phase;
  const ch = challenges.current;
  const fl = flash && now < flash.until ? flash.color : null;
  let status: PanelContent;
  if (ph === 'countdown')
    status = { lines: [{ text: `${ch.name}: ${ch.hint}`, size: 26, align: 'center' }, { text: String(Math.ceil(challenges.countdownLeft)), size: 56, bold: true, align: 'center', color: '#ffd34d' }] };
  else if (ph === 'running')
    status = { lines: [{ text: `${ch.name}: ${ch.hint}`, size: 26, align: 'center' }, { text: `${challenges.elapsedS.toFixed(1)} s / 60`, size: 48, bold: true, align: 'center', mono: true }] };
  else if (ph === 'between')
    status = { flash: fl, lines: [{ text: ch.name, size: 26, align: 'center' }, { text: lastResult?.success ? `Done in ${lastResult.timeS.toFixed(1)} s` : 'Time up', size: 48, bold: true, align: 'center' }] };
  else if (ph === 'results')
    status = { flash: fl, lines: [{ text: 'All challenges done', size: 30, align: 'center' }, { text: 'Your data is recorded', size: 34, bold: true, align: 'center', color: '#5fe08f' }] };
  else status = { lines: [{ text: 'BACKLOT', size: 30, align: 'center', bold: true }, { text: 'Press Start to begin', size: 36, align: 'center' }] };
  status.lines = [...(status.lines ?? []), { text: `wall: ${st}`, size: 18, align: 'center', color: st === 'live' ? '#5fe08f' : '#9fb3c8' }];
  panels.status.set(status);

  let side: PanelContent;
  if (ph === 'results') {
    side = {
      title: 'Results',
      lines: [
        ...challenges.results.map((r) => ({ text: fmt(r), size: 19, mono: true, color: r.success ? '#e8f5ec' : '#ffb3a8' })),
        { text: `${challenges.results.length} attempts saved`, size: 20, color: '#9fb3c8' },
      ],
      buttons: [{ id: 'again', label: 'Run again', wide: true }],
    };
  } else if (ph === 'idle') {
    side = {
      title: 'Challenges',
      lines: CHALLENGES.map((c, i) => ({ text: `${i + 1}. ${c.name}: ${c.hint}`, size: 20 })),
      buttons: [{ id: 'start', label: 'Start', wide: true }],
    };
  } else {
    side = {
      title: 'Challenges',
      lines: CHALLENGES.map((c, i) => {
        const r = challenges.results[i];
        const mark = r ? (r.success ? 'OK  ' : 'FAIL') : i === challenges.index ? '>>  ' : '    ';
        return { text: `${mark} ${c.name}${r ? `  ${r.timeS.toFixed(1)}s` : ''}`, size: 22, mono: true, color: i === challenges.index ? '#ffd34d' : undefined };
      }),
      buttons: [{ id: 'stop', label: 'Stop', wide: true }],
    };
  }
  panels.side.set(side);
}

// desktop-only toolbar
const toolbar = document.getElementById('toolbar')!;
const dl = document.createElement('button');
dl.textContent = 'Download attempts';
dl.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(records, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backlot-${sessionId}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
toolbar.appendChild(dl);
const conn = document.createElement('button');
conn.id = 'orbis-toggle';
conn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (world.connected) await world.disconnect();
  else await world.connect();
  updateToolbar();
});
toolbar.appendChild(conn);
function updateToolbar() {
  conn.style.display = world.liveCapable ? '' : 'none';
  conn.textContent = world.connected ? 'Disconnect Orbis' : 'Connect Orbis';
}
updateToolbar();
world.onStatusChange = () => updateToolbar();
// end the paid session when the tab goes away
window.addEventListener('pagehide', () => void world.disconnect());

// ---------- XR session ----------
document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] }));
renderer.xr.addEventListener('sessionstart', () => {
  document.body.classList.add('xr');
  onGesture();
  void world.getVideo().play().catch(() => {});
});
renderer.xr.addEventListener('sessionend', () => document.body.classList.remove('xr'));

// ---------- render helpers ----------
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

// ---------- loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();
  if (xr.presenting) xr.update(dt);
  desktop.update(dt);
  challenges.update(dt, currentAction);

  const alpha = challenges.acc / (1 / 30);
  renderState(challenges.prev, challenges.curr, Math.min(1, Math.max(0, alpha)), dt);

  const a = xr.presenting ? xr.action() ?? desktop.action() : desktop.action();
  marker.position.set(...a.target);
  const active = xr.presenting ? xr.active : desktop.engaged;
  (marker.material as THREE.MeshBasicMaterial).color.setHex(active ? 0xffb347 : 0x555b66);
  (marker.material as THREE.MeshBasicMaterial).opacity = active ? 0.95 : 0.5;

  if (xr.presenting) for (const p of Object.values(panels)) p.poke(xr.pokeTips(), now);
  updatePanels(now);
  Panel.inScene = xr.presenting;
  for (const p of Object.values(panels)) p.sync();
  renderer.render(scene, camera);
});

// ---------- debug / test hook ----------
declare global {
  interface Window {
    __backlot: unknown;
  }
}
window.__backlot = {
  challenges,
  desktop,
  records,
  world,
  panels,
  sessionId,
  /** screen position (CSS px) of a world point, for driving the mouse in tests */
  project(p: Vec3) {
    const v = new THREE.Vector3(...p).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  },
  state: () => challenges.env.snapshot(),
};
