import { expect, test } from '@playwright/test';
import { playAll } from './helpers';

const SHOTS = 'e2e-shots';

test('M3 Part A: Multiply replays the Place demo in 8 worlds, counter and thumbnails fill', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?orbis=0');
  await page.mouse.click(640, 600);
  await playAll(page);
  const mult = page.locator('.panel-side button[data-id="multiply"]');
  await expect(mult).toBeVisible();
  await mult.click();
  await expect(page.locator('.panel-counter')).toContainText('1 demo, 0 episodes');
  await page.waitForFunction(() => (window as any).__backlot.multiply?.episodes >= 3, null, { timeout: 60_000 });
  await page.screenshot({ path: `${SHOTS}/m3-01-multiply-mid.png` });
  await page.waitForFunction(() => (window as any).__backlot.multiply?.phase === 'done', null, { timeout: 120_000 });
  await expect(page.locator('.panel-counter')).toContainText('1 demo, 8 episodes');
  expect(await page.evaluate(() => (window as any).__backlot.thumbs.count)).toBe(8);
  const worlds = await page.locator('.thumb-grid figcaption').allTextContents();
  expect(worlds).toEqual(['Robotics lab', 'Night market', 'Warehouse', 'Lunar base', 'Kitchen', 'Greenhouse', 'Factory floor', 'Beach']);
  await page.screenshot({ path: `${SHOTS}/m3-02-multiply-done.png` });
  // challenges still work afterwards
  await playAll(page);
  const results = await page.evaluate(() => (window as any).__backlot.challenges.results);
  expect(results.map((r: any) => r.success)).toEqual([true, true, true]);
  expect(errors).toEqual([]);
});
