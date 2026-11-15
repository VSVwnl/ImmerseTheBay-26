// Robot Workshop: arm/tool parts, grab rules, the three Workshop challenges, recording and replay.
import { describe, expect, it } from 'vitest';
import { forwardKinematics, maxReach, shoulderPoint, solveIK } from '../src/arm/ik';
import { COMPACT_LINKS, LONG_LINKS, STANDARD_ROBOT, linksFor, workspaceFor, type RobotParts } from '../src/arm/parts';
import { ITEMS, failText, grabRule, type ItemId } from '../src/arm/items';
import { TaskEnv, clampToWorkspace, type Action, type WorkshopLayout } from '../src/env/env';
import { BIN_POS, L1, L2, SIM_DT, WORKSHOP, WORKSPACE, type Vec3 } from '../src/config';
import { Recorder, replayRecord } from '../src/tasks/recorder';
import { Challenges } from '../src/tasks/challenges';

const near = (a: Vec3, b: Vec3, eps: number) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < eps;
const ROBOTS: RobotParts[] = [
  { arm: 'compact', tool: 'gripper' },
  { arm: 'compact', tool: 'suction' },
  { arm: 'long', tool: 'gripper' },
  { arm: 'long', tool: 'suction' },
];
const key = (r: RobotParts) => `${r.arm}+${r.tool}`;

function grid(ws: { min: Vec3; max: Vec3 }, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++)
      for (let k = 0; k <= n; k++)
        out.push([0, 1, 2].map((q) => ws.min[q] + ((ws.max[q] - ws.min[q]) * [i, j, k][q]) / n) as Vec3);
  return out;
}

describe('IK for both arms', () => {
  it('Long links are 35% longer; Compact links are the original L1/L2', () => {
    expect(COMPACT_LINKS).toEqual({ l1: L1, l2: L2 });
    expect(LONG_LINKS.l1).toBeCloseTo(L1 * 1.35, 12);
    expect(LONG_LINKS.l2).toBeCloseTo(L2 * 1.35, 12);
  });

  it('the standard arm solves exactly as before (default links = Compact)', () => {
    for (const t of grid(WORKSPACE, 4)) expect(solveIK(t, COMPACT_LINKS)).toEqual(solveIK(t));
  });

  for (const arm of ['compact', 'long'] as const) {
    it(`${arm}: reaches its workspace, tool pointing down (Compact clamps only at its high far corners, as before)`, () => {
      const links = linksFor(arm);
      let clamped = 0;
      for (const t of grid(workspaceFor(arm), 6)) {
        const r = solveIK(t, links);
        if (r.clamped) {
          clamped++;
          expect(arm).toBe('compact');
          expect(t[1]).toBeGreaterThan(1.0); // never at table height, where the objects are
          expect(Math.hypot(...(r.tip.map((v, q) => v - t[q]) as Vec3))).toBeLessThan(0.1);
        } else expect(near(r.tip, t, 1e-9)).toBe(true);
        const fk = forwardKinematics(r.joints, links);
        expect(Math.abs(fk.wrist[0] - fk.tip[0])).toBeLessThan(1e-9);
        expect(Math.abs(fk.wrist[2] - fk.tip[2])).toBeLessThan(1e-9);
        // link lengths hold
        expect(Math.hypot(...(fk.elbow.map((v, q) => v - fk.shoulder[q]) as Vec3))).toBeCloseTo(links.l1, 9);
        expect(Math.hypot(...(fk.wrist.map((v, q) => v - fk.elbow[q]) as Vec3))).toBeCloseTo(links.l2, 9);
      }
      if (arm === 'long') expect(clamped).toBe(0);
    });

    it(`${arm}: clamps at full stretch, pointing at the target`, () => {
      const links = linksFor(arm);
      const S = shoulderPoint();
      for (const t of [[0, 0.9, 1.5], [2, 0.8, -1], [-1.5, 1.0, 0.2], [0.3, 3, -0.6]] as Vec3[]) {
        const r = solveIK(t, links);
        expect(r.clamped).toBe(true);
        const fk = forwardKinematics(r.joints, links);
        const d = Math.hypot(fk.wrist[0] - S[0], fk.wrist[1] - S[1], fk.wrist[2] - S[2]);
        expect(d).toBeCloseTo(maxReach(links), 9);
        // the wrist lies on the line from the shoulder toward the requested wrist point
        const want: Vec3 = [t[0] - S[0], t[1] + 0.12 - S[1], t[2] - S[2]];
        const got: Vec3 = [fk.wrist[0] - S[0], fk.wrist[1] - S[1], fk.wrist[2] - S[2]];
        const cos = (want[0] * got[0] + want[1] * got[1] + want[2] * got[2]) / (Math.hypot(...want) * Math.hypot(...got));
        expect(cos).toBeGreaterThan(1 - 1e-9);
      }
    });
  }

  it('the Long arm reaches points the Compact arm cannot', () => {
    const S = shoulderPoint();
    const t: Vec3 = [S[0] + 0.85, S[1] - 0.12, S[2]]; // wrist 0.85 m out: past Compact's 0.79
    expect(solveIK(t, COMPACT_LINKS).clamped).toBe(true);
    expect(solveIK(t, LONG_LINKS).clamped).toBe(false);
    expect(maxReach(LONG_LINKS)).toBeGreaterThan(maxReach(COMPACT_LINKS) * 1.3);
  });

  it('the far can is outside Compact reach and inside Long reach', () => {
    const can: Vec3 = [WORKSHOP.can.x, ITEMS.can.restY, -0.7];
    const c = clampToWorkspace(can, workspaceFor('compact'));
    expect(Math.hypot(can[0] - c[0], can[2] - c[2])).toBeGreaterThan(0.05);
    expect(clampToWorkspace(can, workspaceFor('long'))).toEqual(can);
  });
});

