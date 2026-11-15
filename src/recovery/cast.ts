import type { Vec3 } from '../config';
import type { EnvState } from '../env/env';
import type { Incident } from './engine';
import type { RecoveryHudState } from './hud';

export interface CastFrame {
  publishedAt: number;
  sessionId: string;
  xr: boolean;
  state: EnvState;
  incident: Incident | null;
  failed: Vec3[];
  corrected: Vec3[];
  contact: Vec3 | null;
  replayContact?: boolean;
  hud: RecoveryHudState;
  image?: string | null;
}

const path = '/api/recovery/cast';
const interval = 200;
let latest: CastFrame | null = null;
let sending = false;
let lastSent = -Infinity;
let timer: number | undefined;
let imageSent: { session: string; xr: boolean; data: string | null } | null = null;

function compact(points: Vec3[]): Vec3[] {
  const length = Math.min(points.length, 160);
  return Array.from({ length }, (_, i) => {
    const p = points[Math.round(i * (points.length - 1) / Math.max(1, length - 1))];
    return p.map((n) => Math.round(n * 1000) / 1000) as Vec3;
  });
}

/** Only one request is ever in flight. Slow clients send the latest state when the link frees. */
async function send() {
  if (sending || !latest) return;
  const wait = interval - (performance.now() - lastSent);
  if (wait > 0) {
    if (timer === undefined) timer = window.setTimeout(() => { timer = undefined; void send(); }, wait);
    return;
  }
  sending = true;
  const frame = latest;
  latest = null;
  lastSent = performance.now();
  try {
    const wire = { ...frame, failed: compact(frame.failed), corrected: compact(frame.corrected) };
    if (imageSent?.session === frame.sessionId && imageSent.xr === frame.xr && imageSent.data === frame.image) delete wire.image;
    const response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wire),
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok && frame.image !== undefined) imageSent = { session: frame.sessionId, xr: frame.xr, data: frame.image };
  } catch {
    // A disconnected spectator link must never stop the live simulation.
    imageSent = null;
  } finally {
    sending = false;
    if (latest) void send();
  }
}

export function publishCast(frame: CastFrame) { latest = frame; void send(); }

let imageCache: { token: string; data: string | null } | null = null;
let reading: Promise<CastFrame | null> | null = null;

async function fetchCast(): Promise<CastFrame | null> {
  try {
    const query = imageCache ? '?image=' + encodeURIComponent(imageCache.token) : '';
    const response = await fetch(path + query, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    if (!response.ok) return null;
    const frame = await response.json() as CastFrame | null;
    if (!frame) return null;
    const token = response.headers.get('X-Cast-Image') ?? '';
    if (frame.image === undefined && imageCache?.token === token) frame.image = imageCache.data;
    if (frame.image !== undefined) imageCache = { token, data: frame.image };
    return frame;
  } catch { return null; }
}

export function readCast(): Promise<CastFrame | null> {
  reading ??= fetchCast().finally(() => { reading = null; });
  return reading;
}
