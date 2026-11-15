import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { startPythonServer, type PythonServer } from './python-server';

const DS = 'smoke-e2e';
let server: PythonServer;
let datasetRoot: string;

test.beforeAll(async ({}, testInfo) => {
  datasetRoot = testInfo.outputPath('datasets');
  server = await startPythonServer(['py/data_server.py', '--root', datasetRoot], process.env.E2E_PORT ?? '5173');
});
test.afterAll(async () => { await server?.stop(); });

test('M3 factory: 10 smoke episodes on the stub wall become 10 npz files', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/?mode=factory&dataset=${DS}&episodes=10&humans=0&port=${server.port}&orbis=0`);
  await page.click('#f-start');
  await page.waitForFunction(() => ['done', 'error'].includes((window as any).__backlot.stats.phase), null, { timeout: 150_000 });
  await page.screenshot({ path: 'e2e-shots/m3-03-factory-done.png' });
  const stats = await page.evaluate(() => (window as any).__backlot.stats);
  console.log('factory stats', stats);
  expect(stats.phase, stats.error).toBe('done');
  expect(stats.saved).toBe(10);
  const files = fs.readdirSync(path.join(datasetRoot, DS)).filter((f) => f.endsWith('.npz'));
  expect(files.length).toBe(10);
});

test('M3 factory refuses a real dataset on the stub wall', async ({ page }) => {
  const dir = path.join(datasetRoot, 'multi');
  const before = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  await page.goto(`/?mode=factory&dataset=multi&episodes=2&humans=0&port=${server.port}&orbis=0`);
  await page.click('#f-start');
  await page.waitForFunction(() => (window as any).__backlot.stats.phase === 'error', null, { timeout: 20_000 });
  const stats = await page.evaluate(() => (window as any).__backlot.stats);
  expect(stats.error).toMatch(/needs a live Orbis wall/);
  expect(fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []).toEqual(before);
});
