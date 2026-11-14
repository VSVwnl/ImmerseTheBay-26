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
  vi.stubGlobal('document', { createElement: () => fakeVideo });
  vi.stubGlobal('window', { setTimeout, clearTimeout, setInterval, clearInterval });
  vi.stubGlobal('navigator', { sendBeacon: () => true });
  vi.stubGlobal('fetch', async () => {
    fetches++;
    return { ok: true, status: 200, json: async () => ({ jwt: 'jwt-1', expires_at: Date.now() / 1000 + 21600 }) };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const frame = () => frameCb?.();
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
