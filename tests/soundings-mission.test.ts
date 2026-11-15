import { describe, expect, it } from 'vitest';
import { forwardKinematics, solveIK } from '../src/arm/ik';
import { GRAB_RADIUS, SIM_DT, type Vec3 } from '../src/config';
import {
  armBase,
  cradleAt,
  handleAt,
  lipHeight,
  SoundingsMission,
  validRig,
  type Rail,
  type Rig,
  type Site,
} from '../src/soundings/mission';

const port: Rig = { arm: 'port', lamp: 'starboard', aim: 'inward' };
const starboard: Rig = { arm: 'starboard', lamp: 'port', aim: 'inward' };
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function move(mission: SoundingsMission, target: Vec3, grip: 0 | 1, seconds = 1.5) {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) mission.step({ target, grip }, SIM_DT);
}

function recover(mission: SoundingsMission) {
  const source = handleAt(mission.site);
  const cradle = cradleAt(mission.site);
  move(mission, source, 0);
  mission.step({ target: source, grip: 1 }, SIM_DT);
  expect(mission.state.held).toBe(true);
  move(mission, [source[0], 1.02, source[2]], 1);
  move(mission, [cradle[0], 1.02, cradle[2]], 1);
  move(mission, cradle, 1);
  mission.step({ target: cradle, grip: 0 }, SIM_DT);
}

describe('Soundings engineering decisions', () => {
  it('offers four occupied-socket arrangements with two aim detents per arrangement', () => {
    const rails: Rail[] = ['port', 'starboard'];
    for (const aim of ['inward', 'forward'] as const) {
      const options = rails.flatMap((arm) =>
        (['inner', ...rails] as const).map((lamp) => ({ arm, lamp, aim })),
      );
      expect(options.filter(validRig)).toHaveLength(4);
      for (const duplicate of options.filter((rig) => rig.arm === rig.lamp)) {
        expect(() => new SoundingsMission('dock', duplicate)).toThrow(/socket/);
      }
    }
  });

  it.each([
    ['canyon', port, starboard],
    ['mirror', starboard, port],
  ] as [Site, Rig, Rig][])(
    '%s can be recovered on the near rail and the far rail falls physically short',
    (site, near, far) => {
      const farMission = new SoundingsMission(site, far);
      const source = handleAt(site);
      move(farMission, source, 0);
      farMission.step({ target: source, grip: 1 }, SIM_DT);
      expect(farMission.state.misses).toBe(1);
      expect(farMission.state.closestM).toBeGreaterThan(GRAB_RADIUS);
      expect(farMission.state.closestM).toBeLessThan(0.1);
      expect(
        dist(forwardKinematics(farMission.state.joints, armBase(far)).tip, farMission.state.tip),
      ).toBeLessThan(1e-8);
      expect(farMission.diagnosis()).toContain('cm short');

      const nearMission = new SoundingsMission(site, near, 'clear');
      recover(nearMission);
      expect(nearMission.state.success).toBe(true);
      expect(nearMission.state.handle).toEqual(cradleAt(site));
      expect(nearMission.record.outcome).toBe('recovered');
      expect(nearMission.record.prediction).toBe('clear');
      expect(nearMission.record.events.map((e) => e.type)).toEqual(['grasp', 'delivery']);
      const replay = new SoundingsMission(site, near);
      for (const sample of nearMission.record.samples) replay.step(sample, SIM_DT);
      expect(replay.state).toEqual(nearMission.state);
    },
  );

  it('lets either rail contact the dock target with the open jaws', () => {
    for (const rig of [port, starboard]) {
      const mission = new SoundingsMission('dock', rig);
      move(mission, handleAt('dock'), 0);
      expect(mission.record.outcome).toBe('dock-cleared');
      expect(mission.record.events.map((e) => e.type)).toEqual(['dock']);
    }
  });

  it('retains the snag, drop and subsequent regrip while the pilot stays in the same dive', () => {
    const mission = new SoundingsMission('canyon', port);
    const source = handleAt('canyon');
    move(mission, source, 0);
    mission.step({ target: source, grip: 1 }, SIM_DT);
    move(mission, [source[0] - 0.18, source[1], source[2]], 1);
    expect(mission.state.snagged).toBe(true);
    expect(mission.state.tip[0]).toBeGreaterThan(source[0] - 0.1);
    expect(mission.record.events.filter((e) => e.type === 'snag')).toHaveLength(1);
    move(mission, [mission.state.tip[0], lipHeight('canyon') + 0.12, source[2]], 1);
    const intermediate: Vec3 = [0.19, 1.01, -0.61];
    move(mission, intermediate, 1);
    mission.step({ target: intermediate, grip: 0 }, SIM_DT);
    expect(mission.state.drops).toBe(1);
    expect(mission.state.success).toBe(false);
    expect(mission.state.handle[1]).toEqual(source[1]);
    const dropped = [...mission.state.handle] as Vec3;
    move(mission, dropped, 0);
    mission.step({ target: dropped, grip: 1 }, SIM_DT);
    expect(mission.state.held).toBe(true);
    move(mission, cradleAt('canyon'), 1);
    mission.step({ target: cradleAt('canyon'), grip: 0 }, SIM_DT);
    expect(mission.state.success).toBe(true);
  });

  it('ties an observed frame to each missed or successful closure and preserves aborted attempts', () => {
    const mission = new SoundingsMission('canyon', port, 'scatter');
    mission.steer('light the suspended sediment', 'live');
    mission.reportSymbol('ring', 'bars');
    mission.step({ target: mission.state.tip, grip: 1 }, SIM_DT);
    mission.frame('data:image/jpeg;base64,abc', 'live');
    expect(mission.diagnosis()).toContain('symbol');
    const firstFrame = mission.record.events.at(-1);
    expect(firstFrame).toMatchObject({ type: 'frame', source: 'live', contactEvent: 2 });
    move(mission, handleAt('canyon'), 0);
    mission.step({ target: handleAt('canyon'), grip: 1 }, SIM_DT);
    mission.frame('data:image/jpeg;base64,def', 'live');
    const secondFrame = mission.record.events.at(-1);
    expect(secondFrame).toMatchObject({ type: 'frame', contactEvent: 4 });
    mission.abort();
    const count = mission.record.samples.length;
    mission.step({ target: handleAt('canyon'), grip: 0 }, 1);
    expect(mission.record.samples.length).toBe(count);
    expect(mission.record.outcome).toBe('aborted');
    expect(mission.state.misses).toBe(1);
  });

  it('records at 30 Hz when driven from 72 or 90 Hz', () => {
    const a = new SoundingsMission('canyon', port);
    const b = new SoundingsMission('canyon', port);
    const action = { target: handleAt('canyon'), grip: 0 as const };
    for (let i = 0; i < 72; i++) a.step(action, 1 / 72);
    for (let i = 0; i < 90; i++) b.step(action, 1 / 90);
    expect(a.record.samples).toHaveLength(30);
    expect(a.record.samples).toEqual(b.record.samples);
    expect(a.state).toEqual(b.state);
    expect(a.state.tip).toEqual(solveIK(action.target, armBase(port)).tip);
  });
});
