// WebSocket client for py/serve.py: send image + state, receive a 4-number action.
import { rgbToBase64 } from '../factory/camera';
import type { Vec4 } from '../factory/obs';

export class PolicyClient {
  private ws: WebSocket | null = null;
  private pending = new Map<number, { resolve: (a: Vec4) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  policies: string[] = [];
  defaultPolicy = 'multi';

  constructor(private url = 'ws://localhost:8765') {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Connect and check it is the policy server (not the data server). */
  async connect(timeoutMs = 3000): Promise<void> {
    if (this.connected) return;
    const ws = new WebSocket(this.url);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('policy server timeout')), timeoutMs);
      ws.onopen = () => {
        clearTimeout(t);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(t);
        reject(new Error(`cannot reach the policy server at ${this.url} (run: python py/serve.py ...)`));
      };
    });
    this.ws = ws;
    const pong = new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no pong from policy server')), timeoutMs);
      ws.onmessage = (ev) => {
        clearTimeout(t);
        resolve(JSON.parse(ev.data));
      };
    });
    ws.send(JSON.stringify({ type: 'ping' }));
    const p = await pong;
    if (p.server !== 'policy') {
      ws.close();
      this.ws = null;
      throw new Error(`port is serving "${p.server}", not the policy server (stop data_server.py first)`);
    }
    this.policies = p.policies;
    this.defaultPolicy = p.default;
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      const h = this.pending.get(m.id);
      if (!h) return;
      this.pending.delete(m.id);
      if (m.type === 'action') h.resolve(m.action as Vec4);
      else h.reject(new Error(m.error ?? 'policy error'));
    };
    ws.onclose = () => {
      for (const h of this.pending.values()) h.reject(new Error('policy server closed'));
      this.pending.clear();
      this.ws = null;
    };
  }

  act(rgb: Uint8Array, state: Vec4, policy?: string): Promise<Vec4> {
    if (!this.ws || !this.connected) return Promise.reject(new Error('policy server not connected'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ type: 'act', id, policy: policy ?? this.defaultPolicy, image: rgbToBase64(rgb), state }));
    });
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
