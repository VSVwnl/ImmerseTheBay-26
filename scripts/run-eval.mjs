// Drive the eval page in Chromium and wait until the fixed protocol finishes.
//   node scripts/run-eval.mjs "tag=smoke"          (needs npm run dev + python py/serve.py ...)
// Safety for paid Orbis time: stops if no episode finishes for STALL_S seconds, and always disconnects.
import { chromium } from 'playwright';

const query = process.argv[2] ?? '';
const STALL_S = Number(process.env.STALL_S ?? 120);
const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0);
page.on('console', (m) => (m.type() === 'error' || /^\[orbis\] status/.test(m.text())) && console.log(`[${secs()}s]   ${m.text().slice(0, 200)}`));
let code = 0;
try {
  await page.goto(`http://localhost:5173/?mode=eval&${query}`);
  await page.click('#e-start');
  let last = '';
  let lastDone = -1;
  let lastProgress = Date.now();
  for (;;) {
    const s = await page.evaluate(() => ({ ...window.__backlot.stats, wall: window.__backlot.world.status() }));
    const line = `${s.phase} ${s.done}/${s.total} ${s.world} ${s.policy} seed ${s.seed} wall=${s.wall}`;
    if (line !== last && (s.done % 20 === 0 || s.phase !== 'running')) console.log(`[${secs()}s] ${line}`);
    last = line;
    if (s.done !== lastDone) (lastDone = s.done), (lastProgress = Date.now());
    if (s.phase === 'done' || s.phase === 'error') {
      if (s.error) console.log('error:', s.error);
      if (s.phase === 'error') code = 1;
      break;
    }
    if (Date.now() - lastProgress > STALL_S * 1000) {
      console.log(`STALLED: no episode finished for ${STALL_S} s (wall=${s.wall}); stopping`);
      code = 2;
      break;
    }
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: 'e2e-shots/eval-done.png' });
} catch (e) {
  console.log('driver error:', e?.message ?? e);
  code = 1;
} finally {
  await page.evaluate(() => window.__backlot?.world?.disconnect()).catch(() => {});
  await page.waitForTimeout(1000).catch(() => {});
  await browser.close();
}
process.exit(code);
