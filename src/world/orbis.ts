// Live Visko Orbis wall. The only file that imports the Reactor SDK.
import { Reactor, type ReactorError, type ReactorMessage, type ReactorStatus } from '@reactor-team/js-sdk';
import { ORBIS_BLANK_LUMA, ORBIS_GEN_SETTLE_MS, ORBIS_MODEL, SESSION_REFRESH_S, TOKEN_REFRESH_MARGIN_S, WORLD_MIN_INTERVAL_S } from '../config';
import type { World, WorldDef, WorldStatus, SteeringMode } from './world';

// ---- token: cached in memory, reused until shortly before expiry ----
let cached: { jwt: string; expiresAtMs: number } | null = null;
let inflight: Promise<string> | null = null;

export class NoKeyError extends Error {}

export async function getToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAtMs - TOKEN_REFRESH_MARGIN_S * 1000) return cached.jwt;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/token', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (r.status === 503) throw new NoKeyError('no Orbis key on the dev server');
      if (!r.ok) throw new Error(`token route ${r.status}: ${await r.text()}`);
      const { jwt, expires_at } = await r.json();
      cached = { jwt, expiresAtMs: expires_at * 1000 };
      return jwt as string;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export interface OrbisEvents {
  onStatus?: (s: WorldStatus, detail?: string) => void;
  onSteered?: (def: WorldDef) => void;
  onError?: (msg: string) => void;
}

const log = (...a: unknown[]) => console.info('[orbis]', ...a);

export class OrbisWorld implements World {
  private video: HTMLVideoElement;
  private reactor: Reactor | null = null;
  private st: WorldStatus = 'idle';
  private rstatus: ReactorStatus = 'disconnected';
  private def: WorldDef | null = null;
  private lastSteerMs = -Infinity;
  private queued: { def: WorldDef; mode: SteeringMode } | null = null;
  private queueTimer = 0;
  private runStartedMs = 0;
  private started = false; // a run has been started on this session
  private probeCtx: CanvasRenderingContext2D | null | undefined;
  private awaitingGen = false; // after a reset: old frames, then black, until generation_started + a lit frame
  private setupDone = false; // connect() finished (resolution, audio); setWorld may start a run
  private awaitingFrames = true;
  private frameCallback = 0;
  private framePoll = 0;
  private framesAfterMs = 0;
  private availableRes: string[] = [];
  private readyAtMs = 0;
  private usageTimer = 0;
  private usageKey = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  lastError = '';

  constructor(private events: OrbisEvents = {}) {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
  }

  private set(s: WorldStatus, detail?: string) {
    if (s === this.st) return;
    this.st = s;
    log('status', s, detail ?? '');
    this.events.onStatus?.(s, detail);
  }

  /** True while the video shows (near) black: Orbis streams black frames between a reset and the new world. */
  private frameIsBlank(): boolean {
    try {
      if (this.probeCtx === undefined) {
        const c = document.createElement('canvas') as HTMLCanvasElement;
        c.width = 16;
        c.height = 9;
        this.probeCtx = typeof c.getContext === 'function' ? c.getContext('2d', { willReadFrequently: true }) : null;
      }
      if (!this.probeCtx) return false; // cannot measure: fall back to "frames are arriving"
      this.probeCtx.drawImage(this.video, 0, 0, 16, 9);
      const d = this.probeCtx.getImageData(0, 0, 16, 9).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
      return sum / ((d.length / 4) * 3) < ORBIS_BLANK_LUMA;
    } catch {
      return false;
    }
  }