describe('grab rules', () => {
  const expected: Record<ItemId, Record<string, string | null>> = {
    plate: { 'compact+gripper': 'tool', 'compact+suction': null, 'long+gripper': 'tool', 'long+suction': null },
    can: { 'compact+gripper': null, 'compact+suction': 'tool', 'long+gripper': null, 'long+suction': 'tool' },
    pot: { 'compact+gripper': null, 'compact+suction': 'tool', 'long+gripper': 'heavy', 'long+suction': 'tool' },
  };
  for (const id of ['plate', 'can', 'pot'] as ItemId[])
    for (const r of ROBOTS)
      it(`${id} with ${key(r)} -> ${expected[id][key(r)] ?? 'ok'}`, () => {
        expect(grabRule(ITEMS[id], r)).toBe(expected[id][key(r)]);
      });

  it('weight above payload fails, at or below holds', () => {
    expect(grabRule({ weight: 2 }, { arm: 'compact', tool: 'gripper' })).toBeNull();
    expect(grabRule({ weight: 1 }, { arm: 'long', tool: 'suction' })).toBeNull();
    expect(grabRule({ weight: 2 }, { arm: 'long', tool: 'suction' })).toBe('heavy');
  });

  it('labels say why', () => {
    expect(failText('heavy', 'pot')).toBe('Too heavy for this arm');
    expect(failText('tool', 'plate')).toBe("Can't grip a flat plate");
    expect(failText('reach', 'can')).toBe('Out of reach');
  });

  it('cubes are not tagged: every robot grabs them, so the standard challenges are unaffected', () => {
    for (const r of ROBOTS) {
      const env = new TaskEnv(3, 'place', r);
      const cube = env.state().cubes.red!;
      const s = solve(env, cube, BIN_POS.red);
      expect(s.held).toBeNull();
      expect(s.success).toBe(true);
      expect(s.grabFails).toBe(0);
    }
  });
});

/** Drive the tip toward p (clamped to the arm's workspace) until it arrives. */
function goTo(env: TaskEnv, p: Vec3, grip: 0 | 1, log?: Action[]) {
  const ws = workspaceFor(env.state().robot.arm);
  for (let i = 0; i < 300; i++) {
    const a: Action = { target: p, grip };
    log?.push(a);
    env.step(a, SIM_DT);
    if (near(env.state().tip, clampToWorkspace(p, ws), 1e-6)) break;
  }
}

