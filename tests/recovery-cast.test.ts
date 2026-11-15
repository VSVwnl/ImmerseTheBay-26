import { describe, expect, it } from 'vitest';
import { CastRelay } from '../server/cast';
import type { CastFrame } from '../src/recovery/cast';
import { createIncident, RecoveryEngine } from '../src/recovery/engine';

function frame(xr: boolean, publishedAt = 10): CastFrame {
  const incident = createIncident('left');
  return { sessionId: xr ? 'headset' : 'desktop', publishedAt, xr, incident,
    state: new RecoveryEngine(incident).snapshot(), failed: [], corrected: [], contact: null,
    hud: { phase: 'teaching', available: ['reset'] } };
}

describe('operator spectator relay', () => {
  it('prioritizes the headset, falls back to an active desktop and expires both without an Orbis stream', () => {
    const relay = new CastRelay();
    relay.publish(frame(true), 1000);
    relay.publish(frame(false), 3000);
    expect(relay.current(5000)?.frame.xr).toBe(true);
    expect(relay.current(6000)?.frame.xr).toBe(false);
    expect(relay.current(8000)).toBe(null);
  });

  it('reuses unchanged image evidence and keeps it session-local across source changes', () => {
    const relay = new CastRelay();
    const first = frame(true);
    first.image = 'data:image/jpeg;base64,AAAA';
    relay.publish(first, 1);
    const initial = relay.current(1)!;
    expect(initial.frame.hud.available).toEqual([]);
    relay.publish(frame(true, 11), 2);
    expect(relay.current(2)?.imageToken).toBe(initial.imageToken);
    expect(relay.current(2)?.frame.image).toBe(first.image);
    relay.publish({ ...frame(true, 12), image: null }, 3);
    expect(relay.current(3)?.frame.image).toBe(null);
    relay.publish({ ...frame(true, 13), sessionId: 'second-headset' }, 4);
    expect(relay.current(4)?.frame.image).toBe(null);
  });

  it('rejects malformed poses, images and paths, and ignores out-of-order packets', () => {
    const relay = new CastRelay();
    relay.publish(frame(false, 20), 1000);
    relay.publish(frame(false, 10), 1100);
    expect(relay.current(1100)?.frame.publishedAt).toBe(20);
    expect(relay.publish({ ...frame(true), image: 'https://example.org/pixel' }, 1200)).toBe(false);
    expect(relay.publish({ ...frame(true), failed: [[0, NaN, 0]] }, 1200)).toBe(false);
    expect(relay.publish({ ...frame(true), state: { tip: [0, 1, 0] } }, 1200)).toBe(false);
  });
});
