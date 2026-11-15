import { ARM_BASE, CUBE_SIZE, SIM_HZ, type Vec3 } from '../config';
import { FINGER, fingerOffset, PALM } from '../arm/gripper';
import type { Bounds, ContactEvent, RecoveryState } from './engine';

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((v, i) => v + (b[i] - v) * t) as Vec3;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const yawAt = (p: Vec3) => Math.atan2(p[0] - ARM_BASE[0], p[2] - ARM_BASE[2]);
const centerOf = (box: Bounds) => lerp(box.min, box.max, 0.5);
const half = (v: Vec3): Vec3 => [v[0] / 2, v[1] / 2, v[2] / 2];

/** Intersect the translational sweep of a yawed box with a fixed axis-aligned tote.
 * Their five distinct separating axes are world X/Y/Z and the two horizontal tool axes. */
function sweptBox(from: Vec3, to: Vec3, extent: Vec3, yaw: number, box: Bounds): number | null {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const center = centerOf(box);
  const h = half(box.max.map((v, i) => v - box.min[i]) as Vec3);
  let enter = 0,
    exit = 1;
  for (const [x, y, z] of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [c, 0, -s],
    [s, 0, c],
  ]) {
    const r =
      Math.abs(x) * h[0] +
      Math.abs(y) * h[1] +
      Math.abs(z) * h[2] +
      Math.abs(c * x - s * z) * extent[0] +
      Math.abs(y) * extent[1] +
      Math.abs(s * x + c * z) * extent[2];
    const start = (from[0] - center[0]) * x + (from[1] - center[1]) * y + (from[2] - center[2]) * z;
    const delta = (to[0] - from[0]) * x + (to[1] - from[1]) * y + (to[2] - from[2]) * z;
    if (Math.abs(delta) < 1e-12) {
      if (Math.abs(start) > r) return null;
    } else {
      const a = (-r - start) / delta,
        b = (r - start) / delta;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (enter > exit) return null;
    }
  }
  return enter;
}

type XZ = [number, number];

/** Clip the part footprint against each tote face to find a common contact point. */
function clip(points: XZ[], axis: 0 | 1, face: number, direction: 1 | -1): XZ[] {
  const result: XZ[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const insideA = direction * (a[axis] - face) >= 0;
    const insideB = direction * (b[axis] - face) >= 0;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = (face - a[axis]) / (b[axis] - a[axis]);
      const point: XZ = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      point[axis] = face;
      result.push(point);
    }
  }
  return result;
}

function contactPoint(center: Vec3, extent: Vec3, yaw: number, box: Bounds): Vec3 {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, z]): XZ => [
    center[0] + c * x * extent[0] + s * z * extent[2],
    center[2] - s * x * extent[0] + c * z * extent[2],
  ]);
  let polygon = corners;
  for (const [axis, i] of [
    [0, 0],
    [1, 2],
  ] as const) {
    polygon = clip(polygon, axis, box.min[i], 1);
    polygon = clip(polygon, axis, box.max[i], -1);
  }
  let xz: XZ;
  if (polygon.length) {
    xz = [0, 0];
    for (const p of polygon) {
      xz[0] += p[0] / polygon.length;
      xz[1] += p[1] / polygon.length;
    }
  } else {
    // Tiny separation from the rotation bound or a grazing edge: choose the closest
    // feature pair. For rectangles the minimum is attained by a vertex and an edge.
    let best = Infinity;
    xz = [box.min[0], box.min[2]];
    function consider(x: number, z: number, distance: number) {
      if (distance < best) {
        best = distance;
        xz = [x, z];
      }
    }
    for (const [x, z] of corners) {
      const bx = clamp(x, box.min[0], box.max[0]),
        bz = clamp(z, box.min[2], box.max[2]);
      consider(bx, bz, Math.hypot(bx - x, bz - z));
    }
    for (const x of [box.min[0], box.max[0]])
      for (const z of [box.min[2], box.max[2]]) {
        const dx = x - center[0],
          dz = z - center[2];
        const u = dx * c - dz * s,
          v = dx * s + dz * c;
        consider(x, z, Math.hypot(u - clamp(u, -extent[0], extent[0]), v - clamp(v, -extent[2], extent[2])));
      }
  }
  const point: Vec3 = [xz[0], clamp(center[1], box.min[1], box.max[1]), xz[1]];
  let gap = Infinity,
    axis = 0,
    face = 0;
  for (let i = 0; i < 3; i++)
    for (const edge of [box.min[i], box.max[i]]) {
      const d = Math.abs(point[i] - edge);
      if (d < gap) {
        gap = d;
        axis = i;
        face = edge;
      }
    }
  point[axis] = face;
  return point;
}

