// Drive the eval page in Chromium and wait until the fixed protocol finishes.
//   node scripts/run-eval.mjs "tag=smoke"          (needs npm run dev + python py/serve.py ...)
import { chromium } from 'playwright';

const query = process.argv[2] ?? '';
const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('console', (m) => m.type() === 'error' && console.log('[page]', m.text()));
await page.goto(`http://localhost:5173/?mode=eval&${query}`);
await page.click('#e-start');
const t0 = Date.now();
let last = '';
for (;;) {
  const s = await page.evaluate(() => window.__backlot.stats);
  const line = `${s.phase} ${s.done}/${s.total} ${s.world} ${s.policy} seed ${s.seed}`;
  if (line !== last && (s.done % 20 === 0 || s.phase !== 'running')) console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${line}`);
  last = line;
  if (s.phase === 'done' || s.phase === 'error') {
    if (s.error) console.log('error:', s.error);
    break;
  }
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: 'e2e-shots/eval-done.png' });
await browser.close();
