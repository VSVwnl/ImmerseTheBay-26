// Hologram control logic: maps between the real arm and its small hologram, and turns a grabbing hand (or the
// mouse) into arm targets and gripper toggles. Pure math, no three.js, so it is unit-tested with fake hands.
import { ARM_BASE, HAND_SMOOTH_REF_HZ, HOLO, PINCH_CLOSE, PINCH_OPEN, WORKSPACE, type Vec3 } from '../config';

/** Where the hologram stands: its arm base sits at `pos`, scaled by `scale`, same orientation as the real arm. */
export interface Anchor {
  pos: Vec3;
  scale: number;
}

/** Something that can grab the hologram: a pinch point (world meters) and whether it is closed. */
export interface Grabber {
  point: Vec3;
  closed: boolean;
}

/** The arm command the hologram writes into (DesktopInput has this shape). */
export interface ArmStore {
  target: Vec3;
  grip: 0 | 1;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Real-world point -> hologram point. */
export function toHolo(p: Vec3, a: Anchor): Vec3 {
  return [
    a.pos[0] + (p[0] - ARM_BASE[0]) * a.scale,
    a.pos[1] + (p[1] - ARM_BASE[1]) * a.scale,
    a.pos[2] + (p[2] - ARM_BASE[2]) * a.scale,
  ];
}

/** Hologram point -> real-world point. */
export function fromHolo(q: Vec3, a: Anchor): Vec3 {
  return [
    ARM_BASE[0] + (q[0] - a.pos[0]) / a.scale,
    ARM_BASE[1] + (q[1] - a.pos[1]) / a.scale,
    ARM_BASE[2] + (q[2] - a.pos[2]) / a.scale,
  ];
}

export function clampWorkspace(p: Vec3): Vec3 {
  return [0, 1, 2].map((i) => clamp(p[i], WORKSPACE.min[i], WORKSPACE.max[i])) as Vec3;
}

/** Pinch hysteresis, same thresholds as the direct hand control. */
export function pinchClosed(wasClosed: boolean, pinchDist: number): boolean {
  return wasClosed ? pinchDist < PINCH_OPEN : pinchDist < PINCH_CLOSE;
}

export type LinkEvent = 'grab' | 'drag' | 'release' | 'tap' | null;

/**
 * Grab the hologram tip and drag it; the real target moves by the same amount divided by the hologram scale.
 * The target only moves once the hand has moved `dragStart` (so a tap does not nudge the arm), and a release
 * before that, within `tapMaxS`, toggles the gripper.
 */
export class HoloLink {
  grabbing = false;
  dragging = false;
  hover = false;
  private wasClosed = false;
  private startPoint: Vec3 = [0, 0, 0]; // hologram-space pinch point at grab
  private prevLocal: Vec3 = [0, 0, 0]; // real-space image of the pinch point last frame
  private heldS = 0;

  constructor(
    private store: ArmStore,
    public radius = HOLO.grabRadius,
  ) {}

  /** tip: where the real arm tip is now (the hologram shows that pose). */
  update(g: Grabber | null, a: Anchor | null, tip: Vec3, dt: number): LinkEvent {
    if (!g || !a) {
      const was = this.grabbing;
      this.grabbing = this.dragging = this.hover = false;
      this.wasClosed = false;
      return was ? 'release' : null;
    }
    const holoTip = toHolo(tip, a);
    this.hover = this.grabbing || dist(g.point, holoTip) < this.radius;
    const rising = g.closed && !this.wasClosed;
    const falling = !g.closed && this.wasClosed;
    this.wasClosed = g.closed;

    if (rising && this.hover) {
      this.grabbing = true;
      this.dragging = false;
      this.heldS = 0;
      this.startPoint = [...g.point];
      this.prevLocal = fromHolo(g.point, a);
      return 'grab';
    }
    if (this.grabbing && g.closed) {
      this.heldS += dt;
      const local = fromHolo(g.point, a);
      let ev: LinkEvent = null;
      if (!this.dragging && dist(g.point, this.startPoint) >= HOLO.dragStart) {
        this.dragging = true;
        ev = 'drag';
        // apply the movement made inside the dead zone too, so the arm does not lag the hand
        this.prevLocal = fromHolo(this.startPoint, a);
      }
      if (this.dragging) {
        // incremental, so wheel/W/S height changes made during a drag persist
        const t = this.store.target;
        this.store.target = clampWorkspace([
          t[0] + local[0] - this.prevLocal[0],
          t[1] + local[1] - this.prevLocal[1],
          t[2] + local[2] - this.prevLocal[2],
        ]);
      }
      this.prevLocal = local;
      return ev;
    }
    if (this.grabbing && falling) {
      this.grabbing = false;
      const wasDrag = this.dragging;
      this.dragging = false;
      if (!wasDrag && this.heldS <= HOLO.tapMaxS) {
        this.store.grip = this.store.grip ? 0 : 1;
        return 'tap';
      }
      return 'release';
    }
    return null;
  }
}

/** World-up component of a hand joint's palm normal. WebXR joint frames point -Y out of the palm. */
export function palmUpDot(q: [number, number, number, number]): number {
  const [x, , z] = q;
  // y of the joint's -Y axis in world space
  return 2 * (x * x + z * z) - 1;
}

/**
 * Turns noisy per-frame palm readings into a steady hologram anchor: smoothed, kept for `hideAfterS` after the
 * palm turns away, and kept for as long as the hologram is being held.
 */
export class AnchorFilter {
  anchor: Anchor | null = null;
  private lostS = 0;

