// Robot Workshop with the mouse: wrong parts fail with a reason, right parts solve all three challenges,
// attempt files record the parts, and Multiply / Robot's turn are disabled with a label.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { moveTo, pickAndPlace, state, toggleGrip, waitPhase, type V3 } from '../helpers';

const SHOTS = 'e2e-shots';
const RACK: V3 = [0.3, 0.75, -0.56];
const CAN_BIN: V3 = [-0.3, 0.75, -0.56];
const ZONE: V3 = [0.3, 0.75, -0.56];

const parts = (page: Page, id: string) => page.locator(`.panel-workshop button[data-id="${id}"]`).click();
const items = (page: Page): Promise<Record<string, V3>> => page.evaluate(() => (window as any).__backlot.state().items);
const robot = (page: Page) => page.evaluate(() => (window as any).__backlot.state().robot);
const armModel = (page: Page) => page.evaluate(() => (window as any).__backlot.core.arm.parts);
const label = (page: Page): Promise<string | null> => page.evaluate(() => (window as any).__backlot.core.workshop.lastLabel);

/** Try to grab with the wrong parts: nothing is held, the reason label shows, then open again. */
async function failGrab(page: Page, obj: V3, reason: string) {
  // as close as this arm can get (the desktop target stops at the arm's workspace)
  const ws = await page.evaluate(() => (window as any).__backlot.desktop.workspace);
  const at = [0, 1, 2].map((i) => Math.min(ws.max[i], Math.max(ws.min[i], obj[i]))) as V3;
  await moveTo(page, [at[0], at[1] + 0.1, at[2]]);
  await moveTo(page, [at[0], 0.775, at[2]]);
  await toggleGrip(page);
  const s = await state(page);
  expect(s.held).toBeNull();
  expect(await label(page)).toBe(reason);
  await toggleGrip(page);
}

test('Workshop: wrong parts fail with a reason, right parts solve plate, far and heavy', async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));

  await page.goto('/?orbis=0'); // never open a paid Orbis session in tests
  await page.mouse.click(640, 600);
  await expect(page.locator('.panel-workshop')).toBeHidden();
  await page.locator('.panel-side button[data-id="workshop"]').click();
  await expect(page.locator('.panel-workshop')).toBeVisible();
  await expect(page.locator('.panel-status')).toContainText('Pick the right parts for the job');
  expect(await robot(page)).toEqual({ arm: 'compact', tool: 'gripper' });
  const sessionId: string = await page.evaluate(() => (window as any).__backlot.sessionId);

  await page.locator('.panel-side button[data-id="start"]').click();

  // Plate: the standard gripper can't hold it; switching to Suction restarts the challenge
  await waitPhase(page, 'running');
  expect((await state(page)).layout).toBe('plate');
  await failGrab(page, (await items(page)).plate, "Can't grip a flat plate");
  await page.screenshot({ path: `${SHOTS}/ws-01-plate-wrong-tool.png` });
  await parts(page, 'tool:suction');
  expect(await page.evaluate(() => (window as any).__backlot.challenges.phase)).toBe('countdown');
  expect(await armModel(page)).toEqual({ arm: 'compact', tool: 'suction' });
  await waitPhase(page, 'running');
  await pickAndPlace(page, (await items(page)).plate, RACK);
  await waitPhase(page, 'between');
  await page.screenshot({ path: `${SHOTS}/ws-02-plate-done.png` });

  // Far: Compact can't reach the can; Long + Gripper can
  await waitPhase(page, 'running');
  await parts(page, 'tool:gripper');
  await waitPhase(page, 'running');
  await failGrab(page, (await items(page)).can, 'Out of reach');
  await page.screenshot({ path: `${SHOTS}/ws-03-far-out-of-reach.png` });
  await parts(page, 'arm:long');
  expect(await armModel(page)).toEqual({ arm: 'long', tool: 'gripper' });
  await waitPhase(page, 'running');
  await pickAndPlace(page, (await items(page)).can, CAN_BIN);
  await waitPhase(page, 'between');
  await page.screenshot({ path: `${SHOTS}/ws-04-far-done.png` });

  // Heavy: the Long arm's payload is too small; Compact + Gripper lifts the pot
  await waitPhase(page, 'running');
  await failGrab(page, (await items(page)).pot, 'Too heavy for this arm');
  await page.screenshot({ path: `${SHOTS}/ws-05-heavy-too-heavy.png` });
  await parts(page, 'arm:compact');
  await waitPhase(page, 'running');
  await pickAndPlace(page, (await items(page)).pot, ZONE);
  await waitPhase(page, 'results', 10000);
  await page.screenshot({ path: `${SHOTS}/ws-06-results.png` });

  const results = await page.evaluate(() => (window as any).__backlot.challenges.results);
  expect(results.map((r: any) => [r.challenge, r.success])).toEqual([
    ['plate', true],
    ['far', true],
    ['heavy', true],
  ]);
  // Multiply and Robot's turn: standard robot only, shown disabled with a label
  const mult = page.locator('.panel-side button[data-id="multiply"]');
  await expect(mult).toBeDisabled();
  await expect(mult).toContainText('off in Workshop');
  await expect(page.locator('.panel-side button[data-id="robot"]')).toBeDisabled();

  // attempt files: parts and success; restarted attempts are not saved
  const recs: any[] = await page.evaluate(() => (window as any).__backlot.records);
  expect(recs.map((r) => [r.challenge, r.arm, r.tool, r.success])).toEqual([
    ['plate', 'compact', 'suction', true],
    ['far', 'long', 'gripper', true],
    ['heavy', 'compact', 'gripper', true],
  ]);
  // a random world on the wall for every attempt, recorded in the file
  const worldIds = recs.map((r) => r.world?.id);
  expect(worldIds.every((w) => typeof w === 'string')).toBe(true);
  expect(new Set(worldIds).size).toBeGreaterThan(1);
  await page.waitForTimeout(500);
  const dir = path.join('data', 'sessions', sessionId);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  expect(files.length).toBe(3);
  const onDisk = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  expect(onDisk.map((r) => [r.challenge, r.arm, r.tool, r.success])).toEqual(recs.map((r) => [r.challenge, r.arm, r.tool, r.success]));

  // back to the standard robot and the standard challenges
  await page.locator('.panel-side button[data-id="standard"]').click();
  await expect(page.locator('.panel-workshop')).toBeHidden();
  expect(await robot(page)).toEqual({ arm: 'compact', tool: 'gripper' });
  expect(await armModel(page)).toEqual({ arm: 'compact', tool: 'gripper' });
  await expect(page.locator('.panel-side')).toContainText('Reach');
  expect(errors).toEqual([]);
});
