// Render an in-headset panel's canvas to a PNG (what the Quest shows), from the desktop page.
//   node scripts/panel-shot.mjs <panel> <out.png> [query]   e.g. node scripts/panel-shot.mjs workshop e2e-shots/p.png
import { chromium } from 'playwright';
import fs from 'node:fs';
const [name = 'workshop', out = 'e2e-shots/panel.png', query = ''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=d3d11'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`http://localhost:5173/?orbis=0&${query}`);
await p.mouse.click(640, 600);
if (name === 'workshop' || process.env.WORKSHOP) await p.locator('.panel-side button[data-id="workshop"]').click();
await p.waitForTimeout(300);
const url = await p.evaluate((n) => {
  const w = window.__backlot.panels[n];
  w.draw();
  return w.canvas.toDataURL('image/png');
}, name);
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
await b.close();
console.log('saved', out);
