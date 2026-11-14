// Mouse + keyboard control. Produces an Action every frame.
import * as THREE from 'three';
import { HOME_TIP, KEY_RAISE_SPEED, WHEEL_STEP, WORKSPACE, type Vec3 } from '../config';
import type { Action } from '../env/env';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class DesktopInput {
  target: Vec3 = [...HOME_TIP];
  grip: 0 | 1 = 0;
  /** true once the mouse has moved over the canvas (so the target follows it) */
  engaged = false;
  private keys = new Set<string>();
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  enabled = true;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: THREE.Camera,
    private onWorldKey: (index: number) => void,
    private onGesture: () => void,
  ) {
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private onMove = (e: PointerEvent) => {
    if (!this.enabled) return;
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.plane.constant = -this.target[1];
    if (this.ray.ray.intersectPlane(this.plane, this.hit)) {
      this.target[0] = clamp(this.hit.x, WORKSPACE.min[0], WORKSPACE.max[0]);
      this.target[2] = clamp(this.hit.z, WORKSPACE.min[2], WORKSPACE.max[2]);
      this.engaged = true;
    }
  };

  private onDown = (e: PointerEvent) => {
    this.onGesture();
    if (!this.enabled) return;
    if (e.button === 0) this.toggleGrip();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.enabled) return;
    this.raise(-e.deltaY * WHEEL_STEP);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    this.onGesture();
    if (/^Digit[1-9]$/.test(e.code)) {
      this.onWorldKey(Number(e.code.slice(5)) - 1);
      return;
    }
    if (!this.enabled) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.toggleGrip();
    }
    this.keys.add(e.code);
  };

  toggleGrip(): void {
    this.grip = this.grip ? 0 : 1;
  }

  raise(dy: number): void {
    this.target[1] = clamp(this.target[1] + dy, WORKSPACE.min[1], WORKSPACE.max[1]);
  }

  /** per-frame update for held keys */
  update(dt: number): void {
    if (!this.enabled) return;
    if (this.keys.has('KeyW')) this.raise(KEY_RAISE_SPEED * dt);
    if (this.keys.has('KeyS')) this.raise(-KEY_RAISE_SPEED * dt);
  }

  action(): Action {
    return { target: [...this.target], grip: this.grip };
  }
}
