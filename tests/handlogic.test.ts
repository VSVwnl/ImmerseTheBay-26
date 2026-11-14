import { describe, expect, it } from 'vitest';
import { ControllerControl, PinchControl, smoothAlpha } from '../src/input/handlogic';
import { HAND_OFFSET, type Vec3 } from '../src/config';

const hand = (p: Vec3, gap: number) => ({
  thumbTip: [p[0] - gap / 2, p[1], p[2]] as Vec3,
  indexTip: [p[0] + gap / 2, p[1], p[2]] as Vec3,
});
const DT = 1 / 72;

describe('PinchControl', () => {
  it('maps the pinch point plus offset to the target once settled', () => {
    const c = new PinchControl();
    const p: Vec3 = [0.1, 1.1, -0.4];
    for (let i = 0; i < 100; i++) c.update(hand(p, 0.08), DT);
    expect(c.active).toBe(true);
    c.target.forEach((v, i) => expect(v).toBeCloseTo(p[i] + HAND_OFFSET[i], 4));
  });

  it('low-passes: first frame after a jump moves 35% at 72 Hz', () => {
    const c = new PinchControl();
    c.update(hand([0, 1, -0.4], 0.08), DT);
    c.update(hand([0.1, 1, -0.4], 0.08), DT);
    expect(c.target[0]).toBeCloseTo(0.035, 6);
    expect(smoothAlpha(1 / 72)).toBeCloseTo(0.35, 9);
  });

  it('pinch has hysteresis', () => {
    const c = new PinchControl();
    const p: Vec3 = [0, 1, -0.4];
    c.update(hand(p, 0.03), DT);
    expect(c.grip).toBe(0); // between thresholds: stays open
    c.update(hand(p, 0.02), DT);
    expect(c.grip).toBe(1);
    c.update(hand(p, 0.035), DT);
    expect(c.grip).toBe(1); // between thresholds: stays closed
    c.update(hand(p, 0.05), DT);
    expect(c.grip).toBe(0);
  });

  it('holds target and grip outside the active region and when untracked', () => {
    const c = new PinchControl();
    for (let i = 0; i < 50; i++) c.update(hand([0, 1, -0.4], 0.02), DT);
    expect(c.grip).toBe(1);
    // hand drops below the table height (open fingers far below, so the smoothed point leaves at once)
    let i = 0;
    while (c.active && i++ < 50) c.update(hand([0, -2, -0.4], 0.08), DT);
    const held = [...c.target];
    for (let k = 0; k < 50; k++) c.update(hand([0, 0.5, -0.4], 0.08), DT);
    expect(c.active).toBe(false);
    expect(c.target).toEqual(held);
    expect(c.grip).toBe(1);
    // hand behind z = -0.10
    for (let i = 0; i < 50; i++) c.update(hand([0, 1, 0.5], 0.08), DT);
    expect(c.active).toBe(false);
    c.update(null, DT);
    expect(c.active).toBe(false);
    expect(c.target).toEqual(held);
  });
});

describe('ControllerControl', () => {
  it('trigger closes the gripper, grip pose drives the target', () => {
    const c = new ControllerControl();
    for (let i = 0; i < 100; i++) c.update({ grip: [0.2, 1.0, -0.3], trigger: 0 }, DT);
    expect(c.active).toBe(true);
    expect(c.target[0]).toBeCloseTo(0.2, 4);
    c.update({ grip: [0.2, 1.0, -0.3], trigger: 1 }, DT);
    expect(c.grip).toBe(1);
    c.update({ grip: [0.2, 1.0, -0.3], trigger: 0 }, DT);
    expect(c.grip).toBe(0);
  });
});
