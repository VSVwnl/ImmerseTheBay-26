import { describe, expect, it } from 'vitest';
import { forwardKinematics, solveIK } from '../src/arm/ik';
import { binUnder, findGrab, settle } from '../src/arm/grasp';
import { TaskEnv, clampToWorkspace, type Action } from '../src/env/env';
import { BIN_POS, CUBE_SPAWN, SIM_DT, WORKSPACE, type Vec3 } from '../src/config';
import { Recorder, replayRecord } from '../src/tasks/recorder';

const near = (a: Vec3, b: Vec3, eps = 1e-9) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < eps;

/** Drive the env to a point and wait until the tip arrives. */
function goTo(env: TaskEnv, p: Vec3, grip: 0 | 1, maxSteps = 200, log?: Action[]) {
  for (let i = 0; i < maxSteps; i++) {
    const a: Action = { target: p, grip };
    log?.push(a);
    env.step(a, SIM_DT);
    if (near(env.state().tip, clampToWorkspace(p), 1e-6)) break;
  }
}

describe('IK', () => {
  it('reaches every point of a workspace grid exactly, tool pointing down', () => {
    const n = 6;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++)
        for (let k = 0; k <= n; k++) {
          const t: Vec3 = [
            WORKSPACE.min[0] + ((WORKSPACE.max[0] - WORKSPACE.min[0]) * i) / n,
            WORKSPACE.min[1] + ((WORKSPACE.max[1] - WORKSPACE.min[1]) * j) / n,
            WORKSPACE.min[2] + ((WORKSPACE.max[2] - WORKSPACE.min[2]) * k) / n,
          ];
          const r = solveIK(t);
          const fk = forwardKinematics(r.joints);
          // tool vertical: wrist directly above tip
          expect(Math.abs(fk.wrist[0] - fk.tip[0])).toBeLessThan(1e-9);
          expect(Math.abs(fk.wrist[2] - fk.tip[2])).toBeLessThan(1e-9);
          if (!r.clamped) expect(near(r.tip, t, 1e-9)).toBe(true);
          else expect(Math.hypot(...(r.tip.map((v, q) => v - t[q]) as Vec3))).toBeLessThan(0.1);
        }
  });

  it('is elbow-up', () => {
    const r = solveIK([0, 0.8, -0.6]);
    const fk = forwardKinematics(r.joints);
    expect(fk.elbow[1]).toBeGreaterThan(fk.shoulder[1]);
  });

  it('clamps unreachable targets and reports the actual tip', () => {
    const r = solveIK([0, 3, 0]);
    expect(r.clamped).toBe(true);
    expect(near(r.tip, [0, 3, 0], 0.01)).toBe(false);
  });
});

describe('grasp', () => {
  it('grabs the nearest cube in radius only', () => {
    expect(findGrab([0, 0.8, -0.7], { red: [0, 0.775, -0.7], blue: [0.03, 0.775, -0.7] })).toBe('red');
    expect(findGrab([0, 0.9, -0.7], { red: [0, 0.775, -0.7] })).toBe(null);
  });
  it('settles into bins and onto the table', () => {
    expect(binUnder(BIN_POS.red)).toBe('red');
    const r = settle([BIN_POS.blue[0], 1.0, BIN_POS.blue[2]]);
    expect(r.bin).toBe('blue');
    expect(r.pos[1]).toBeCloseTo(0.775);
    expect(settle([0, 1.0, -0.7]).bin).toBe(null);
    expect(settle([2, 1.0, -0.7]).offTable).toBe(true);
  });
});

