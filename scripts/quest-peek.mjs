// Inspect the Backlot tab in the Quest Browser over adb (adb forward tcp:9333 localabstract:chrome_devtools_remote).
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('5173'));
if (!page) { console.log('no Backlot tab open'); process.exit(0); }
console.log('url', page.url());
const info = await page.evaluate(async () => {
  const b = window.__backlot;
  const vrBtn = document.getElementById('VRButton');
  return {
    xr: navigator.xr ? await navigator.xr.isSessionSupported('immersive-vr') : 'no navigator.xr',
    vrButton: vrBtn ? vrBtn.textContent : null,
    phase: b?.challenges?.phase ?? null,
    wall: b?.world?.status?.() ?? null,
    hasHook: !!b,
    visible: document.visibilityState,
    secure: window.isSecureContext,
  };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: 'e2e-shots/quest-page.png' }).catch((e) => console.log('screenshot failed', e.message));
process.exit(0);
