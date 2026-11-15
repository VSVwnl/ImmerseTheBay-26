import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Quaternion, Vector3 } from 'three';
import { SIM_HZ, TOOL_LEN, type Vec3 } from '../src/config';
import { ArmModel } from '../src/arm/arm';
import type { Action } from '../src/env/env';
import { forwardKinematics, solveIK, toolOrientation } from '../src/arm/ik';
import { createIncident, nominalAction, RecoveryEngine, type HandPose, type Side } from '../src/recovery/engine';
import { buildSkill, replayAction, segmentAttempt, validateReplay } from '../src/recovery/skill';

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function nominal(side: Side, blocked = true) {
  const inc = createIncident(side);
  const env = new RecoveryEngine(inc, undefined, blocked);
  for (let i = 0; i < 300 && !env.metrics.collisions && !env.metrics.success; i++) {
    env.step(nominalAction(env.state(), inc));
  }
  return env;
}

function teach(side: Side) {
  const prior = nominal(side);
  const inc = prior.incident;
  const env = new RecoveryEngine(inc, prior.snapshot());
  const lane = side === 'left' ? 0.21 : -0.26;
  let pathLengthM = 0;
  const hand: HandPose = {
    tracked: true,
    wrist: { position: [-0.1, 0.98, -0.34], orientation: [0, 0, 0, 1] },
    thumbTip: [0, 1, -0.4],
    indexTip: [0.01, 1, -0.4],
    thumbTipOrientation: [0, 1, 0, 0],
    indexTipOrientation: [1, 0, 0, 0],
  };
  function step(target: Vec3, grip: Action['grip'], pose = hand) {
    const prev = env.snapshot().tip;
    env.step({ target, grip }, pose);
    pathLengthM += dist(prev, env.state().tip);
  }
  function move(target: Vec3, grip: Action['grip']) {
    for (let steps = 0; steps < 70; steps++) {
      step(target, grip);
      if (dist(env.state().tip, target) < 0.0001) return;
    }
    throw new Error('Unreachable demonstration waypoint ' + target);
  }
  move([lane, 0.89, -0.55], 0);
  move([lane, 0.89, -0.86], 0);
  move(inc.carton, 0);
  for (let i = 0; i < 5; i++) step(inc.carton, 1);
  const untracked: HandPose = { tracked: false, wrist: null, thumbTip: null, indexTip: null };
  for (let i = 0; i < 5; i++) step([...env.state().tip], 1, untracked);
  move([lane, 0.9, -0.86], 1);
  move([lane, 0.9, -0.54], 1);
  move([inc.tray[0], 0.87, inc.tray[2]], 1);
  step([...env.state().tip], 0);
  return { attempt: env.finish(), pathLengthM, hand };
}

describe('Recovery workcell', () => {
  it('runs the same carton and tray to completion with a clear lane', () => {
    const env = nominal('left', false);
    expect(env.metrics.success).toBe(true);
    expect(env.metrics.collisions).toBe(0);
    expect(env.state().held).toBeNull();
    expect(env.start.cubes.red).toEqual(createIncident('right').carton);
  });

  it.each(['left', 'right'] as const)(
    'halts the open gripper on the %s intrusion, preserving its last clear pose',
    (side) => {
      const env = nominal(side);
      expect(env.metrics.success).toBe(false);
      expect(env.metrics.collisions).toBe(1);
      expect(env.state().held).toBeNull();
      expect(env.state().cubes.red).toEqual(env.start.cubes.red);
      const atContact = env.snapshot();
      const entry = env.firstContact!;
      expect(entry.body).toBe('gripper');
      expect(entry.point[2]).toBeCloseTo(env.incident.obstacle.max[2], 8);
      expect(entry.point).not.toEqual(atContact.tip);
      expect(entry.t).toBeGreaterThanOrEqual(entry.step / SIM_HZ);
      expect(entry.t).toBeLessThanOrEqual((entry.step + 1) / SIM_HZ);
      // Compare the collision marker with the independent articulated Three.js mesh at impact time.
      const candidate = new RecoveryEngine(env.incident, atContact, false);
      candidate.step(nominalAction(candidate.state(), env.incident));
      const tip = new Vector3(...atContact.tip).lerp(
        new Vector3(...candidate.state().tip),
        entry.t * SIM_HZ - entry.step,
      );
      const model = new ArmModel();
      model.setJoints(solveIK(tip.toArray() as Vec3).joints);
      model.root.updateMatrixWorld(true);
      const meshName = {
        palm: 'gripper-palm',
        'left-finger': 'gripper-left',
        'right-finger': 'gripper-right',
        carton: '',
      }[entry.part];
      const mesh = model.root.getObjectByName(meshName) as Mesh;
      mesh.geometry.computeBoundingBox();
      const local = mesh.worldToLocal(new Vector3(...entry.point));
      expect(mesh.geometry.boundingBox!.distanceToPoint(local)).toBeLessThan(0.0003);

      for (let i = 0; i < 6; i++) env.step(nominalAction(env.state(), env.incident));
      expect(env.metrics.collisions).toBe(1);
      expect(env.snapshot().tip).toEqual(atContact.tip);
      env.step({ target: env.start.tip, grip: 0 });
      for (let i = 0; i < 8; i++) env.step(nominalAction(env.state(), env.incident));
      expect(env.metrics.collisions).toBe(2);
      const saved = env.finish();
      expect(saved.contactEvents.map((e) => e.step)).toEqual(saved.contacts);
    },
  );

  it('detects the carton falling onto the tote even when the elevated gripper clears it', () => {
    const inc = createIncident('right');
    const start = new RecoveryEngine(inc).snapshot();
    const ik = solveIK([0, 1.05, -0.7]);
    Object.assign(start, { tip: ik.tip, joints: ik.joints, grip: 1, held: 'red', cubes: { red: [...ik.tip] } });
    const env = new RecoveryEngine(inc, start);
    env.step({ target: [...start.tip], grip: 0 });
    expect(env.metrics.collisions).toBe(1);
    expect(env.firstContact?.body).toBe('carton');
    expect(env.firstContact?.point[1]).toBe(inc.obstacle.max[1]);
    expect(env.state().held).toBe('red');
  });

  it('allows free space between the fingers and detects the palm itself', () => {
    const inc = createIncident('right');
    const start = new RecoveryEngine(inc).snapshot();
    const tinyBoxAround = (p: Vector3) => ({
      min: p.clone().addScalar(-0.002).toArray() as Vec3,
      max: p.clone().addScalar(0.002).toArray() as Vec3,
    });
    const model = new ArmModel();
    model.setJoints(start.joints);
    model.root.updateMatrixWorld(true);
    const command: Action = { target: [...start.tip], grip: 0 };
    const gap = new RecoveryEngine({ ...inc, obstacle: tinyBoxAround(new Vector3(...start.tip)) }, start);
    gap.step(command);
    expect(gap.metrics.collisions).toBe(0);
    const palm = model.root.getObjectByName('gripper-palm') as Mesh;
    const bead = palm.localToWorld(new Vector3(0.048, 0, 0));
    const touching = new RecoveryEngine({ ...inc, obstacle: tinyBoxAround(bead) }, start);
    touching.step(command);
    expect(touching.firstContact?.part).toBe('palm');
  });

  it('reconstructs the articulated model tip and quaternion from recorded joint angles', () => {
    const model = new ArmModel();
    for (const target of [
      [-0.3, 0.82, -0.55],
      [0.26, 1.16, -0.8],
      [0.12, 0.775, -0.86],
    ] as Vec3[]) {
      const ik = solveIK(target);
      model.setJoints(ik.joints);
      model.root.updateMatrixWorld(true);
      const tool = model.root.getObjectByName('gripper-palm')!.parent!;
      const renderedTip = tool.localToWorld(new Vector3(0, 0, TOOL_LEN));
      const fk = forwardKinematics(ik.joints);
      expect(renderedTip.distanceTo(new Vector3(...fk.tip))).toBeLessThan(1e-10);
      const recorded = new Quaternion(...toolOrientation(ik.joints));
      const rendered = tool.getWorldQuaternion(new Quaternion());
      expect(Math.abs(recorded.dot(rendered))).toBeCloseTo(1, 10);
      // The boxes queried in collision tests originate in this FK hierarchy.
      expect(new Box3().setFromObject(tool).containsPoint(renderedTip)).toBe(true);
    }
  });
});

