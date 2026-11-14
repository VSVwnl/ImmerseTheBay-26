// Snap-grab, release and settling rules. No physics: grasps work every time.
import { BIN, BIN_POS, CUBE_SIZE, GRAB_RADIUS, TABLE, type Vec3 } from '../config';

export type CubeColor = 'red' | 'blue';
export const COLORS: CubeColor[] = ['red', 'blue'];

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Nearest cube whose center is within GRAB_RADIUS of the tip, or null. */
export function findGrab(tip: Vec3, cubes: Partial<Record<CubeColor, Vec3>>): CubeColor | null {
  let best: CubeColor | null = null;
  let bestD = GRAB_RADIUS;
  for (const c of COLORS) {
    const p = cubes[c];
    if (!p) continue;
    const d = dist(tip, p);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Which bin's footprint (x/z) contains this point, if any. */
export function binUnder(p: Vec3): CubeColor | null {
  for (const c of COLORS) {
    const b = BIN_POS[c];
    if (Math.abs(p[0] - b[0]) <= BIN.w / 2 && Math.abs(p[2] - b[2]) <= BIN.d / 2) return c;
  }
  return null;
}

export function onTable(p: Vec3): boolean {
  return Math.abs(p[0] - TABLE.cx) <= TABLE.width / 2 && Math.abs(p[2] - TABLE.cz) <= TABLE.depth / 2;
}

export type RestResult = { pos: Vec3; bin: CubeColor | null; offTable: boolean };

/** Where a released cube comes to rest: straight down onto the bin floor or the table. */
export function settle(p: Vec3): RestResult {
  const bin = binUnder(p);
  const restY = TABLE.top + CUBE_SIZE / 2; // bins are open boxes standing on the table; floor at table level
  if (bin) {
    // keep the cube fully inside the bin walls
    const b = BIN_POS[bin];
    const m = BIN.w / 2 - BIN.wall - CUBE_SIZE / 2;
    const x = Math.min(b[0] + m, Math.max(b[0] - m, p[0]));
    const z = Math.min(b[2] + m, Math.max(b[2] - m, p[2]));
    return { pos: [x, restY, z], bin, offTable: false };
  }
  if (!onTable(p)) return { pos: p, bin: null, offTable: true };
  return { pos: [p[0], restY, p[2]], bin: null, offTable: false };
}

/** A cube "rests in" a bin when it is not held and sits inside that bin's footprint. */
export function restsIn(p: Vec3, color: CubeColor, held: boolean): boolean {
  return !held && binUnder(p) === color && p[1] < TABLE.top + BIN.h;
}
