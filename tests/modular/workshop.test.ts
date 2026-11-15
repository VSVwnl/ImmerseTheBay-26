// Robot Workshop (modular tests; run alone with `npm run test:modular`): parts, reach, grab rules, every
// Workshop challenge against every robot, recording/replay, switches, and the per-attempt world pick.
// Adding a part or challenge: add its row to EXPECT below; every robot x challenge pair is then checked.
import { describe, expect, it } from 'vitest';
import { forwardKinematics, maxReach, shoulderPoint, solveIK } from '../../src/arm/ik';
import {
  ARM_KINDS,
  ARMS,
  COMPACT_LINKS,
  LONG_LINKS,
  partsOf,
  STANDARD_ROBOT,
  TOOL_KINDS,
  linksFor,
  workspaceFor,
  type RobotParts,
} from '../../src/arm/parts';
import { ITEM_IDS, ITEMS, TOOL_RULES, grabCheck, grabRule, type ItemId } from '../../src/arm/items';
import { TaskEnv, clampToWorkspace, type Action } from '../../src/env/env';
import { WORKSHOP_LAYOUTS, WORKSHOP_TASKS, type WorkshopLayout } from '../../src/env/workshop';
import { BIN_POS, ENABLED_CHALLENGES, ENABLED_PARTS, L1, L2, SIM_DT, WORKSHOP, WORKSPACE, type Vec3 } from '../../src/config';
import { Recorder, replayRecord } from '../../src/tasks/recorder';
import { Challenges, workshopChallenges } from '../../src/tasks/challenges';
import { pickAttemptWorld } from '../../src/tasks/worldpick';

const near = (a: Vec3, b: Vec3, eps: number) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < eps;
const ROBOTS: RobotParts[] = ARM_KINDS.flatMap((arm) => TOOL_KINDS.map((tool) => ({ arm, tool })));
const key = (r: RobotParts) => `${r.arm}+${r.tool}`;

/** Expected outcome of each Workshop challenge for each robot: 'ok' or the failure reason.
 *  Robots not listed must fail (any reason). */
