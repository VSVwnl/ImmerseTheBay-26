// Orbis client logic against a fake Reactor (no key, no network).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...a: any[]) => void;
const sent: { cmd: string; data: unknown }[] = [];
let lastReactor: FakeReactor | null = null;
let resolutions = ['720p', '1080p'];

class FakeReactor {
  handlers = new Map<string, Handler[]>();
  status = 'disconnected';
  constructor(public opts: { modelName: string }) {
    lastReactor = this;
  }
  on(ev: string, h: Handler) {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), h]);
  }
  emit(ev: string, ...a: unknown[]) {
    for (const h of this.handlers.get(ev) ?? []) h(...a);
  }
  async connect(jwt: string) {
    expect(jwt).toBe('jwt-1');
    this.emit('statusChanged', 'connecting');
    this.emit('statusChanged', 'waiting');
    this.emit('statusChanged', 'ready');
    this.emit('message', { type: 'state', data: { available_resolutions: resolutions } });
  }
  async sendCommand(cmd: string, data: unknown) {
    sent.push({ cmd, data });
    return { type: 'ok', data: {} };
  }
  async disconnect() {
    sent.push({ cmd: '__disconnect', data: null });
  }
  async reconnect() {}
}

vi.mock('@reactor-team/js-sdk', () => ({ Reactor: FakeReactor }));

let frameCb: (() => void) | null = null;
let luma = 120; // brightness the fake canvas reports for the current video frame
const fakeCanvas = {
  width: 0,
  height: 0,
  getContext: () => ({
    drawImage: () => {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(luma) }),
  }),
};
const fakeVideo = {
  muted: false,
  playsInline: false,
  autoplay: false,
  srcObject: null as unknown,
  readyState: 4,
  play: () => Promise.resolve(),
  requestVideoFrameCallback(cb: () => void) {
    frameCb = cb;
    return 1;
  },
};
let fetches = 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
  sent.length = 0;
  fetches = 0;
  resolutions = ['720p', '1080p'];
  luma = 120;
  vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'canvas' ? fakeCanvas : fakeVideo) });
  vi.stubGlobal('window', { setTimeout, clearTimeout, setInterval, clearInterval });
  vi.stubGlobal('navigator', { sendBeacon: () => true });
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    fetches++;
    // the real /api/token refuses anything that is not JSON (server/plugin.ts checkSameOrigin)
    const ct = String((init?.headers as Record<string, string> | undefined)?.['Content-Type'] ?? '');
    if (!ct.startsWith('application/json')) return { ok: false, status: 403, text: async () => 'content-type must be application/json' };
    return { ok: true, status: 200, json: async () => ({ jwt: 'jwt-1', expires_at: Date.now() / 1000 + 21600 }) };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const frame = () => frameCb?.();
const gen = () => lastReactor!.emit('message', { type: 'generation_started', data: {} });
const cmds = () => sent.map((s) => s.cmd);
const def = (id: string) => ({ id, label: id, prompt: `prompt ${id}` });

async function connected() {
  const { OrbisWorld } = await import('../src/world/orbis');
  const o = new OrbisWorld();
  await o.setWorld(def('lab'), 'fresh');
  await o.connect();
  return o;
}

