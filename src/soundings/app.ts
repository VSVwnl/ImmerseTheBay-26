import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HOME_TIP, WORKSPACE, WHEEL_STEP, type Vec3 } from '../config';
import { newSessionId } from '../tasks/recorder';
import { StubWorld } from '../world/stub';
import { WorldManager } from '../world/manager';
import type { WorldDef } from '../world/world';
import { SoundingsMission, cradleAt, handleAt, type Rig, type Site } from './mission';
import { SoundingsScene, type FrozenEvidence } from './scene';
import { Headset } from './headset';
import { AudienceFeed, DiveLog } from './telemetry';
import { SoundingsUI, type SoundingsAction, type SoundingsViewState } from './ui';

const initial = (): SoundingsViewState => ({
  phase: 'rig',
  arm: 'left',
  lamp: 'inner',
  aim: 'handle',
  prediction: null,
  stream: 'practice',
  xrAvailable: false,
  spectator: false,
  missionSide: 'port',
  success: false,
  elapsedSec: 0,
  closestCm: null,
  beforeFrame: null,
  afterFrame: null,
  note: '',
  symbolAnswer: null,
  mirrorAvailable: false,
  dockDone: false,
  waterTest: false,
  comparisonMode: 'lamp',
  hasWaterPair: false,
  waterFrame: null,
  evidenceSource: null,
  assessment: '',
  jawStatus: 'open',
  heightCm: 0,
});
const opposite = (a: Rig['arm']) => (a === 'port' ? 'starboard' : 'port');
const imageOf = (canvas: HTMLCanvasElement) => canvas.toDataURL('image/jpeg', 0.78);
function waterPrompt(rig: Rig, dense: boolean): WorldDef {
  const water = dense
    ? 'A thick cloud of fine bright suspended marine snow drifts past the stationary camera.'
    : 'The suspended silt settles and clear dark water opens in front of the lens.';
  const mount = rig.lamp === 'inner' ? 'next to the lens' : 'on the ' + rig.lamp + ' rail, well outside the lens';
  const beam = rig.aim === 'inward'
    ? 'aims inward and down at a patch of seafloor in the center of the camera view'
    : 'points straight forward, parallel to the camera axis';
  const light = 'One floodlight ' + mount + ' ' + beam + '. Suspended particles catch the beam.';
  return {
    id: 'monterey',
    label: 'Monterey Canyon',
    prompt:
      'One continuous fixed underwater shot in Monterey Canyon, California. Deep green-blue water, distant rocky seabed. Empty water column in the upper half. ' +
      water +
      ' ' +
      light +
      ' Camera and location remain stationary, no cuts, text or instruments.',
  };
}

async function spectator(host: HTMLElement) {
  const ui = new SoundingsUI(host, {
    onAction: (a) => {
      if (a.type === 'sound') void ui.audio.recover();
    },
  });
  const img = new Image();
  img.alt = 'Pilot camera relayed from the dive station';
  ui.viewport.append(img);
  ui.setState({ spectator: true, note: 'Waiting for the pilot station.' });
  const poll = async () => {
    try {
      const response = await fetch('/api/soundings/mirror', { cache: 'no-store' });
      if (!response.ok) throw Error();
      const packet = await response.json();
      if (packet) {
        img.src = packet.image;
        img.hidden = false;
        ui.setState({ ...packet.state, spectator: true, xrAvailable: false });
      } else {
        img.hidden = true;
        ui.setState({ ...initial(), spectator: true, note: 'Waiting for the pilot station.' });
      }
    } catch {
      img.hidden = true;
      ui.setState({ spectator: true, note: 'Pilot station disconnected.' });
    }
    window.setTimeout(poll, 250);
  };
  await poll();
}

