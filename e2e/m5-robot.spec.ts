import { expect } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { playAll, spawnPython, test } from './helpers';

const CK = { single: 'data/ckpt/smoke-single.pt', multi: 'data/ckpt/smoke-multi.pt' };
const haveAll = fs.existsSync(CK.single) && fs.existsSync(CK.multi) && (fs.existsSync('data/results/summary.json') || fs.existsSync('data/results/summary-smoke.json'));
let server: ChildProcess;

test.describe('M5 Robot\'s turn', () => {
  test.skip(!haveAll, 'needs smoke checkpoints and a results summary (run M4 first)');

  test.beforeAll(async () => {
    server = spawnPython(['py/serve.py', '--ckpt', `single=${CK.single}`, '--ckpt', `multi=${CK.multi}`, '--port', '8767']);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('policy server did not start')), 60000);
      const on = (d: Buffer) => String(d).includes('policies') && String(d).includes('ws://') && (clearTimeout(t), resolve());
      server.stdout!.on('data', on);
      server.stderr!.on('data', on);
    });
  });
  test.afterAll(() => server?.kill());

  test('policy runs the arm, switches world and policy live, Take over returns control', async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/?mode=app&orbis=0&policyPort=8767');
    await page.mouse.click(640, 600);
    await playAll(page);
    const btn = page.locator('.panel-side button[data-id="robot"]');
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();
    await expect(page.locator('.panel-table')).toContainText('single');
    await expect(page.locator('.panel-world')).toContainText('Subway *');
    // the robot acts on its own: steps advance with no input
    await page.waitForFunction(() => (window as any).__backlot.robot?.steps >= 10, null, { timeout: 20000 });
    await page.screenshot({ path: 'e2e-shots/m5-01-robot.png' });
    // switch to a held-out world without reloading
    await page.locator('.panel-world button[data-id="subway"]').click();
    expect(await page.evaluate(() => (window as any).__backlot.world.current().id)).toBe('subway');
    // switch policy
    await page.locator('.panel-side button[data-id="toggle"]').click();
    expect(await page.evaluate(() => (window as any).__backlot.robot.policy)).toBe('single');
    await page.waitForFunction(() => (window as any).__backlot.robot?.steps >= 5, null, { timeout: 20000 });
    // let it finish one episode
    await page.waitForFunction(() => (window as any).__backlot.robot?.tries >= 1, null, { timeout: 90000 });
    const r = await page.evaluate(() => ({ tries: (window as any).__backlot.robot.tries, ok: (window as any).__backlot.robot.successes, phase: (window as any).__backlot.robot.phase }));
    console.log('robot session', r);
    expect(r.phase).not.toBe('error');
    await page.screenshot({ path: 'e2e-shots/m5-02-robot-subway.png' });
    // take over: the hand/mouse controls again and the challenges still work
    await page.locator('.panel-side button[data-id="takeover"]').click();
    expect(await page.evaluate(() => (window as any).__backlot.robot)).toBe(null);
    await playAll(page);
    const results = await page.evaluate(() => (window as any).__backlot.challenges.results);
    expect(results.map((x: any) => x.success)).toEqual([true, true, true]);
    expect(errors).toEqual([]);
  });
});
