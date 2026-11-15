import { expect } from '@playwright/test';
import { test } from './helpers';
import fs from 'node:fs';

const SHOTS = 'e2e-shots';

test('M2 without a key: token route says unavailable, app runs on the stub and says stub', async ({ page, request }) => {
  const hasKey = fs.existsSync('.env') && /REACTOR_API_KEY=rk_(?!your_key_here)/.test(fs.readFileSync('.env', 'utf8'));
  test.skip(hasKey, 'a real key is configured');
  const get = await request.get('/api/token');
  expect(await get.json()).toEqual({ available: false });
  const post = await request.post('/api/token', { headers: { 'Content-Type': 'application/json' }, data: {} });
  expect(post.status()).toBe(503);

  await page.goto('/?mode=app');
  await page.mouse.click(640, 600);
  await expect(page.locator('.panel-world')).toContainText('wall: stub');
  await expect(page.locator('.panel-status')).toContainText('wall: stub');
  await expect(page.locator('#orbis-toggle')).toBeHidden();
});

test('M2 token route rejects cross-origin posts', async ({ request }) => {
  const r = await request.post('/api/token', {
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    data: {},
  });
  expect(r.status()).toBe(403);
});

test('M2 live connect failure falls back to the stub', async ({ page }) => {
  // pretend a key exists, then make the mint fail
  await page.route('**/api/token', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { available: true } })
      : route.fulfill({ status: 502, json: { ok: false, error: 'token mint failed (401)' } }),
  );
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto('/?mode=app');
  await expect(page.locator('#orbis-toggle')).toBeVisible();
  await page.mouse.click(640, 600); // first gesture triggers connect
  await expect(page.locator('.panel-world')).toContainText('wall: stub (live failed)', { timeout: 10000 });
  await page.screenshot({ path: `${SHOTS}/m2-01-fallback.png` });
  expect(logs.some((l) => l.includes('falling back to stub'))).toBe(true);
  // challenges still start
  await page.locator('.panel-side button[data-id="start"]').click();
  await page.waitForFunction(() => (window as any).__backlot.challenges.phase === 'running', null, { timeout: 8000 });
});