const EXPECT: Record<WorkshopLayout, Record<string, 'ok' | 'tool' | 'heavy' | 'reach'>> = {
  anvil: { 'xlong+gripper': 'heavy', 'xlong+suction': 'tool', 'xlong+magnet': 'heavy', 'xlong+wide': 'tool', 'xlong+scoop': 'tool', 'tall+gripper': 'reach', 'tall+suction': 'reach', 'tall+magnet': 'reach', 'tall+wide': 'reach', 'tall+scoop': 'reach',
    'compact+gripper': 'heavy', 'compact+suction': 'tool', 'compact+magnet': 'heavy', 'compact+wide': 'tool',
    'long+gripper': 'heavy', 'long+suction': 'tool', 'long+magnet': 'heavy', 'long+wide': 'tool',
    'heavyduty+gripper': 'ok', 'heavyduty+suction': 'tool', 'heavyduty+magnet': 'ok', 'heavyduty+wide': 'tool',
    'compact+scoop': 'tool', 'long+scoop': 'tool', 'heavyduty+scoop': 'tool',
  },
  marbles: { 'xlong+gripper': 'tool', 'xlong+suction': 'tool', 'xlong+magnet': 'tool', 'xlong+wide': 'tool', 'xlong+scoop': 'heavy', 'tall+gripper': 'reach', 'tall+suction': 'reach', 'tall+magnet': 'reach', 'tall+wide': 'reach', 'tall+scoop': 'reach',
    'compact+gripper': 'tool', 'compact+suction': 'tool', 'compact+magnet': 'tool', 'compact+wide': 'tool', 'compact+scoop': 'ok',
    'long+gripper': 'tool', 'long+suction': 'tool', 'long+magnet': 'tool', 'long+wide': 'tool', 'long+scoop': 'ok',
    'heavyduty+gripper': 'tool', 'heavyduty+suction': 'tool', 'heavyduty+magnet': 'tool', 'heavyduty+wide': 'tool', 'heavyduty+scoop': 'ok',
  },
  plate: { 'xlong+gripper': 'tool', 'xlong+suction': 'heavy', 'xlong+magnet': 'tool', 'xlong+wide': 'tool', 'xlong+scoop': 'tool', 'tall+gripper': 'reach', 'tall+suction': 'reach', 'tall+magnet': 'reach', 'tall+wide': 'reach', 'tall+scoop': 'reach', 'compact+gripper': 'tool', 'compact+suction': 'ok', 'long+gripper': 'tool', 'long+suction': 'ok', 'compact+magnet': 'tool', 'long+magnet': 'tool', 'compact+wide': 'tool', 'long+wide': 'tool',
    'heavyduty+gripper': 'tool', 'heavyduty+suction': 'ok', 'heavyduty+magnet': 'tool', 'heavyduty+wide': 'tool',
    'compact+scoop': 'tool', 'long+scoop': 'tool', 'heavyduty+scoop': 'tool' },
  far: { 'xlong+gripper': 'heavy', 'xlong+suction': 'tool', 'xlong+magnet': 'heavy', 'xlong+wide': 'tool', 'xlong+scoop': 'tool', 'tall+gripper': 'reach', 'tall+suction': 'reach', 'tall+magnet': 'reach', 'tall+wide': 'reach', 'tall+scoop': 'reach', 'compact+gripper': 'reach', 'compact+suction': 'reach', 'long+gripper': 'ok', 'long+suction': 'tool', 'compact+magnet': 'reach', 'long+magnet': 'ok', 'compact+wide': 'reach', 'long+wide': 'tool',
    'heavyduty+gripper': 'reach', 'heavyduty+suction': 'reach', 'heavyduty+magnet': 'reach', 'heavyduty+wide': 'reach',
    'compact+scoop': 'reach', 'long+scoop': 'tool', 'heavyduty+scoop': 'reach' },
  heavy: { 'xlong+gripper': 'heavy', 'xlong+suction': 'tool', 'xlong+magnet': 'heavy', 'xlong+wide': 'tool', 'xlong+scoop': 'tool', 'tall+gripper': 'reach', 'tall+suction': 'reach', 'tall+magnet': 'reach', 'tall+wide': 'reach', 'tall+scoop': 'reach', 'compact+gripper': 'ok', 'compact+suction': 'tool', 'long+gripper': 'heavy', 'long+suction': 'tool', 'compact+magnet': 'ok', 'long+magnet': 'heavy', 'compact+wide': 'tool', 'long+wide': 'tool',
    'heavyduty+gripper': 'ok', 'heavyduty+suction': 'tool', 'heavyduty+magnet': 'ok', 'heavyduty+wide': 'tool',
    'compact+scoop': 'tool', 'long+scoop': 'tool', 'heavyduty+scoop': 'tool' },
  washer: { 'xlong+gripper': 'tool', 'xlong+suction': 'tool', 'xlong+magnet': 'heavy', 'xlong+wide': 'tool', 'xlong+scoop': 'tool', 'tall+gripper': 'reach', 'tall+suction': 'reach', 'tall+magnet': 'reach', 'tall+wide': 'reach', 'tall+scoop': 'reach', 'compact+gripper': 'tool', 'compact+suction': 'tool', 'long+gripper': 'tool', 'long+suction': 'tool', 'compact+magnet': 'ok', 'long+magnet': 'ok', 'compact+wide': 'tool', 'long+wide': 'tool',
    'heavyduty+gripper': 'tool', 'heavyduty+suction': 'tool', 'heavyduty+magnet': 'ok', 'heavyduty+wide': 'tool',
    'compact+scoop': 'tool', 'long+scoop': 'tool', 'heavyduty+scoop': 'tool' },
  crate: { 'xlong+gripper': 'tool', 'xlong+suction': 'tool', 'xlong+magnet': 'tool', 'xlong+wide': 'heavy', 'xlong+scoop': 'tool', 'tall+gripper': 'reach', 'tall+suction': 'reach', 'tall+magnet': 'reach', 'tall+wide': 'reach', 'tall+scoop': 'reach', 'compact+gripper': 'tool', 'compact+suction': 'tool', 'long+gripper': 'tool', 'long+suction': 'tool', 'compact+magnet': 'tool', 'long+magnet': 'tool', 'compact+wide': 'ok', 'long+wide': 'heavy',
    'heavyduty+gripper': 'tool', 'heavyduty+suction': 'tool', 'heavyduty+magnet': 'tool', 'heavyduty+wide': 'ok',
    'compact+scoop': 'tool', 'long+scoop': 'tool', 'heavyduty+scoop': 'tool' },
  shelf: { 'xlong+gripper': 'reach', 'xlong+suction': 'reach', 'xlong+magnet': 'reach', 'xlong+wide': 'reach', 'xlong+scoop': 'reach',
    'tall+gripper': 'ok', 'tall+suction': 'tool', 'tall+magnet': 'tool', 'tall+wide': 'tool', 'tall+scoop': 'tool',
    'compact+gripper': 'reach', 'compact+suction': 'reach', 'compact+magnet': 'reach', 'compact+wide': 'reach', 'compact+scoop': 'reach', 'long+gripper': 'reach', 'long+suction': 'reach', 'long+magnet': 'reach', 'long+wide': 'reach', 'long+scoop': 'reach', 'heavyduty+gripper': 'reach', 'heavyduty+suction': 'reach', 'heavyduty+magnet': 'reach', 'heavyduty+wide': 'reach', 'heavyduty+scoop': 'reach',
  },
  cart: {
    'xlong+gripper': 'ok', 'xlong+suction': 'ok', 'xlong+magnet': 'tool', 'xlong+wide': 'tool', 'xlong+scoop': 'tool',
    'compact+gripper': 'reach', 'compact+suction': 'reach', 'compact+magnet': 'reach', 'compact+wide': 'reach', 'compact+scoop': 'reach', 'long+gripper': 'reach', 'long+suction': 'reach', 'long+magnet': 'reach', 'long+wide': 'reach', 'long+scoop': 'reach', 'heavyduty+gripper': 'reach', 'heavyduty+suction': 'reach', 'heavyduty+magnet': 'reach', 'heavyduty+wide': 'reach', 'heavyduty+scoop': 'reach', 'tall+gripper': 'reach', 'tall+suction': 'reach', 'tall+magnet': 'reach', 'tall+wide': 'reach', 'tall+scoop': 'reach',
  },
};

