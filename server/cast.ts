import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { CastFrame } from '../src/recovery/cast';
import { checkSameOrigin, readBody, sendJson } from './plugin.ts';

type Json = Record<string, unknown>;
const object = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vector = (v: unknown, n = 3) => Array.isArray(v) && v.length === n && v.every(x => number(x) && Math.abs(x) <= 100);
const path = (v: unknown, limit: number) => Array.isArray(v) && v.length <= limit && v.every(p => vector(p));
const stat = (v: unknown) => number(v) && v >= 0;
const nullableVec = (v: unknown) => v === null || vector(v);
const jpeg = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
const liveMs = 5000;
const maxBodyBytes = 260 * 1024;

function validState(s: unknown): boolean {
  if (!object(s) || s.layout !== 'place' || !object(s.cubes) || !vector(s.cubes.red)) return false;
  return vector(s.tip) && vector(s.joints, 4) && (s.grip === 0 || s.grip === 1) &&
    (s.held === null || s.held === 'red') && (s.cubes.blue === undefined || vector(s.cubes.blue)) &&
    path(s.reachTargets, 3) && typeof s.success === 'boolean' &&
    [s.seed, s.reachIndex, s.drops, s.wrongBin, s.steps].every(stat);
}

function validIncident(i: unknown): boolean {
  if (i === null) return true;
  return object(i) && (i.side === 'left' || i.side === 'right') && stat(i.seed) &&
    vector(i.carton) && vector(i.tray) && object(i.obstacle) && vector(i.obstacle.min) && vector(i.obstacle.max);
}

function validHud(h: unknown): boolean {
  if (!object(h)) return false;
  const textKeys = ['mode', 'phase', 'phaseLabel', 'title', 'caption', 'incident', 'feedCaption', 'activeLane', 'input', 'evidenceLabel'];
  for (const key of textKeys) if (h[key] != null && (typeof h[key] !== 'string' || h[key].length > 750)) return false;
  for (const key of ['samples', 'keyframes', 'runCount', 'skillSteps', 'playheadStep']) if (h[key] !== undefined && !stat(h[key])) return false;
  if (h.frameFrozen !== undefined && typeof h.frameFrozen !== 'boolean') return false;
  if (h.evidenceImage != null) return false; // Source image is sent once in the top-level cast channel.
  if (h.timeline !== undefined && (!Array.isArray(h.timeline) || h.timeline.length > 2700 ||
    !h.timeline.every(span => object(span) && ['approach', 'grasp', 'transport', 'release'].includes(String(span.name)) &&
      stat(span.startStep) && stat(span.endStep) && Number(span.startStep) <= Number(span.endStep)))) return false;
  if (h.available !== undefined && (!Array.isArray(h.available) || h.available.length > 32 ||
    !h.available.every(x => typeof x === 'string' && x.length <= 32))) return false;
  if (h.metrics === undefined) return true;
  if (!object(h.metrics)) return false;
  return Object.values(h.metrics).every(m => object(m) && (m.success === undefined || typeof m.success === 'boolean') &&
    [m.pathM, m.durationS, m.collisions].every(v => v === undefined || stat(v)));
}

function validFrame(f: unknown): f is CastFrame {
  return object(f) && (f.replayContact === undefined || typeof f.replayContact === 'boolean') && number(f.publishedAt) && typeof f.xr === 'boolean' && typeof f.sessionId === 'string' &&
    /^[\w.-]{1,80}$/.test(f.sessionId) && validState(f.state) && validIncident(f.incident) &&
    path(f.failed, 160) && path(f.corrected, 160) && nullableVec(f.contact) && validHud(f.hud) &&
    (f.image == null || (typeof f.image === 'string' && f.image.length < 235000 && jpeg.test(f.image)));
}

interface Slot { frame: CastFrame; received: number; imageToken: string }

/** One latest sample per device type in memory. Browser and headset clocks may differ. */
export class CastRelay {
  private headset: Slot | null = null;
  private desktop: Slot | null = null;
  private revision = 0;
  private id = randomUUID();

  publish(frame: unknown, now: number): boolean {
    if (!validFrame(frame)) return false;
    const old = frame.xr ? this.headset : this.desktop;
    const same = old?.frame.sessionId === frame.sessionId;
    if (same && old && old.received + liveMs > now && frame.publishedAt < old.frame.publishedAt) return true;
    const inherited = same && old && frame.image === undefined;
    const slot = { frame: { ...frame, image: inherited ? old.frame.image : frame.image ?? null },
      imageToken: inherited ? old.imageToken : this.id + '-' + (++this.revision), received: now };
    // Cast users see the state, handoff and metrics. Only the operator can issue commands.
    slot.frame.hud = { ...frame.hud, available: [] };
    if (frame.xr) this.headset = slot;
    else this.desktop = slot;
    return true;
  }

  current(now: number): Slot | null {
    for (const slot of [this.headset, this.desktop]) if (slot && now - slot.received < liveMs) return slot;
    return null;
  }
}

const station = new CastRelay();

export async function serveCast(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.headers.host ?? '';
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) {
    return sendJson(res, 403, { error: 'The spectator relay uses the local demo host.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const slot = station.current(Date.now());
    if (!slot) return sendJson(res, 200, null);
    const query = new URL(req.url ?? '/', 'http://localhost').searchParams;
    res.setHeader('X-Cast-Image', slot.imageToken);
    const frame = { ...slot.frame };
    if (query.get('image') === slot.imageToken) delete frame.image;
    return sendJson(res, 200, frame);
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use GET or POST.' });
  const bad = checkSameOrigin(req);
  if (bad) return sendJson(res, 403, { error: bad });
  if (Number(req.headers['content-length']) > maxBodyBytes) return sendJson(res, 413, { error: 'Cast frame too large.' });
  try {
    const frame = JSON.parse(await readBody(req, maxBodyBytes));
    if (!station.publish(frame, Date.now())) return sendJson(res, 400, { error: 'Invalid spectator frame.' });
    return sendJson(res, 200, { ok: true });
  } catch {
    return sendJson(res, 400, { error: 'Invalid spectator frame.' });
  }
}
