// Drive the factory page in Chromium and wait until it finishes.
//   node scripts/run-factory.mjs "dataset=smoke-multi&episodes=300" [--port 8765]
// Needs `npm run dev` and `python py/data_server.py` running.
// Safety for paid Orbis time: if no episode is saved for STALL_S seconds the page disconnects and the run stops.
// The page always disconnects from Orbis before the browser closes.
import { chromium } from 'playwright';

const query = process.argv[2] ?? 'dataset=smoke&episodes=10';
const STALL_S = Number(process.env.STALL_S ?? 90);
const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0);
page.on('console', (m) => {
  const t = m.text();
  if (/^\[(factory|orbis|world)\]/.test(t)) console.log(`[${secs()}s]   ${t.slice(0, 240)}`);
});
page.on('pageerror', (e) => console.log(`[${secs()}s]   pageerror: ${e.message}`));
let code = 0;
try {
  await page.goto(`http://localhost:5173/?mode=factory&${query}`);
  await page.click('#f-start');
  let last = '';
  let lastSaved = -1;
  let lastProgress = Date.now();
  for (;;) {
    const s = await page.evaluate(() => ({ ...window.__backlot.stats, wall: window.__backlot.world.status() }));
    const line = `${s.phase} ${s.done}/${s.planned} saved=${s.saved} discarded=${s.discarded} ${s.stepsPerSec.toFixed(0)} steps/s ${s.world} wall=${s.wall}`;
    if (line !== last) console.log(`[${secs()}s] ${line}`);
    last = line;
    if (s.saved !== lastSaved) (lastSaved = s.saved), (lastProgress = Date.now());
    if (s.phase === 'done' || s.phase === 'error') {
      if (s.error) console.log('error:', s.error);
      if (s.phase === 'error') code = 1;
      break;
    }
    if (Date.now() - lastProgress > STALL_S * 1000) {
      console.log(`STALLED: no episode saved for ${STALL_S} s (wall=${s.wall}); stopping`);
      code = 2;
      break;
    }
    await page.waitForTimeout(2000);
  }
} catch (e) {
  console.log('driver error:', e?.message ?? e);
  code = 1;
} finally {
  await page.evaluate(() => window.__backlot?.world?.disconnect()).catch(() => {});
  await page.waitForTimeout(1000).catch(() => {});
  await browser.close();
}
process.exit(code);
