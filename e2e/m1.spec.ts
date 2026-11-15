import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { BIN, phase, pickAndPlace, playReach, state, waitForChallenge, waitPhase } from './helpers';

const SHOTS = 'e2e-shots';

test('M1: all three challenges with the mouse, records saved, worlds switch', async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

  await page.goto('/?mode=app&orbis=0'); // never open a paid Orbis session in tests
  await waitPhase(page, 'idle');
  await page.mouse.click(640, 600); // user gesture: starts the wall video
  await page.screenshot({ path: `${SHOTS}/m1-01-idle.png` });

  // world keys 1..6 change the stub wall
  const ids: string[] = [];
  for (let k = 1; k <= 6; k++) {
    await page.keyboard.press(`Digit${k}`);
    await page.waitForTimeout(80);
    ids.push(await page.evaluate(() => (window as any).__backlot.world.current().id));
  }
  expect(ids).toEqual(['lab', 'night-market', 'warehouse', 'lunar-base', 'kitchen', 'greenhouse']);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/m1-02-greenhouse.png` });
  await page.keyboard.press('Digit2');

  const sessionId: string = await page.evaluate(() => (window as any).__backlot.sessionId);
  await page.locator('.panel-side button[data-id="start"]').click();

  // Reach
  await playReach(page);
  await page.screenshot({ path: `${SHOTS}/m1-03-reach-done.png` });

  // Place
  await waitForChallenge(page, 'place');
  let s = await state(page);
  expect(s.layout).toBe('place');
  await pickAndPlace(page, s.cubes.red!, BIN.red);

  // Sort
  await waitForChallenge(page, 'sort');
  s = await state(page);
  expect(s.layout).toBe('sort');
  await pickAndPlace(page, s.cubes.red!, BIN.red);
  await page.screenshot({ path: `${SHOTS}/m1-04-sort-mid.png` });
  s = await state(page);
  await pickAndPlace(page, s.cubes.blue!, BIN.blue);
  await waitPhase(page, 'results', 10000);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/m1-05-results.png` });

  const results = await page.evaluate(() => (window as any).__backlot.challenges.results);
  expect(results.map((r: any) => r.success)).toEqual([true, true, true]);
  await expect(page.locator('.panel-side button[data-id="again"]')).toBeVisible();

  // records written by /api/log
  const dir = path.join('data', 'sessions', sessionId);
  await expect.poll(() => (fs.existsSync(dir) ? fs.readdirSync(dir).length : 0)).toBe(3);
  for (const f of fs.readdirSync(dir)) {
    const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const k of ['sessionId', 'attemptId', 'challenge', 'seed', 'world', 'startedAt', 'durationMs', 'success', 'drops', 'wrongBin', 'pathLengthM', 'input', 'samples'])
      expect(rec).toHaveProperty(k);
    expect(rec.world.id).toBe('night-market');
    expect(rec.input).toBe('mouse');
    expect(rec.samples.length).toBeGreaterThan(10);
    for (const k of ['t', 'target', 'grip', 'tip', 'joints', 'held', 'cubes']) expect(rec.samples[0]).toHaveProperty(k);
  }
  expect(await phase(page)).toBe('results');
  expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
});
