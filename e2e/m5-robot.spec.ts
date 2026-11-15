import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { playAll } from './helpers';
import { startPythonServer, type PythonServer } from './python-server';

// Match the server's selected summary with its corresponding real or smoke checkpoints.
const real = fs.existsSync('data/results/summary.json');
const prefix = real ? '' : 'smoke-';
const CK = { single: 'data/ckpt/' + prefix + 'single.pt', multi: 'data/ckpt/' + prefix + 'multi.pt' };
const haveAll = fs.existsSync(CK.single) && fs.existsSync(CK.multi) && (real || fs.existsSync('data/results/summary-smoke.json'));
let server: PythonServer;

test.describe('M5 Robot\'s turn', () => {
  test.skip(!haveAll, 'needs matching policy checkpoints and evaluation summary (run M4 first)');

  test.beforeAll(async () => {
    server = await startPythonServer(['py/serve.py', '--ckpt', `single=${CK.single}`, '--ckpt', `multi=${CK.multi}`], process.env.E2E_PORT ?? '5173', 60_000);
  });
  test.afterAll(async () => { await server?.stop(); });

  test('policy runs the arm, switches world and policy live, Take over returns control', async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/?mode=app&orbis=0&policyPort=${server.port}`);
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
