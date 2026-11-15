// Quick desktop check for every Workshop part: its button builds that arm or tool at once, with no page errors.
// Screenshots: e2e-shots/part-<id>.png (PART=<id> runs one).
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test('Workshop parts: every part button rebuilds the robot', async ({ page }) => {
  fs.mkdirSync('e2e-shots', { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?orbis=0&challenges=plate'); // never a paid Orbis session in tests
  await page.mouse.click(640, 600);
  await page.locator('.panel-side button[data-id="workshop"]').click();
  const ids = await page.locator('.panel-workshop button').evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.id!));
  expect(ids.length).toBeGreaterThan(3);
  for (const id of ids.filter((x) => !process.env.PART || x.endsWith(':' + process.env.PART))) {
    const [slot, kind] = id.split(':');
    await page.locator(`.panel-workshop button[data-id="${id}"]`).click();
    const built = await page.evaluate(() => (window as any).__backlot.core.arm.parts);
    expect(built[slot]).toBe(kind);
    await expect(page.locator(`.panel-workshop button[data-id="${id}"]`)).toHaveClass(/active/);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `e2e-shots/part-${kind}.png` });
  }
  expect(errors).toEqual([]);
});