function grid(ws: { min: Vec3; max: Vec3 }, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++)
      for (let k = 0; k <= n; k++) out.push([0, 1, 2].map((q) => ws.min[q] + ((ws.max[q] - ws.min[q]) * [i, j, k][q]) / n) as Vec3);
  return out;
}

describe('parts', () => {
  it('Long links are 35% longer; Compact links are the original L1/L2', () => {
    expect(COMPACT_LINKS).toEqual({ l1: L1, l2: L2 });
    expect(LONG_LINKS.l1).toBeCloseTo(L1 * 1.35, 12);
    expect(LONG_LINKS.l2).toBeCloseTo(L2 * 1.35, 12);
  });

  it('every part and every challenge is listed in the config switches', () => {
    for (const k of [...ARM_KINDS, ...TOOL_KINDS]) expect(ENABLED_PARTS).toContain(k);
    for (const l of WORKSHOP_LAYOUTS) expect(ENABLED_CHALLENGES).toContain(l);
    expect(Object.keys(EXPECT).sort()).toEqual([...WORKSHOP_LAYOUTS].sort());
  });

  it('every part has a strength and a weakness: no robot solves every challenge, every robot fails one', () => {
    for (const r of ROBOTS) expect(WORKSHOP_LAYOUTS.some((l) => EXPECT[l][key(r)] !== 'ok')).toBe(true);
  });

  it('old or unknown part names fall back to the standard robot', () => {
    expect(partsOf({})).toEqual(STANDARD_ROBOT);
    expect(partsOf({ arm: 'rocket', tool: 'laser' })).toEqual(STANDARD_ROBOT);
  });
});

