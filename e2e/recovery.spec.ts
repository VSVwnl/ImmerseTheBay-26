import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { moveTo, state, toggleGrip } from './helpers';

const recording = process.env.RECORD_RECOVERY === '1';
test.use({
  viewport: { width: 1440, height: 920 },
  video: recording ? { mode: 'on', size: { width: 1440, height: 920 } } : 'off',
});

const phase = (page: Page, expected: string) =>
  page.waitForFunction((wanted) => (window as any).__backlot?.session.phase === wanted, expected, {
    timeout: 25000,
  });
const control = (page: Page, action: string) =>
  page.locator('button[data-action="' + action + '"]:visible').first();
const hold = (page: Page, ms: number) => (recording ? page.waitForTimeout(ms) : Promise.resolve());

async function guideCarton(page: Page) {
  const carton = (await state(page)).cubes.red!;
  // Demonstrate the free right-hand passage around the blue tote in the local left-side incident.
  await moveTo(page, [0.22, 0.9, -0.53]);
  await moveTo(page, [0.22, 0.9, -0.86]);
  await moveTo(page, [carton[0], 0.9, carton[2]]);
  await moveTo(page, carton);
  await toggleGrip(page);
  expect((await state(page)).held).toBe('red');
  await hold(page, 850);
  await moveTo(page, [carton[0], 0.9, carton[2]]);
  await moveTo(page, [0.22, 0.9, -0.86]);
  await moveTo(page, [0.22, 0.9, -0.53]);
  await moveTo(page, [-0.3, 0.9, -0.55]);
  await hold(page, 600);
  await toggleGrip(page);
}

test('operator teaches a saved skill, reloads, compares a new incident, casts and resets', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(recording ? 170000 : 100000);
  const start = Date.now();
  const beats: Record<string, number> = {};
  const mark = (event: string) => {
    beats[event] = (Date.now() - start) / 1000;
  };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let audienceVideo: string | undefined;
  const audience = recording
    ? await browser.newContext({
        baseURL,
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir: 'data/rehearsal/capture', size: { width: 1280, height: 720 } },
      })
    : null;
  const audiencePage = audience ? await audience.newPage() : null;
  if (audiencePage) await audiencePage.goto('/?mode=spectator');
  const captureStart = (Date.now() - start) / 1000;
  await page.goto('/?orbis=0');
  await phase(page, 'ready');
  mark('clear');
  await hold(page, 2300);
  await control(page, 'practice').click();
  await phase(page, 'blocked');
  mark('block');
  const episode = () => page.evaluate(() => (window as any).__backlot.session.exportEpisode());
  const first = await episode();
  expect(first.trials.map((t: any) => t.kind)).toEqual(['clear-pick', 'nominal']);
  expect(first.trials[0].attempt.metrics.success).toBe(true);
  expect(first.trials[1].attempt.metrics.collisions).toBe(1);
  expect(first.trials[1].evidence.source).toBe('practice');
  expect(first.trials[1].evidence.frame).toBeNull();
  await hold(page, 2600);
  await control(page, 'teach').click();
  await phase(page, 'teaching');
  mark('teach');
  await guideCarton(page);
  await phase(page, 'saved');
  mark('saved');
  const afterTeach = await episode();
  const demo = afterTeach.trials.find((t: any) => t.kind === 'demonstration');
  expect(demo.inputs).toEqual(['mouse']);
  expect(demo.attempt.start).toEqual(first.trials[1].attempt.start);
  expect(demo.skill.phases.map((s: any) => s.name)).toEqual(['approach', 'grasp', 'transport', 'release']);
  expect(demo.skill.keyframes.length).toBeLessThan(demo.attempt.samples.length);
  await hold(page, 2700);
  await control(page, 'replay').click();
  mark('replay');
  await phase(page, 'result');
  mark('replayed');
  let result = await episode();
  const replay = result.trials.at(-1);
  expect(replay.kind).toBe('same-incident-replay');
  expect(replay.attempt.metrics.success).toBe(true);
  expect(replay.attempt.metrics.collisions).toBe(0);
  if (recording) {
    await page.locator('[data-result="recovery"]').scrollIntoViewIfNeeded();
    await hold(page, 2600);
    await page.evaluate(() => scrollTo(0, 0));
  }
  await hold(page, 1100);

  // Reload and restore through the public user controls, then execute the reloaded skill.
  mark('reload');
  await page.reload();
  await expect(control(page, 'resume')).toBeEnabled();
  await control(page, 'resume').click();
  await phase(page, 'saved');
  await control(page, 'replay').click();
  await phase(page, 'result');
  expect((await episode()).trials.at(-1).attempt.metrics).toEqual(replay.attempt.metrics);

  mark('fresh');
  await control(page, 'next').click();
  await phase(page, 'result');
  result = await episode();
  const fresh = result.trials.at(-1);
  expect(fresh.kind).toBe('fresh-incident-replay');
  expect(fresh.evidence.side).toBe('right');
  expect(fresh.attempt.metrics.collisions).toBe(1);
  expect(fresh.attempt.metrics.success).toBe(false);
  await expect(page.locator('[data-result="fresh"]')).toContainText('Incomplete');
  mark('fresh-result');
  await hold(page, 1300);
  if (recording) {
    await page.locator('[data-result="fresh"]').scrollIntoViewIfNeeded();
    await hold(page, 3500);
  }
  mark('end');
  if (audiencePage && audience) {
    audienceVideo = await audiencePage.video()!.path();
    await audience.close();
  }

  // Use a second browser context, as a laptop spectator would. It shares no IndexedDB.
  const viewer = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const spectator = await viewer.newPage();
  await spectator.goto('/?mode=spectator');
  await expect(spectator.locator('[data-result="fresh"]')).toContainText('Incomplete');
  await expect(spectator.locator('[data-result="recovery"]')).toContainText('Completed');
  await expect(spectator.locator('button:visible')).toHaveCount(0);
  await viewer.close();

  const download = page.waitForEvent('download');
  await control(page, 'download').click();
  const file = await download;
  const exported = JSON.parse(fs.readFileSync((await file.path())!, 'utf8'));
  expect(exported.trials.at(-1).id).toBe(fresh.id);
  const saved = path.join('data', 'recovery', exported.sessionId, fresh.id + '.json');
  await expect.poll(() => fs.existsSync(saved)).toBe(true);
  expect(JSON.parse(fs.readFileSync(saved, 'utf8')).trial.attempt.metrics).toEqual(fresh.attempt.metrics);
  if (recording) {
    fs.mkdirSync('data/rehearsal', { recursive: true });
    fs.writeFileSync('data/rehearsal/episode.json', JSON.stringify(exported));
    fs.writeFileSync('data/rehearsal/beats.json', JSON.stringify({ ...beats, captureStart }));
    if (audienceVideo) fs.writeFileSync('data/rehearsal/audience-path.txt', audienceVideo);
    fs.writeFileSync('data/rehearsal/video-path.txt', await page.video()!.path());
    await page.screenshot({ path: 'data/rehearsal/fresh-trial.png', fullPage: true });
  }
  await control(page, 'reset').click();
  await phase(page, 'ready');
  expect((await episode()).sessionId).not.toBe(first.sessionId);
  expect((await episode()).trials.map((t: any) => t.kind)).toEqual(['clear-pick']);
  expect(errors).toEqual([]);
});