describe('OrbisWorld', () => {
  it('connect: 1080p if offered, audio off, then reset/prompt/start; loading until frames, then live', async () => {
    const o = await connected();
    expect(lastReactor!.opts.modelName).toBe('reactor/visko-orbis-stable');
    expect(cmds()).toEqual(['set_resolution', 'set_audio_enabled', 'reset', 'set_prompt', 'start']);
    expect(sent[0].data).toEqual({ resolution: '1080p' });
    expect(sent[1].data).toEqual({ audio_enabled: false });
    expect(sent[3].data).toEqual({ prompt: 'prompt lab' });
    expect(o.status()).toBe('loading');
    frame(); // too early: frames from before the reset are ignored
    expect(o.status()).toBe('loading');
    vi.advanceTimersByTime(600);
    frame(); // still the old run: no generation_started yet
    expect(o.status()).toBe('loading');
    gen();
    vi.advanceTimersByTime(1100);
    frame();
    expect(o.status()).toBe('live');
  });

  it('skips set_resolution when 1080p is not offered', async () => {
    resolutions = ['720p'];
    await connected();
    expect(cmds()[0]).toBe('set_audio_enabled');
  });

  it('morphs with set_prompt; rapid presses are coalesced to the latest after 4 s', async () => {
    const o = await connected();
    sent.length = 0;
    vi.advanceTimersByTime(10_000);
    await o.setWorld(def('a'), 'morph');
    await o.setWorld(def('b'), 'morph');
    await o.setWorld(def('c'), 'morph');
    expect(sent).toEqual([{ cmd: 'set_prompt', data: { prompt: 'prompt a' } }]);
    await vi.advanceTimersByTimeAsync(4100);
    expect(sent.map((s) => (s.data as any)?.prompt)).toEqual(['prompt a', 'prompt c']);
    expect(o.current()!.id).toBe('c');
  });

  it('fresh mode resets; after SESSION_REFRESH_S a morph becomes a fresh restart', async () => {
    const o = await connected();
    sent.length = 0;
    vi.advanceTimersByTime(5000);
    await o.setWorld(def('a'), 'fresh');
    expect(cmds()).toEqual(['reset', 'set_prompt', 'start']);
    sent.length = 0;
    vi.advanceTimersByTime(151_000);
    await o.setWorld(def('b'), 'morph');
    expect(cmds()).toEqual(['reset', 'set_prompt', 'start']);
  });

  it('a fresh switch inside the 4 s interval waits, then resets: status is loading when it returns (factory labels stay true)', async () => {
    const o = await connected();
    vi.advanceTimersByTime(600);
    gen();
    vi.advanceTimersByTime(1100);
    frame();
    expect(o.status()).toBe('live');
    sent.length = 0;
    let done = false;
    const p = o.setWorld(def('b'), 'fresh').then(() => (done = true));
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toBe(false); // still waiting out the interval, nothing sent yet
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(4000);
    await p;
    expect(cmds()).toEqual(['reset', 'set_prompt', 'start']);
    expect(sent[1].data).toEqual({ prompt: 'prompt b' });
    expect(o.status()).toBe('loading');
    vi.advanceTimersByTime(1000);
    frame(); // old world still streaming (bright), before generation_started: must not count
    expect(o.status()).toBe('loading');
    gen();
    frame(); // right after generation_started: can still be an old frame
    expect(o.status()).toBe('loading');
    vi.advanceTimersByTime(1100);
    frame();
    expect(o.status()).toBe('live');
  });

  it('connected with no world (factory, eval): the first setWorld starts a run', async () => {
    const { OrbisWorld } = await import('../src/world/orbis');
    const o = new OrbisWorld();
    await o.connect();
    expect(cmds()).toEqual(['set_resolution', 'set_audio_enabled']);
    await o.setWorld(def('lab'), 'fresh');
    expect(cmds().slice(2)).toEqual(['reset', 'set_prompt', 'start']);
    expect(o.status()).toBe('loading');
    vi.advanceTimersByTime(600);
    gen();
    vi.advanceTimersByTime(1100);
    frame();
    expect(o.status()).toBe('live');
  });

  it('black frames after a reset (new world not rendered yet) keep the wall loading', async () => {
    const o = await connected();
    vi.advanceTimersByTime(600);
    gen();
    luma = 0;
    frame();
    expect(o.status()).toBe('loading');
    luma = 3;
    vi.advanceTimersByTime(2000);
    frame();
    expect(o.status()).toBe('loading');
    luma = 90;
    frame();
    expect(o.status()).toBe('live');
  });

  it('starts again on generation_complete', async () => {
    await connected();
    sent.length = 0;
    lastReactor!.emit('message', { type: 'generation_complete', data: { total_chunks: 2000 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(cmds()).toEqual(['reset', 'set_prompt', 'start']);
  });

  it('reuses the cached token', async () => {
    const { getToken } = await import('../src/world/orbis');
    await getToken();
    await getToken();
    expect(fetches).toBe(1);
  });

  it('disconnect ends the session', async () => {
    const o = await connected();
    await o.disconnect();
    expect(cmds()).toContain('__disconnect');
    expect(o.status()).toBe('idle');
  });

  it('does not create a Reactor session when a token arrives after disconnect', async () => {
    const before = lastReactor;
    let finishMint!: () => void;
    vi.stubGlobal('fetch', () => new Promise(resolve => {
      finishMint = () => resolve({ ok: true, json: async () => ({ jwt: 'jwt-1', expires_at: Date.now() / 1000 + 3600 }) });
    }));
    const { OrbisWorld } = await import('../src/world/orbis');
    const world = new OrbisWorld();
    const connecting = world.connect();
    await world.disconnect();
    finishMint();
    await connecting;
    expect(lastReactor).toBe(before);
    expect(sent).toEqual([]);
    expect(world.status()).toBe('idle');
  });

  it('closes a late SDK acquisition and refuses commands or ready events from the closed connection', async () => {
    let finishAcquisition!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const connect = vi.spyOn(FakeReactor.prototype, 'connect').mockImplementationOnce(function () {
      markStarted();
      return new Promise<void>(resolve => { finishAcquisition = resolve; });
    });
    try {
      const { OrbisWorld } = await import('../src/world/orbis');
      const world = new OrbisWorld();
      await world.setWorld(def('warehouse'), 'fresh');
      const connecting = world.connect();
      await started;
      const old = lastReactor!;
      await world.disconnect();
      finishAcquisition();
      await connecting;
      old.emit('statusChanged', 'ready');
      old.emit('message', { type: 'generation_complete', data: {} });
      expect(cmds()).toEqual(['__disconnect', '__disconnect']);
      expect(world.status()).toBe('idle');
    } finally { connect.mockRestore(); }
  });

  it('an unrecoverable error reports error status', async () => {
    const onStatus = vi.fn();
    const { OrbisWorld } = await import('../src/world/orbis');
    const o = new OrbisWorld({ onStatus });
    await o.connect();
    lastReactor!.emit('error', { operation: 'connect', code: 'x', message: 'boom', recoverable: false });
    expect(o.status()).toBe('error');
    expect(onStatus).toHaveBeenCalledWith('error', expect.stringContaining('boom'));
  });
});
