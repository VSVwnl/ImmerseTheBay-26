// Headset eye level: the scene moves so the user's eyes start at XR_EYE_Y, centred on them, standing or seated.
import { describe, expect, it } from 'vitest';
import { eyeLevelOffset, headReady } from '../src/input/eyelevel';
import { XR_EYE_Y } from '../src/config';

describe('eye level', () => {
  it('a standing user (eyes 1.71 m, off to the left) ends up with eyes at XR_EYE_Y, centred', () => {
    const head: [number, number, number] = [-0.5, 1.71, -0.41];
    const o = eyeLevelOffset(head, XR_EYE_Y);
    // poses in the offset space = base pose - origin offset
    expect(head.map((v, i) => +(v - o[i]).toFixed(6))).toEqual([0, XR_EYE_Y, 0]);
  });

  it('a seated user (eyes 1.15 m) is lifted to the same eye height', () => {
    const head: [number, number, number] = [0, 1.15, 0];
    expect(head[1] - eyeLevelOffset(head, XR_EYE_Y)[1]).toBeCloseTo(XR_EYE_Y);
  });

  it('waits for a tracked head: the first frames can report zeros', () => {
    expect(headReady([0, 0, 0])).toBe(false);
    expect(headReady([0, 1.7, 0])).toBe(true);
  });

  it('the table sits a comfortable distance below the eyes and the button panels near eye level', () => {
    expect(XR_EYE_Y - 0.75).toBeGreaterThan(0.5);
    expect(Math.abs(1.55 - XR_EYE_Y)).toBeLessThan(0.25);
  });
});
