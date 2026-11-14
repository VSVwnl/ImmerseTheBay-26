import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { expertSource, humanSource, resampleActions, runHeadless, usableHumanDemos } from '../src/factory/episodes';
import { actionFromVec, actionVec, denormPos, normPos, stateVec } from '../src/factory/obs';
import { TaskEnv } from '../src/env/env';
import { WORKSPACE, type Vec3 } from '../src/config';
import type { AttemptRecord } from '../src/tasks/recorder';

describe('observation format', () => {
  it('scales workspace corners to -1..1 and back', () => {
    expect(normPos(WORKSPACE.min)).toEqual([-1, -1, -1]);
    normPos(WORKSPACE.max).forEach((v) => expect(v).toBeCloseTo(1, 12));
    const p: Vec3 = [0.1, 0.9, -0.6];
    denormPos(normPos(p)).forEach((v, i) => expect(v).toBeCloseTo(p[i], 12));
    const a = actionFromVec(actionVec({ target: p, grip: 1 }));
    expect(a.grip).toBe(1);
    expect(stateVec(new TaskEnv(1, 'place').state())).toHaveLength(4);
  });
});

describe('scripted expert', () => {
  const rate = (noise: boolean, n = 400) => {
    let ok = 0;
    let steps = 0;
    for (let i = 0; i < n; i++) {
      const r = runHeadless(expertSource(1000 + i, noise));
      if (r.success) ok++;
      steps += r.steps;
    }
    return { rate: ok / n, meanSteps: steps / n };
  };

  it('succeeds above 95% without noise', () => {
    const r = rate(false);
    console.log('expert clean', r);
    expect(r.rate).toBeGreaterThan(0.95);
  });

  it('succeeds above 95% with burst noise', () => {
    const r = rate(true);
    console.log('expert noisy', r);
    expect(r.rate).toBeGreaterThan(0.95);
  });

  it('is deterministic per seed', () => {
    const a = runHeadless(expertSource(7, true)).env.snapshot();
    const b = runHeadless(expertSource(7, true)).env.snapshot();
    expect(a).toEqual(b);
  });

  it('recovers when the cube is knocked away mid-carry', () => {
    const src = expertSource(5, false);
    const env = new TaskEnv(5, 'place');
    let dropped = false;
    for (let i = 0; i < 200 && !env.state().success; i++) {
      const a = src.next(env.state())!;
      // disturbance: force a release once while carrying
      const executed = !dropped && env.state().held === 'red' && env.state().tip[1] > 0.89 ? { ...a.executed, grip: 0 as const } : a.executed;
      if (executed !== a.executed) dropped = true;
      env.step(executed, 0.1);
    }
    expect(dropped).toBe(true);
    expect(env.state().success).toBe(true);
  });
});

describe('human demo replay at 10 Hz', () => {
  it('resamples 30 Hz to every third action', () => {
    const samples = Array.from({ length: 9 }, (_, i) => ({ target: [i, 0, 0], grip: i >= 7 ? 1 : 0 })) as any;
    const acts = resampleActions({ samples, hz: 30 });
    expect(acts.map((a) => a.target[0])).toEqual([2, 5, 8]);
    expect(acts[2].grip).toBe(1);
  });

  const root = path.join('data', 'sessions');
  const recs: AttemptRecord[] = [];
  if (fs.existsSync(root))
    for (const sid of fs.readdirSync(root))
      for (const f of fs.readdirSync(path.join(root, sid))) recs.push(JSON.parse(fs.readFileSync(path.join(root, sid, f), 'utf8')));
  const places = recs.filter((r) => r.challenge === 'place' && r.success);

  it.skipIf(places.length === 0)(`keeps successful replays among ${places.length} saved Place demos`, () => {
    const ok = usableHumanDemos(places);
    console.log(`human Place demos usable at 10 Hz: ${ok.length}/${places.length}`);
    for (const r of ok) expect(runHeadless(humanSource(r), 600).success).toBe(true);
    expect(ok.length).toBeGreaterThan(0);
  });
});
