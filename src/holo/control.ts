// Hologram control (?holo=1): wires the hologram to the mouse on desktop and to hands/controllers in the headset.
// It writes the arm command into the same store the desktop input uses, so challenges and recording are unchanged.
import * as THREE from 'three';
import { HOLO, type Vec3 } from '../config';
import type { EnvState } from '../env/env';
import type { Side, XRInput } from '../input/xr';
import { AnchorFilter, HoloLink, toHolo, xrHoloFrame, type Anchor, type ArmStore, type Grabber, type LinkEvent } from './link';
import { Hologram } from './hologram';

export class HoloControl {
  readonly hologram = new Hologram();
  readonly link: HoloLink;
  /** false while the robot or a replay drives the arm: the hologram only mirrors it */
  interactive = true;
  inputKind: 'mouse' | 'hand' | 'controller' = 'mouse';
  anchor: Anchor | null = null;
  lastEvent: LinkEvent = null;
  onEvent: (e: Exclude<LinkEvent, null>) => void = () => {};

  private desktopAnchor: Anchor = { pos: [...HOLO.desktopAnchor], scale: HOLO.desktopScale };
  private xrAnchor = new AnchorFilter(HOLO.scale);
  private xrPrev = { closed: false };
  // desktop pointer
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private downNdc = new THREE.Vector2(); // where the button went down: the grab starts there even if moves follow in the same frame
  private hasPointer = false;
  private mouseDown = false;
  private pressLatched = false; // a click shorter than a frame still counts as one closed frame
  private releaseLatched = false; // moves that arrive with the release still count: one more closed frame
  private grabY = 0;
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  private pedestal: THREE.Mesh; // desktop only: the hologram projector stands on it

  constructor(
    scene: THREE.Scene,
    private canvas: HTMLCanvasElement,
    private camera: THREE.Camera,
    store: ArmStore,
    private xr: XRInput,
  ) {
    this.link = new HoloLink(store, HOLO.desktopGrabRadius);
    scene.add(this.hologram.group);
    const [px, py, pz] = HOLO.desktopAnchor;
    const h = py - 0.022 * (HOLO.desktopScale / HOLO.scale);
    this.pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.07, h, 28),
      new THREE.MeshStandardMaterial({ color: 0x1d2026, metalness: 0.6, roughness: 0.4 }),
    );
    this.pedestal.position.set(px, h / 2, pz);
    scene.add(this.pedestal);
    canvas.addEventListener('pointermove', this.setPointer);
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.setPointer(e);
      this.downNdc.copy(this.ndc);
      this.mouseDown = true;
      this.pressLatched = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0 && this.mouseDown) {
        this.mouseDown = false;
        this.releaseLatched = true;
      }
    });
    window.addEventListener('blur', () => (this.mouseDown = false));
  }

  private setPointer = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.hasPointer = true;
  };

  /** Mouse ray hits a horizontal plane at the hologram tip's height (frozen while dragging; wheel sets height). */
  private desktopGrabber(anchor: Anchor, tip: Vec3): Grabber | null {
    const closed = this.mouseDown || this.pressLatched || this.releaseLatched;
    const ndc = this.pressLatched ? this.downNdc : this.ndc;
    this.pressLatched = this.releaseLatched = false;
    if (!this.hasPointer) return null;
    if (!this.link.grabbing) this.grabY = toHolo(tip, anchor)[1];
    this.ray.setFromCamera(ndc, this.camera);
    this.plane.constant = -this.grabY;
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return null;
    return { point: [this.hit.x, this.hit.y, this.hit.z], closed };
  }

  update(dt: number, tip: Vec3, state: EnvState): void {
    let grabber: Grabber | null = null;
    if (this.xr.presenting) {
      const palmSide: Side = HOLO.palmHand;
      const grabSide: Side = palmSide === 'left' ? 'right' : 'left';
      const f = xrHoloFrame(
        {
          palmHand: this.xr.handData(palmSide),
          palmCtrl: this.xr.controllerData(palmSide),
          grabHand: this.xr.handData(grabSide),
          grabCtrl: this.xr.controllerData(grabSide),
        },
        this.xrPrev,
      );
      this.anchor = this.xrAnchor.update(f.palm, this.link.grabbing, dt);
      grabber = f.grabber;
      if (f.kind) this.inputKind = f.kind;
      this.link.radius = HOLO.grabRadius;
    } else {
      this.anchor = this.desktopAnchor;
      grabber = this.desktopGrabber(this.anchor, tip);
      this.inputKind = 'mouse';
      this.link.radius = HOLO.desktopGrabRadius;
    }
    this.pedestal.visible = !this.xr.presenting;
    const ev = this.link.update(this.interactive ? grabber : null, this.anchor, tip, dt);
    if (ev) {
      this.lastEvent = ev;
      this.onEvent(ev);
    }
    this.canvas.style.cursor = this.xr.presenting ? '' : this.link.grabbing ? 'grabbing' : this.link.hover && this.interactive ? 'grab' : '';
    this.hologram.update(
      this.anchor,
      tip,
      state,
      { hover: this.link.hover, grabbing: this.link.grabbing, interactive: this.interactive, handleRadius: this.link.radius },
      dt,
    );
  }

  /** Hologram tip (world) for the current anchor, for tests. */
  holoTip(tip: Vec3): Vec3 | null {
    return this.anchor ? toHolo(tip, this.anchor) : null;
  }
}
