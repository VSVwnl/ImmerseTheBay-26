// The human app: challenges, panels, inputs, Multiply. Runs on the shared core.
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { PANELS, SUCCESS_NUDGES, WORLD_DEFAULT_MODE, type Vec3 } from './config';
import { DesktopInput } from './input/desktop';
import { XRInput } from './input/xr';
import { Challenges, CHALLENGES, type ChallengeResult } from './tasks/challenges';
import { newSessionId, type AttemptRecord, type InputKind } from './tasks/recorder';
import { Panel, type PanelContent } from './ui/panels';
import { sfx, unlockAudio } from './ui/sound';
import { BUTTON_WORLDS, HELD_OUT_WORLDS, PROMPT_PREFIX, TRAINING_WORLDS, type WorldDef } from './world/world';
import { PolicyClient } from './policy/client';
import { RobotTurn } from './policy/robot';
import { Multiply } from './factory/multiply';
import { DatasetCamera } from './factory/camera';
import { ThumbWall } from './ui/thumbs';
import { listenOnce, voiceSupported } from './ui/voice';
import type { Action } from './env/env';
import type { Core } from './core';
import { HoloControl } from './holo/control';

export function startApp(core: Core) {
  const { canvas, renderer, scene, camera, marker, world, streamLight, renderState } = core;
  const params = new URLSearchParams(location.search);
  let listening = false;
  function speakWorld() {
    listenOnce(
      (text) => {
        const label = text.length > 22 ? text.slice(0, 21) + '…' : text;
        selectWorld({ id: 'custom', label, prompt: `${PROMPT_PREFIX} ${text}` });
      },
      (on) => {
        listening = on;
      },
    );
  }
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

  // ---------- hologram control (?holo=1) ----------
  // A small hologram of the arm: drag its tip and the real arm follows. It writes into the desktop input's
  // target/grip, so the challenges, recording and replay see an ordinary action.
  const holo = params.get('holo') === '1' ? new HoloControl(scene, canvas, camera, desktop, xr) : null;
  if (holo) {
    desktop.holoMode = true;
    holo.onEvent = (e) => {
      if (e === 'grab' || e === 'tap') sfx.click();
    };
    const help = document.getElementById('help');
    if (help) help.textContent = 'Drag the hologram tip: move arm · wheel or W/S: up/down · click the tip or Space: grip · 1–6: world';
  }

  let inputKind: InputKind = 'mouse';
  function currentAction(): Action {
    if (holo) {
      inputKind = holo.inputKind;
      return desktop.action();
    }
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
          void world.nudge(SUCCESS_NUDGES[Math.floor(Math.random() * SUCCESS_NUDGES.length)]);
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
          void probeRobot();
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
      if (id === 'voice') return speakWorld();
      const def = (robot ? ROBOT_WORLDS : BUTTON_WORLDS).find((w) => w.id === id);
      if (def) selectWorld(def);
      if (def && robot) robot.reset(); // fresh seed in the new world
      return;
    }
    if (id === 'robot') return startRobot();
    if (id === 'takeover') return takeOver();
    if (id === 'toggle' && robot) {
      robot.setPolicy(robot.policy === 'multi' ? 'single' : 'multi');
      return;
    }
    if (id === 'reseed' && robot) return robot.reset();
    if (robot) return;
    if (id === 'multiply') return startMultiply();
    if (id === 'mstop') {
      multiply?.stop();
      return;
    }
    if (multiply && multiply.phase !== 'done') return;
    if (id === 'start' || id === 'again') challenges.start();
    if (id === 'stop') challenges.abort();
  }
  panels.world = new Panel('world', PANELS.world.w, PANELS.world.h, PANELS.world.pos, onPress, hud);
  panels.status = new Panel('status', PANELS.status.w, PANELS.status.h, PANELS.status.pos, onPress, hud);
  panels.side = new Panel('side', PANELS.side.w, PANELS.side.h, PANELS.side.pos, onPress, hud);
  panels.counter = new Panel('counter', PANELS.counter.w, PANELS.counter.h, PANELS.counter.pos, onPress, hud);
  for (const p of Object.values(panels)) scene.add(p.mesh);

  // ---------- Multiply (M3 Part A) ----------
  const dcam = new DatasetCamera();
  const thumbs = new ThumbWall(4, 2, PANELS.thumbs.w, PANELS.thumbs.pos, hud);
  scene.add(thumbs.mesh);
  let multiply: Multiply | null = null;
  let pendingSnap: string | null = null;
  const bestPlace = () =>
    [...records].reverse().find((r) => r.challenge === 'place' && r.success) ?? null;
  function startMultiply() {
    const demo = bestPlace();
    if (!demo || (multiply && multiply.phase !== 'done')) return;
    challenges.freePlay = false;
    thumbs.clear();
    thumbs.visible = true;
    multiply = new Multiply(demo, TRAINING_WORLDS, {
      setWorld: (def) => selectWorld(def),
      snapshot: (w) => {
        pendingSnap = w.label;
      },
      onEpisode: () => sfx.ding(),
    });
  }
  const multiplying = () => !!multiply && multiply.phase !== 'done';

  // ---------- Robot's turn (M5) ----------
  const policyClient = new PolicyClient(`ws://localhost:${params.get('policyPort') ?? 8765}`);
  let robot: RobotTurn | null = null;
  let robotAvailable = false;
  let summary: any = null;
  let summaryTag = '';
  const ROBOT_WORLDS = [...BUTTON_WORLDS, ...HELD_OUT_WORLDS];
  panels.table = new Panel('table', PANELS.thumbs.w, 0.3, PANELS.thumbs.pos, onPress, hud);
  scene.add(panels.table.mesh);
  /** The button shows only when a results summary exists and the policy server answers. */
  async function probeRobot() {
    try {
      // the dev server checks the files and the policy port, so a missing server leaves no console errors
      const r = await fetch(`/api/robot?port=${params.get('policyPort') ?? 8765}`, { cache: 'no-store' });
      const p = r.ok ? await r.json() : null;
      summary = p?.summary ?? null;
      summaryTag = p?.tag ?? '';
      if (!summary || !p.policyServer) {
        robotAvailable = false;
        return;
      }
      await policyClient.connect();
      robotAvailable = true;
    } catch {
      robotAvailable = false;
    }
  }
  void probeRobot();
  function startRobot() {
    if (!robotAvailable || multiplying() || robot) return;
    challenges.freePlay = false;
    thumbs.visible = false;
    const first = policyClient.policies.includes('multi') ? 'multi' : policyClient.defaultPolicy;
    robot = new RobotTurn(
      policyClient,
      (st) => {
        renderState(st, st, 1, 1);
        return dcam.capture(renderer, scene);
      },
      () => Math.floor(Math.random() * 1e9),
      first,
    );
  }
  function takeOver() {
    robot?.stop();
    robot = null;
    challenges.freePlay = true;
    challenges.abort(); // back to the idle screen: Start runs the challenges again
  }
  const cell = (c: { success: number; episodes: number } | undefined) => (c && c.episodes ? `${c.success}/${c.episodes}` : '-');

  const fmt = (r: ChallengeResult) =>
    `${r.name.padEnd(6)} ${(r.timeS.toFixed(1) + 's').padStart(6)} ${r.success ? 'OK  ' : 'FAIL'} drops ${r.drops}  ${r.pathLengthM.toFixed(2)}m`;

  function updatePanels(now: number) {
    const st = world.status();
    if (robot)
      panels.world.set({
        title: 'Pick a world',
        lines: [{ text: `wall: ${st}   * = held out, never trained on`, size: 20, color: st === 'live' ? '#5fe08f' : '#c9d3dd' }],
        buttons: ROBOT_WORLDS.map((w) => ({
          id: w.id,
          label: w.heldOut ? w.label.replace(' (held out)', ' *') : w.label,
          active: w.id === world.current()?.id,
        })),
        cols: 3,
      });
    else panels.world.set({
      title: 'Worlds',
      lines: [{ text: `wall: ${st}${st === 'stub' && world.lastError ? ' (live failed)' : ''}`, size: 22, color: st === 'live' ? '#5fe08f' : st === 'loading' ? '#ffd34d' : '#c9d3dd' }],
      buttons: [
        ...BUTTON_WORLDS.map((w, i) => ({ id: w.id, label: `${i + 1} ${w.label}`, active: w.id === world.current()?.id })),
        ...(voiceSupported
          ? [{ id: 'voice', label: listening ? 'Listening…' : world.current()?.id === 'custom' ? `Say a world (${world.current()!.label})` : 'Say a world', wide: true, active: listening }]
          : []),
      ],
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
    // Multiply and Robot's turn set their own status below; setting it twice per frame would redraw every frame
    if (!robot && !multiplying()) panels.status.set(status);

    let side: PanelContent;
    if (ph === 'results') {
      side = {
        title: 'Results',
        lines: [
          ...challenges.results.map((r) => ({ text: fmt(r), size: 19, mono: true, color: r.success ? '#e8f5ec' : '#ffb3a8' })),
          { text: `${challenges.results.length} attempts saved`, size: 20, color: '#9fb3c8' },
        ],
        buttons: [
          ...(bestPlace() ? [{ id: 'multiply', label: 'Multiply my Place demo', wide: true }] : []),
          { id: 'again', label: 'Run again', wide: true },
        ],
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
    if (multiplying()) {
      const m = multiply!;
      side = {
        title: 'Multiply',
        lines: [
          { text: `Replaying your Place demo`, size: 22 },
          { text: `World ${m.index + 1} of ${m.worlds.length}: ${m.world?.label ?? ''}`, size: 22, color: '#ffd34d' },
          { text: m.phase === 'settle' ? 'Waiting for the world to settle' : 'Replaying', size: 20, color: '#9fb3c8' },
        ],
        buttons: [{ id: 'mstop', label: 'Stop', wide: true }],
      };
      status = {
        lines: [
          { text: 'Multiply', size: 26, align: 'center' },
          { text: `${m.world?.label ?? ''}`, size: 44, bold: true, align: 'center' },
          { text: `wall: ${st}`, size: 18, align: 'center', color: st === 'live' ? '#5fe08f' : '#9fb3c8' },
        ],
      };
      panels.status.set(status);
    }
    if (ph === 'results' && robotAvailable && !multiplying() && side.buttons)
      side.buttons = [{ id: 'robot', label: "Robot's turn", wide: true }, ...side.buttons];
    if (robot) {
      const r = robot;
      side = {
        title: "Robot's turn",
        lines: [
          { text: `policy: ${r.policy} (trained on ${r.policy === 'single' ? 'one world' : 'many worlds'})`, size: 20 },
          { text: `this session: ${r.successes}/${r.tries} placed`, size: 22, bold: true },
          {
            text: r.phase === 'error' ? `error: ${r.lastError}` : `step ${r.steps} / 200`,
            size: 18,
            color: r.phase === 'error' ? '#ff7b6b' : '#9fb3c8',
          },
        ],
        buttons: [
          { id: 'toggle', label: `Switch to ${r.policy === 'multi' ? 'single' : 'multi'}`, wide: true, disabled: policyClient.policies.length < 2 },
          { id: 'reseed', label: 'New scene', wide: true },
          { id: 'takeover', label: 'Take over', wide: true },
        ],
      };
      const word = r.phase === 'success' ? 'Placed it!' : r.phase === 'fail' ? 'Missed' : r.phase === 'error' ? 'Policy error' : 'The robot is working';
      panels.status.set({
        flash: r.phase === 'success' ? 'rgba(40,160,90,0.92)' : r.phase === 'fail' ? 'rgba(170,50,40,0.92)' : null,
        lines: [
          { text: `Robot's turn: ${world.current()?.label ?? ''}`, size: 26, align: 'center' },
          { text: word, size: 40, bold: true, align: 'center' },
          { text: `wall: ${st}`, size: 18, align: 'center', color: st === 'live' ? '#5fe08f' : '#9fb3c8' },
        ],
      });
    }
    panels.side.set(side);
    if (robot && summary?.table) {
      const T = summary.table;
      const cols = ['lab', 'subway', 'forest', 'desert', 'held_out_mean'];
      const fmtRow = (r: string[]) => r[0].padEnd(7) + r.slice(1).map((x, i) => x.padStart(i === 4 ? 10 : 8)).join('');
      const head = fmtRow(['', 'lab', 'subway', 'forest', 'desert', 'held-out']);
      const rows = ['single', 'multi'].map((p) => fmtRow([p, ...cols.map((c) => cell(T[p]?.[c]))]));
      panels.table.set({
        title: `Measured: Place successes / episodes${summaryTag ? ' (SMOKE: stub walls)' : ''}`,
        lines: [head, ...rows].map((t) => ({ text: t, mono: true, size: 26 })),
      });
    } else panels.table.set({ hidden: true });
    panels.counter.set(
      multiply
        ? {
            lines: [
              {
                text: `1 demo, ${multiply.episodes} episode${multiply.episodes === 1 ? '' : 's'}`,
                size: 40,
                bold: true,
                align: 'center',
                color: multiply.phase === 'done' ? '#5fe08f' : '#eef2f6',
              },
            ],
          }
        : { hidden: true },
    );
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

  // ---------- loop ----------
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const now = performance.now();
    if (xr.presenting) xr.update(dt);
    desktop.update(dt);
    if (robot) robot.update(dt);
    else if (multiplying()) {
      multiply!.update(dt);
      if (!multiplying()) challenges.freePlay = true;
    } else challenges.update(dt, currentAction);
    streamLight.update(dt);

    const src = robot ?? (multiplying() ? multiply! : challenges);
    const alpha = robot ? robot.alpha : src.acc * 30;
    renderState(src.prev, src.curr, Math.min(1, Math.max(0, alpha)), dt);
    if (holo) {
      const k = Math.min(1, Math.max(0, alpha));
      const p = src.prev.tip;
      const c = src.curr.tip;
      holo.interactive = !robot && !multiplying();
      holo.update(dt, [p[0] + (c[0] - p[0]) * k, p[1] + (c[1] - p[1]) * k, p[2] + (c[2] - p[2]) * k], src.curr);
    }
    if (pendingSnap) {
      dcam.capture(renderer, scene);
      thumbs.add(dcam.toCanvas(document.createElement('canvas')), pendingSnap);
      pendingSnap = null;
    }

    const a = holo ? desktop.action() : xr.presenting ? xr.action() ?? desktop.action() : desktop.action();
    marker.position.set(...a.target);
    marker.visible = !robot && !multiplying();
    const active = holo ? true : xr.presenting ? xr.active : desktop.engaged;
    (marker.material as THREE.MeshBasicMaterial).color.setHex(active ? 0xffb347 : 0x555b66);
    (marker.material as THREE.MeshBasicMaterial).opacity = active ? 0.95 : 0.5;

    if (xr.presenting) for (const p of Object.values(panels)) p.poke(xr.pokeTips(), now);
    updatePanels(now);
    Panel.inScene = xr.presenting;
    for (const p of Object.values(panels)) p.sync();
    ThumbWall.inScene = xr.presenting;
    thumbs.sync();
    renderer.render(scene, camera);
  });

  // ---------- debug / test hook ----------
  window.__backlot = {
    challenges,
    desktop,
    records,
    world,
    panels,
    sessionId,
    holo,
    /** screen position (CSS px) of a world point, for driving the mouse in tests */
    project(p: Vec3) {
      const v = new THREE.Vector3(...p).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    state: () => challenges.env.snapshot(),
    get robot() {
      return robot;
    },
    probeRobot,
    startRobot,
    get multiply() {
      return multiply;
    },
    thumbs,
    renderer,
    scene,
    dcam,
  };
}
