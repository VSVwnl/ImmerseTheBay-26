import type { SoundingsViewState } from './ui';
import type { MissionRecord } from './mission';

export interface DiveFile extends MissionRecord {
  sessionId: string;
  attemptId: string;
}
const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Keep a durable local copy before delivery. Losing the laptop link must not lose a missed grasp.
const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('soundings-dive-logs', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('pending', { keyPath: ['sessionId', 'attemptId'] });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
export class DiveLog {
  private db = database().catch(() => null);
  private flushing: Promise<void> | null = null;
  saved = 0;
  constructor(private report: (message: string) => void) {
    window.addEventListener('online', () => void this.flush());
    void this.flush();
  }
  private async send(file: DiveFile) {
    const r = await post('/api/log', file);
    if (!r.ok) throw Error('Dive upload failed');
    this.saved++;
  }
  async save(file: DiveFile) {
    try {
      const db = await this.db;
      if (!db) {
        await this.send(file);
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction('pending', 'readwrite');
        t.objectStore('pending').put(file);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
      if (this.flushing) await this.flushing;
      await this.flush();
    } catch {
      this.report('Dive log storage unavailable. Check the local demo server.');
    }
  }
  flush() {
    if (this.flushing) return this.flushing;
    this.flushing = this.deliver()
      .catch(() => this.report('Dive saved on this device. Upload will retry on reconnect.'))
      .finally(() => {
        this.flushing = null;
      });
    return this.flushing;
  }
  private async deliver() {
    const db = await this.db;
    if (!db) return;
    const files = await new Promise<DiveFile[]>((resolve, reject) => {
      const r = db.transaction('pending').objectStore('pending').getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    for (const file of files) {
      await this.send(file);
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction('pending', 'readwrite');
        t.objectStore('pending').delete([file.sessionId, file.attemptId]);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    }
  }
}

export class AudienceFeed {
  private canvas = document.createElement('canvas');
  private busy = false;
  private watching = false;
  private next = 0;
  constructor() {
    this.canvas.width = 480;
    this.canvas.height = 270;
  }
  send(now: number, image: HTMLCanvasElement, s: SoundingsViewState) {
    if (this.busy || now < this.next) return;
    this.next = now + (this.watching ? 240 : 1500);
    let packet: object = {};
    if (this.watching) {
      this.canvas.getContext('2d')!.drawImage(image, 0, 0, 480, 270);
      packet = { state: { ...s, spectator: true }, image: this.canvas.toDataURL('image/jpeg', 0.62) };
    }
    this.busy = true;
    void post('/api/soundings/mirror', packet)
      .then(async (r) => {
        if (r.ok) this.watching = !!(await r.json()).watching;
      })
      .catch(() => {
        this.watching = false;
      })
      .finally(() => {
        this.busy = false;
      });
  }
}
