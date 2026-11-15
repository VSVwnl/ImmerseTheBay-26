import * as THREE from 'three';
import type { Core } from '../core';
import { SIM_DT, type Vec3 } from '../config';
import { unlockAudio, sfx } from '../ui/sound';
import { DesktopInput } from '../input/desktop';
import { XRInput } from '../input/xr';
import { createRecoveryHud, type RecoveryAction, type RecoveryHudState, type RunMetrics } from './hud';
import { RecoverySession, type RecoveryPhase } from './session';
import type { RecoveryMetrics } from './engine';
import { dressWorkcell } from './workcell';
import { createMonitor } from './monitor';
import { createXrConsole } from './xr-console';
import { publishCast, readCast } from './cast';

const titles: Record<RecoveryPhase, string> = {
  baseline: 'Watch the standard pick',
  ready: 'Obstruct the pick lane',
  steering: 'Steering the live station',
  observe: 'Locate the blue tote',
  blocked: 'The route is blocked',
  teaching: 'Guide the recovery',
  saved: 'Your recovery is ready',
  replaying: 'Hands off. Robot in control.',
  result: 'Replay complete',
};
const hudPhases: Record<RecoveryPhase, RecoveryHudState['phase']> = {
  baseline: 'baseline',
  ready: 'standby',
  steering: 'standby',
  observe: 'standby',
  blocked: 'failed',
  teaching: 'teaching',
  saved: 'saved',
  replaying: 'replay',
  result: 'complete',
};
const metrics = (m?: RecoveryMetrics | null): RunMetrics | undefined =>
  m
    ? {
        success: m.success,
        collisions: m.collisions,
        pathM: m.pathLengthM,
        durationS: m.durationS,
      }
    : undefined;

