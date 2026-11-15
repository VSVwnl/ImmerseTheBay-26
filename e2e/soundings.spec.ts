import { expect, type Page } from '@playwright/test';
import { test } from './helpers';
import fs from 'node:fs';
import path from 'node:path';
import type { Vec3 } from '../src/config';
import type { MissionRecord, Rig, Site } from '../src/soundings/mission';

type Snapshot = {
  phase: 'rig' | 'dock' | 'dive' | 'debrief'; rig: Rig; site: Site;
  target: Vec3; tip: Vec3; handle: Vec3; cradle: Vec3; grip: 0 | 1; held: boolean; dockDone: boolean; waterTest: boolean;
};
type Recorded = MissionRecord & { sessionId: string; attemptId: string };
type Observer = { snapshot(): Snapshot; project(p: Vec3): { x: number; y: number } };
const snap = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => ((window as unknown as { __soundings: Observer }).__soundings.snapshot()));
const xyzDistance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const button = (page: Page, action: string) => page.locator(`button[data-action="${action}"]:visible`);
const phase = (page: Page, name: Snapshot['phase']) => expect(page.locator('.sd-console')).toHaveAttribute('data-phase', name);


// Read camera projection to place a real pointer in the mounted-camera viewport.
// All commands go through mouse/wheel/keyboard events, like a person piloting the vehicle.
async function pointAt(page: Page, point: Vec3) {
  const xy = await page.evaluate(p => (window as unknown as { __soundings: Observer }).__soundings.project(p), point);
  await page.mouse.move(xy.x, xy.y);
}
async function command(page: Page, point: Vec3) {
  // Change the steering plane while the pointer is over the pilot canvas.
  await pointAt(page, point);
  const current = await snap(page);
  if (Math.abs(current.target[1] - point[1]) > .0015) {
    await page.mouse.wheel(0, (current.target[1] - point[1]) / .0006);
    await expect.poll(async () => Math.abs((await snap(page)).target[1] - point[1])).toBeLessThan(.002);
  }
  await pointAt(page, point);
}
async function arrive(page: Page, point: Vec3) {
  await command(page, point);
  await expect.poll(async () => xyzDistance((await snap(page)).tip, point)).toBeLessThan(.012);
}
async function dock(page: Page) {
  await button(page, 'clear').click();
  await button(page, 'dock').click();
  await phase(page, 'dock');
  await command(page, (await snap(page)).handle);
  await phase(page, 'rig');
  expect((await snap(page)).dockDone).toBe(true);
}

async function recovery(page: Page, site: 'canyon' | 'mirror') {
  // Park the lamp beside the lens to free the opposite rail before moving the heavy arm.
  await button(page, 'inner').click();
  await button(page, site === 'canyon' ? 'port' : 'starboard').click();
  await button(page, 'outer').click();
  await button(page, 'inward').click();
  await button(page, 'clear').click();
  await button(page, 'dive').click();
  await phase(page, 'dive');
  const start = await snap(page);
  expect(start.site).toBe(site);
  expect(start.rig.arm).toBe(site === 'canyon' ? 'port' : 'starboard');
  expect(start.rig.lamp).not.toBe(start.rig.arm);
  await button(page, site === 'canyon' ? 'ring' : 'bars').click();
  await arrive(page, start.handle);
  // Click directly at the handle as a pilot would after choosing the symbol.
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await snap(page)).held).toBe(true);
  await arrive(page, [start.handle[0], .98, start.handle[2]]);
  await arrive(page, [start.cradle[0], .98, start.cradle[2]]);
  await arrive(page, start.cradle);
  await page.mouse.down();
  await page.mouse.up();
  await phase(page, 'debrief');
  await expect(button(page, 'sound')).toBeVisible();
  const photos = page.locator('[data-field="frames"] img');
  await expect(photos.first()).toBeVisible();
  await expect(photos.last()).toBeVisible();
  await expect.poll(() => photos.evaluateAll(images => images.every(image =>
    (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth >= 100))).toBe(true);
  expect(await photos.first().getAttribute('src')).not.toBe(await photos.last().getAttribute('src'));
}