export async function startSoundings(watching: boolean) {
  document.title = watching ? 'Soundings · Spectator' : 'Soundings · Monterey Canyon';
  document.body.replaceChildren();
  document.body.classList.add('soundings');
  if (watching) {
    await spectator(document.body);
    return;
  }

  let s = initial();
  const ui = new SoundingsUI(document.body, { onAction: act });
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.domElement.setAttribute('aria-label', 'ROV rigging bench. Drag to orbit the chassis.');
  const view = new SoundingsScene(renderer);
  ui.viewport.prepend(renderer.domElement, view.pilotCanvas);
  view.pilotCanvas.setAttribute(
    'aria-label',
    'Mounted pilot camera. Point to aim, scroll to lift, click to pinch.',
  );
  const orbit = new OrbitControls(view.benchCamera, renderer.domElement);
  orbit.target.set(0, 0.84, -0.82);
  orbit.minDistance = 0.85;
  orbit.maxDistance = 3.3;
  orbit.enablePan = false;
  orbit.maxPolarAngle = Math.PI * 0.48;
  orbit.update();
  const headset = new Headset(renderer, view, act);
  const world = new WorldManager(new StubWorld(1, 1, false));
  const offline = new URLSearchParams(location.search).get('orbis') === '0';
  const audience = new AudienceFeed();
  const waterInset = document.createElement('figure');
  waterInset.className = 'sd-water-inset';
  waterInset.hidden = true;
  const waterCaption = document.createElement('figcaption');
  waterInset.append(view.waterCanvas, waterCaption);
  ui.viewport.append(waterInset);
  const log = new DiveLog((message) => patch({ note: message }));
  let session = newSessionId(),
    attempt = 0;
  let rig: Rig = { arm: 'port', lamp: 'inner', aim: 'inward' };
  let site: Site = 'dock';
  let mission = new SoundingsMission(site, rig);
  let inAttempt = false,
    dense = false;
  let evidence: FrozenEvidence | null = null;
  let waterBefore: FrozenEvidence | null = null;
  let waterSteeringStart = 0;
  let waterPairs: {
    before: ReturnType<typeof storeFrame>;
    after: ReturnType<typeof storeFrame>;
    rig: Rig;
  }[] = [];
  let lampPair: { beforeFrame: string; afterFrame: string } | null = null;
  let steering: { at: string; stage: string; prompt: string; mediaTime: number }[] = [];
  let lastRecord: object | null = null;
  let target: Vec3 = [...HOME_TIP],
    grip: 0 | 1 = 0;
  let pilotWidth = 1,
    pilotHeight = 1;
  let lastPilot = -Infinity,
    lastFrame = performance.now(),
    lastTelemetry = 0;
  let lastInput = 'mouse';
  const keys = new Set<string>();
  const active = () => s.phase === 'dock' || s.phase === 'dive';
  const src = () => (world.status() === 'live' ? 'live' : 'practice');
  function patch(part: Partial<SoundingsViewState>) {
    Object.assign(s, part);
    ui.setState(part);
    headset.set(s, rig);
    waterInset.hidden = !s.waterTest;
    waterCaption.textContent =
      view.waterSource === 'live' ? 'Orbis · source frame' : 'Practice · source frame';
  }
  function storeFrame(e: FrozenEvidence) {
    return {
      image: imageOf(e.pilot),
      water: imageOf(e.water),
      source: e.source,
      mediaTime: e.mediaTime,
      capturedAt: e.capturedAt,
      pose: e.pose,
      rig: e.rig,
      site: e.site,
    };
  }
  function repaint() {
    view.update(mission.state, rig, site, 0);
    view.renderPilot();
    lastPilot = performance.now();
  }
  function snap() {
    repaint();
    return view.captureEvidence();
  }
  function resize() {
    const box = ui.viewport.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    if (!renderer.xr.isPresenting) renderer.setSize(box.width, box.height, false);
    view.resize(box.width, box.height);
    // CSS canvas and camera ray mapping use the identical, uncropped 16:9 sensor aperture.
    pilotWidth = Math.min(box.width, box.height * view.pilotCamera.aspect);
    pilotHeight = pilotWidth / view.pilotCamera.aspect;
    Object.assign(view.pilotCanvas.style, {
      position: 'absolute',
      width: pilotWidth + 'px',
      height: pilotHeight + 'px',
      left: '50%',
      top: '50%',
      right: 'auto',
      bottom: 'auto',
      transform: 'translate(-50%,-50%)',
      touchAction: 'none',
    });
  }
  function visibility() {
    const piloting = active() || s.phase === 'debrief';
    renderer.domElement.style.display = piloting && !renderer.xr.isPresenting ? 'none' : 'block';
    view.pilotCanvas.style.display = piloting ? 'block' : 'none';
    orbit.enabled = !piloting;
    resize();
  }
  function guide() {
    view.setGuides(s.phase === 'rig' && site !== 'mirror');
  }
  function setWater() {
    view.setWater(world.status() === 'live' ? world.getVideo() : null, world.status() === 'live');
  }
  function steer() {
    const def = waterPrompt(rig, dense);
    steering.push({
      at: new Date().toISOString(),
      stage: 'requested',
      prompt: def.prompt,
      mediaTime: world.getVideo().currentTime,
    });
    if (inAttempt) mission.steer(def.prompt, src());
    view.setTurbidity(dense);
    void world
      .setWorld(def, 'continuous')
      .catch(() => patch({ note: 'Steering request failed. Reconnect Orbis or continue in practice.' }));
  }
  world.onSteered = (def) => {
    steering.push({
      at: new Date().toISOString(),
      stage: 'sent',
      prompt: def.prompt,
      mediaTime: view.waterMediaTime,
    });
  };
  world.onVideoChange = setWater;
  world.onStatusChange = (status) => {
    setWater();
    patch({ stream: status === 'live' ? 'live' : status === 'loading' ? 'connecting' : 'practice' });
    if (world.lastError && status !== 'live' && status !== 'loading')
      patch({ note: 'Live connection interrupted. Practice water is active. Reconnect to retry.' });
  };
  async function connect(manual: boolean) {
    if (offline) {
      if (manual) patch({ note: 'Practice-only launch. Open the base URL to enable live Orbis.' });
      return;
    }
    if (world.connected) return;
    if (!(await world.probe())) {
      if (manual) patch({ note: 'No team key on this server. Practice water is active.' });
      return;
    }
    patch({ stream: 'connecting' });
    await world.connect();
    setWater();
    patch({
      stream: world.status() === 'live' ? 'live' : world.status() === 'loading' ? 'connecting' : 'practice',
    });
  }
  function preserve(outcome: string) {
    if (!inAttempt) return;
    if (!mission.state.success) mission.abort();
    const file = {
      ...mission.record,
      sessionId: session,
      attemptId: 'dive-' + String(++attempt).padStart(3, '0'),
      reason: outcome,
      input: lastInput,
      immersive: renderer.xr.isPresenting,
      steering: steering.slice(),
      waterTests: waterPairs.slice(),
      comparison: evidence
        ? {
            ...storeFrame(evidence),
            alternate: lampPair?.afterFrame ?? null,
            alternateRig: alternate(evidence.rig),
          }
        : null,
    };
    inAttempt = false;
    lastRecord = file;
    void log.save(file);
  }
  function alternate(base: Rig): Rig {
    return { ...base, lamp: base.lamp === 'inner' ? opposite(base.arm) : 'inner' };
  }
  function comparison() {
    if (!evidence) evidence = snap();
    const after = view.compareEvidence(evidence, alternate(evidence.rig));
    lampPair = { beforeFrame: imageOf(evidence.pilot), afterFrame: imageOf(after) };
    return lampPair;
  }
  function finish(review = true) {
    const success = mission.state.success;
    const pair = comparison();
    const symbol = mission.record.events.filter((e) => e.type === 'symbol').at(-1);
    const prediction = mission.record.prediction;
    const label =
      prediction === 'miss' ? 'short reach' : prediction === 'scatter' ? 'backscatter' : 'clear view';
    const reading =
      symbol?.type === 'symbol'
        ? symbol.correct
          ? 'Symbol identified.'
          : 'Symbol misread.'
        : 'No symbol reported.';
    const assessment =
      (prediction ? 'Predicted ' + label + '. ' : '') +
      reading +
      ' ' +
      mission.state.misses +
      ' missed grasps.';
    patch({
      ...pair,
      comparisonMode: 'lamp',
      hasWaterPair: waterPairs.length > 0,
      waterFrame: imageOf(evidence!.water),
      evidenceSource: evidence!.source,
      assessment,
      phase: review ? 'debrief' : 'rig',
      success,
      elapsedSec: mission.state.elapsedS,
      closestCm: Math.round(mission.state.closestM * 100),
      waterTest: false,
      mirrorAvailable: s.mirrorAvailable || (success && site === 'canyon'),
      note: mission.diagnosis(),
    });
    preserve(success ? 'delivered' : 'reviewed');
    guide();
    visibility();
    if (success && site !== 'dock') void ui.audio.recover();
  }
  function begin(destination: Site) {
    if (inAttempt) preserve('new-attempt');
    site = destination;
    mission = new SoundingsMission(site, rig, s.prediction ?? '');
    inAttempt = true;
    evidence = null;
    lampPair = null;
    waterBefore = null;
    waterPairs = [];
    target = [...HOME_TIP];
    grip = 0;
    headset.reanchor(target);
    dense = site !== 'dock';
    patch({
      phase: site === 'dock' ? 'dock' : 'dive',
      waterTest: false,
      hasWaterPair: false,
      assessment: '',
      comparisonMode: 'lamp',
      waterFrame: null,
      evidenceSource: null,
      symbolAnswer: null,
      beforeFrame: null,
      afterFrame: null,
      elapsedSec: 0,
      closestCm: null,
      success: false,
      jawStatus: 'open',
      heightCm: Math.round((target[1] - mission.state.handle[1]) * 100),
      note:
        site === 'dock'
          ? 'Touch the practice handle with the jaws.'
          : 'Read the symbol beside the handle. Grip, lift clear, then release over the cradle.',
    });
    guide();
    steer();
    visibility();
    repaint();
  }
  function bench(destination: Site, note: string) {
    site = destination;
    mission = new SoundingsMission(site, rig);
    waterBefore = null;
    steering = [];
    target = [...HOME_TIP];
    grip = 0;
    patch({
      phase: 'rig',
      waterTest: false,
      note,
      missionSide: site === 'mirror' ? 'starboard' : 'port',
      success: false,
    });
    guide();
    visibility();
    view.update(mission.state, rig, site, 0);
  }
  function reset() {
    if (inAttempt) {
      if (!evidence) evidence = snap();
      preserve('reset');
    }
    session = newSessionId();
    attempt = 0;
    evidence = null;
    lampPair = null;
    waterPairs = [];
    steering = [];
    ui.audio.reset();
    keys.clear();
    rig = { arm: 'port', lamp: 'inner', aim: 'inward' };
    s = { ...initial(), xrAvailable: s.xrAvailable, stream: s.stream };
    patch(s);
    dense = false;
    bench('dock', 'Rig the arm and light, then run the clear-water dock check.');
    steer();
  }
  function changeRig(a: SoundingsAction) {
    if (s.phase !== 'rig') return;
    const next = { ...rig };
    if (a.type === 'arm') {
      const side = a.side === 'left' ? 'port' : 'starboard';
      if (side === next.lamp) {
        patch({ note: 'That rail holds the lamp. Move the light to the inner socket first.' });
        return;
      }
      next.arm = side;
    } else if (a.type === 'lamp') {
      next.lamp = a.mount === 'inner' ? 'inner' : opposite(next.arm);
    } else if (a.type === 'aim') {
      next.aim = a.aim === 'handle' ? 'inward' : 'forward';
    }
    const illumination = next.lamp !== rig.lamp || next.aim !== rig.aim;
    rig = next;
    mission = new SoundingsMission(site, rig);
    patch({
      arm: rig.arm === 'port' ? 'left' : 'right',
      lamp: rig.lamp === 'inner' ? 'inner' : 'outer',
      aim: rig.aim === 'inward' ? 'handle' : 'forward',
      note: illumination
        ? 'Light seated. Inspect its beam and predict your camera view.'
        : 'Arm seated. Inspect the distance to the pickup.',
    });
    view.update(mission.state, rig, site, 0);
    if (illumination) steer();
  }
  function waterTest() {
    if (!active()) return;
    if (!s.waterTest) {
      waterBefore = snap();
      waterSteeringStart = steering.length;
      dense = !dense;
      patch({
        waterTest: true,
        note: 'Arm pose locked. Watch the symbol as the water changes, then capture the view.',
      });
      steer();
    } else if (waterBefore) {
      const after = snap();
      if (after.source !== waterBefore.source) {
        waterBefore = null;
        patch({ waterTest: false, note: 'Water source changed. Start the test again on the current source.' });
        return;
      }
      if (after.source === 'live') {
        const prompt = waterPrompt(rig, dense).prompt;
        const command = steering.slice(waterSteeringStart).find(event => event.stage === 'sent' && event.prompt === prompt);
        if (!command || after.mediaTime <= Math.max(command.mediaTime, waterBefore.mediaTime)) {
          patch({ note: 'Waiting for a frame after the steering command. Capture when the water visibly changes.' });
          return;
        }
      }
      waterPairs.push({ before: storeFrame(waterBefore), after: storeFrame(after), rig: { ...rig } });
      waterBefore = null;
      patch({ waterTest: false, note: 'Both water frames saved at the same pose. Resume piloting.' });
    }
  }
  function act(a: SoundingsAction) {
    void ui.audio.unlock().catch(() => {});
    switch (a.type) {
      case 'xr':
        void headset.enter().catch((e) => patch({ note: String(e.message ?? e) }));
        break;
      case 'connect':
        void connect(true);
        break;
      case 'arm':
      case 'lamp':
      case 'aim':
        changeRig(a);
        break;
      case 'prediction':
        if (s.phase === 'rig') patch({ prediction: a.prediction });
        break;
      case 'dock':
        if (s.phase === 'rig') begin('dock');
        break;
      case 'dive':
        if (s.phase === 'rig' && s.dockDone && s.prediction) begin(site === 'mirror' ? 'mirror' : 'canyon');
        else if (s.phase === 'rig') patch({ note: 'Choose your prediction before deploying.' });
        break;
      case 'symbol':
        if (s.phase === 'dive') {
          mission.reportSymbol(a.symbol, site === 'canyon' ? 'ring' : 'bars');
          patch({ symbolAnswer: a.symbol });
        }
        break;
      case 'waterTest':
        waterTest();
        break;
      case 'compare': {
        if (s.phase !== 'debrief') break;
        const pair = waterPairs.at(-1);
        if (a.mode === 'water' && pair)
          patch({
            comparisonMode: 'water',
            beforeFrame: pair.before.image,
            afterFrame: pair.after.image,
            waterFrame: pair.after.water,
            evidenceSource: pair.after.source,
          });
        else if (a.mode === 'lamp' && lampPair && evidence)
          patch({
            ...lampPair,
            comparisonMode: 'lamp',
            waterFrame: imageOf(evidence.water),
            evidenceSource: evidence.source,
          });
        break;
      }
      case 'grip':
        if (active()) grip = grip ? 0 : 1;
        break;
      case 'debrief':
        if (active()) finish();
        break;
      case 'retry':
      case 'resume': {
        const hint = active() ? mission.diagnosis() : 'Choose your next rig and make a prediction.';
        if (inAttempt) {
          Object.assign(s, comparison());
          preserve('refit');
        }
        bench(site, hint);
        break;
      }
      case 'mirror':
        if (s.mirrorAvailable) {
          patch({ prediction: null, symbolAnswer: null });
          bench('mirror', 'New pickup on the opposite side. Choose a rail and predict the outcome.');
        }
        break;
      case 'sound':
        void ui.audio.recover();
        break;
      case 'reset':
        reset();
        break;
    }
  }

  const sensor = view.pilotCanvas;
  sensor.tabIndex = 0;
  sensor.addEventListener('pointerenter', () => {
    if (active()) sensor.focus({ preventScroll: true });
  });
  sensor.addEventListener('pointermove', (e) => {
    if (!active() || s.waterTest) return;
    const p = view.pointerTarget(e.clientX, e.clientY, sensor.getBoundingClientRect(), target[1]);
    if (p) target = p;
  });
  sensor.addEventListener('pointerdown', (e) => {
    if (e.button === 0 && active()) {
      e.preventDefault();
      act({ type: 'grip' });
    }
  });
  sensor.addEventListener(
    'wheel',
    (e) => {
      if (active()) {
        e.preventDefault();
        target[1] = THREE.MathUtils.clamp(
          target[1] - e.deltaY * WHEEL_STEP,
          WORKSPACE.min[1],
          WORKSPACE.max[1],
        );
      }
    },
    { passive: false },
  );
  window.addEventListener('keydown', (e) => {
    if (!active() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space' && !(e.target as Element)?.closest('button,select,input')) {
      e.preventDefault();
      if (!e.repeat) act({ type: 'grip' });
    }
    if (e.code === 'KeyW' || e.code === 'KeyS') keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  new ResizeObserver(resize).observe(ui.viewport);
  renderer.xr.addEventListener('sessionstart', visibility);
  renderer.xr.addEventListener('sessionend', () => {
    visibility();
    headset.reanchor(target);
  });
  void navigator.xr
    ?.isSessionSupported('immersive-vr')
    .then((xrAvailable) => patch({ xrAvailable }))
    .catch(() => {});
  if (!offline) document.addEventListener('pointerdown', () => void connect(false), { once: true });
  window.addEventListener('pagehide', () => {
    if (inAttempt) preserve('left-station');
    void world.disconnect();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) reset();
  });
  patch(s);
  bench('dock', 'Rig the arm and light, then run the clear-water dock check.');
  steer();

  renderer.setAnimationLoop((now) => {
    const dt = Math.max(0, Math.min(0.1, (now - lastFrame) / 1000));
    lastFrame = now;
    const xr = renderer.xr.isPresenting;
    const hand = xr ? headset.action(dt) : null;
    if (active() && !s.waterTest) {
      if (keys.size)
        target[1] = THREE.MathUtils.clamp(
          target[1] + ((keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)) * 0.28 * dt,
          WORKSPACE.min[1],
          WORKSPACE.max[1],
        );
      if (hand) {
        target = hand.target;
        grip = hand.grip;
        lastInput = headset.input.mode ?? 'hand';
      } else if (!xr) lastInput = 'mouse';
      const old = mission.record.events.length;
      mission.step({ target, grip }, dt);
      view.update(mission.state, rig, site, dt);
      const events = mission.record.events.slice(old);
      if (events.some((e) => e.type === 'grasp' || e.type === 'miss')) {
        evidence = snap();
        mission.frame(imageOf(evidence.pilot), evidence.source);
        patch({ note: mission.diagnosis() });
      }
      if (events.some((e) => e.type === 'drop' || e.type === 'snag')) patch({ note: mission.diagnosis() });
      if (mission.state.success) {
        if (site === 'dock') {
          preserve('dock-cleared');
          patch({ dockDone: true, prediction: null });
          bench('canyon', 'Dock check passed. Inspect the canyon pickup and predict your first dive.');
        } else finish();
      }
    } else view.update(mission.state, rig, site, dt);
    if (now - lastPilot > (active() || xr ? 60 : 200)) {
      view.renderPilot();
      lastPilot = now;
    }
    if (xr) headset.render(now);
    else if (s.phase === 'rig') {
      orbit.update();
      renderer.render(view.scene, view.benchCamera);
    }
    if (active() && now - lastTelemetry > 350) {
      lastTelemetry = now;
      patch({
        elapsedSec: Math.floor(mission.state.elapsedS),
        closestCm: Math.round(mission.state.closestM * 1000) / 10,
        jawStatus: mission.state.held ? 'carrying' : mission.state.grip ? 'closed' : 'open',
        heightCm: Math.round((mission.state.tip[1] - handleAt(site)[1]) * 100),
      });
    }
    audience.send(now, sensor, s);
  });
  // Read-only inspection surface for repeatable input-driven browser and headset rehearsals.
  Object.assign(window, {
    __soundings: {
      snapshot: () => ({
        phase: s.phase,
        rig: { ...rig },
        site,
        tip: [...mission.state.tip],
        handle: [...mission.state.handle],
        grip,
        held: mission.state.held,
        target: [...target],
        cradle: cradleAt(site),
        elapsedS: mission.state.elapsedS,
        waterTest: s.waterTest,
        dockDone: s.dockDone,
        saved: log.saved,
        source: s.stream,
        immersive: renderer.xr.isPresenting,
        session,
        rect: sensor.getBoundingClientRect().toJSON(),
      }),
      project: (p: Vec3) => {
        const r = sensor.getBoundingClientRect(),
          v = new THREE.Vector3(...p).project(view.pilotCamera);
        return { x: r.x + ((1 + v.x) * r.width) / 2, y: r.y + ((1 - v.y) * r.height) / 2 };
      },
      lastRecord: () => structuredClone(lastRecord),
    },
  });
}
