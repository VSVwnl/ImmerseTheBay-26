// Chooses between the stub and live Orbis. The Orbis client (and the Reactor SDK) is loaded lazily,
// only when a key exists and a connection is requested, so `npm run dev` without a key never touches it.
import { StubWorld } from './stub';
import type { World, WorldDef, WorldStatus } from './world';
import type { OrbisWorld } from './orbis';

export class WorldManager implements World {
  readonly stub = new StubWorld();
  private orbis: OrbisWorld | null = null;
  private def: WorldDef | null = null;
  private showing: HTMLVideoElement;
  private connecting: Promise<void> | null = null;
  private generation = 0;
  keyAvailable: boolean | null = null;
  lastError = '';
  onVideoChange: (v: HTMLVideoElement) => void = () => {};
  onStatusChange: (s: WorldStatus) => void = () => {};

  constructor() {
    this.showing = this.stub.getVideo();
  }

  async probe(): Promise<boolean> {
    try {
      const r = await fetch('/api/token', { cache: 'no-store' });
      this.keyAvailable = r.ok && !!(await r.json()).available;
    } catch {
      this.keyAvailable = false;
    }
    return this.keyAvailable;
  }

  get liveCapable(): boolean {
    return !!this.keyAvailable;
  }

  get connected(): boolean {
    return !!this.orbis;
  }

  /** Connect to Orbis if a key exists; otherwise stay on the stub. Never throws. */
  connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    if (this.orbis) return Promise.resolve();
    const generation = ++this.generation;
    this.lastError = '';
    this.connecting = (async () => {
      if (this.keyAvailable === null) await this.probe();
      if (!this.keyAvailable || generation !== this.generation) return;
      try {
        this.stub.setOverlay('Loading live world');
        this.onStatusChange('loading');
        const { OrbisWorld } = await import('./orbis');
        if (generation !== this.generation) return;
        const o = new OrbisWorld({
          onStatus: (s, detail) => {
            if (generation !== this.generation || this.orbis !== o) return;
            if (s === 'live') {
              this.stub.setOverlay('');
              this.show(o.getVideo());
            }
            if (s === 'loading' && detail) this.stub.setOverlay('Loading live world');
            if (s === 'error') { void this.fallback(detail ?? 'error'); return; }
            this.onStatusChange(this.status());
          },
        });
        this.orbis = o;
        if (this.def) await o.setWorld(this.def, 'fresh');
        if (generation === this.generation) await o.connect();
      } catch (e) {
        if (generation === this.generation) await this.fallback(String((e as Error)?.message ?? e));
      }
    })().finally(() => {
      if (generation === this.generation) this.connecting = null;
    });
    return this.connecting;
  }

  private async fallback(reason: string) {
    console.warn('[world] falling back to stub:', reason);
    this.lastError = reason;
    await this.close();
  }

  private show(v: HTMLVideoElement) {
    if (v === this.showing) return;
    this.showing = v;
    void v.play().catch(() => {});
    this.onVideoChange(v);
  }

  async setWorld(def: WorldDef, mode: 'morph' | 'fresh' = 'morph'): Promise<void> {
    this.def = def;
    await this.stub.setWorld(def);
    if (this.orbis && this.def === def) await this.orbis.setWorld(def, mode);
  }

  /** Polish: a short follow-up prompt describing one visible change. */
  async nudge(prompt: string): Promise<void> {
    await this.orbis?.nudge(prompt);
  }

  async steerIncident(prompt: string, signal: AbortSignal): Promise<void> {
    if (!this.orbis) throw new Error('Connect to live Orbis before steering.');
    await this.orbis.steerIncident(prompt, signal);
  }

  getVideo(): HTMLVideoElement {
    return this.showing;
  }

  status(): WorldStatus {
    if (this.orbis) {
      const s = this.orbis.status();
      if (s === 'live' || s === 'loading') return s;
      if (s === 'idle') return 'loading';
    }
    return this.connecting ? 'loading' : 'stub';
  }

  current(): WorldDef | null {
    return this.def;
  }

  async disconnect(): Promise<void> {
    this.lastError = '';
    await this.close();
  }

  private async close(): Promise<void> {
    ++this.generation;
    this.connecting = null;
    const o = this.orbis;
    this.orbis = null;
    this.stub.setOverlay('');
    this.show(this.stub.getVideo());
    this.onStatusChange(this.status());
    if (o) await o.disconnect();
  }
}
