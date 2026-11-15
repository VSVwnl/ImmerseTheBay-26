import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { BIN, state, waitPhase, type V3 } from './helpers';

const SHOTS = 'e2e-shots';
const WHEEL_STEP = 0.0006;

const info = (page: Page) =>
  page.evaluate(() => {
    const b = (window as any).__backlot;
    const s = b.state();
    return {
      target: b.desktop.target as V3,
      grip: b.desktop.grip as 0 | 1,
      tip: s.tip as V3,
      holoTip: b.holo.holoTip(s.tip) as V3,
      scale: b.holo.anchor.scale as number,
      grabbing: b.holo.link.grabbing as boolean,
    };
  });
const project = (page: Page, p: V3) => page.evaluate((q) => (window as any).__backlot.project(q), p) as Promise<{ x: number; y: number }>;
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

async function settle(page: Page, tol = 0.004) {
  for (let i = 0; i < 150; i++) {
    const s = await info(page);
    if (dist(s.tip, s.target) < tol) return;
    await page.waitForTimeout(30);
  }
}

/** Click the hologram's tip without dragging: toggles the gripper. */
async function holoTap(page: Page) {
  await settle(page);
  const s = await info(page);
  const a = await project(page, s.holoTip);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(150);
}

/** Drive the real tip to p only by dragging the hologram tip (x/z) and the wheel (height). */
async function holoMoveTo(page: Page, p: V3, tol = 0.007) {
  for (let i = 0; i < 6; i++) {
    await settle(page);
    const s = await info(page);
    const dx = (p[0] - s.target[0]) * s.scale;
    const dz = (p[2] - s.target[2]) * s.scale;
    if (Math.hypot(dx, dz) > 0.0006) {
      const H = s.holoTip;
      const a = await project(page, H);
      const b = await project(page, [H[0] + dx, H[1], H[2] + dz]);
      // leave the dead zone first so even a short correction is a drag, not a tap
      const away = await project(page, [H[0] + dx + 0.02, H[1], H[2] + dz]);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(away.x, away.y, { steps: 6 });
      await page.mouse.move(b.x, b.y, { steps: 6 });
      await page.waitForTimeout(40);
      await page.mouse.up();
      await page.waitForTimeout(40);
    }
    const t = (await info(page)).target;
    const dy = p[1] - t[1];
    if (Math.abs(dy) >= 0.002) {
      await page.mouse.wheel(0, -dy / WHEEL_STEP);
      let last = t[1];
      for (let k = 0; k < 40; k++) {
        await page.waitForTimeout(25);
        const y = (await info(page)).target[1];
        if (y !== last) last = y;
        else if (y !== t[1]) break;
      }
    }
    const t2 = (await info(page)).target;
    if (dist(t2, p) < tol * 0.6) break;
  }
  for (let i = 0; i < 150; i++) {
    const s = await state(page);
    if (dist(s.tip, p) < tol) return;
    await page.waitForTimeout(30);
  }
  const s = await info(page);
  throw new Error(`tip did not arrive: tip=${s.tip} want=${p} target=${s.target}`);
}

async function holoPickAndPlace(page: Page, cube: V3, bin: V3) {
  await holoMoveTo(page, [cube[0], cube[1] + 0.1, cube[2]]);
  await holoMoveTo(page, [cube[0], 0.775, cube[2]]);
  await holoTap(page);
  const g = await state(page);
  if (!g.held) throw new Error(`grab failed: ${JSON.stringify(g)}`);
  await holoMoveTo(page, [cube[0], 0.95, cube[2]]);
  await holoMoveTo(page, [bin[0], 0.95, bin[2]]);
  await holoTap(page);
  const r = await state(page);
  if (r.held) throw new Error(`release failed: ${JSON.stringify(r)}`);
}