describe('IK for every arm', () => {
  it('the standard arm solves exactly as before (default links = Compact)', () => {
    for (const t of grid(WORKSPACE, 4)) expect(solveIK(t, COMPACT_LINKS)).toEqual(solveIK(t));
  });

  for (const arm of ARM_KINDS) {
    it(`${arm}: reaches its workspace, tool pointing down (Compact clamps only at its high far corners, as before)`, () => {
      const links = linksFor(arm);
      for (const t of grid(workspaceFor(arm), 6)) {
        const r = solveIK(t, links);
        if (r.clamped) {
          expect(arm).toBe('compact');
          expect(t[1]).toBeGreaterThan(1.0); // never at table height, where the objects are
          expect(Math.hypot(...(r.tip.map((v, q) => v - t[q]) as Vec3))).toBeLessThan(0.1);
        } else expect(near(r.tip, t, 1e-9)).toBe(true);
        const fk = forwardKinematics(r.joints, links);
        expect(Math.abs(fk.wrist[0] - fk.tip[0])).toBeLessThan(1e-9);
        expect(Math.abs(fk.wrist[2] - fk.tip[2])).toBeLessThan(1e-9);
        expect(Math.hypot(...(fk.elbow.map((v, q) => v - fk.shoulder[q]) as Vec3))).toBeCloseTo(links.l1, 9);
        expect(Math.hypot(...(fk.wrist.map((v, q) => v - fk.elbow[q]) as Vec3))).toBeCloseTo(links.l2, 9);
      }
    });

    it(`${arm}: clamps at full stretch, pointing at the target`, () => {
      const links = linksFor(arm);
      const S = shoulderPoint(links);
      for (const t of [[0, 0.9, 1.5], [2, 0.8, -1], [-1.5, 1.0, 0.2], [0.3, 3, -0.6]] as Vec3[]) {
        const r = solveIK(t, links);
        expect(r.clamped).toBe(true);
        const fk = forwardKinematics(r.joints, links);
        const d = Math.hypot(fk.wrist[0] - S[0], fk.wrist[1] - S[1], fk.wrist[2] - S[2]);
        expect(d).toBeCloseTo(maxReach(links), 9);
        const want: Vec3 = [t[0] - S[0], t[1] + 0.12 - S[1], t[2] - S[2]];
        const got: Vec3 = [fk.wrist[0] - S[0], fk.wrist[1] - S[1], fk.wrist[2] - S[2]];
        const cos = (want[0] * got[0] + want[1] * got[1] + want[2] * got[2]) / (Math.hypot(...want) * Math.hypot(...got));
        expect(cos).toBeGreaterThan(1 - 1e-9);
      }
    });
  }

  it('the Long arm reaches points the Compact arm cannot', () => {
    const S = shoulderPoint();
    const t: Vec3 = [S[0] + 0.85, S[1] - 0.12, S[2]];
    expect(solveIK(t, COMPACT_LINKS).clamped).toBe(true);
    expect(solveIK(t, LONG_LINKS).clamped).toBe(false);
  });

  it('the far can is outside Compact reach and inside Long reach', () => {
    const can: Vec3 = [WORKSHOP.can.x, ITEMS.can.restY, -0.7];
    const c = clampToWorkspace(can, workspaceFor('compact'));
    expect(Math.hypot(can[0] - c[0], can[2] - c[2])).toBeGreaterThan(0.05);
    expect(clampToWorkspace(can, workspaceFor('long'))).toEqual(can);
  });
});

