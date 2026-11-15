// Watch the Backlot tab in the Quest Browser: console, reloads, XR state, challenge phase, arm grip.
//   adb forward tcp:9333 localabstract:chrome_devtools_remote ; node scripts/quest-watch.mjs 300
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('5173'));
if (!page) { console.log('no Backlot tab'); process.exit(0); }
const t0 = Date.now();
const S = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
page.on('console', (m) => console.log(`[${S()}] console.${m.type()}: ${m.text().slice(0, 220)}`));
page.on('pageerror', (e) => console.log(`[${S()}] PAGEERROR: ${e.message}`));
page.on('framenavigated', (f) => f === page.mainFrame() && console.log(`[${S()}] RELOAD/NAVIGATE -> ${f.url()}`));
let last = '';
const end = Date.now() + Number(process.argv[2] ?? 300) * 1000;
while (Date.now() < end) {
  const s = await page.evaluate(() => {
    const b = window.__backlot;
    return JSON.stringify({ vr: document.getElementById('VRButton')?.textContent, phase: b?.challenges?.phase, xrMode: b?.xr?.mode ?? null, grip: b?.desktop?.grip });
  }).catch((e) => 'eval failed: ' + e.message.slice(0, 80));
  if (s !== last) console.log(`[${S()}] ${s}`);
  last = s;
  await new Promise((r) => setTimeout(r, 250));
}
console.log('done watching');
process.exit(0);
