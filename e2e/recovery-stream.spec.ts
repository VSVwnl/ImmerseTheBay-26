import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const control = (page: Page, action: string) => page.locator('button[data-action="' + action + '"]:visible').first();
const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  want => (window as any).__backlot?.session.phase === want, phase, { timeout: 22000 });

test('synthetic Reactor footage runs through steer, freeze, observed geometry, re-steer and stream loss', async ({ page }) => {
  const fixture = fileURLToPath(new URL('./fixtures/reactor.mjs', import.meta.url));
  await page.route(/\/node_modules\/\.vite\/deps\/@reactor-team_js-sdk\.js(\?|$)/,
    route => route.fulfill({ path: fixture, contentType: 'application/javascript' }));
  await page.route('**/api/token', route => route.fulfill({ json: route.request().method() === 'GET'
    ? { available: true } : { jwt: 'synthetic-fixture', expires_at: Date.now() / 1000 + 180 } }));
  // Synthetic input must never be archived as a sponsor run or counted as a billable session.
  for (const endpoint of ['/api/log', '/api/usage', '/api/recovery/cast']) {
    await page.route('**' + endpoint, route => route.fulfill({ json: { ok: true } }));
  }
  await page.goto('/');
  await waitForPhase(page, 'ready');
  await control(page, 'steer-left').click();
  await waitForPhase(page, 'observe');
  await control(page, 'capture').click();
  await expect(control(page, 'confirm-right')).toBeEnabled();
  const rightIsBlue = await page.evaluate(async () => {
    const img = new Image();
    img.src = (window as any).__backlot.session.frame.image;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const [r, , b] = ctx.getImageData(220, 75, 1, 1).data;
    return b > r + 90;
  });
  expect(rightIsBlue).toBe(true);
  await control(page, 'confirm-right').click();
  await waitForPhase(page, 'blocked');
  const record = await page.evaluate(() => (window as any).__backlot.session.evidence);
  expect(record).toMatchObject({ requestedSide: 'left', side: 'right', source: 'orbis' });
  expect(record.frame.image).toMatch(/^data:image\/jpeg;base64,/);

  await control(page, 'reset').click();
  await waitForPhase(page, 'ready');
  await control(page, 'steer-right').click();
  await waitForPhase(page, 'observe');
  const counts = await page.evaluate(() => {
    const fixture = (window as any).reactorFixture;
    return { starts: fixture.starts, connections: fixture.connections, prompts: fixture.prompts.length };
  });
  expect(counts).toEqual({ starts: 1, connections: 1, prompts: 3 });
  await page.evaluate(() => (window as any).reactorFixture.drop());
  await control(page, 'capture').click();
  await expect.poll(() => page.evaluate(() => (window as any).__backlot.session.message)).toContain('interrupted');
  await expect(control(page, 'confirm-left')).toHaveCount(0);
  await control(page, 'retry').click();
  await waitForPhase(page, 'observe');
  await expect.poll(() => page.evaluate(() => (window as any).reactorFixture.connections)).toBe(2);
  const disconnects = await page.evaluate(() => (window as any).reactorFixture.disconnects);
  await control(page, 'practice').click();
  await waitForPhase(page, 'blocked');
  await expect.poll(() => page.evaluate(() => (window as any).reactorFixture.disconnects)).toBe(disconnects + 1);
  expect(await page.evaluate(() => (window as any).__backlot.world.status())).toBe('stub');
  expect(await page.evaluate(() => (window as any).__backlot.session.evidence.source)).toBe('practice');
});