describe('grab rules', () => {
  it('every tool has a rule, every object has tags', () => {
    for (const t of TOOL_KINDS) expect(typeof TOOL_RULES[t]).toBe('function');
    for (const id of ITEM_IDS) expect(ITEMS[id].weight).toBeGreaterThan(0);
  });

  it('magnet: metal only; washer: only the magnet', () => {
    expect(grabCheck(ITEMS.plate, { arm: 'compact', tool: 'magnet' })?.text).toBe('Magnet only lifts metal');
    expect(grabCheck(ITEMS.washer, { arm: 'compact', tool: 'gripper' })?.text).toBe("Can't grip a flat washer");
    expect(grabCheck(ITEMS.washer, { arm: 'compact', tool: 'suction' })?.text).toBe('Air leaks through the hole');
    expect(grabCheck(ITEMS.washer, { arm: 'long', tool: 'magnet' })).toBeNull();
  });

  it('wide gripper: big things only; crate: only the wide gripper', () => {
    expect(grabCheck(ITEMS.can, { arm: 'long', tool: 'wide' })?.text).toBe('Too small for the wide gripper');
    expect(grabCheck(ITEMS.crate, STANDARD_ROBOT)?.text).toBe('Too big for this gripper');
    expect(grabCheck(ITEMS.crate, { arm: 'compact', tool: 'suction' })?.text).toBe('Air leaks through the slats');
    expect(grabCheck(ITEMS.crate, { arm: 'compact', tool: 'magnet' })?.text).toBe('Magnet only lifts metal');
    expect(grabCheck(ITEMS.crate, { arm: 'long', tool: 'wide' })?.text).toBe('Too heavy for this arm');
    expect(grabCheck(ITEMS.crate, { arm: 'compact', tool: 'wide' })).toBeNull();
  });

  it('scoop: loose bits only; marbles: only the scoop', () => {
    expect(grabCheck(ITEMS.marbles, STANDARD_ROBOT)?.text).toBe('Loose bits slip through the fingers');
    expect(grabCheck(ITEMS.marbles, { arm: 'compact', tool: 'suction' })?.text).toBe("Suction can't hold loose bits");
    expect(grabCheck(ITEMS.marbles, { arm: 'compact', tool: 'magnet' })?.text).toBe('Magnet only lifts metal');
    expect(grabCheck(ITEMS.can, { arm: 'long', tool: 'scoop' })?.text).toBe("Can't scoop up a can");
    expect(grabCheck(ITEMS.marbles, { arm: 'long', tool: 'scoop' })).toBeNull();
  });

  it('tall base: shoulder 0.3 m higher; reaches high up but not down to the table', () => {
    expect(shoulderPoint(linksFor('tall'))[1]).toBeCloseTo(shoulderPoint()[1] + WORKSHOP.tallRise, 12);
    expect(workspaceFor('tall').max[1]).toBeGreaterThan(Math.max(...ARM_KINDS.filter((k) => k !== 'tall').map((k) => workspaceFor(k).max[1])));
    expect(workspaceFor('tall').min[1]).toBeGreaterThan(ITEMS.pot.restY + 0.05);
  });

  it('shelf: the jar is above every arm but the tall base; glass and round, so gripper only', () => {
    expect(grabCheck(ITEMS.jar, { arm: 'tall', tool: 'gripper' })).toBeNull();
    expect(grabCheck(ITEMS.jar, { arm: 'tall', tool: 'magnet' })?.text).toBe('Magnet only lifts metal');
    expect(grabCheck(ITEMS.jar, { arm: 'tall', tool: 'suction' })?.text).toBe("Suction can't seal on a jar");
    const jarY = WORKSHOP.shelf.top + WORKSHOP.jar.h / 2;
    for (const a of ARM_KINDS.filter((k) => k !== 'tall')) expect(workspaceFor(a).max[1]).toBeLessThan(jarY - 0.05);
    expect(workspaceFor('tall').max[1]).toBeGreaterThan(jarY);
    const env = new TaskEnv(3, 'shelf');
    expect(env.state().items.jar![1]).toBeCloseTo(jarY, 9);
  });

  it('extra-long: reaches past the table edge, lifts only light things', () => {
    expect(workspaceFor('xlong').max[0]).toBeGreaterThan(0.6); // table half-width
    for (const a of ARM_KINDS.filter((k) => k !== 'xlong')) expect(workspaceFor(a).max[0]).toBeLessThan(0.6);
    expect(grabCheck(ITEMS.plate, { arm: 'xlong', tool: 'suction' })?.text).toBe('Too heavy for this arm');
  });

  it('cart: the parcel sits past the table edge, only the extra-long arm reaches it, and it is light', () => {
    const env = new TaskEnv(4, 'cart');
    const p = env.state().items.parcel!;
    expect(p[0]).toBeGreaterThan(0.6); // off the table, on the cart
    for (const a of ARM_KINDS.filter((k) => k !== 'xlong')) expect(workspaceFor(a).max[0]).toBeLessThan(p[0] - 0.05);
    expect(ITEMS.parcel.weight).toBeLessThanOrEqual(ARMS.xlong.payload);
    expect(grabCheck(ITEMS.parcel, { arm: 'xlong', tool: 'magnet' })?.text).toBe('Magnet only lifts metal');
  });

  it('original labels', () => {
    expect(grabCheck(ITEMS.pot, { arm: 'long', tool: 'gripper' })?.text).toBe('Too heavy for this arm');
    expect(grabCheck(ITEMS.plate, STANDARD_ROBOT)?.text).toBe("Can't grip a flat plate");
    expect(grabCheck(ITEMS.can, { arm: 'compact', tool: 'suction' })?.text).toBe("Suction can't seal on a can");
    expect(grabCheck(ITEMS.pot, { arm: 'compact', tool: 'suction' })?.text).toBe("Suction can't hold a pot");
  });

  it('tool is checked before weight; weight at or below payload holds', () => {
    expect(grabRule(ITEMS.pot, { arm: 'long', tool: 'suction' })).toBe('tool');
    for (const arm of ARM_KINDS)
      for (const id of ITEM_IDS) {
        const r = grabCheck({ ...ITEMS[id], shape: 'cylinder', size: 'normal' }, { arm, tool: 'gripper' });
        expect(r?.reason === 'heavy').toBe(ITEMS[id].weight > ARMS[arm].payload);
      }
  });

  it('cubes are not tagged: every robot that reaches the table grabs them, so the standard challenges are unaffected', () => {
    for (const r of ROBOTS.filter((q) => workspaceFor(q.arm).min[1] < 0.8)) {
      const env = new TaskEnv(3, 'place', r);
      const cube = env.state().cubes.red!;
      const s = pickPlace(env, cube, BIN_POS.red);
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
function pickPlace(env: TaskEnv, obj: Vec3, goal: Vec3, log?: Action[], carryY = 0.98) {
  goTo(env, [obj[0], obj[1] + 0.12, obj[2]], 0, log);
  goTo(env, [obj[0], obj[1], obj[2]], 0, log);
  goTo(env, [obj[0], obj[1], obj[2]], 1, log);
  goTo(env, [obj[0], Math.max(carryY, obj[1] + 0.05), obj[2]], 1, log);
  goTo(env, [goal[0], Math.max(carryY, obj[1] + 0.05), goal[2]], 1, log);
  goTo(env, [goal[0], Math.max(carryY, obj[1] + 0.05), goal[2]], 0, log);
  for (let i = 0; i < 3; i++) {
    const a: Action = { target: [goal[0], carryY, goal[2]], grip: 0 };
    log?.push(a);
    env.step(a, SIM_DT);
  }
  return env.snapshot();
}

/** Solve a Workshop challenge step by step with one robot; stops at the first failed grab. */
function solve(layout: WorkshopLayout, robot: RobotParts, seed: number, log?: Action[]) {
  const env = new TaskEnv(seed, layout, robot);
  for (const st of WORKSHOP_TASKS[layout].steps) {
    const before = env.state().grabFails;
    pickPlace(env, env.state().items[st.item]!, st.goal.pos, log);
    if (env.state().grabFails > before) break;
  }
  return env.snapshot();
}

describe('Workshop challenges: every robot', () => {
  for (const layout of WORKSHOP_LAYOUTS) {
    const items = WORKSHOP_TASKS[layout].steps.map((s) => s.item);
    for (const r of ROBOTS) {
      const want = EXPECT[layout][key(r)];
      it(`${layout} with ${key(r)}: ${want === 'ok' ? 'solvable' : `fails (${want ?? 'any reason'})`}`, () => {
        for (const seed of [1, 2, 3, 77, 4242]) {
          const env = new TaskEnv(seed, layout, r);
          const s0 = env.snapshot();
          expect(s0.success).toBe(false);
          expect(Object.keys(s0.items).sort()).toEqual([...items].sort());
          const s = solve(layout, r, seed);
          expect(s.success).toBe(want === 'ok');
          if (want === 'ok') expect(s.grabFails).toBe(0);
          else {
            expect(s.grabFails).toBeGreaterThan(0);
            expect(s.grabFail?.text.length).toBeGreaterThan(3);
            if (want) expect(s.grabFail?.reason).toBe(want);
          }
        }
      });
    }
  }

  it('objects spawn from the seed (same seed, same layout; different seeds differ)', () => {
    for (const layout of WORKSHOP_LAYOUTS) {
      expect(new TaskEnv(5, layout).state().items).toEqual(new TaskEnv(5, layout).state().items);
      expect(new TaskEnv(5, layout).state().items).not.toEqual(new TaskEnv(6, layout).state().items);
    }
  });

  it("each challenge's declared solutions are exactly the robots that solve it", () => {
    for (const layout of WORKSHOP_LAYOUTS) {
      const declared = WORKSHOP_TASKS[layout].solutions.map(key).sort();
      const ok = Object.entries(EXPECT[layout]).filter(([, v]) => v === 'ok').map(([k]) => k).sort();
      expect(declared).toEqual(ok);
    }
  });

  it('a challenge hides itself when none of the robots that solve it can be built from enabled parts', () => {
    const saved = [...ENABLED_PARTS];
    try {
      for (const part of [...ARM_KINDS, ...TOOL_KINDS]) {
        ENABLED_PARTS.splice(0, ENABLED_PARTS.length, ...saved.filter((p) => p !== part));
        const shown = workshopChallenges().map((c) => c.layout);
        for (const layout of WORKSHOP_LAYOUTS) {
          const still = WORKSHOP_TASKS[layout].solutions.some((r) => r.arm !== part && r.tool !== part);
          expect(shown.includes(layout)).toBe(still);
        }
      }
    } finally {
      ENABLED_PARTS.splice(0, ENABLED_PARTS.length, ...saved);
    }
  });

  it('every goal is on the table; objects spawn on the table unless the challenge brings scenery (shelf, cart)', () => {
    const onTable = (p: Vec3) => Math.abs(p[0]) < 0.6 && p[2] > -1.1 && p[2] < -0.4;
    for (const layout of WORKSHOP_LAYOUTS) {
      expect(Object.values(EXPECT[layout])).toContain('ok');
      const task = WORKSHOP_TASKS[layout];
      for (const st of task.steps) {
        expect(onTable(st.goal.pos)).toBe(true);
        for (const seed of [1, 9, 99]) {
          const p = st.spawn(() => ((seed * 9301 + 49297) % 233280) / 233280);
          if (!task.scenery) expect(onTable(p)).toBe(true);
        }
      }
    }
  });

  it('a released plate off the rack lands on the table and counts as a drop', () => {
    const env = new TaskEnv(1, 'plate', { arm: 'compact', tool: 'suction' });
    const s = pickPlace(env, env.state().items.plate!, [-0.2, 0.75, -0.7]);
    expect(s.success).toBe(false);
    expect(s.drops).toBe(1);
    expect(s.items.plate![1]).toBe(ITEMS.plate.restY);
  });
});

describe('recording and replay keep the robot', () => {
  it('records arm, tool, success and grab fails; a replay rebuilds the same robot and outcome', () => {
    const robot: RobotParts = { arm: 'long', tool: 'gripper' };
    const log: Action[] = [];
    solve('far', robot, 11, log);
    const rec = new Recorder();
    rec.start({ sessionId: 's', attemptId: '0001', challenge: 'far', seed: 11, world: { id: 'lab', prompt: 'p' }, input: 'mouse', arm: robot.arm, tool: robot.tool });
    const env = new TaskEnv(11, 'far', robot);
    for (const a of log) {
      rec.sample(env.state(), a);
      env.step(a, SIM_DT);
    }
    const r = rec.finish(env.state())!;
    expect([r.arm, r.tool, r.success, r.grabFails, r.world?.id]).toEqual(['long', 'gripper', true, 0, 'lab']);
    expect(r.samples[0].items?.can).toBeDefined();
    const again = replayRecord(JSON.parse(JSON.stringify(r)));
    expect(again.robot).toEqual(robot);
    expect(again.success).toBe(true);
    expect(replayRecord({ ...r, arm: 'compact' }).success).toBe(false);
  });

  it('standard attempts record compact + gripper; old files without parts replay as the standard robot', () => {
    const rec = new Recorder();
    rec.start({ sessionId: 's', attemptId: '0001', challenge: 'place', seed: 1, world: null, input: 'mouse' });
    const r = rec.finish(new TaskEnv(1, 'place').state())!;
    expect([r.arm, r.tool]).toEqual(['compact', 'gripper']);
    const { arm: _a, tool: _t, ...old } = r;
    expect(replayRecord(old).robot).toEqual(STANDARD_ROBOT);
  });
});

describe('Challenges: parts, switches and Workshop mode', () => {
  function make() {
    const events: string[] = [];
    const c = new Challenges({ sessionId: 's', world: () => null, input: () => 'mouse', seed: () => 7, onEvent: (e) => events.push(e.type) });
    return { c, events };
  }
  const tick = (c: Challenges, s: number) => {
    for (let t = 0; t < s; t += 0.05) c.update(0.05, () => ({ target: [0, 1, -0.65], grip: 0 }));
  };

  it('parts change only in Workshop mode; leaving restores the standard robot and challenges', () => {
    const { c } = make();
    c.setParts({ arm: 'long' });
    expect(c.robot).toEqual(STANDARD_ROBOT);
    c.setWorkshop(true);
    expect(c.list.map((d) => d.layout)).toEqual(workshopChallenges().map((d) => d.layout));
    c.setParts({ arm: 'long', tool: 'suction' });
    expect(c.env.state().robot).toEqual({ arm: 'long', tool: 'suction' });
    c.setWorkshop(false);
    expect(c.robot).toEqual(STANDARD_ROBOT);
    expect(c.env.state().robot).toEqual(STANDARD_ROBOT);
    expect(c.list.map((d) => d.layout)).toEqual(['reach', 'place', 'sort']);
  });

  it('changing a part mid-challenge rebuilds at once and restarts that challenge', () => {
    const { c, events } = make();
    c.setWorkshop(true);
    c.start();
    tick(c, 4.2);
    expect(c.phase).toBe('running');
    c.setParts({ tool: c.robot.tool === 'suction' ? 'gripper' : 'suction' });
    expect(c.phase).toBe('countdown');
    expect(c.index).toBe(0);
    expect(c.env.state().steps).toBe(0);
    expect(events).toContain('parts');
  });

  it('switching challenges off removes them; with none left the Workshop does not open (no crash)', () => {
    const saved = [...ENABLED_CHALLENGES];
    try {
      ENABLED_CHALLENGES.splice(0, ENABLED_CHALLENGES.length, 'heavy');
      expect(workshopChallenges().map((d) => d.layout)).toEqual(['heavy']);
      const { c } = make();
      c.setWorkshop(true);
      expect(c.env.state().layout).toBe('heavy');
      c.start();
      tick(c, 4);
      expect(c.current.layout).toBe('heavy');
      ENABLED_CHALLENGES.splice(0, ENABLED_CHALLENGES.length);
      const b = make().c;
      b.setWorkshop(true);
      expect(b.workshop).toBe(false);
    } finally {
      ENABLED_CHALLENGES.splice(0, ENABLED_CHALLENGES.length, ...saved);
    }
  });

  it('switching the standard parts off starts the Workshop on the first enabled ones (no crash)', () => {
    const saved = [...ENABLED_PARTS];
    try {
      ENABLED_PARTS.splice(0, ENABLED_PARTS.length, ...saved.filter((p) => p !== 'compact' && p !== 'gripper'));
      const { c } = make();
      c.setWorkshop(true);
      expect(c.robot.arm).not.toBe('compact');
      expect(c.robot.tool).not.toBe('gripper');
      c.setWorkshop(false);
      expect(c.robot).toEqual(STANDARD_ROBOT);
    } finally {
      ENABLED_PARTS.splice(0, ENABLED_PARTS.length, ...saved);
    }
  });
});

describe('a random world for every Workshop attempt', () => {
  const worlds = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('never repeats the world already on the wall', () => {
    for (let i = 0; i < 50; i++) expect(pickAttemptWorld(worlds, 'b', () => i / 50)!.id).not.toBe('b');
  });
  it('covers every other world', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(pickAttemptWorld(worlds, 'a', () => i / 20)!.id);
    expect([...seen].sort()).toEqual(['b', 'c']);
  });
  it('copes with one or no worlds', () => {
    expect(pickAttemptWorld([{ id: 'a' }], 'a', () => 0.5)!.id).toBe('a');
    expect(pickAttemptWorld([], undefined, () => 0.5)).toBeNull();
  });
});

describe('item ids', () => {
  it('every item belongs to some challenge', () => {
    const used = new Set<ItemId>(WORKSHOP_LAYOUTS.flatMap((l) => WORKSHOP_TASKS[l].steps.map((s) => s.item)));
    for (const id of ITEM_IDS) expect(used.has(id)).toBe(true);
  });
});
