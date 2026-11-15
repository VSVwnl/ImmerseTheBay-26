// Arm model: base, turret, two links, wrist, and a tool (two-finger gripper or suction pad).
// Driven by joint angles from ik.ts. Built for one set of parts; the app builds a new one when parts change.
import * as THREE from 'three';
import { ARM_BASE, FINGER_ANIM_S, FINGER_GAP_CLOSED, FINGER_GAP_OPEN, SHOULDER_H, TOOL_LEN, WORKSHOP } from '../config';
import type { Joints } from './ik';
import { linksFor, STANDARD_ROBOT, type RobotParts } from './parts';

export class ArmModel {
  readonly root = new THREE.Group();
  private turret = new THREE.Group();
  private upper = new THREE.Group();
  private fore = new THREE.Group();
  private tool = new THREE.Group();
  private fingers: THREE.Mesh[] = [];
  private gap = FINGER_GAP_OPEN;
  private pad: THREE.Mesh | null = null;
  private padOn = 0; // 0..1 suction squash
  private slipT = 0; // seconds left of the failed-grab wobble
  readonly parts: RobotParts;

  constructor(parts: RobotParts = STANDARD_ROBOT) {
    this.parts = { arm: parts.arm, tool: parts.tool };
    const { l1: L1, l2: L2 } = linksFor(parts.arm);
    const orange = new THREE.MeshStandardMaterial({ color: 0xf28a1e, roughness: 0.45, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2d3036, roughness: 0.5, metalness: 0.5 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.8 });

    this.root.position.set(...ARM_BASE);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.04, 40), dark);
    base.position.y = 0.02;
    this.root.add(base);
    this.root.add(this.turret);

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, SHOULDER_H - 0.02, 32), orange);
    column.position.y = 0.04 + (SHOULDER_H - 0.04) / 2 - 0.01;
    this.turret.add(column);

    // shoulder pivot
    this.upper.position.y = SHOULDER_H;
    this.turret.add(this.upper);
    const shoulderHub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.13, 32), dark);
    shoulderHub.rotation.z = Math.PI / 2;
    this.upper.add(shoulderHub);
    const link1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, L1), orange);
    link1.position.z = L1 / 2;
    this.upper.add(link1);

    this.fore.position.z = L1;
    this.upper.add(this.fore);
    const elbowHub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 28), dark);
    elbowHub.rotation.z = Math.PI / 2;
    this.fore.add(elbowHub);
    const link2 = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, L2), orange);
    link2.position.z = L2 / 2;
    this.fore.add(link2);

    this.tool.position.z = L2;
    this.fore.add(this.tool);
    const wristHub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 24), dark);
    wristHub.rotation.z = Math.PI / 2;
    this.tool.add(wristHub);
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 24), steel);
    flange.rotation.x = Math.PI / 2;
    flange.position.z = 0.035;
    this.tool.add(flange);
    if (parts.tool === 'suction') {
      // stem down to a flat round rubber pad whose face is at the tip point
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, TOOL_LEN - 0.07, 16), steel);
      stem.rotation.x = Math.PI / 2;
      stem.position.z = 0.06 + (TOOL_LEN - 0.07) / 2;
      this.tool.add(stem);
      const rubber = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.9, metalness: 0 });
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.014, 32), rubber);
      pad.rotation.x = Math.PI / 2;
      pad.position.z = TOOL_LEN - 0.007;
      this.tool.add(pad);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.004, 8, 32), orange);
      ring.position.z = TOOL_LEN - 0.016;
      this.tool.add(ring);
      this.pad = pad;
    } else {
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.02), dark);
      palm.position.z = TOOL_LEN - 0.055;
      this.tool.add(palm);
      for (let i = 0; i < 2; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.065), steel);
        f.position.z = TOOL_LEN - 0.012;
        this.fingers.push(f);
        this.tool.add(f);
      }
      this.setGap(FINGER_GAP_OPEN);
    }
    this.root.traverse((o) => {
      o.castShadow = false;
    });
  }

  setJoints(j: Joints): void {
    const [yaw, sh, el, wp] = j;
    this.turret.rotation.y = yaw;
    this.upper.rotation.x = -sh;
    this.fore.rotation.x = Math.PI - el;
    this.tool.rotation.x = -wp;
  }

  /** A failed grab: the tool slips sideways for a moment. */
  slip(): void {
    this.slipT = WORKSHOP.slipS;
  }

  private setGap(g: number): void {
    if (!this.fingers.length) return;
    this.gap = g;
    this.fingers[0].position.x = -(g / 2 + 0.006);
    this.fingers[1].position.x = g / 2 + 0.006;
  }

  /** Animate the finger gap toward open/closed over FINGER_ANIM_S. */
  updateGrip(closed: boolean, dt: number): void {
    if (this.slipT > 0) {
      this.slipT = Math.max(0, this.slipT - dt);
      const k = this.slipT / WORKSHOP.slipS;
      this.tool.position.x = 0.012 * k * Math.sin((1 - k) * 40);
    } else this.tool.position.x = 0;
    if (this.pad) {
      // suction: the pad squashes a little while sucking
      const want = closed ? 1 : 0;
      this.padOn += Math.sign(want - this.padOn) * Math.min(Math.abs(want - this.padOn), dt / FINGER_ANIM_S);
      this.pad.scale.y = 1 - 0.35 * this.padOn;
      return;
    }
    const target = closed ? FINGER_GAP_CLOSED : FINGER_GAP_OPEN;
    const rate = (FINGER_GAP_OPEN - FINGER_GAP_CLOSED) / FINGER_ANIM_S;
    const d = target - this.gap;
    const step = Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    if (step !== 0) this.setGap(this.gap + step);
  }
}