  private watchFrames() {
    const v = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
    };
    const onFrame = () => {
      if (this.reactor && this.awaitingFrames && !this.awaitingGen && performance.now() > this.framesAfterMs && this.rstatus === 'ready' && !this.frameIsBlank()) {
        this.awaitingFrames = false;
        this.set('live');
      }
      if (v.requestVideoFrameCallback) this.frameCallback = v.requestVideoFrameCallback(onFrame);
    };
    if (v.requestVideoFrameCallback) this.frameCallback = v.requestVideoFrameCallback(onFrame);
    else {
      // fallback: poll readyState / currentTime
      let lastT = -1;
      this.framePoll = window.setInterval(() => {
        if (v.readyState >= 2 && v.currentTime !== lastT) {
          lastT = v.currentTime;
          onFrame();
        }
      }, 200);
    }
  }

  async connect(): Promise<void> {
    if (this.reactor) return;
    this.set('loading', 'requesting token');
    const jwt = await getToken();
    const reactor = new Reactor({ modelName: ORBIS_MODEL });
    this.reactor = reactor;
    this.watchFrames();
    reactor.on('trackReceived', (name: string, _track: MediaStreamTrack, stream: MediaStream) => {
      if (name !== 'main_video') return;
      this.video.srcObject = stream;
      void this.video.play().catch(() => {});
    });
    reactor.on('statusChanged', (s: ReactorStatus) => {
      this.rstatus = s;
      log('reactor', s);
      if (s === 'waiting' || s === 'connecting') this.set('loading', s);
      if (s === 'ready' && !this.readyAtMs) {
        this.readyAtMs = Date.now();
        this.startUsageHeartbeat();
      }
      if (s === 'disconnected' && this.st !== 'idle') this.set('error', 'disconnected');
    });
    reactor.on('message', (m: ReactorMessage) => this.onMessage(m));
    reactor.on('error', (e: ReactorError) => {
      if (e.operation === 'sendCommand') {
        log('command refused', e.code, e.message);
        return;
      }
      this.lastError = `${e.operation}: [${e.code}] ${e.message}`;
      console.warn('[orbis] error', this.lastError, 'recoverable', e.recoverable);
      if (e.recoverable) void reactor.reconnect().catch(() => this.fail(this.lastError));
      else this.fail(this.lastError);
    });

    const ready = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timed out waiting for Orbis session (180 s)')), 180_000);
      const check = (s: ReactorStatus) => {
        if (s === 'ready') {
          clearTimeout(t);
          resolve();
        }
      };
      reactor.on('statusChanged', check);
    });
    const stateSeen = new Promise<void>((resolve) => {
      const h = (m: ReactorMessage) => {
        if (m.type === 'state') resolve();
      };
      reactor.on('message', h);
    });
    await reactor.connect(jwt);
    if (this.rstatus !== 'ready') await ready;
    await Promise.race([stateSeen, new Promise((r) => setTimeout(r, 3000))]);
    if (this.availableRes.includes('1080p')) await reactor.sendCommand('set_resolution', { resolution: '1080p' });
    await reactor.sendCommand('set_audio_enabled', { audio_enabled: false });
    this.setupDone = true;
    if (this.def) await this.startFresh(this.def);
  }

  private fail(msg: string) {
    this.lastError = msg;
    this.set('error', msg);
    this.events.onError?.(msg);
  }

  private onMessage(m: ReactorMessage) {
    const d = (m.data ?? {}) as Record<string, unknown>;
    switch (m.type) {
      case 'state':
        if (Array.isArray(d.available_resolutions)) this.availableRes = d.available_resolutions as string[];
        break;
      case 'generation_started':
        this.awaitingGen = false;
        this.framesAfterMs = Math.max(this.framesAfterMs, performance.now() + ORBIS_GEN_SETTLE_MS);
        this.runStartedMs = performance.now();
        log('generation_started', d.width, d.height, d.fps, d.resolution);
        break;
      case 'chunk_complete':
        break;
      case 'generation_complete':
        log('generation_complete: starting again');
        if (this.def) void this.startFresh(this.def);
        break;
      case 'command_error':
        log('command_error', d.command, d.reason);
        break;
    }
  }

  private async startFresh(def: WorldDef) {
    const r = this.reactor;
    if (!r || this.rstatus !== 'ready') return;
    this.awaitingFrames = true;
    this.awaitingGen = true; // measured: ~1.3 s of old-world frames, then ~4 s black, then the new world
    this.set('loading', 'starting world');
    await r.sendCommand('reset', {});
    await r.sendCommand('set_prompt', { prompt: def.prompt });
    await r.sendCommand('start', {});
    this.started = true;
    this.lastSteerMs = performance.now();
    // frames from before the reset may still be in flight; ignore the first ~0.5 s
    this.framesAfterMs = performance.now() + 500;
    this.runStartedMs = performance.now();
  }

  async setWorld(def: WorldDef, mode: SteeringMode = 'morph'): Promise<void> {
    this.def = def;
    if (!this.reactor || this.rstatus !== 'ready' || !this.setupDone) return; // stored; used at connect
    if (!this.started) return this.startFresh(def); // connected with no world yet (factory, eval)
    let now = performance.now();
    let wait = this.lastSteerMs + WORLD_MIN_INTERVAL_S * 1000 - now;
    if (wait > 0 && mode === 'fresh') {
      // factory / eval: they record right after this returns, so wait out the interval instead of queueing
      // (a queued switch would leave the old world live under the new world's label)
      await new Promise((r) => window.setTimeout(r, wait));
      if (!this.reactor || this.rstatus !== 'ready') return;
      now = performance.now();
      wait = 0;
    }
    if (wait > 0) {
      // rapid presses: keep only the latest, send when the interval has passed
      this.queued = { def, mode };
      if (!this.queueTimer)
        this.queueTimer = window.setTimeout(() => {
          this.queueTimer = 0;
          const q = this.queued;
          this.queued = null;
          if (q) void this.setWorld(q.def, q.mode);
        }, wait);
      return;
    }
    this.lastSteerMs = now;
    const runAgeS = (now - this.runStartedMs) / 1000;
    if (mode === 'fresh' || (mode === 'morph' && runAgeS > SESSION_REFRESH_S)) await this.startFresh(def);
    else {
      await this.reactor.sendCommand('set_prompt', { prompt: def.prompt });
      this.events.onSteered?.(def);
    }
  }

  /** A short follow-up prompt describing a single visible change (polish: world reacts to success). */
  async nudge(prompt: string): Promise<void> {
    if (!this.reactor || this.rstatus !== 'ready' || this.st !== 'live') return;
    if (performance.now() - this.lastSteerMs < WORLD_MIN_INTERVAL_S * 1000) return;
    this.lastSteerMs = performance.now();
    await this.reactor.sendCommand('set_prompt', { prompt });
  }

  getVideo(): HTMLVideoElement {
    return this.video;
  }

  status(): WorldStatus {
    return this.st;
  }

  current(): WorldDef | null {
    return this.def;
  }

  private startUsageHeartbeat() {
    const beat = () => {
      if (!this.readyAtMs) return;
      const body = JSON.stringify({ key: this.usageKey, readyAt: this.readyAtMs, until: Date.now() });
      navigator.sendBeacon?.('/api/usage', new Blob([body], { type: 'application/json' }));
    };
    beat();
    this.usageTimer = window.setInterval(beat, 15_000);
  }

  async disconnect(): Promise<void> {
    const r = this.reactor;
    this.reactor = null;
    clearInterval(this.usageTimer);
    clearInterval(this.framePoll);
    this.video.cancelVideoFrameCallback?.(this.frameCallback);
    clearTimeout(this.queueTimer);
    this.queueTimer = 0;
    this.queued = null;
    if (this.readyAtMs) {
      const body = JSON.stringify({ key: this.usageKey, readyAt: this.readyAtMs, until: Date.now() });
      navigator.sendBeacon?.('/api/usage', new Blob([body], { type: 'application/json' }));
    }
    this.readyAtMs = 0;
    this.runStartedMs = 0;
    this.started = false;
    this.setupDone = false;
    this.set('idle');
    if (r) await r.disconnect().catch(() => {});
  }
}
