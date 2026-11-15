import * as THREE from 'three';
import { Panel } from '../ui/panels';
import type { Core } from '../core';
import type { XRInput } from '../input/xr';
import type { RecoveryAction, RecoveryHudState } from './hud';

const names: Partial<Record<RecoveryAction, string>> = {
  'steer-left': 'Steer left',
  'steer-right': 'Steer right',
  capture: 'Freeze frame',
  'confirm-left': 'Mark left',
  'confirm-right': 'Mark right',
  teach: 'Teach recovery',
  replay: 'Replay skill',
  next: 'New incident',
  practice: 'Local rehearsal',
  reset: 'Reset station',
  resume: 'Load last skill',
  retry: 'Steer again',
};

function wrap(text: string, limit: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > limit) {
      lines.push(line);
      line = word;
    } else line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  return lines;
}

export function createXrConsole(
  core: Core,
  input: XRInput,
  feed: HTMLCanvasElement,
  send: (action: RecoveryAction) => void,
) {
  const { scene, renderer } = core;
  const hiddenHtml = document.createElement('div');
  const press = (_panel: string, action: string) => send(action as RecoveryAction);
  const status = new Panel('recovery-status', 0.72, 0.24, [0, 1.64, -1.35], press, hiddenHtml);
  const controls = new Panel('recovery-control', 0.42, 0.4, [0.49, 1.48, -0.47], press, hiddenHtml);
  const feedControls = new Panel('recovery-feed', 0.46, 0.23, [-0.48, 1.32, -0.5], press, hiddenHtml);
  const panels = [controls, feedControls, status];
  scene.add(...panels.map((p) => p.mesh));
  const tex = new THREE.CanvasTexture(feed);
  tex.colorSpace = THREE.SRGBColorSpace;
  const monitor = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.259),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
  );
  monitor.position.set(-0.48, 1.57, -0.5);
  monitor.quaternion.copy(feedControls.mesh.quaternion);
  scene.add(monitor);
  const ray = new THREE.Raycaster();
  let marking = false,
    teaching = false;
  const pointers: ReturnType<typeof renderer.xr.getController>[] = [];
  const cursors: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const pointer = renderer.xr.getController(i);
    pointers.push(pointer);
    const cursor = new THREE.Mesh(
      new THREE.SphereGeometry(0.005, 10, 6),
      new THREE.MeshBasicMaterial({ color: 0xffc367, depthTest: false }),
    );
    cursor.visible = false;
    scene.add(cursor);
    cursors.push(cursor);
    pointer.addEventListener('selectstart', () => {
      if (!renderer.xr.isPresenting || !pointer.visible || (teaching && input.controllerSide(i) !== 'left'))
        return;
      ray.setFromXRController(pointer);
      const id = panels.map((p) => p.rayButton(ray)).find(Boolean);
      if (id) send(id as RecoveryAction);
      else if (marking) {
        const hit = ray.intersectObject(monitor, false)[0];
        if (hit?.uv) send(hit.uv.x < 0.5 ? 'confirm-left' : 'confirm-right');
      }
    });
  }
  return {
    update(state: RecoveryHudState, feedDirty: boolean, now: number) {
      Panel.inScene = renderer.xr.isPresenting;
      monitor.visible = Panel.inScene;
      if (feedDirty) tex.needsUpdate = true;
      if (!Panel.inScene) {
        panels.forEach((p) => p.sync());
        cursors.forEach((c) => (c.visible = false));
        return;
      }
      const actions = state.available ?? [];
      teaching = state.phase === 'teaching';
      marking = actions.includes('confirm-left');
      const feedActions: RecoveryAction[] = [
        'steer-left',
        'steer-right',
        'capture',
        'confirm-left',
        'confirm-right',
        'retry',
      ];
      const controlActions: RecoveryAction[] = ['teach', 'replay', 'next', 'resume', 'practice', 'reset'];
      const buttons = (order: RecoveryAction[]) =>
        order.filter((id) => actions.includes(id)).map((id) => ({ id, label: names[id] ?? id }));
      status.set({
        title: state.title,
        lines: wrap(state.caption ?? '', 44)
          .slice(0, 4)
          .map((text) => ({ text, size: 22 })),
      });
      controls.set({
        title: 'Station controls',
        cols: 2,
        lines: [
          { text: state.phaseLabel ?? '', size: 22, bold: true, color: '#ffcc78' },
          {
            text: teaching ? 'Left hand controls · right hand guides' : 'Point and pinch, or touch a button.',
            size: 16,
          },
          ...(state.metrics?.recovery?.pathM !== undefined
            ? [
                {
                  text: `Replay  ${state.metrics.recovery.pathM.toFixed(2)} m   ·   ${state.metrics.recovery.collisions} contacts`,
                  size: 18,
                },
              ]
            : []),
        ],
        buttons: buttons(controlActions),
      });
      feedControls.set({
        title:
          state.mode === 'live'
            ? 'Orbis camera'
            : state.mode === 'connecting'
              ? 'Connecting to Orbis'
              : 'Station camera',
        lines: wrap(state.feedCaption ?? '', 40)
          .slice(0, 2)
          .map((text) => ({ text, size: 16 })),
        cols: 3,
        buttons: buttons(feedActions),
      });
      const tips = input.pokeTips(teaching ? 'left' : undefined);
      for (const p of panels) {
        p.sync();
        p.poke(tips, now);
      }
      pointers.forEach((pointer, i) => {
        const cursor = cursors[i];
        cursor.visible = false;
        if (!pointer.visible || (teaching && input.controllerSide(i) !== 'left')) return;
        ray.setFromXRController(pointer);
        const objects: THREE.Object3D[] = [controls.mesh, feedControls.mesh];
        if (marking) objects.push(monitor);
        const hit = ray.intersectObjects(objects, false)[0];
        if (hit) {
          cursor.position.copy(hit.point);
          cursor.visible = true;
        }
      });
    },
  };
}