  constructor(public scale = HOLO.scale) {}

  /** palm: palm center (world) when it faces up, else null. */
  update(palm: Vec3 | null, held: boolean, dt: number): Anchor | null {
    if (palm) {
      const p: Vec3 = [palm[0], palm[1] + HOLO.palmLift, palm[2]];
      this.lostS = 0;
      if (!this.anchor) this.anchor = { pos: p, scale: this.scale };
      else {
        const k = 1 - Math.pow(1 - HOLO.anchorSmooth, Math.max(0, dt) * HAND_SMOOTH_REF_HZ);
        const a = this.anchor.pos;
        this.anchor = { pos: [a[0] + (p[0] - a[0]) * k, a[1] + (p[1] - a[1]) * k, a[2] + (p[2] - a[2]) * k], scale: this.scale };
      }
    } else if (this.anchor && !held) {
      this.lostS += dt;
      if (this.lostS > HOLO.hideAfterS) this.anchor = null;
    }
    return this.anchor;
  }
}

/** What the headset reports for one hand, in world space (see XRInput.handData). */
export interface HandData {
  thumb: Vec3;
  index: Vec3;
  palm: Vec3; // palm center
  wristQuat: [number, number, number, number];
}
/** One controller: its grip position, a point a few cm ahead of it (the "fingertip"), and the trigger. */
export interface ControllerData {
  grip: Vec3;
  point: Vec3;
  trigger: number;
}
export interface XRHoloFrame {
  palm: Vec3 | null; // where the hologram should stand this frame, or null
  grabber: Grabber | null;
  kind: 'hand' | 'controller' | null; // what the grabbing side is
}

/**
 * Picks the hologram's palm and the grabbing pinch from the two sides. The palm side (HOLO.palmHand) shows the
 * hologram when its palm faces up (a controller there always does); the other side pinches (or pulls the trigger).
 * `prev` carries the pinch/trigger hysteresis between frames.
 */
export function xrHoloFrame(
  side: { palmHand: HandData | null; palmCtrl: ControllerData | null; grabHand: HandData | null; grabCtrl: ControllerData | null },
  prev: { closed: boolean },
): XRHoloFrame {
  let palm: Vec3 | null = null;
  if (side.palmHand) {
    if (palmUpDot(side.palmHand.wristQuat) >= HOLO.palmUpMin) palm = side.palmHand.palm;
  } else if (side.palmCtrl) palm = side.palmCtrl.grip;

  let grabber: Grabber | null = null;
  let kind: XRHoloFrame['kind'] = null;
  if (side.grabHand) {
    const { thumb: a, index: b } = side.grabHand;
    const closed = pinchClosed(prev.closed, dist(a, b));
    grabber = { point: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], closed };
    kind = 'hand';
  } else if (side.grabCtrl) {
    const t = side.grabCtrl.trigger;
    grabber = { point: side.grabCtrl.point, closed: prev.closed ? t > 0.3 : t > 0.6 };
    kind = 'controller';
  }
  prev.closed = grabber?.closed ?? false;
  return { palm, grabber, kind };
}