/** The obvious plan: above the object, down, close, lift, carry over the goal, open. */
function solve(env: TaskEnv, obj: Vec3, goal: Vec3, log?: Action[]) {
  goTo(env, [obj[0], obj[1] + 0.12, obj[2]], 0, log);
  goTo(env, [obj[0], obj[1], obj[2]], 0, log);
  goTo(env, [obj[0], obj[1], obj[2]], 1, log);
  goTo(env, [obj[0], 0.98, obj[2]], 1, log);
  goTo(env, [goal[0], 0.98, goal[2]], 1, log);
  goTo(env, [goal[0], 0.98, goal[2]], 0, log);
  for (let i = 0; i < 3; i++) {
    const a: Action = { target: [goal[0], 0.98, goal[2]], grip: 0 };
    log?.push(a);
    env.step(a, SIM_DT);
  }
  return env.snapshot();
}

const TASKS: Record<WorkshopLayout, { item: ItemId; goal: Vec3; ok: string[]; failWith: Record<string, string> }> = {
  plate: {
    item: 'plate',
    goal: WORKSHOP.rack.pos,
    ok: ['compact+suction', 'long+suction'],
    failWith: { 'compact+gripper': 'tool', 'long+gripper': 'tool' },
  },
  far: {
    item: 'can',
    goal: WORKSHOP.canBin.pos,
    ok: ['long+gripper'],
    failWith: { 'compact+gripper': 'reach', 'compact+suction': 'reach', 'long+suction': 'tool' },
  },
  heavy: {
    item: 'pot',
    goal: WORKSHOP.zone.pos,
    ok: ['compact+gripper'],
    failWith: { 'compact+suction': 'tool', 'long+gripper': 'heavy', 'long+suction': 'tool' },
  },
};

describe('Workshop challenges', () => {
  for (const layout of ['plate', 'far', 'heavy'] as WorkshopLayout[]) {
    const t = TASKS[layout];
    for (const r of ROBOTS) {
      const good = t.ok.includes(key(r));
      it(`${layout} with ${key(r)}: ${good ? 'solvable' : `not solvable (${t.failWith[key(r)]})`}`, () => {
        for (const seed of [1, 2, 3, 77, 4242]) {
          const env = new TaskEnv(seed, layout, r);
          const s0 = env.state();
          expect(s0.success).toBe(false);
          expect(Object.keys(s0.items)).toEqual([t.item]);
          const s = solve(env, s0.items[t.item]!, t.goal);
          expect(s.success).toBe(good);
          if (good) expect(s.grabFails).toBe(0);
          else {
            expect(s.grabFails).toBeGreaterThan(0);
            expect(s.grabFail?.reason).toBe(t.failWith[key(r)]);
            expect(s.items[t.item]).toEqual(s0.items[t.item]); // it never moved
          }
        }
      });
    }
  }

  it('objects spawn from the seed (same seed, same layout; different seeds differ)', () => {
    for (const layout of ['plate', 'far', 'heavy'] as WorkshopLayout[]) {
      expect(new TaskEnv(5, layout).state().items).toEqual(new TaskEnv(5, layout).state().items);
      expect(new TaskEnv(5, layout).state().items).not.toEqual(new TaskEnv(6, layout).state().items);
    }
  });

  it('a released plate off the rack lands on the table and counts as a drop', () => {
    const env = new TaskEnv(1, 'plate', { arm: 'compact', tool: 'suction' });
    const p = env.state().items.plate!;
    const s = solve(env, p, [-0.2, 0.75, -0.7]);
    expect(s.success).toBe(false);
    expect(s.drops).toBe(1);
    const p2 = s.items.plate!;
    expect(p2[0]).toBeCloseTo(-0.2, 9);
    expect(p2[1]).toBe(ITEMS.plate.restY);
    expect(p2[2]).toBeCloseTo(-0.7, 9);
  });
});