function resizeToStage(core: Core, stage: HTMLElement) {
  const resize = () => {
    if (core.renderer.xr.isPresenting || !stage.clientWidth || !stage.clientHeight) return;
    core.renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    core.camera.aspect = stage.clientWidth / stage.clientHeight;
    core.camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  window.addEventListener('resize', resize);
  core.renderer.xr.addEventListener('sessionend', resize);
  resize();
}

export function startRecovery(core: Core) {
  const params = new URLSearchParams(location.search);
  const spectator = params.get('mode') === 'spectator';
  const allowLive = params.get('orbis') !== '0';
  if (spectator) document.body.classList.add('spectator');
  const { renderer, camera, scene, canvas, world } = core;
  const cell = dressWorkcell(core);
  const hud = createRecoveryHud(dispatch);
  const monitor = createMonitor(hud.feed);
  resizeToStage(core, hud.stage);
  core.marker.visible = false;

  if (spectator) {
    const wallTexture = new THREE.CanvasTexture(hud.feed);
    wallTexture.colorSpace = THREE.SRGBColorSpace;
    (core.stage.wall.material as THREE.MeshBasicMaterial).map = wallTexture;
    let polling = false,
      nextPoll = 0;
    const waiting = () =>
      hud.update(
        {
          phase: 'standby',
          phaseLabel: 'Waiting for station',
          title: 'Waiting for a station',
          caption:
            'Open the operator view on this server to follow its workcell, source frame and measured results.',
          available: [],
          mode: 'local',
          metrics: {},
          incident: '',
          feedCaption: 'Connect to the same demo server.',
        },
        true,
      );
    waiting();
    renderer.setAnimationLoop((now) => {
      if (polling || now < nextPoll) return;
      polling = true;
      nextPoll = now + 180;
      void readCast()
        .then((frame) => {
          if (!frame) {
            waiting();
            cell.showStream(false);
            cell.update(null, [], [], null);
            renderer.setClearColor(0x29342f, 1);
            renderer.clear();
            hud.feed.getContext('2d')?.clearRect(0, 0, hud.feed.width, hud.feed.height);
            return;
          }
          core.renderState(frame.state, frame.state, 1, 0.18);
          cell.update(frame.incident, frame.failed, frame.corrected, frame.contact, frame.replayContact);
          hud.update({ ...frame.hud, available: [], input: 'Spectator view' }, true);
          monitor.update(now, null, null, frame.incident, frame.state, frame.image);
          cell.showStream(frame.hud.mode === 'live' && !!frame.image);
          wallTexture.needsUpdate = true;
          renderer.render(scene, camera);
        })
        .catch(waiting)
        .finally(() => {
          polling = false;
        });
    });
    return;
  }

  const session = new RecoverySession(world, { allowLive });
  const xr = new XRInput(renderer);
  scene.add(xr.group);
  const desktop = new DesktopInput(
    canvas,
    camera,
    () => {},
    () => {},
  );
  desktop.enabled = false;
  const panel = createXrConsole(core, xr, hud.feed, dispatch);
  const xrOrigin = camera.position.clone(),
    xrLook = camera.quaternion.clone();
  let xrSupported = false,
    xrBusy = false,
    uiNotice = '',
    lastTime = 0,
    acc = 0,
    lastHud = 0,
    lastCast = 0;
  let needsAlignment = false,
    startedTracking = false;
  let connectedBefore = false,
    observedLiveError = '';
  let snapshot = session.state();
  let previous = snapshot;
  let seenPhase: RecoveryPhase | undefined;
  let view: RecoveryHudState = {};
  if (allowLive) void world.probe();
  if (navigator.xr)
    void navigator.xr
      .isSessionSupported('immersive-vr')
      .then((s) => {
        xrSupported = s;
      })
      .catch(() => {});
  renderer.xr.addEventListener('sessionstart', () => {
    document.body.classList.add('xr');
    // Quest Browser can finish the opening pick while the judge is still entering VR.
    if (!session.incident && (session.phase === 'baseline' || session.phase === 'ready')) {
      session.reset();
      previous = snapshot = session.state();
      lastTime = acc = 0;
    }
  });
  renderer.xr.addEventListener('sessionend', () => {
    document.body.classList.remove('xr');
    session.interruptTeaching('The headset session ended before the demonstration finished.');
    camera.position.copy(xrOrigin);
    camera.quaternion.copy(xrLook);
    camera.updateMatrixWorld();
    lastTime = 0;
    acc = 0;
  });
  async function enterXr() {
    if (!navigator.xr || xrBusy) return;
    xrBusy = true;
    try {
      const headset = await navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hand-tracking', 'layers'],
      });
      await renderer.xr.setSession(headset);
      void world
        .getVideo()
        .play()
        .catch(() => {});
    } catch (e) {
      uiNotice = 'Quest session could not start. ' + (e instanceof Error ? e.message : 'Try again.');
    } finally {
      xrBusy = false;
    }
  }
  function dispatch(action: RecoveryAction) {
    if (spectator) return;
    uiNotice = '';
    unlockAudio();
    switch (action) {
      case 'enter-xr':
        void enterXr();
        break;
      case 'reset':
        session.reset();
        break;
      case 'resume':
        void session.restore();
        break;
      case 'practice':
        connectedBefore = false;
        observedLiveError = '';
        session.practice('left');
        break;
      case 'steer-left':
      case 'steer-right': {
        const side = action === 'steer-left' ? 'left' : 'right';
        observedLiveError = '';
        if (session.skill && session.source === 'orbis') void session.challenge(side);
        else void session.steer(side);
        break;
      }
      case 'capture':
        session.capture();
        break;
      case 'confirm-left':
      case 'confirm-right':
        session.observe(action === 'confirm-left' ? 'left' : 'right');
        break;
      case 'retry':
        observedLiveError = '';
        void session.retrySteer();
        break;
      case 'teach':
        if (session.teach()) {
          needsAlignment = xr.presenting;
          startedTracking = false;
          desktop.target = [...session.state().tip];
          desktop.grip = 0;
          desktop.engaged = false;
          if (!xr.presenting) canvas.focus({ preventScroll: true });
        }
        break;
      case 'replay':
        session.replay();
        break;
      case 'next':
        void session.challenge();
        break;
      case 'download': {
        const episode = session.exportEpisode(),
          a = document.createElement('a');
        const url = URL.createObjectURL(new Blob([JSON.stringify(episode)], { type: 'application/json' }));
        a.href = url;
        a.download = 'backlot-' + episode.sessionId + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        break;
      }
    }
    previous = snapshot = session.state();
    lastHud = 0;
  }
  // The displayed, frozen image itself is a label target. The buttons are its accessible equivalent.
  hud.feed.addEventListener('click', (event) => {
    if (session.phase !== 'observe' || !session.frame) return;
    const rect = hud.feed.getBoundingClientRect();
    dispatch(event.clientX < rect.left + rect.width / 2 ? 'confirm-left' : 'confirm-right');
  });
  canvas.tabIndex = 0;
  window.addEventListener('pagehide', () => {
    void world.disconnect();
  });
  function getView(): RecoveryHudState {
    const phase = session.phase;
    const trials = session.exportEpisode().trials;
    const actions: RecoveryAction[] = ['reset'];
    if (xrSupported && !xr.presenting) actions.push('enter-xr');
    if (['ready', 'result', 'steering', 'observe'].includes(phase)) actions.push('practice');
    if (session.canRestore && (phase === 'ready' || (phase === 'baseline' && !session.incident)))
      actions.push('resume');
    if (trials.length) actions.push('download');
    if (['ready', 'observe', 'result', 'saved'].includes(phase) && allowLive && world.keyAvailable !== false)
      actions.push('steer-left', 'steer-right');
    if (phase === 'observe') {
      actions.push('capture', 'retry');
      if (session.frame) actions.push('confirm-left', 'confirm-right');
    }
    if (['blocked', 'result', 'saved'].includes(phase)) actions.push('teach');
    if (session.skill && ['saved', 'result', 'blocked'].includes(phase)) actions.push('replay', 'next');
    if (phase === 'ready' && allowLive && world.keyAvailable === false) {
      // Re-probe on a new setup after the operator restarts Vite with its team key.
      if (observedLiveError) actions.push('retry');
    }
    const recent = [...trials].reverse();
    const demo = recent.find((t) => t.kind === 'demonstration' && !!t.skill);
    const same = recent.find((t) => t.kind === 'same-incident-replay' && t.skillId === demo?.id);
    const fresh = recent.find((t) => t.kind === 'fresh-incident-replay' && t.skillId === demo?.id);
    const base = demo
      ? trials.find((t) => t.kind === 'nominal' && t.attempt.incident.seed === demo.attempt.incident.seed)
      : undefined;
    const local = session.source === 'practice';
    const live = world.status() === 'live' && !local;
    const mode =
      phase === 'steering' ? 'connecting' : live ? 'live' : observedLiveError && !local ? 'error' : 'local';
    let caption = session.message;
    if (phase === 'ready' && !live && (!allowLive || world.keyAvailable === false))
      caption = 'Choose Local rehearsal to introduce a blue tote into the standard pick path.';
    if (phase === 'teaching' && !xr.presenting)
      caption = session.state().held
        ? 'Carton secured. Clear the tote, position above the yellow tray, then release.'
        : 'Move the open gripper around the blue tote. Lower it onto the carton and click to grasp.';
    const feedCaption =
      phase === 'observe'
        ? session.frame
          ? 'Frozen frame · mark the side occupied by the tote'
          : 'Live infeed · freeze when the tote appears'
        : local
          ? 'Local workcell diagram · simulated incident'
          : live
            ? 'Live warehouse stream · Visko Orbis'
            : phase === 'steering'
              ? 'Awaiting generated frames'
              : world.keyAvailable && allowLive
                ? 'Live steering available'
                : 'Local workcell diagram';
    let title = titles[phase];
    if (phase === 'result')
      title = session.metrics.success
        ? 'The carton made it through'
        : session.metrics.collisions
          ? 'The saved route hit the tote'
          : 'The carton missed its tray';
    if (phase === 'blocked' && !session.metrics.collisions) title = 'The correction is incomplete';
    if (phase === 'teaching' && xr.presenting && needsAlignment) {
      caption = startedTracking
        ? 'Tracking paused. Return to the tool with the same grip to resume.'
        : 'Bring your open right hand to the gripper. Align the amber dot with the tool to start.';
    }
    if (session.recordingStatus) caption += ' ' + session.recordingStatus;
    return {
      phase: hudPhases[phase],
      phaseLabel:
        phase === 'blocked'
          ? session.metrics.collisions
            ? 'Contact detected'
            : 'Correction incomplete'
          : phase === 'observe'
            ? 'Inspect the stream'
            : phase === 'ready'
              ? 'Station ready'
              : phase === 'teaching'
                ? 'Recording demonstration'
                : phase === 'steering'
                  ? 'Steering'
                  : undefined,
      mode,
      frameFrozen: !!session.frame,
      title,
      caption: uiNotice || caption,
      available: actions,
      feedCaption,
      activeLane: session.incident?.side ?? null,
      incident: session.evidence
        ? 'Incident ' +
          String(session.incidentNumber).padStart(2, '0') +
          ' · ' +
          (local ? 'Local rehearsal' : 'Orbis observation')
        : '',
      input: xr.presenting
        ? 'Right hand guides the gripper · Pinch to grasp · Open to release'
        : 'Move mouse to reach · Wheel or W/S for height · Click or Space to grip',
      metrics: {
        clear: metrics(trials.find((t) => t.kind === 'clear-pick')?.attempt.metrics),
        baseline: metrics(base?.attempt.metrics ?? session.baselineMetrics),
        demonstration: metrics(demo?.attempt.metrics),
        recovery: metrics(same?.attempt.metrics),
        fresh: metrics(fresh?.attempt.metrics),
      },
      timeline: demo?.skill?.phases,
      skillSteps: demo?.skill?.steps,
      playheadStep: phase === 'replaying' ? Math.max(0, session.trace.length - 2) : undefined,
      evidenceImage: demo?.evidence?.frame?.image ?? null,
      evidenceLabel: demo?.evidence?.frame
        ? 'Saved source frame · ' + demo.evidence.side + ' lane'
        : undefined,
      runCount: trials.length,
      samples: demo?.attempt.samples.length,
      keyframes: demo?.skill?.keyframes.length,
    };
  }
  renderer.setAnimationLoop((now, frame) => {
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
    lastTime = now;
    if (xr.presenting) xr.update(dt);
    desktop.enabled = session.phase === 'teaching' && !xr.presenting;
    desktop.update(dt);
    const hand = xr.presenting && xr.mode !== 'controller' ? xr.rawHand(frame) : null;
    let action = xr.presenting
      ? xr.active && (!hand || hand.tracked)
        ? xr.action()
        : null
      : desktop.action();
    if (session.phase === 'teaching' && xr.presenting) {
      if (!action) needsAlignment = true;
      if (needsAlignment && action) {
        const current = session.state(),
          target = action.target;
        const distance = Math.hypot(...target.map((v, i) => v - current.tip[i]));
        if (action.grip === current.grip && distance < 0.12) {
          needsAlignment = false;
          startedTracking = true;
        } else action = null;
      }
    }
    acc += dt;
    while (acc >= SIM_DT) {
      previous = { ...session.state(), tip: [...session.state().tip], cubes: { ...session.state().cubes } };
      if (!(session.phase === 'teaching' && xr.presenting && needsAlignment && !startedTracking))
        session.tick(
          action,
          hand,
          xr.presenting ? (xr.mode === 'controller' ? 'controller' : 'hand') : 'mouse',
        );
      snapshot = session.state();
      acc -= SIM_DT;
    }
    core.renderState(previous, snapshot, Math.min(1, acc / SIM_DT), dt);
    const drawCorrected = ['teaching', 'replaying', 'saved', 'result'].includes(session.phase);
    const corrected = session.phase === 'saved' ? session.skillTrace : drawCorrected ? session.trace : [];
    const failed = session.phase === 'baseline' && session.incident ? session.trace : session.failedTrace;
    const contact = session.contact;
    cell.update(
      session.incident,
      failed,
      corrected,
      contact,
      session.phase === 'result' && session.metrics.collisions > 0,
    );
    const aim = xr.presenting ? (xr.active ? xr.action() : null) : action;
    core.marker.visible = session.phase === 'teaching' && !!aim;
    if (aim) core.marker.position.set(...aim.target);
    if (world.status() === 'live') connectedBefore = true;
    if (connectedBefore && world.status() === 'stub')
      observedLiveError = world.lastError || 'Live stream interrupted';
    const feedDirty = monitor.update(
      now,
      world.status() === 'live' && session.source !== 'practice' ? world.getVideo() : null,
      session.frame,
      session.incident,
      snapshot,
    );
    if (seenPhase !== session.phase) {
      if (session.phase === 'blocked' || (session.phase === 'result' && !session.metrics.success)) sfx.fail();
      if (session.phase === 'saved' || (session.phase === 'result' && session.metrics.success)) sfx.success();
    }
    if (!previous.held && snapshot.held && session.phase === 'teaching' && acc < dt) sfx.ding();
    if (!lastHud || now - lastHud > 160 || seenPhase !== session.phase) {
      seenPhase = session.phase;
      lastHud = now;
      view = getView();
      hud.update(view);
    }
    cell.showStream(world.status() === 'live' && session.source !== 'practice');
    panel.update(view, feedDirty, now);
    renderer.render(scene, camera);
    if (now - lastCast > 260) {
      lastCast = now;
      publishCast({
        sessionId: session.exportEpisode().sessionId,
        publishedAt: Date.now(),
        xr: xr.presenting,
        state: snapshot,
        incident: session.incident,
        failed,
        corrected,
        contact,
        replayContact: session.phase === 'result' && session.metrics.collisions > 0,
        hud: { ...view, evidenceImage: null },
        image:
          world.status() === 'live' && session.source !== 'practice'
            ? hud.feed.toDataURL('image/jpeg', 0.54)
            : null,
      });
    }
  });
  // Read-only introspection lets hardware and browser rehearsals inspect the same state operators see.
  window.__backlot = {
    state: () => session.state(),
    session,
    desktop,
    world,
    project: (p: Vec3) => {
      const v = new THREE.Vector3(...p).project(camera),
        r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) * r.width) / 2, y: r.top + ((1 - v.y) * r.height) / 2 };
    },
  };
}
