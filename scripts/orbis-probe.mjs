// Debug: what does the Orbis video do after a fresh world switch? Logs status, brightness, frame time.
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('console', (m) => /^\[orbis\]/.test(m.text()) && console.log('   ', m.text().slice(0, 160)));
const t0 = Date.now();
const S = () => ((Date.now() - t0) / 1000).toFixed(1);
try {
  await page.goto('http://localhost:5173/?mode=factory&dataset=dbg');
  await page.evaluate(async () => {
    const w = window.__backlot.world;
    await w.probe();
    await w.connect();
    window.__probe = () => {
      const v = w.getVideo();
      const c = window.__pc ?? (window.__pc = Object.assign(document.createElement('canvas'), { width: 16, height: 9 }));
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(v, 0, 0, 16, 9);
      const d = x.getImageData(0, 0, 16, 9).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
      return { st: w.status(), luma: +(s / (d.length / 4) / 3).toFixed(1), t: +v.currentTime.toFixed(2), vw: v.videoWidth, paused: v.paused, src: v.srcObject?.id?.slice(0, 8) };
    };
  });
  const sample = async (label, n) => {
    for (let i = 0; i < n; i++) {
      console.log(`[${S()}] ${label} ${JSON.stringify(await page.evaluate(() => window.__probe()))}`);
      await page.waitForTimeout(500);
    }
  };
  await page.evaluate(() => window.__backlot.world.setWorld({ id: 'lab', label: 'lab', prompt: window.__backlot.planEpisodes ? 'A bright robotics lab.' : '' }, 'fresh'));
  await sample('first', 16);
  await page.screenshot({ path: 'e2e-shots/probe-1.png' });
  console.log(`[${S()}] --- switch to kitchen (fresh)`);
  await page.evaluate(() => window.__backlot.world.setWorld({ id: 'kitchen', label: 'kitchen', prompt: 'A bright modern kitchen with white cabinets, daylight.' }, 'fresh'));
  await sample('after', 30);
  await page.screenshot({ path: 'e2e-shots/probe-2.png' });
} catch (e) {
  console.log('error', e?.message ?? e);
} finally {
  await page.evaluate(() => window.__backlot.world.disconnect()).catch(() => {});
  await page.waitForTimeout(1000);
  await browser.close();
}