const PARTS = [
  { shape: PALM, side: 0, name: 'palm' },
  { shape: FINGER, side: -1, name: 'left-finger' },
  { shape: FINGER, side: 1, name: 'right-finger' },
] as const;

export function firstImpact(
  before: RecoveryState,
  after: RecoveryState,
  box: Bounds,
  step: number,
): ContactEvent | null {
  let hit: ContactEvent | null = null;
  function test(
    from: Vec3,
    to: Vec3,
    extent: Vec3,
    yaw: number,
    margin: number,
    start: number,
    span: number,
    part: ContactEvent['part'],
  ) {
    const inflated: Vec3 = [extent[0] + margin, extent[1], extent[2] + margin];
    const t = sweptBox(from, to, inflated, yaw, box);
    if (t === null) return;
    const time = (step + start + span * t) / SIM_HZ;
    if (hit && hit.t <= time) return;
    hit = {
      step,
      t: time,
      body: part === 'carton' ? 'carton' : 'gripper',
      part,
      point: contactPoint(lerp(from, to, t), extent, yaw, box),
    };
  }

  // The arm always points down. Its only rotation during a sweep is yaw around
  // the base. Short angular intervals plus a support-radius bound cover every
  // intermediate finger/palm orientation without discrete collision tunnelling.
  const rotation = Math.abs(yawAt(after.tip) - yawAt(before.tip));
  const count = Math.max(1, Math.ceil(rotation / (Math.PI / 720)));
  const gapAt = (t: number) => before.fingerGapM + (after.fingerGapM - before.fingerGapM) * t;
  for (let i = 0; i < count; i++) {
    const t0 = i / count,
      t1 = (i + 1) / count;
    const a = lerp(before.tip, after.tip, t0),
      b = lerp(before.tip, after.tip, t1);
    const yaw0 = yawAt(a),
      yaw1 = yawAt(b),
      yaw = (yaw0 + yaw1) / 2;
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    for (const { shape, side, name } of PARTS) {
      const [w, d, h] = shape.size;
      const e: Vec3 = [w / 2, h / 2, d / 2];
      const p = side * fingerOffset(gapAt(t0)),
        q = side * fingerOffset(gapAt(t1));
      const from: Vec3 = [a[0] + c * p, a[1] + shape.aboveTip, a[2] - s * p];
      const to: Vec3 = [b[0] + c * q, b[1] + shape.aboveTip, b[2] - s * q];
      const radius = Math.hypot(Math.max(Math.abs(p), Math.abs(q)) + w / 2, d / 2);
      const margin = 2 * radius * Math.sin(Math.abs(yaw1 - yaw0) / 4);
      test(from, to, e, yaw, margin, t0, t1 - t0, name);
    }
    if (hit) break; // The carton sweep below can still produce an earlier impact.
  }
  if (before.held === 'red' || after.held === 'red') {
    const h = CUBE_SIZE / 2;
    const extent: Vec3 = [h, h, h];
    test(before.cubes.red!, after.tip, extent, 0, 0, 0, 1, 'carton');
    if (!after.held) test(after.tip, after.cubes.red!, extent, 0, 0, 1, 0, 'carton');
  }
  return hit;
}
