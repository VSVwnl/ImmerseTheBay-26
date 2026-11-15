// One short live Orbis session for the Workshop: each attempt's countdown switches the wall to a random new world;
// check that each one goes live, screenshot it, and ALWAYS disconnect. Prints the Orbis minutes logged.
//   node scripts/workshop-live-check.mjs        (needs `npm run dev` and REACTOR_API_KEY in .env)
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const HARD_STOP_MS = 150_000; // never keep the paid session longer than this
const ATTEMPTS = Number(process.env.ATTEMPTS ?? 2);
const SHOTS_AT = (process.env.SHOTS_AT ?? '').split(',').filter(Boolean).map(Number); // e.g. SHOTS_AT=4,8,12
const browser = await chromium.launch({
  headless: false,
  args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
const ev = (f) => page.evaluate(f);
const status = () => ev(() => window.__backlot.world.status());
const worldId = () => ev(() => window.__backlot.world.current()?.id ?? null);
const before = await (await fetch(BASE + '/api/usage')).json();
const results = [];
const hard = setTimeout(() => { console.log('HARD STOP'); void page.evaluate(() => window.__backlot.world.disconnect()).catch(() => {}); }, HARD_STOP_MS);

async function waitFor(pred, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await pred()) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

try {
  await page.goto(BASE + '/?challenges=plate');
  await page.mouse.click(640, 600); // first gesture connects when a key exists
  const live = await waitFor(async () => (await status()) === 'live', 90_000);
  console.log(`[${secs()}] connected: ${await status()} world=${await worldId()}`);
  if (live) {
    await page.locator('.panel-side button[data-id="workshop"]').click();
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const prev = await worldId();
      await page.locator('.panel-side button[data-id="start"]').click();
      const switched = await waitFor(async () => (await worldId()) !== prev, 5_000);
      const tSwitch = Date.now();
      // the wall shows the new world once a real frame of it arrives (status back to live after loading)
      const back = await waitFor(async () => (await status()) === 'live' && Date.now() - tSwitch > 1500, 25_000);
      const id = await worldId();
      const secsToLive = ((Date.now() - tSwitch) / 1000).toFixed(1);
      console.log(`[${secs()}] attempt ${attempt}: ${prev} -> ${id} switched=${switched} live=${back} after ${secsToLive}s`);
      await page.screenshot({ path: `e2e-shots/workshop-live-${attempt}.png` });
      // how long until the new world is actually visible on the wall (morph switches take a while)
      for (const t of SHOTS_AT) {
        await page.waitForTimeout(Math.max(0, tSwitch + t * 1000 - Date.now()));
        await page.screenshot({ path: `e2e-shots/workshop-live-${attempt}-${t}s.png` });
      }
      results.push({ attempt, from: prev, to: id, switched, live: back, secsToLive: Number(secsToLive) });
      await page.locator('.panel-side button[data-id="stop"]').click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }
} catch (e) {
  console.log('error:', e?.message ?? e);
} finally {
  clearTimeout(hard);
  try {
    await page.evaluate(() => window.__backlot.world.disconnect());
    console.log(`[${secs()}] disconnected: ${await status()}`);
  } catch (e) {
    console.log('disconnect error:', e?.message ?? e);
  }
  await page.waitForTimeout(1500);
  await browser.close();
  const after = await (await fetch(BASE + '/api/usage')).json();
  console.log(`result: ${JSON.stringify(results)}`);
  console.log(`usage: ${before.sessions} -> ${after.sessions} sessions, ${before.minutes} -> ${after.minutes} min`);
}
