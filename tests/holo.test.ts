import { describe, expect, it } from 'vitest';
import { AnchorFilter, HoloLink, clampWorkspace, fromHolo, palmUpDot, pinchClosed, toHolo, type Anchor, type ArmStore } from '../src/holo/link';
import { ARM_BASE, HOLO, HOME_TIP, WORKSPACE, type Vec3 } from '../src/config';

const A: Anchor = { pos: [-0.2, 1.1, -0.3], scale: 0.3 };
const DT = 1 / 72;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const store = (): ArmStore => ({ target: [...HOME_TIP], grip: 0 });

describe('hologram mapping', () => {
  it('arm base maps to the anchor, and toHolo/fromHolo invert', () => {
    expect(toHolo(ARM_BASE, A)).toEqual(A.pos);
    const p: Vec3 = [0.13, 0.91, -0.62];
    fromHolo(toHolo(p, A), A).forEach((v, i) => expect(v).toBeCloseTo(p[i], 12));
  });

  it('distances shrink by the scale', () => {
    const a = toHolo([0, 1, -0.5], A);
    const b = toHolo([0.1, 1, -0.5], A);
    expect(b[0] - a[0]).toBeCloseTo(0.03, 12);
  });

  it('clampWorkspace keeps targets reachable', () => {
    expect(clampWorkspace([5, -5, 0])).toEqual([WORKSPACE.max[0], WORKSPACE.min[1], WORKSPACE.max[2]]);
  });

  it('pinch hysteresis', () => {
    expect(pinchClosed(false, 0.03)).toBe(false);
    expect(pinchClosed(false, 0.02)).toBe(true);
    expect(pinchClosed(true, 0.035)).toBe(true);
    expect(pinchClosed(true, 0.05)).toBe(false);
  });
});

