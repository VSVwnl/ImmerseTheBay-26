// Dinner (two steps, swap tools mid-challenge) with the mouse: a part change keeps the attempt running, swapping
// while holding is refused with a label, and the attempt records the swaps.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { moveTo, state, toggleGrip, waitPhase, type V3 } from '../helpers';

const RACK: V3 = [0.3, 0.75, -0.6];
const ZONE: V3 = [-0.3, 0.75, -0.6];
const items = (page: Page): Promise<Record<string, V3>> => page.evaluate(() => (window as any).__backlot.state().items);
const label = (page: Page) => page.evaluate(() => (window as any).__backlot.core.workshop.lastLabel);
const phase = (page: Page) => page.evaluate(() => (window as any).__backlot.challenges.phase);
const tool = (page: Page) => page.evaluate(() => (window as any).__backlot.state().robot.tool);

async function grabAt(page: Page, p: V3) {
  await moveTo(page, [p[0], 0.875, p[2]]);
  await moveTo(page, [p[0], 0.775, p[2]]);
  await toggleGrip(page);
}
async function dropAt(page: Page, from: V3, goal: V3) {
  await moveTo(page, [from[0], 0.95, from[2]]);
  await moveTo(page, [goal[0], 0.95, goal[2]]);
  await toggleGrip(page);
}

test('Workshop dinner: swap tools mid-challenge without a restart; no swap while holding', async ({ page }) => {
  fs.mkdirSync('e2e-shots', { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?orbis=0&challenges=dinner'); // never a paid Orbis session in tests
  await page.mouse.click(640, 600);
  await page.locator('.panel-side button[data-id="workshop"]').click();
  await page.locator('.panel-side button[data-id="start"]').click();
  await waitPhase(page, 'running');

  // the standard gripper can't take the plate
  const plate = (await items(page)).plate;
  await grabAt(page, plate);
  expect((await state(page)).held).toBeNull();
  expect(await label(page)).toBe("Can't grip a flat plate");
  await toggleGrip(page);

  // swap to suction: same attempt keeps running
  const steps = (await state(page) as any).steps;
  await page.locator('.panel-workshop button[data-id="tool:suction"]').click();
  expect(await phase(page)).toBe('running');
  expect(((await state(page)) as any).steps).toBeGreaterThanOrEqual(steps);
  await expect(page.locator('.panel-workshop')).toContainText('Swap parts any time');
  await grabAt(page, plate);
  expect((await state(page)).held).toBe('plate');

  // no swap while holding
  await page.locator('.panel-workshop button[data-id="tool:gripper"]').click();
  expect(await tool(page)).toBe('suction');
  expect(await label(page)).toBe('Put it down before changing parts');
  await page.screenshot({ path: 'e2e-shots/dinner-holding.png' });
  await dropAt(page, plate, RACK);
  expect((await state(page)).held).toBeNull();

  // swap back to the gripper for the pot
  await page.locator('.panel-workshop button[data-id="tool:gripper"]').click();
  expect(await tool(page)).toBe('gripper');
  const pot = (await items(page)).pot;
  await grabAt(page, pot);
  expect((await state(page)).held).toBe('pot');
  await dropAt(page, pot, ZONE);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'e2e-shots/dinner-done.png' });
  await waitPhase(page, 'results', 10000);

  const recs: any[] = await page.evaluate(() => (window as any).__backlot.records);
  const r = recs[recs.length - 1];
  expect([r.challenge, r.arm, r.tool, r.success]).toEqual(['dinner', 'compact', 'gripper', true]);
  expect(r.swaps.map((w: any) => w.tool)).toEqual(['suction', 'gripper']);
  expect(errors).toEqual([]);
});