test('Hologram: drag the hologram tip to move the arm, tap it to grip, all three challenges', async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

  await page.goto('/?orbis=0&holo=1');
  await page.waitForFunction(() => (window as any).__backlot?.holo?.hologram.group.visible === true);
  await page.mouse.click(900, 640); // user gesture on empty table: no grip, no movement
  await page.waitForTimeout(200);

  // the plain mouse no longer drives the arm
  const t0 = (await info(page)).target;
  await page.mouse.move(700, 600, { steps: 5 });
  await page.mouse.move(1000, 700, { steps: 5 });
  expect((await info(page)).target).toEqual(t0);
  expect((await info(page)).grip).toBe(0);

  // hovering the hologram tip highlights it
  const s0 = await info(page);
  const h0 = await project(page, s0.holoTip);
  await page.mouse.move(h0.x, h0.y);
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => (window as any).__backlot.holo.link.hover)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/holo-01-idle.png` });

  // tap toggles the gripper and leaves the target alone
  await holoTap(page);
  expect((await info(page)).grip).toBe(1);
  expect((await info(page)).target).toEqual(t0);
  await holoTap(page);
  expect((await info(page)).grip).toBe(0);

  // a drag moves the real target by the hologram delta / scale, and the real tip follows
  const want: V3 = [0.2, t0[1], -0.6];
  {
    const s = await info(page);
    const H = s.holoTip;
    const a = await project(page, H);
    const b = await project(page, [H[0] + (want[0] - s.target[0]) * s.scale, H[1], H[2] + (want[2] - s.target[2]) * s.scale]);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 });
    expect((await info(page)).grabbing).toBe(true);
    await page.screenshot({ path: `${SHOTS}/holo-02-dragging.png` });
    await page.mouse.up();
  }
  const t1 = (await info(page)).target;
  expect(dist(t1, want)).toBeLessThan(0.01);
  await settle(page);
  expect(dist((await state(page)).tip, want)).toBeLessThan(0.012);
  expect((await info(page)).grip).toBe(0); // a drag is not a tap

  // pressing away from the hologram tip and dragging does nothing
  {
    const before = (await info(page)).target;
    await page.mouse.move(640, 560);
    await page.mouse.down();
    await page.mouse.move(800, 600, { steps: 8 });
    await page.mouse.up();
    expect((await info(page)).target).toEqual(before);
  }

  // the three challenges, driven only through the hologram
  const sessionId: string = await page.evaluate(() => (window as any).__backlot.sessionId);
  await page.locator('.panel-side button[data-id="start"]').click();
  await waitPhase(page, 'running');
  let s = await state(page);
  expect(s.layout).toBe('reach');
  for (const t of s.reachTargets) await holoMoveTo(page, t, 0.038);
  await waitPhase(page, 'between');

  await waitPhase(page, 'running');
  s = await state(page);
  expect(s.layout).toBe('place');
  await holoPickAndPlace(page, s.cubes.red!, BIN.red);
  await page.screenshot({ path: `${SHOTS}/holo-03-placed.png` });
  await waitPhase(page, 'between');

  await waitPhase(page, 'running');
  s = await state(page);
  expect(s.layout).toBe('sort');
  await holoPickAndPlace(page, s.cubes.red!, BIN.red);
  s = await state(page);
  await holoMoveTo(page, [s.cubes.blue![0], s.cubes.blue![1] + 0.1, s.cubes.blue![2]]);
  await page.screenshot({ path: `${SHOTS}/holo-04-sort.png` });
  await holoPickAndPlace(page, s.cubes.blue!, BIN.blue);
  await waitPhase(page, 'results', 10000);

  const results = await page.evaluate(() => (window as any).__backlot.challenges.results);
  expect(results.map((r: any) => r.success)).toEqual([true, true, true]);
  const dir = path.join('data', 'sessions', sessionId);
  await expect.poll(() => (fs.existsSync(dir) ? fs.readdirSync(dir).length : 0)).toBe(3);
  for (const f of fs.readdirSync(dir)) {
    const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    expect(rec.success).toBe(true);
    expect(rec.input).toBe('mouse');
  }
  expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
});

test('Hologram is off without ?holo=1 (mouse drives the arm as before)', async ({ page }) => {
  await page.goto('/?orbis=0');
  await page.waitForFunction(() => !!(window as any).__backlot);
  expect(await page.evaluate(() => (window as any).__backlot.holo)).toBe(null);
  expect(await page.evaluate(() => !!(window as any).__backlot.scene.getObjectByName('hologram'))).toBe(false);
  const t0 = await page.evaluate(() => [...(window as any).__backlot.desktop.target]);
  await page.mouse.move(640, 600, { steps: 4 });
  await page.mouse.move(760, 640, { steps: 4 });
  const t1 = await page.evaluate(() => [...(window as any).__backlot.desktop.target]);
  expect(t1).not.toEqual(t0);
});
