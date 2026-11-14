import type { Page } from '@playwright/test';

export type V3 = [number, number, number];

export interface S {
  layout: string;
  tip: V3;
  grip: 0 | 1;
  held: string | null;
  cubes: { red?: V3; blue?: V3 };
  reachTargets: V3[];
  reachIndex: number;
  success: boolean;
}

export const state = (page: Page): Promise<S> => page.evaluate(() => (window as any).__backlot.state());
export const phase = (page: Page): Promise<string> => page.evaluate(() => (window as any).__backlot.challenges.phase);
const target = (page: Page): Promise<V3> => page.evaluate(() => (window as any).__backlot.desktop.target);

const WHEEL_STEP = 0.0006;

/** Drive the arm tip to p with the real mouse and wheel, wait until it arrives. */
export async function moveTo(page: Page, p: V3, tol = 0.006) {
  // alternate: put the cursor over the spot (on the canvas), then fix the height with the wheel
  for (let i = 0; i < 8; i++) {
    const t = await target(page);
    const xy = await page.evaluate((q) => (window as any).__backlot.project(q), [p[0], t[1], p[2]]);
    await page.mouse.move(xy.x, xy.y, { steps: 3 });
    await page.waitForTimeout(20);
    const dy = p[1] - t[1];
    if (Math.abs(dy) < 0.002 && i > 0) break;
    if (Math.abs(dy) >= 0.002) {
      await page.mouse.wheel(0, -dy / WHEEL_STEP);
      // wheel events arrive asynchronously: wait until the target height stops changing
      let last = t[1];
      for (let k = 0; k < 40; k++) {
        await page.waitForTimeout(25);
        const y = (await target(page))[1];
        if (y !== last) last = y;
        else if (y !== t[1]) break;
      }
    }
  }
  for (let i = 0; i < 150; i++) {
    const s = await state(page);
    if (Math.hypot(s.tip[0] - p[0], s.tip[1] - p[1], s.tip[2] - p[2]) < tol) return;
    await page.waitForTimeout(30);
  }
  const s = await state(page);
  const t = await target(page);
  const xy = await page.evaluate((q) => (window as any).__backlot.project(q), p);
  const el = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 80), xy);
  throw new Error(`tip did not arrive: tip=${s.tip} want=${p} target=${t} screen=${JSON.stringify(xy)} el=${el}`);
}

/** Toggle the gripper with the space key (a click works too, but the cursor position matters). */
export async function toggleGrip(page: Page) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
}

export async function waitPhase(page: Page, ph: string, timeout = 15000) {
  await page.waitForFunction((want) => (window as any).__backlot.challenges.phase === want, ph, { timeout });
}

export const BIN = { red: [-0.3, 0.75, -0.55] as V3, blue: [0.3, 0.75, -0.55] as V3 };

export async function pickAndPlace(page: Page, cube: V3, bin: V3) {
  await moveTo(page, [cube[0], cube[1] + 0.1, cube[2]]);
  await moveTo(page, [cube[0], 0.775, cube[2]]);
  await toggleGrip(page);
  const g = await state(page);
  if (!g.held) throw new Error(`grab failed: ${JSON.stringify(g)}`);
  await moveTo(page, [cube[0], 0.95, cube[2]]);
  await moveTo(page, [bin[0], 0.95, bin[2]]);
  await toggleGrip(page);
}
