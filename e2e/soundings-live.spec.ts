import { expect } from '@playwright/test';
import { test } from './helpers';

// Synthetic transport and media only. The app still uses its real OrbisWorld,
// video decoder, optical renderer, water trial, and recording/upload path.
const transportModule = `
export class Reactor {
  handlers = new Map();
  commands = [];
  timer = 0;
  dense = false;
  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 144;
    const ctx = canvas.getContext('2d');
    this.stream = canvas.captureStream(0);
    const track = this.stream.getVideoTracks()[0];
    let n = 0;
    const paint = () => {
      ctx.fillStyle = this.dense ? '#7d8e83' : '#16434e';
      ctx.fillRect(0, 0, 256, 144);
      ctx.fillStyle = this.dense ? '#eaf9e5' : '#215560';
      for (let x = 0; x < 256; x += 12)
        for (let y = 0; y < 144; y += 12)
          ctx.fillRect((x + n) % 256, y, 5, 5);
      n++;
      track.requestFrame();
    };
    window.syntheticOrbis = {
      commands: this.commands,
      freeze: () => clearInterval(this.timer),
      resume: () => { clearInterval(this.timer); this.timer = setInterval(paint, 100); paint(); },
      interrupt: () => this.emit('statusChanged', 'disconnected')
    };
  }
  on(name, callback) { this.handlers.set(name, [...(this.handlers.get(name) || []), callback]); }
  emit(name, ...args) { for (const cb of this.handlers.get(name) || []) cb(...args); }
  async connect(token) {
    if (token !== 'synthetic-in-process') throw new Error('Expected synthetic token');
    this.emit('trackReceived', 'main_video', this.stream.getVideoTracks()[0], this.stream);
    this.emit('statusChanged', 'ready');
    this.emit('message', {type:'state', data:{available_resolutions:[]}});
  }
  async sendCommand(name, data) {
    this.commands.push({name, prompt:data.prompt});
    if (name === 'set_prompt') this.dense = data.prompt.includes('thick cloud');
    if (name === 'start') {
      this.emit('message', {type:'generation_started', data:{}});
      window.syntheticOrbis.resume();
    }
  }
  async disconnect() {
    clearInterval(this.timer);
    this.stream.getTracks().forEach(track => track.stop());
  }
}`;

interface SyntheticTransport {
  commands: {name: string; prompt?: string}[];
  freeze(): void;
  resume(): void;
  interrupt(): void;
}
declare global { interface Window { syntheticOrbis: SyntheticTransport } }

test('synthetic Orbis session records new steered pixels and rejects stale or mixed-source water pairs', async ({page}) => {
  const tokenMethods: string[] = [];
  // Every credential, accounting and upload request ends here. No external
  // network or venue key is needed, and no synthetic evidence reaches disk on the server.
  await page.routeWebSocket(/^wss?:\/\//, () => {});
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost') return route.abort();
    if (url.pathname.endsWith('/@reactor-team_js-sdk.js'))
      return route.fulfill({contentType:'application/javascript', body:transportModule});
    if (url.pathname === '/api/token') {
      const method = route.request().method();
      tokenMethods.push(method);
      return route.fulfill({json:method === 'GET' ? {available:true} :
        {jwt:'synthetic-in-process', expires_at:Math.floor(Date.now()/1000) + 3600}});
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({json:{ok:true, watching:false}});
    return route.continue();
  });

  const button = (id: string) => page.locator('button[data-action="' + id + '"]:visible');
  const status = page.locator('.sd-console');
  const note = page.locator('[data-field="note"]');
  await page.goto('/');
  await button('connect').click();
  await expect(status).toHaveAttribute('data-stream', 'live', {timeout:25_000});
  expect(tokenMethods).toContain('GET');
  expect(tokenMethods.filter(method => method === 'POST')).toHaveLength(1);

  await button('dock').click();
  await expect(status).toHaveAttribute('data-phase', 'dock');
  await page.evaluate(() => window.syntheticOrbis.freeze());
  await button('waterTest').click();
  // Wait until the real OrbisWorld command queue has sent this specific steer.
  await expect.poll(() => page.evaluate(() => window.syntheticOrbis.commands.some(
    c => c.name === 'set_prompt' && c.prompt?.includes('thick cloud')
  )), {timeout:15_000}).toBe(true);
  await button('waterTest').click();
  await expect(note).toContainText('Waiting for a frame after the steering command');
  await expect(button('waterTest')).toHaveText('Capture changed water');

  await page.evaluate(() => window.syntheticOrbis.resume());
  // Poll the actual capture action while the decoder presents new frames.
  await expect(async () => {
    await button('waterTest').click();
    await expect(note).toContainText('Both water frames saved', {timeout:500});
  }).toPass({timeout:8000});
  await button('waterTest').click();
  await page.evaluate(() => window.syntheticOrbis.interrupt());
  await expect(status).toHaveAttribute('data-stream', 'practice');
  await button('waterTest').click();
  await expect(note).toContainText('Water source changed');
  const upload = page.waitForRequest(r => new URL(r.url()).pathname === '/api/log' && r.method() === 'POST');
  await button('retry').click();
  const record = (await upload).postDataJSON();
  expect(record).toMatchObject({kind:'soundings',site:'dock',reason:'refit'});
  expect(record.waterTests).toHaveLength(1);
  const {before, after} = record.waterTests[0];
  const sent = record.steering.find((event: {stage:string;prompt:string}) =>
    event.stage === 'sent' && event.prompt.includes('thick cloud'));
  expect(sent).toBeDefined();
  expect(before.source).toBe('live');
  expect(after.source).toBe('live');
  expect(after.mediaTime).toBeGreaterThan(Math.max(sent.mediaTime, before.mediaTime));
  expect(after.pose).toEqual(before.pose);
  expect(after.rig).toEqual(before.rig);
  expect(after.water).toMatch(/^data:image\/jpeg;base64,/);
  expect(after.water).not.toBe(before.water);
  expect(after.image).not.toBe(before.image);
  const commands = await page.evaluate(() => window.syntheticOrbis.commands.map(c => c.name));
  expect(commands.filter(name => name === 'reset')).toHaveLength(1);
  expect(commands.filter(name => name === 'start')).toHaveLength(1);
});
