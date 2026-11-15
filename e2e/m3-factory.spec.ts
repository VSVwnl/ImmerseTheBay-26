import { expect } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { spawnPython, test } from './helpers';
const DS = 'smoke-e2e';
let server: ChildProcess;

test.beforeAll(async () => {
  fs.rmSync(path.join('data', 'datasets', DS), { recursive: true, force: true });
  server = spawnPython(['py/data_server.py', '--port', '8766']);
  await new Promise<void>((resolve, reject) => {
    let problem = '';
    server.stderr!.on('data', d => { problem += String(d); });
    server.once('error', reject);
    server.once('exit', code => reject(new Error(`data server exited ${code}: ${problem}`)));
    const t = setTimeout(() => reject(new Error('data server did not start: ' + problem)), 15000);
    server.stdout!.on('data', (d) => String(d).includes('listening') && (clearTimeout(t), resolve()));
  });
});
test.afterAll(() => server?.kill());

test('M3 factory: 10 smoke episodes on the stub wall become 10 npz files', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/?mode=factory&dataset=${DS}&episodes=10&humans=0&port=8766&orbis=0`);
  await page.click('#f-start');
  await page.waitForFunction(() => (window as any).__backlot.stats.phase === 'done', null, { timeout: 150_000 });
  await page.screenshot({ path: 'e2e-shots/m3-03-factory-done.png' });
  const stats = await page.evaluate(() => (window as any).__backlot.stats);
  console.log('factory stats', stats);
  expect(stats.saved).toBe(10);
  const files = fs.readdirSync(path.join('data', 'datasets', DS)).filter((f) => f.endsWith('.npz'));
  expect(files.length).toBe(10);
});

test('M3 factory refuses a real dataset on the stub wall', async ({ page }) => {
  // the real multi dataset may exist (built on the live wall): nothing may be added to it
  const dir = path.join('data', 'datasets', 'multi');
  const before = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  await page.goto('/?mode=factory&dataset=multi&episodes=2&humans=0&port=8766&orbis=0');
  await page.click('#f-start');
  await page.waitForFunction(() => (window as any).__backlot.stats.phase === 'error', null, { timeout: 20_000 });
  const stats = await page.evaluate(() => (window as any).__backlot.stats);
  expect(stats.error).toMatch(/needs a live Orbis wall/);
  expect(fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []).toEqual(before);
});
