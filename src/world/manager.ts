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
    this.connecting = (async () => {
      if (this.keyAvailable === null) await this.probe();
      if (!this.keyAvailable) return;
      try {
        this.stub.setOverlay('Loading live world');
        this.onStatusChange('loading');
        const { OrbisWorld } = await import('./orbis');
        const o = new OrbisWorld({
          onStatus: (s, detail) => {
            if (s === 'live') {
              this.stub.setOverlay('');
              this.show(o.getVideo());
            }
            if (s === 'loading' && detail) this.stub.setOverlay('Loading live world');
            if (s === 'error') void this.fallback(detail ?? 'error');
            this.onStatusChange(this.status());
          },
        });
        this.orbis = o;
        if (this.def) await o.setWorld(this.def, 'fresh');
        await o.connect();
      } catch (e) {
        await this.fallback(String((e as Error)?.message ?? e));
      }
    })().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async fallback(reason: string) {
    console.warn('[world] falling back to stub:', reason);
    this.lastError = reason;
    const o = this.orbis;
    this.orbis = null;
    this.stub.setOverlay('');
    this.show(this.stub.getVideo());
    if (o) await o.disconnect().catch(() => {});
    this.onStatusChange(this.status());
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
    if (this.orbis) await this.orbis.setWorld(def, mode);
  }

  /** Polish: a short follow-up prompt describing one visible change. */
  async nudge(prompt: string): Promise<void> {
    await this.orbis?.nudge(prompt);
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
    const o = this.orbis;
    this.orbis = null;
    this.stub.setOverlay('');
    this.show(this.stub.getVideo());
    if (o) await o.disconnect();
    this.onStatusChange(this.status());
  }
}
