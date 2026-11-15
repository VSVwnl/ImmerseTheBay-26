// Quick desktop check for each Workshop challenge on its own (?challenges=<id>): wrong parts fail with the
// expected label, the right parts solve it with the mouse, and the attempt records parts and world.
// Add a CASES row for each new challenge.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { moveTo, pickAndPlace, state, toggleGrip, waitPhase, type V3 } from '../helpers';

interface Case {
  layout: string;
  item: string;
  goal: V3;
  wrong: { arm: string; tool: string; label: string };
  right: { arm: string; tool: string };
}
const CASES: Case[] = [
  {
    layout: 'washer',
    item: 'washer',
    goal: [0.3, 0.75, -0.56],
    wrong: { arm: 'compact', tool: 'suction', label: 'Air leaks through the hole' },
    right: { arm: 'compact', tool: 'magnet' },
  },
  {
    layout: 'crate',
    item: 'crate',
    goal: [-0.28, 0.75, -0.58],
    wrong: { arm: 'long', tool: 'wide', label: 'Too heavy for this arm' },
    right: { arm: 'compact', tool: 'wide' },
  },
  {
    layout: 'anvil',
    item: 'anvil',
    goal: [-0.24, 0.75, -0.66],
    wrong: { arm: 'compact', tool: 'gripper', label: 'Too heavy for this arm' },
    right: { arm: 'heavyduty', tool: 'gripper' },
  },
  {
    layout: 'marbles',
    item: 'marbles',
    goal: [0.27, 0.75, -0.62],
    wrong: { arm: 'compact', tool: 'gripper', label: 'Loose bits slip through the fingers' },
    right: { arm: 'compact', tool: 'scoop' },
  },
];
const only = process.env.CASE;

const items = (page: Page): Promise<Record<string, V3>> => page.evaluate(() => (window as any).__backlot.state().items);
const label = (page: Page): Promise<string | null> => page.evaluate(() => (window as any).__backlot.core.workshop.lastLabel);
const robot = (page: Page) => page.evaluate(() => (window as any).__backlot.challenges.robot);

async function setParts(page: Page, arm: string, tool: string) {
  const r = await robot(page);
  if (r.arm !== arm) await page.locator(`.panel-workshop button[data-id="arm:${arm}"]`).click();
  if (r.tool !== tool) await page.locator(`.panel-workshop button[data-id="tool:${tool}"]`).click();
  expect(await robot(page)).toEqual({ arm, tool });
}

for (const c of CASES.filter((k) => !only || k.layout === only)) {
  test(`Workshop ${c.layout}: ${c.wrong.arm}+${c.wrong.tool} fails, ${c.right.arm}+${c.right.tool} solves`, async ({ page }) => {
    fs.mkdirSync('e2e-shots', { recursive: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/?orbis=0&challenges=${c.layout}`); // never a paid Orbis session in tests
    await page.mouse.click(640, 600);
    await page.locator('.panel-side button[data-id="workshop"]').click();
    await setParts(page, c.wrong.arm, c.wrong.tool);
    await page.locator('.panel-side button[data-id="start"]').click();
    await waitPhase(page, 'running');
    expect((await state(page)).layout).toBe(c.layout);

    // wrong parts: as close as this arm gets, close the tool: nothing held, the reason shows
    const obj = (await items(page))[c.item];
    const ws = await page.evaluate(() => (window as any).__backlot.desktop.workspace);
    const at = [0, 1, 2].map((i) => Math.min(ws.max[i], Math.max(ws.min[i], obj[i]))) as V3;
    await moveTo(page, [at[0], at[1] + 0.1, at[2]]);
    await moveTo(page, [at[0], 0.775, at[2]]);
    await toggleGrip(page);
    expect((await state(page)).held).toBeNull();
    expect(await label(page)).toBe(c.wrong.label);
    await page.screenshot({ path: `e2e-shots/ch-${c.layout}-wrong.png` });
    await toggleGrip(page);

    // right parts: restarts the challenge, then solve it
    await setParts(page, c.right.arm, c.right.tool);
    await waitPhase(page, 'running');
    await pickAndPlace(page, (await items(page))[c.item], c.goal);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `e2e-shots/ch-${c.layout}-done.png` });
    await waitPhase(page, 'results', 10000);
    const recs: any[] = await page.evaluate(() => (window as any).__backlot.records);
    const last = recs[recs.length - 1];
    expect([last.challenge, last.arm, last.tool, last.success]).toEqual([c.layout, c.right.arm, c.right.tool, true]);
    expect(typeof last.world?.id).toBe('string');
    expect(errors).toEqual([]);
  });
}
