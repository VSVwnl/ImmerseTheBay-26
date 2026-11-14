// Evaluation harness (M4): /?mode=eval  (add &tag=smoke for runs on the stub wall)
// Fixed protocol: Place; success within 200 steps; seeds 9000-9019; worlds lab + the three held-out worlds;
// for each world: setWorld(fresh), wait for live, then both policies on the same seeds. Closed loop at 10 Hz of
// simulated time: render dataset camera -> send image + state -> receive action -> env.step(action, 0.1).
import type { Core } from '../core';
import { TaskEnv } from '../env/env';
import { DatasetCamera } from '../factory/camera';
import { actionFromVec, CONTROL_DT, stateVec } from '../factory/obs';
import { worldById } from '../world/world';
import { PolicyClient } from './client';

export const EVAL_PROTOCOL = Object.freeze({
  task: 'place',
  maxSteps: 200,
  seeds: Array.from({ length: 20 }, (_, i) => 9000 + i),
  worlds: ['lab', 'subway', 'forest', 'desert'],
  policies: ['single', 'multi'],
  dt: CONTROL_DT,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(body: unknown) {
  const r = await fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`log failed: ${await r.text()}`);
}

export function startEval(core: Core): void {
  const { renderer, scene, camera, world, streamLight, renderState } = core;
  const params = new URLSearchParams(location.search);
  const tag = params.get('tag') ?? '';
  const isDev = tag.startsWith('dev');
  const isSmoke = tag.startsWith('smoke') || isDev;
  // Development checks use other seeds and only the worlds asked for; the official protocol stays frozen.
  const P = isDev
    ? {
        ...EVAL_PROTOCOL,
        seeds: Array.from({ length: Number(params.get('n') ?? 20) }, (_, i) => 5000 + i),
        worlds: (params.get('worlds') ?? 'lab').split(','),
        policies: (params.get('policies') ?? 'single,multi').split(','),
      }
    : EVAL_PROTOCOL;
  document.getElementById('help')!.style.display = 'none';
  const dcam = new DatasetCamera();
  const client = new PolicyClient(`ws://localhost:${params.get('port') ?? 8765}`);

  const hud = document.getElementById('hud')!;
  const ui = document.createElement('div');
  ui.className = 'panel factory-panel';
  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = `Evaluation${tag ? ` (${tag})` : ''}`;
  const row = document.createElement('div');
  row.className = 'factory-row';
  const preview = document.createElement('canvas');
  preview.id = 'f-preview';
  const statsEl = document.createElement('div');
  statsEl.className = 'panel-line mono';
  row.append(preview, statsEl);
  const btns = document.createElement('div');
  btns.className = 'panel-buttons';
  const start = document.createElement('button');
  start.id = 'e-start';
  start.textContent = 'Run the fixed protocol';
  btns.appendChild(start);
  const table = document.createElement('div');
  table.className = 'panel-line mono f-log';
  ui.append(title, row, btns, table);
  hud.appendChild(ui);

  const stats = { phase: 'idle', done: 0, total: 0, world: '', policy: '', seed: 0, error: '', runId: '' };
  const tally = new Map<string, { s: number; n: number }>();
  const draw = () => {
    statsEl.textContent = [
      `phase    ${stats.phase}`,
      `episode  ${stats.done} / ${stats.total}`,
      `world    ${stats.world}   wall ${world.status()}`,
      `policy   ${stats.policy}   seed ${stats.seed}`,
      stats.error ? `error    ${stats.error}` : '',
    ].join('\n');
    const lines = [`${''.padEnd(8)}${P.worlds.map((w) => w.padStart(10)).join('')}`];
    for (const p of P.policies)
      lines.push(
        p.padEnd(8) +
          P.worlds
            .map((w) => {
              const c = tally.get(`${p}/${w}`);
              return (c ? `${c.s}/${c.n}` : '-').padStart(10);
            })
            .join(''),
      );
    table.textContent = lines.join('\n');
  };
  setInterval(draw, 250);
  draw();
  renderer.setAnimationLoop(() => {
    streamLight.update(1 / 60);
    renderer.render(scene, camera);
  });

  async function waitForWall() {
    for (;;) {
      const st = world.status();
      if (st === 'live') return;
      if (st === 'stub' && isSmoke) return;
      if (st === 'stub' && !world.liveCapable) throw new Error('the protocol needs a live Orbis wall (or tag=smoke*)');
      await sleep(200);
    }
  }

  async function run() {
    stats.phase = 'connecting';
    await client.connect();
    for (const p of P.policies)
      if (!client.policies.includes(p)) throw new Error(`policy server has no "${p}" policy (has ${client.policies.join(', ')})`);
    await world.probe();
    if (world.liveCapable && params.get('orbis') !== '0') await world.connect();
    stats.runId = `${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await post({ kind: 'eval-start', tag, runId: stats.runId, protocol: P });
    stats.total = P.worlds.length * P.policies.length * P.seeds.length;
    const env = new TaskEnv(0, 'place');
    for (const wid of P.worlds) {
      const def = worldById(wid)!;
      stats.world = def.label;
      await world.setWorld(def, 'fresh');
      await sleep(world.status() === 'stub' ? 1700 : 300);
      for (const seed of P.seeds)
        for (const policy of P.policies) {
          await waitForWall();
          stats.phase = 'running';
          stats.policy = policy;
          stats.seed = seed;
          env.reset(seed, 'place');
          let steps = 0;
          const wall = world.status();
          while (steps < P.maxSteps && !env.state().success) {
            const s = env.state();
            renderState(s, s, 1, 1);
            const rgb = dcam.capture(renderer, scene);
            if (steps % 5 === 0) dcam.toCanvas(preview, rgb);
            const a = await client.act(rgb, stateVec(s), policy);
            env.step(actionFromVec(a), CONTROL_DT);
            steps++;
          }
          const success = env.state().success;
          const k = `${policy}/${wid}`;
          const c = tally.get(k) ?? { s: 0, n: 0 };
          tally.set(k, { s: c.s + (success ? 1 : 0), n: c.n + 1 });
          await post({ kind: 'eval', tag, runId: stats.runId, world: wid, policy, seed, success, steps, wall });
          stats.done++;
        }
    }
    stats.phase = 'done';
    if (world.connected) await world.disconnect();
  }

  start.addEventListener('click', () => {
    start.disabled = true;
    void run().catch((e) => {
      stats.phase = 'error';
      stats.error = String(e?.message ?? e);
      console.error('[eval]', e);
    });
  });
  window.addEventListener('pagehide', () => void world.disconnect());
  window.__backlot = { stats, tally, world };
}
