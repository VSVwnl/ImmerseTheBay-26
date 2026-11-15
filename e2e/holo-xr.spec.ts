// The headset path of the hologram, with fake hands: XRInput's presenting flag and joint reads are replaced in the
// page, so everything from xrHoloFrame through HoloLink, the app loop, the env and the recorder runs for real.
import { expect, test, type Page } from '@playwright/test';
import { state, type V3 } from './helpers';

type Q = [number, number, number, number];
const PALM_UP: Q = [0, 0, 1, 0];
const PALM_DOWN: Q = [0, 0, 0, 1];

async function fake(page: Page) {
  await page.evaluate(() => {
    const b = (window as any).__backlot;
    const f = ((window as any).__fake = { left: null, right: null, lc: null, rc: null } as any);
    Object.defineProperty(b.xr, 'presenting', { get: () => true });
    b.xr.handData = (side: string) => f[side];
    b.xr.controllerData = (side: string) => (side === 'left' ? f.lc : f.rc);
  });
}
const set = (page: Page, v: any) => page.evaluate((v) => Object.assign((window as any).__fake, v), v);
const hand = (palm: V3, q: Q, pinch: V3, gap: number) => ({
  thumb: [pinch[0] - gap / 2, pinch[1], pinch[2]],
  index: [pinch[0] + gap / 2, pinch[1], pinch[2]],
  palm,
  wristQuat: q,
});
const holo = (page: Page) =>
  page.evaluate(() => {
    const b = (window as any).__backlot;
    const s = b.state();
    return {
      anchor: b.holo.anchor,
      visible: b.holo.hologram.group.visible,
      holoTip: b.holo.anchor ? b.holo.holoTip(s.tip) : null,
      target: [...b.desktop.target] as V3,
      grip: b.desktop.grip,
      tip: s.tip as V3,
      grabbing: b.holo.link.grabbing,
      kind: b.holo.inputKind,
    };
  });
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

test('Hologram in the headset (fake hands): palm up shows it, right pinch drags and taps', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?orbis=0&holo=1');
  await page.waitForFunction(() => !!(window as any).__backlot?.holo);
  await fake(page);
  const palm: V3 = [-0.25, 1.0, -0.3];
  const far: V3 = [0.3, 1.2, -0.2];

  // palm down: no hologram
  await set(page, { left: hand(palm, PALM_DOWN, [-0.25, 1.05, -0.3], 0.08), right: hand([0.3, 1, -0.3], PALM_DOWN, far, 0.08) });
  await page.waitForTimeout(500);
  expect((await holo(page)).anchor).toBe(null);
  await page.waitForTimeout(400);
  expect((await holo(page)).visible).toBe(false);

  // palm up: hologram stands on the palm (lifted), at the headset scale
  await set(page, { left: hand(palm, PALM_UP, [-0.25, 1.05, -0.3], 0.08) });
  await page.waitForTimeout(700);
  let h = await holo(page);
  expect(h.visible).toBe(true);
  expect(h.anchor.scale).toBeCloseTo(0.3, 6);
  expect(h.anchor.pos[1]).toBeCloseTo(1.04, 2);
  expect(h.anchor.pos[0]).toBeCloseTo(-0.25, 2);

  // right hand: open at the hologram tip, pinch quickly -> gripper toggles, target unchanged
  const t0 = h.target;
  const at = h.holoTip as V3;
  await set(page, { right: hand([0.3, 1, -0.3], PALM_DOWN, at, 0.08) });
  await page.waitForTimeout(100);
  await set(page, { right: hand([0.3, 1, -0.3], PALM_DOWN, at, 0.015) });
  await page.waitForTimeout(120);
  await set(page, { right: hand([0.3, 1, -0.3], PALM_DOWN, at, 0.08) });
  await page.waitForTimeout(150);
  h = await holo(page);
  expect(h.grip).toBe(1);
  expect(h.target).toEqual(t0);
  expect(h.kind).toBe('hand');

  // pinch and drag 3 cm right, 1.5 cm toward the user: real target moves 10 cm and 5 cm
  await set(page, { right: hand([0.3, 1, -0.3], PALM_DOWN, at, 0.015) });
  await page.waitForTimeout(100);
  expect((await holo(page)).grabbing).toBe(true);
  for (let i = 1; i <= 10; i++) {
    await set(page, { right: hand([0.3, 1, -0.3], PALM_DOWN, add(at, [0.003 * i, 0, 0.0015 * i]), 0.015) });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(300);
  await set(page, { right: hand([0.3, 1, -0.3], PALM_DOWN, add(at, [0.03, 0, 0.015]), 0.08) });
  await page.waitForTimeout(150);
  h = await holo(page);
  expect(h.grabbing).toBe(false);
  expect(h.grip).toBe(1); // a drag is not a tap
  expect(h.target[0]).toBeCloseTo(t0[0] + 0.1, 2);
  expect(h.target[2]).toBeCloseTo(t0[2] + 0.05, 2);
  await page.waitForTimeout(600);
  const s = await state(page);
  expect(Math.hypot(s.tip[0] - h.target[0], s.tip[2] - h.target[2])).toBeLessThan(0.01);

  // palm turns down mid-grab: the hologram stays while held, then hides after release
  const at2 = (await holo(page)).holoTip as V3;
  await set(page, { right: hand([0.3, 1, -0.3], PALM_DOWN, at2, 0.08) });
  await page.waitForTimeout(80);
  await set(page, { right: hand([0.3, 1, -0.3], PALM_DOWN, at2, 0.015) });
  await page.waitForTimeout(80);
  await set(page, { left: hand(palm, PALM_DOWN, [-0.25, 1.05, -0.3], 0.08) });
  await page.waitForTimeout(600);
  expect((await holo(page)).anchor).not.toBe(null);
  await set(page, { right: hand([0.3, 1, -0.3], PALM_DOWN, at2, 0.08) });
  await page.waitForTimeout(700);
  expect((await holo(page)).anchor).toBe(null);
  expect(errors).toEqual([]);
});

test('Hologram in the headset (fake controllers): left controller holds it, right trigger drags', async ({ page }) => {
  await page.goto('/?orbis=0&holo=1');
  await page.waitForFunction(() => !!(window as any).__backlot?.holo);
  await fake(page);
  const lc = { grip: [-0.25, 1.0, -0.3], point: [-0.25, 1.0, -0.35], trigger: 0 };
  await set(page, { lc });
  await page.waitForTimeout(500);
  let h = await holo(page);
  expect(h.visible).toBe(true);
  const at = h.holoTip as V3;
  const t0 = h.target;
  await set(page, { rc: { grip: at, point: at, trigger: 0 } });
  await page.waitForTimeout(80);
  await set(page, { rc: { grip: at, point: at, trigger: 1 } });
  await page.waitForTimeout(80);
  for (let i = 1; i <= 6; i++) {
    const p = add(at, [0, 0.003 * i, 0]);
    await set(page, { rc: { grip: p, point: p, trigger: 1 } });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(100);
  await set(page, { rc: { grip: at, point: add(at, [0, 0.018, 0]), trigger: 0 } });
  await page.waitForTimeout(150);
  h = await holo(page);
  expect(h.target[1]).toBeCloseTo(t0[1] + 0.06, 2);
  expect(h.kind).toBe('controller');
});
