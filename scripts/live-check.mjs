// One short live Orbis session: connect, wait for real frames, switch one world, screenshot, disconnect.
//   node scripts/live-check.mjs            (needs `npm run dev` and REACTOR_API_KEY in .env)
// Always disconnects, even on failure. Prints the Orbis minutes logged by the dev server.
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const browser = await chromium.launch({
  headless: false,
  args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => /orbis|reactor|world/i.test(m.text()) && console.log('  [page]', m.text().slice(0, 200)));
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
const status = () => page.evaluate(() => window.__backlot.world.status());

async function waitLive(label, timeoutMs) {
  let last = '';
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const s = await status();
    if (s !== last) console.log(`[${secs()}] ${label}: ${s}`);
    last = s;
    if (s === 'live') return true;
    if (/failed/.test(s)) return false;
    await page.waitForTimeout(500);
  }
  return false;
}

let ok = false;
try {
  await page.goto(BASE + '/');
  await page.mouse.click(640, 600); // first gesture connects when a key exists
  ok = await waitLive('connect', 120_000);
  if (ok) {
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'e2e-shots/live-01-first-world.png' });
    const btn = page.locator('.panel-world button').nth(1);
    console.log(`[${secs()}] switching world: ${await btn.textContent()}`);
    await btn.click();
    await page.waitForTimeout(10_000);
    console.log(`[${secs()}] after switch: ${await status()}`);
    await page.screenshot({ path: 'e2e-shots/live-02-switched.png' });
  }
} catch (e) {
  console.log('error:', e?.message ?? e);
} finally {
  try {
    await page.evaluate(() => window.__backlot.world.disconnect());
    console.log(`[${secs()}] disconnected: ${await status()}`);
  } catch (e) {
    console.log('disconnect error:', e?.message ?? e);
  }
  await page.waitForTimeout(1500);
  await browser.close();
  const usage = await (await fetch(BASE + '/api/usage')).json();
  console.log(`result: ${ok ? 'LIVE OK' : 'NOT LIVE'}; usage so far: ${usage.sessions} sessions, ${usage.minutes} min`);
}
