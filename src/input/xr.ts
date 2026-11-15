// WebXR: hand tracking (right hand drives the arm), controller fallback, fingertips for poking.
import * as THREE from 'three';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import type { Action } from '../env/env';
import type { Vec3 } from '../config';
import { ControllerControl, PinchControl } from './handlogic';
import type { ControllerData, HandData } from '../holo/link';

export type Side = 'left' | 'right';

interface HandSlot {
  hand: THREE.Group & { joints?: Record<string, THREE.Object3D> };
  controller: THREE.Group;
  grip: THREE.Group;
  source: XRInputSource | null;
}

const v = new THREE.Vector3();
const toVec = (o: THREE.Object3D): Vec3 => {
  o.getWorldPosition(v);
  return [v.x, v.y, v.z];
};

export class XRInput {
  readonly group = new THREE.Group();
  readonly pinch = new PinchControl();
  readonly ctrl = new ControllerControl();
  private slots: HandSlot[] = [];
  /** which device drove the arm last: 'hand' | 'controller' | null */
  mode: 'hand' | 'controller' | null = null;

  constructor(private renderer: THREE.WebGLRenderer) {
    const handFactory = new XRHandModelFactory();
    const ctrlFactory = new XRControllerModelFactory();
    for (let i = 0; i < 2; i++) {
      const hand = renderer.xr.getHand(i) as HandSlot['hand'];
      hand.add(handFactory.createHandModel(hand, 'mesh'));
      const controller = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      grip.add(ctrlFactory.createControllerModel(grip));
      const slot: HandSlot = { hand, controller, grip, source: null };
      const onConnect = (e: { data?: XRInputSource }) => {
        if (e.data) slot.source = e.data;
      };
      const onDisconnect = () => {
        slot.source = null;
      };
      // three dispatches connected/disconnected on all three spaces; listen on the controller
      controller.addEventListener('connected', onConnect as never);
      controller.addEventListener('disconnected', onDisconnect as never);
      this.group.add(hand, controller, grip);
      this.slots.push(slot);
    }
  }

  private slot(side: Side, kind: 'hand' | 'controller'): HandSlot | null {
    return (
      this.slots.find(
        (s) => s.source && s.source.handedness === side && (kind === 'hand' ? !!s.source.hand : !s.source.hand),
      ) ?? null
    );
  }

  private joint(s: HandSlot, name: string): THREE.Object3D | null {
    const j = s.hand.joints?.[name];
    return j && j.visible !== false ? j : null;
  }

  get presenting(): boolean {
    return this.renderer.xr.isPresenting;
  }

  update(dt: number): void {
    const rh = this.slot('right', 'hand');
    if (rh) {
      const thumb = this.joint(rh, 'thumb-tip');
      const index = this.joint(rh, 'index-finger-tip');
      this.pinch.update(thumb && index ? { thumbTip: toVec(thumb), indexTip: toVec(index) } : null, dt);
      if (this.pinch.active) this.mode = 'hand';
      this.ctrl.update(null, dt);
      return;
    }
    this.pinch.update(null, dt);
    const rc = this.slot('right', 'controller');
    if (rc) {
      const gp = rc.source?.gamepad;
      this.ctrl.update({ grip: toVec(rc.grip), trigger: gp?.buttons[0]?.value ?? 0 }, dt);
      if (this.ctrl.active) this.mode = 'controller';
    } else this.ctrl.update(null, dt);
  }

  get active(): boolean {
    return this.mode === 'hand' ? this.pinch.active : this.mode === 'controller' ? this.ctrl.active : false;
  }

  action(): Action | null {
    if (this.mode === 'hand') return { target: [...this.pinch.target], grip: this.pinch.grip };
    if (this.mode === 'controller') return { target: [...this.ctrl.target], grip: this.ctrl.grip };
    return null;
  }

  /** Raw hand joints for the hologram (?holo=1): pinch tips, palm center, wrist orientation. */
  handData(side: Side): HandData | null {
    const s = this.slot(side, 'hand');
    if (!s) return null;
    const t = this.joint(s, 'thumb-tip');
    const i = this.joint(s, 'index-finger-tip');
    const w = this.joint(s, 'wrist');
    const k = this.joint(s, 'middle-finger-phalanx-proximal');
    if (!t || !i || !w || !k) return null;
    const q = w.getWorldQuaternion(new THREE.Quaternion());
    const wp = toVec(w);
    const kp = toVec(k);
    return {
      thumb: toVec(t),
      index: toVec(i),
      palm: [(wp[0] + kp[0]) / 2, (wp[1] + kp[1]) / 2, (wp[2] + kp[2]) / 2],
      wristQuat: [q.x, q.y, q.z, q.w],
    };
  }

  /** Controller grip position, a point 5 cm ahead of its ray origin, and the trigger, for the hologram. */
  controllerData(side: Side): ControllerData | null {
    const s = this.slot(side, 'controller');
    if (!s) return null;
    const p = new THREE.Vector3(0, 0, -0.05).applyMatrix4(s.controller.matrixWorld);
    return { grip: toVec(s.grip), point: [p.x, p.y, p.z], trigger: s.source?.gamepad?.buttons[0]?.value ?? 0 };
  }

  /** Fingertips (both index tips, or controller ray origins) for poking panels. */
  pokeTips(): THREE.Vector3[] {
    const tips: THREE.Vector3[] = [];
    for (const s of this.slots) {
      if (!s.source) continue;
      if (s.source.hand) {
        const j = this.joint(s, 'index-finger-tip');
        if (j) tips.push(j.getWorldPosition(new THREE.Vector3()));
      } else {
        // a point a few cm in front of the controller's ray origin
        const p = new THREE.Vector3(0, 0, -0.05).applyMatrix4(s.controller.matrixWorld);
        tips.push(p);
      }
    }
    return tips;
  }
}