describe('Recovery demonstration and executable skill', () => {
  it.each(['left', 'right'] as const)(
    'records, segments, compresses and replays a human-shaped %s detour',
    (side) => {
      const { attempt, pathLengthM, hand } = teach(side);
      expect(attempt.metrics).toMatchObject({ success: true, collisions: 0, pathLengthM });
      expect(attempt.metrics.durationS).toBe(attempt.samples.length / SIM_HZ);
      expect(attempt.samples.at(-1)!.t).toBeCloseTo((attempt.samples.length - 1) / SIM_HZ, 4);
      expect(attempt.samples.filter((s) => s.hand?.tracked === false)).toHaveLength(5);
      hand.wrist!.orientation[3] = 0;
      hand.thumbTipOrientation![1] = 0;
      expect(attempt.samples[0].hand!.wrist!.orientation[3]).toBe(1);
      expect(attempt.samples[0].hand!.thumbTipOrientation).toEqual([0, 1, 0, 0]);
      expect(attempt.start.tipOrientation).toEqual(toolOrientation(attempt.start.joints));
      expect(attempt.final.tipOrientation).toEqual(toolOrientation(attempt.final.joints));
      expect(attempt.coordinates.cartonOrientation).toEqual([0, 0, 0, 1]);
      const skill = buildSkill(attempt);
      expect(skill.phases.map((p) => p.name)).toEqual(['approach', 'grasp', 'transport', 'release']);
      expect(skill.phases).toEqual(segmentAttempt(attempt));
      expect(skill.keyframes.length).toBeLessThan(attempt.samples.length * 0.8);
      expect(skill.smoothingWeight).toBeGreaterThan(0);
      for (const p of skill.phases) {
        expect(replayAction(skill, p.startStep)).toEqual(
          expect.objectContaining({ target: attempt.samples[p.startStep].target }),
        );
      }
      expect(replayAction(skill, skill.steps)).toBeNull();
      const restored = JSON.parse(JSON.stringify(skill));
      const replay = validateReplay(restored, attempt);
      expect(replay.valid).toBe(true);
      expect(replay.metrics.success).toBe(true);
      expect(replay.metrics.collisions).toBe(0);
      expect(replay.maxTipErrorM).toBeLessThanOrEqual(0.012);
      expect(replay.metrics.durationS).toBe(attempt.metrics.durationS);
      const fresh = new RecoveryEngine(createIncident(side === 'left' ? 'right' : 'left'), skill.start);
      for (let i = 0; i < skill.steps; i++) fresh.step(replayAction(skill, i)!);
      expect(fresh.metrics.collisions).toBeGreaterThan(0);
    },
  );

  it('refuses failed demonstrations and detects a corrupted replay', () => {
    expect(() => buildSkill(nominal('right').finish())).toThrow();
    const { attempt } = teach('left');
    const skill = buildSkill(attempt);
    for (const key of skill.keyframes) key.grip = 0;
    const replay = validateReplay(skill, attempt);
    expect(replay.valid).toBe(false);
    expect(replay.metrics.success).toBe(false);
  });
});
