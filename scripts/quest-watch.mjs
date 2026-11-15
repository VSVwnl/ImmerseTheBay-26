// Watch the Soundings or Backlot tab in the Quest Browser: console, reloads, crashes, XR state, challenge phase, grip.
// Re-attaches if the tab is closed, crashes or is replaced.
//   adb forward tcp:9333 localabstract:chrome_devtools_remote ; node scripts/quest-watch.mjs 600
import { chromium } from 'playwright';

const end = Date.now() + Number(process.argv[2] ?? 300) * 1000;
const t0 = Date.now();
const S = () => new Date().toLocaleTimeString('en-US', { hour12: false }) + ` +${((Date.now() - t0) / 1000).toFixed(1)}s`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
    const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('5173'));
    return { browser, page };
  } catch (e) {
    return { browser: null, page: null, err: e.message.slice(0, 100) };
  }
}

while (Date.now() < end) {
  const { browser, page, err } = await findPage();
  if (!page) {
    console.log(`[${S()}] no demo tab ${err ? '(' + err + ')' : ''}`);
    await browser?.close().catch(() => {});
    await sleep(2000);
    continue;
  }
  console.log(`[${S()}] attached: ${page.url()}`);
  let closed = false;
  page.on('console', (m) => console.log(`[${S()}] console.${m.type()}: ${m.text().slice(0, 220)}`));
  page.on('pageerror', (e) => console.log(`[${S()}] PAGEERROR: ${e.message}`));
  page.on('crash', () => console.log(`[${S()}] TAB CRASHED`));
  page.on('close', () => ((closed = true), console.log(`[${S()}] TAB CLOSED`)));
  page.on('framenavigated', (f) => f === page.mainFrame() && console.log(`[${S()}] NAVIGATED/RELOADED -> ${f.url()}`));
  let last = '';
  while (!closed && Date.now() < end) {
    const s = await page
      .evaluate(() => {
        const soundings = window.__soundings?.snapshot();
        if (soundings) {
          const { phase, site, source, immersive, grip, held, saved } = soundings;
          return JSON.stringify({ app: 'Soundings', phase, site, source, immersive, grip, held, saved });
        }
        const b = window.__backlot;
        return JSON.stringify({
          vr: document.getElementById('VRButton')?.textContent,
          phase: b?.challenges?.phase,
          wall: b?.world?.status?.(),
          grip: b?.state?.()?.grip,
          held: b?.state?.()?.held ?? null,
          vis: document.visibilityState,
        });
      })
      .catch((e) => 'eval failed: ' + e.message.split('\n')[0].slice(0, 80));
    if (s !== last) console.log(`[${S()}] ${s}`);
    last = s;
    if (s.startsWith('eval failed')) break;
    await sleep(250);
  }
  await browser.close().catch(() => {});
}
console.log(`[${S()}] done watching`);
process.exit(0);