describe('env', () => {
  it('limits tip speed', () => {
    const env = new TaskEnv(1, 'place');
    const before = [...env.state().tip] as Vec3;
    env.step({ target: [0.4, 0.76, -0.45], grip: 0 }, 0.1);
    const after = env.state().tip;
    expect(Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2])).toBeLessThanOrEqual(0.06 + 1e-9);
  });

  it('spawns cubes in the spawn area, apart, from the seed', () => {
    for (let seed = 0; seed < 200; seed++) {
      const env = new TaskEnv(seed, 'sort');
      const { red, blue } = env.state().cubes;
      for (const c of [red!, blue!]) {
        expect(c[0]).toBeGreaterThanOrEqual(CUBE_SPAWN.xMin);
        expect(c[0]).toBeLessThanOrEqual(CUBE_SPAWN.xMax);
        expect(c[2]).toBeGreaterThanOrEqual(CUBE_SPAWN.zMin);
        expect(c[2]).toBeLessThanOrEqual(CUBE_SPAWN.zMax);
      }
      expect(Math.hypot(red![0] - blue![0], red![2] - blue![2])).toBeGreaterThanOrEqual(CUBE_SPAWN.minSep);
    }
    expect(new TaskEnv(5, 'place').state().cubes).toEqual(new TaskEnv(5, 'place').state().cubes);
    expect(new TaskEnv(5, 'place').state().cubes).not.toEqual(new TaskEnv(6, 'place').state().cubes);
  });

  it('completes place by pick and drop, counting drops and wrong bins', () => {
    const env = new TaskEnv(3, 'sort');
    const red = env.state().cubes.red!;
    goTo(env, [red[0], red[1] + 0.1, red[2]], 0);
    goTo(env, red, 0);
    env.step({ target: red, grip: 1 }, SIM_DT);
    expect(env.state().held).toBe('red');
    // drop red in the blue bin: wrong bin
    goTo(env, [BIN_POS.blue[0], 0.95, BIN_POS.blue[2]], 1);
    env.step({ target: [BIN_POS.blue[0], 0.95, BIN_POS.blue[2]], grip: 0 }, SIM_DT);
    expect(env.state().wrongBin).toBe(1);
    expect(env.state().drops).toBe(1);
    expect(env.state().held).toBe(null);
    expect(env.state().success).toBe(false);
  });

  it('reach advances targets in order', () => {
    const env = new TaskEnv(11, 'reach');
    const targets = env.state().reachTargets;
    expect(targets).toHaveLength(3);
    goTo(env, targets[1], 0); // out of order: no progress
    expect(env.state().reachIndex).toBe(0);
    for (const t of targets) goTo(env, t, 0);
    expect(env.state().reachIndex).toBe(3);
    expect(env.state().success).toBe(true);
  });
});

function scriptedSort(env: TaskEnv, log: Action[]) {
  for (const c of ['red', 'blue'] as const) {
    const p = env.state().cubes[c]!;
    goTo(env, [p[0], p[1] + 0.1, p[2]], 0, 200, log);
    goTo(env, p, 0, 200, log);
    for (let i = 0; i < 3; i++) {
      log.push({ target: p, grip: 1 });
      env.step({ target: p, grip: 1 }, SIM_DT);
    }
    const b = BIN_POS[c];
    goTo(env, [p[0], 0.95, p[2]], 1, 200, log);
    goTo(env, [b[0], 0.95, b[2]], 1, 200, log);
    for (let i = 0; i < 3; i++) {
      log.push({ target: [b[0], 0.95, b[2]], grip: 0 });
      env.step({ target: [b[0], 0.95, b[2]], grip: 0 }, SIM_DT);
    }
  }
}

describe('determinism and replay', () => {
  it('same seed + actions + dt => identical state', () => {
    const run = () => {
      const env = new TaskEnv(42, 'sort');
      scriptedSort(env, []);
      return env.snapshot();
    };
    const a = run();
    expect(a.success).toBe(true);
    expect(run()).toEqual(a);
  });

  it('a recorded attempt replays to the same success state', () => {
    for (const seed of [1, 2, 3, 100, 12345]) {
      const env = new TaskEnv(seed, 'sort');
      const rec = new Recorder();
      rec.start({ sessionId: 's', attemptId: '0001', challenge: 'sort', seed, world: null, input: 'mouse' });
      const log: Action[] = [];
      // run the script against a shadow env to get the actions, then record them live
      scriptedSort(new TaskEnv(seed, 'sort'), log);
      for (const a of log) {
        rec.sample(env.state(), a);
        env.step(a, SIM_DT);
      }
      const record = JSON.parse(JSON.stringify(rec.finish(env.state())!));
      expect(record.success).toBe(true);
      expect(record.samples.length).toBe(log.length);
      const replayed = replayRecord(record);
      expect(replayed.success).toBe(true);
      expect(replayed.cubes).toEqual(env.state().cubes);
      expect(replayed.drops).toBe(record.drops);
    }
  });
});
