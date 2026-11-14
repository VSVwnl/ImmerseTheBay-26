// Drive the factory page in Chromium and wait until it finishes.
//   node scripts/run-factory.mjs "dataset=smoke-multi&episodes=300" [--port 8765]
// Needs `npm run dev` and `python py/data_server.py` running.
import { chromium } from 'playwright';

const query = process.argv[2] ?? 'dataset=smoke&episodes=10';
const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('console', (m) => m.text().startsWith('[factory]') && console.log(m.text()));
await page.goto(`http://localhost:5173/?mode=factory&${query}`);
await page.click('#f-start');
const t0 = Date.now();
let last = '';
for (;;) {
  const s = await page.evaluate(() => window.__backlot.stats);
  const line = `${s.phase} ${s.done}/${s.planned} saved=${s.saved} discarded=${s.discarded} ${s.stepsPerSec.toFixed(0)} steps/s ${s.world}`;
  if (line !== last) console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${line}`);
  last = line;
  if (s.phase === 'done' || s.phase === 'error') {
    if (s.error) console.log('error:', s.error);
    break;
  }
  await page.waitForTimeout(5000);
}
await browser.close();
