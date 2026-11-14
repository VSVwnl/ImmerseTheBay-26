// The data factory (M3 Part B): /?mode=factory&dataset=multi&episodes=300
// Replays expert and human Place episodes across the dataset's world schedule, renders the dataset camera
// each 10 Hz step and streams {image, state, action, meta} to the Python data server.
import type { Core } from '../core';
import { TaskEnv } from '../env/env';
import { TRAINING_WORLDS, worldById, type WorldDef } from '../world/world';
import { DatasetCamera, rgbToBase64 } from './camera';
import { expertSource, humanSource, usableHumanDemos, type EpisodeSource } from './episodes';
import { actionVec, CONTROL_DT, MAX_STEPS, stateVec } from './obs';
import type { AttemptRecord } from '../tasks/recorder';
import { FACTORY } from '../config';

export interface PlannedEpisode {
  index: number;
  world: WorldDef;
  source: () => EpisodeSource;
  kind: 'expert' | 'human';
  seed: number;
  noise: boolean;
}

/** The dataset schedule. `single` uses lab only; `multi` (and smoke) change world every 10 episodes. */
export function planEpisodes(dataset: string, nExpert: number, humans: AttemptRecord[], schedule?: 'single' | 'multi'): PlannedEpisode[] {
  const sched = schedule ?? (dataset === 'single' ? 'single' : 'multi');
  const lab = worldById('lab')!;
  const list: Omit<PlannedEpisode, 'index' | 'world'>[] = [];
  for (let i = 0; i < nExpert; i++) {
    const seed = FACTORY.seedBase + i;
    const noise = i % 2 === 1;
    list.push({ kind: 'expert', seed, noise, source: () => expertSource(seed, noise) });
  }
  for (const h of humans) list.push({ kind: 'human', seed: h.seed, noise: false, source: () => humanSource(h) });
  return list.map((e, index) => ({
    ...e,
    index,
    world: sched === 'single' ? lab : TRAINING_WORLDS[Math.floor(index / FACTORY.worldEvery) % TRAINING_WORLDS.length],
  }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startFactory(core: Core): void {
  const { renderer, scene, camera, world, streamLight, renderState } = core;
  const params = new URLSearchParams(location.search);
  const dataset = params.get('dataset') ?? 'smoke';
  const nExpert = Number(params.get('episodes') ?? 10);
  const port = Number(params.get('port') ?? 8765);
  const useHumans = params.get('humans') !== '0';
  const schedule = (params.get('schedule') as 'single' | 'multi' | null) ?? undefined;
  const isSmoke = dataset.startsWith('smoke');
  document.getElementById('help')!.style.display = 'none';

  const dcam = new DatasetCamera();
  const hud = document.getElementById('hud')!;
  const ui = document.createElement('div');
  ui.className = 'panel factory-panel';
  ui.innerHTML = `
    <div class="panel-title">Data factory</div>
    <div class="panel-line bold" id="f-title"></div>
    <div class="factory-row"><canvas id="f-preview" width="96" height="96"></canvas>
      <div id="f-stats" class="panel-line mono"></div></div>
    <div class="panel-buttons" style="grid-template-columns:1fr 1fr">
      <button id="f-start">Start</button><button id="f-stop" disabled>Stop</button></div>
    <div id="f-log" class="panel-line mono f-log"></div>`;
  hud.appendChild(ui);
  const $ = (id: string) => document.getElementById(id)!;
  $('f-title').textContent = `dataset "${dataset}", ${nExpert} expert episodes${useHumans ? ' + human Place demos' : ''}`;
  const preview = $('f-preview') as HTMLCanvasElement;

  const stats = {
    phase: 'idle' as 'idle' | 'loading' | 'waiting-wall' | 'running' | 'done' | 'error',
    planned: 0,
    done: 0,
    saved: 0,
    discarded: 0,
    steps: 0,
    stepsPerSec: 0,
    world: '',
    error: '',
    humans: 0,
  };
  const log = (msg: string) => {
    const el = $('f-log');
    el.textContent = `${new Date().toLocaleTimeString()} ${msg}\n${el.textContent}`.slice(0, 4000);
    console.info('[factory]', msg);
  };
  const render = () => {
    $('f-stats').textContent = [
      `phase     ${stats.phase}`,
      `episodes  ${stats.done} / ${stats.planned}`,
      `saved     ${stats.saved}   discarded ${stats.discarded}`,
      `steps/s   ${stats.stepsPerSec.toFixed(0)}`,
      `world     ${stats.world}`,
      `wall      ${world.status()}`,
      `humans    ${stats.humans}`,
      stats.error ? `error     ${stats.error}` : '',
    ].join('\n');
  };
  setInterval(render, 250);
  render();

  // keep the main view alive at a low rate (the loop itself is not tied to it)
  let liveView = true;
  renderer.setAnimationLoop(() => {
    if (!liveView) return;
    streamLight.update(1 / 60);
    renderer.render(scene, camera);
  });

  let stopRequested = false;
  $('f-stop').addEventListener('click', () => {
    stopRequested = true;
  });
  $('f-start').addEventListener('click', () => {
    ($('f-start') as HTMLButtonElement).disabled = true;
    ($('f-stop') as HTMLButtonElement).disabled = false;
    void world.getVideo().play().catch(() => {});
    void run().catch((e) => {
      stats.phase = 'error';
      stats.error = String(e?.message ?? e);
      log(`error: ${stats.error}`);
    });
  });

  async function connectServer(): Promise<WebSocket> {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`cannot reach the data server on ws://localhost:${port} (run: python py/data_server.py)`));
    });
    return ws;
  }

  const acks: ((m: any) => void)[] = [];
  function waitAck(timeoutMs = 10000): Promise<any> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('data server did not acknowledge the episode')), timeoutMs);
      acks.push((m) => {
        clearTimeout(t);
        resolve(m);
      });
    });
  }

  async function waitForWall(): Promise<void> {
    // never record a loading wall; a stub wall only into smoke datasets
    for (;;) {
      const st = world.status();
      if (st === 'live') return;
      if (st === 'stub' && isSmoke) return;
      if (st === 'stub' && !isSmoke && (!world.liveCapable || params.get('orbis') === '0'))
        throw new Error(`dataset "${dataset}" needs a live Orbis wall, and there is no key. Use dataset=smoke.`);
      stats.phase = 'waiting-wall';
      await sleep(200);
      if (stopRequested) throw new Error('stopped');
    }
  }

  async function run() {
    stats.phase = 'loading';
    await world.probe();
    if (world.liveCapable && params.get('orbis') !== '0') await world.connect();
    const ws = await connectServer();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'error') log(`server error: ${m.error}`);
      else acks.shift()?.(m);
    };
    let humans: AttemptRecord[] = [];
    if (useHumans) {
      const recs: AttemptRecord[] = await fetch('/api/sessions?challenge=place&success=1').then((r) => r.json());
      humans = usableHumanDemos(recs);
      log(`human Place demos: ${humans.length} usable of ${recs.length}`);
    }
    stats.humans = humans.length;
    const plan = planEpisodes(dataset, nExpert, humans, schedule);
    if (plan.some((p) => p.world.heldOut)) throw new Error('held-out world in schedule');
    stats.planned = plan.length;

    const env = new TaskEnv(0, 'place');
    let currentWorld: string | null = null;
    let stepCount = 0;
    let t0 = performance.now();
    for (const ep of plan) {
      if (stopRequested) break;
      stats.world = ep.world.label;
      if (ep.world.id !== currentWorld) {
        await world.setWorld(ep.world, 'fresh');
        currentWorld = ep.world.id;
        // the stub cross-fades; Orbis reports loading until frames arrive
        await sleep(world.status() === 'stub' ? FACTORY.stubSettleMs : 300);
      }
      await waitForWall();
      stats.phase = 'running';
      const src = ep.source();
      env.reset(ep.seed, 'place');
      const meta = { world: ep.world.id, prompt: ep.world.prompt, seed: ep.seed, source: ep.kind, noise: ep.noise, wall: world.status() };
      ws.send(JSON.stringify({ type: 'begin', dataset, episode: ep.index, meta }));
      let steps = 0;
      let wallOk = true;
      while (steps < (ep.kind === 'human' ? 600 : MAX_STEPS) && !env.state().success) {
        const s = env.state();
        const a = src.next(s);
        if (!a) break;
        if (world.status() !== 'live' && !(isSmoke && world.status() === 'stub')) {
          wallOk = false; // the wall dropped mid-episode: discard this one
          break;
        }
        renderState(s, s, 1, 1); // dt=1: fingers and cube falls settle instantly for each frame
        const rgb = dcam.capture(renderer, scene);
        ws.send(JSON.stringify({ type: 'step', image: rgbToBase64(rgb), state: stateVec(s), action: actionVec(a.saved) }));
        env.step(a.executed, CONTROL_DT);
        steps++;
        stepCount++;
        stats.steps++;
        if (stepCount % 5 === 0) dcam.toCanvas(preview, rgb);
        const el = (performance.now() - t0) / 1000;
        if (el > 1) {
          stats.stepsPerSec = stepCount / el;
          stepCount = 0;
          t0 = performance.now();
        }
        while (ws.bufferedAmount > 4 * 1024 * 1024) await sleep(5);
        await sleep(0);
      }
      const success = env.state().success && wallOk;
      ws.send(JSON.stringify({ type: 'end', success }));
      const ack = await waitAck();
      stats.done++;
      if (ack.type === 'saved') stats.saved++;
      else {
        stats.discarded++;
        log(`episode ${ep.index} discarded: ${ack.reason}`);
      }
    }
    stats.phase = 'done';
    log(`finished: ${stats.saved} saved, ${stats.discarded} discarded`);
    ws.close();
    liveView = true;
    if (world.connected) await world.disconnect();
  }

  window.addEventListener('pagehide', () => void world.disconnect());
  window.__backlot = { stats, world, planEpisodes };
}