describe('HoloLink', () => {
  const tip: Vec3 = [...HOME_TIP];
  const holoTip = toHolo(tip, A);

  it('a pinch away from the hologram tip does nothing', () => {
    const s = store();
    const l = new HoloLink(s);
    const far = add(holoTip, [0.1, 0, 0]);
    expect(l.update({ point: far, closed: false }, A, tip, DT)).toBe(null);
    expect(l.update({ point: far, closed: true }, A, tip, DT)).toBe(null);
    expect(l.grabbing).toBe(false);
    for (let i = 0; i < 10; i++) l.update({ point: add(far, [0.01 * i, 0, 0]), closed: true }, A, tip, DT);
    expect(s.target).toEqual(HOME_TIP);
  });

  it('closing near the tip grabs; dragging moves the target by delta / scale', () => {
    const s = store();
    const l = new HoloLink(s);
    l.update({ point: holoTip, closed: false }, A, tip, DT);
    expect(l.hover).toBe(true);
    expect(l.update({ point: holoTip, closed: true }, A, tip, DT)).toBe('grab');
    // move 3 cm right and 1.5 cm up in hologram space in small steps
    let ev = null;
    const evs: string[] = [];
    for (let i = 1; i <= 10; i++) {
      ev = l.update({ point: add(holoTip, [0.003 * i, 0.0015 * i, 0]), closed: true }, A, tip, DT);
      if (ev) evs.push(ev);
    }
    expect(evs).toEqual(['drag']);
    expect(s.target[0]).toBeCloseTo(HOME_TIP[0] + 0.1, 9);
    expect(s.target[1]).toBeCloseTo(HOME_TIP[1] + 0.05, 9);
    expect(s.target[2]).toBeCloseTo(HOME_TIP[2], 9);
    expect(l.update({ point: add(holoTip, [0.03, 0.015, 0]), closed: false }, A, tip, DT)).toBe('release');
    expect(s.grip).toBe(0);
    // after release, moving the hand does nothing
    l.update({ point: add(holoTip, [0.06, 0, 0]), closed: false }, A, tip, DT);
    expect(s.target[0]).toBeCloseTo(HOME_TIP[0] + 0.1, 9);
  });

  it('a short pinch without moving toggles the gripper and leaves the target alone', () => {
    const s = store();
    const l = new HoloLink(s);
    l.update({ point: holoTip, closed: true }, A, tip, DT);
    l.update({ point: add(holoTip, [0.002, 0, 0]), closed: true }, A, tip, DT); // inside the dead zone
    expect(s.target).toEqual(HOME_TIP);
    expect(l.update({ point: holoTip, closed: false }, A, tip, DT)).toBe('tap');
    expect(s.grip).toBe(1);
    l.update({ point: holoTip, closed: true }, A, tip, DT);
    expect(l.update({ point: holoTip, closed: false }, A, tip, DT)).toBe('tap');
    expect(s.grip).toBe(0);
  });

  it('a long still pinch is not a tap', () => {
    const s = store();
    const l = new HoloLink(s);
    l.update({ point: holoTip, closed: true }, A, tip, DT);
    for (let i = 0; i < Math.ceil((HOLO.tapMaxS + 0.1) / DT); i++) l.update({ point: holoTip, closed: true }, A, tip, DT);
    expect(l.update({ point: holoTip, closed: false }, A, tip, DT)).toBe('release');
    expect(s.grip).toBe(0);
  });

  it('a pinch already closed when reaching the tip does not grab (needs a fresh close)', () => {
    const s = store();
    const l = new HoloLink(s);
    l.update({ point: add(holoTip, [0.2, 0, 0]), closed: true }, A, tip, DT);
    expect(l.update({ point: holoTip, closed: true }, A, tip, DT)).toBe(null);
    expect(l.grabbing).toBe(false);
  });

  it('dragging clamps to the workspace, and wheel changes made mid-drag persist', () => {
    const s = store();
    const l = new HoloLink(s);
    l.update({ point: holoTip, closed: true }, A, tip, DT);
    for (let i = 1; i <= 40; i++) l.update({ point: add(holoTip, [0.01 * i, 0, 0]), closed: true }, A, tip, DT);
    expect(s.target[0]).toBe(WORKSPACE.max[0]);
    s.target[1] += 0.05; // like a wheel step during the drag
    l.update({ point: add(holoTip, [0.4, 0, 0.003]), closed: true }, A, tip, DT);
    expect(s.target[1]).toBeCloseTo(HOME_TIP[1] + 0.05, 9);
    expect(s.target[2]).toBeCloseTo(HOME_TIP[2] + 0.01, 9);
  });

  it('losing the hand mid-grab releases without a tap', () => {
    const s = store();
    const l = new HoloLink(s);
    l.update({ point: holoTip, closed: true }, A, tip, DT);
    expect(l.update(null, A, tip, DT)).toBe('release');
    expect(s.grip).toBe(0);
    expect(l.grabbing).toBe(false);
  });

  it('the anchor moving with the palm while the fingers stay still moves the arm the other way', () => {
    const s = store();
    const l = new HoloLink(s);
    l.update({ point: holoTip, closed: true }, A, tip, DT);
    l.update({ point: add(holoTip, [0.01, 0, 0]), closed: true }, A, tip, DT); // start dragging
    const x0 = s.target[0];
    const moved: Anchor = { pos: add(A.pos, [0.01, 0, 0]), scale: A.scale };
    l.update({ point: add(holoTip, [0.01, 0, 0]), closed: true }, moved, tip, DT);
    expect(s.target[0]).toBeCloseTo(x0 - 0.01 / A.scale, 9);
  });
});

describe('palm and anchor', () => {
  it('palmUpDot: identity joint (palm down) is -1, rolled 180 degrees about Z (palm up) is +1', () => {
    expect(palmUpDot([0, 0, 0, 1])).toBeCloseTo(-1, 12);
    expect(palmUpDot([0, 0, 1, 0])).toBeCloseTo(1, 12);
    // rolled 90 degrees: palm sideways
    expect(palmUpDot([0, 0, Math.SQRT1_2, Math.SQRT1_2])).toBeCloseTo(0, 12);
  });

  it('AnchorFilter lifts, smooths, holds briefly, and holds while grabbed', () => {
    const f = new AnchorFilter(0.3);
    const a = f.update([0, 1, -0.3], false, DT)!;
    expect(a.pos[1]).toBeCloseTo(1 + HOLO.palmLift, 12);
    const b = f.update([0.1, 1, -0.3], false, DT)!;
    expect(b.pos[0]).toBeGreaterThan(0);
    expect(b.pos[0]).toBeLessThan(0.1);
    // palm turns away: kept for hideAfterS
    let n = 0;
    while (f.update(null, false, DT) && n < 1000) n++;
    expect(n * DT).toBeGreaterThan(HOLO.hideAfterS - 2 * DT);
    expect(n * DT).toBeLessThan(HOLO.hideAfterS + 2 * DT);
    // while held it never disappears
    f.update([0, 1, -0.3], false, DT);
    for (let i = 0; i < 500; i++) expect(f.update(null, true, DT)).not.toBe(null);
  });
});