describe('recording and replay keep the robot', () => {
  it('records arm, tool, success and grab fails; a replay rebuilds the same robot and outcome', () => {
    const robot: RobotParts = { arm: 'long', tool: 'gripper' };
    const env = new TaskEnv(11, 'far', robot);
    const rec = new Recorder();
    rec.start({ sessionId: 's', attemptId: '0001', challenge: 'far', seed: 11, world: null, input: 'mouse', arm: robot.arm, tool: robot.tool });
    const log: Action[] = [];
    solve(env, env.state().items.can!, WORKSHOP.canBin.pos, log);
    const replayEnv = new TaskEnv(11, 'far', robot);
    for (const a of log) {
      rec.sample(replayEnv.state(), a);
      replayEnv.step(a, SIM_DT);
    }
    const r = rec.finish(replayEnv.state())!;
    expect(r.arm).toBe('long');
    expect(r.tool).toBe('gripper');
    expect(r.success).toBe(true);
    expect(r.grabFails).toBe(0);
    expect(r.samples[0].items?.can).toBeDefined();
    const again = replayRecord(JSON.parse(JSON.stringify(r)));
    expect(again.robot).toEqual(robot);
    expect(again.success).toBe(true);
    // the same actions with the wrong robot fail: the replay really uses the recorded parts
    expect(replayRecord({ ...r, arm: 'compact' }).success).toBe(false);
  });

  it('standard attempts record compact + gripper; old files without parts replay as the standard robot', () => {
    const rec = new Recorder();
    rec.start({ sessionId: 's', attemptId: '0001', challenge: 'place', seed: 1, world: null, input: 'mouse' });
    const env = new TaskEnv(1, 'place');
    const r = rec.finish(env.state())!;
    expect([r.arm, r.tool]).toEqual(['compact', 'gripper']);
    const { arm: _a, tool: _t, ...old } = r;
    expect(replayRecord(old).robot).toEqual(STANDARD_ROBOT);
    expect(r.samples.every((s) => s.items === undefined)).toBe(true);
  });
});

describe('Challenges: parts and Workshop mode', () => {
  function make() {
    const events: string[] = [];
    const c = new Challenges({ sessionId: 's', world: () => null, input: () => 'mouse', seed: () => 7, onEvent: (e) => events.push(e.type) });
    return { c, events };
  }
  const tick = (c: Challenges, s: number) => {
    for (let t = 0; t < s; t += 0.05) c.update(0.05, () => ({ target: [0, 1, -0.65], grip: 0 }));
  };

  it('parts can only change in Workshop mode; leaving the Workshop restores the standard robot', () => {
    const { c } = make();
    c.setParts({ arm: 'long' });
    expect(c.robot).toEqual(STANDARD_ROBOT);
    c.setWorkshop(true);
    expect(c.list.map((d) => d.layout)).toEqual(['plate', 'far', 'heavy']);
    c.setParts({ arm: 'long', tool: 'suction' });
    expect(c.env.state().robot).toEqual({ arm: 'long', tool: 'suction' });
    c.setWorkshop(false);
    expect(c.robot).toEqual(STANDARD_ROBOT);
    expect(c.env.state().robot).toEqual(STANDARD_ROBOT);
    expect(c.list.map((d) => d.layout)).toEqual(['reach', 'place', 'sort']);
  });

  it('changing a part mid-challenge rebuilds at once and restarts that challenge; the attempt records the parts', () => {
    const { c, events } = make();
    c.setWorkshop(true);
    c.start();
    tick(c, 3.2);
    expect(c.phase).toBe('running');
    tick(c, 1);
    c.setParts({ tool: 'suction' });
    expect(c.phase).toBe('countdown');
    expect(c.index).toBe(0);
    expect(c.env.state().steps).toBe(0);
    expect(c.env.state().robot.tool).toBe('suction');
    expect(events).toContain('parts');
    tick(c, 3.2);
    expect(c.phase).toBe('running');
  });
});