test('Soundings practice: diagnose, refit, recover on both rails and reset for another judge', async ({page}) => {
  test.setTimeout(180_000);
  // This test exercises the no-key mode even when the developer machine has a venue key.
  await page.route('**/api/token', route => {
    expect(route.request().method()).toBe('GET');
    return route.fulfill({json: {available: false}});
  });
  const saves: Recorded[] = [];
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('requestfinished', request => {
    if (new URL(request.url()).pathname === '/api/log' && request.method() === 'POST') {
      saves.push(request.postDataJSON());
    }
  });
  await page.goto('/');
  await phase(page, 'rig');
  await expect(page.locator('[data-field="stream"]')).toHaveText('Practice water');
  await dock(page);

  await button(page, 'starboard').click();
  await button(page, 'inner').click();
  await button(page, 'miss').click();
  await button(page, 'dive').click();
  await phase(page, 'dive');
  const pastReach = (await snap(page)).handle;
  await command(page, pastReach);
  await expect.poll(async () => xyzDistance((await snap(page)).tip, pastReach)).toBeLessThan(.098);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snap(page)).grip).toBe(1);
  expect((await snap(page)).held).toBe(false);
  await button(page, 'retry').click();
  await phase(page, 'rig');

  await recovery(page, 'canyon');
  await page.screenshot({ path: 'e2e-shots/soundings-recovery.png' });
  await button(page, 'mirror').click();
  await phase(page, 'rig');
  await recovery(page, 'mirror');
  await button(page, 'reset').click();
  await phase(page, 'rig');
  expect((await snap(page)).dockDone).toBe(false);
  await dock(page);
  await recovery(page, 'canyon');
  await expect.poll(() => saves.filter(s => s.outcome === 'recovered').length).toBe(3);
  const aborted = saves.find(s => s.outcome === 'aborted' && s.site === 'canyon');
  expect(aborted?.prediction).toBeTruthy();
  expect(aborted?.closestM).toBeGreaterThan(.05);
  expect(aborted?.events.some(e => e.type === 'miss')).toBe(true);
  for (const record of saves.filter(s => s.site !== 'dock')) {
    expect(record.kind).toBe('soundings');
    expect(record.hz).toBe(30);
    expect(record.samples.length).toBeGreaterThan(2);
    expect(record.events.find(e => e.type === 'frame')).toMatchObject({source:'practice'});
    if (record.outcome === 'recovered') expect(record.events.find(e => e.type === 'symbol')).toMatchObject({correct:true});
    const stored = path.join('data','soundings','sessions',record.sessionId,record.attemptId+'.json');
    expect(JSON.parse(fs.readFileSync(stored,'utf8'))).toMatchObject({outcome:record.outcome,rig:record.rig});
  }
  expect(errors).toEqual([]);
});

test('stationary water trial holds the tool pose and the spectator receives the pilot image', async ({page, context}) => {
  await page.goto('/?orbis=0');
  await dock(page);
  await button(page,'port').click();
  await button(page,'inner').click();
  await button(page,'scatter').click();
  await button(page,'dive').click();
  await phase(page,'dive');
  await button(page,'waterTest').click();
  await expect.poll(async () => (await snap(page)).waterTest).toBe(true);
  const clamped = await snap(page);
  await pointAt(page, clamped.handle);
  const spectator = await context.newPage();
  await spectator.goto('/?mode=spectator');
  // Observer is independent of XR casting and must receive a decoded image from this running pilot.
  await expect.poll(async () => {
    const response = await spectator.request.get('/api/soundings/mirror');
    const packet = await response.json();
    return packet?.state?.phase === 'dive' && packet?.state?.waterTest && packet.image.startsWith('data:image/jpeg;base64,');
  },{ timeout:15_000 }).toBe(true);
  await expect(spectator.locator('.sd-console')).toHaveAttribute('data-spectator', 'true');
  const remoteImage = spectator.locator('[data-field="viewport"] img');
  await expect(remoteImage).toBeVisible();
  await expect.poll(() => remoteImage.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(480);
  expect((await snap(page)).tip).toEqual(clamped.tip);
  await spectator.close();
  await page.bringToFront();
  await button(page,'waterTest').click();
  await expect.poll(async () => (await snap(page)).waterTest).toBe(false);
});
