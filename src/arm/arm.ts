// Arm model: base, turret, two links, wrist, two-finger gripper. Driven by joint angles from ik.ts.
import * as THREE from 'three';
import { ARM_BASE, FINGER_GAP_OPEN, L1, L2, SHOULDER_H, TOOL_LEN } from '../config';
import type { Joints } from './ik';
import { advanceGap, FINGER, fingerOffset, PALM } from './gripper';

export class ArmModel {
  readonly root = new THREE.Group();
  private turret = new THREE.Group();
  private upper = new THREE.Group();
  private fore = new THREE.Group();
  private tool = new THREE.Group();
  private fingers: THREE.Mesh[] = [];
  private gap = FINGER_GAP_OPEN;

  constructor() {
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
    const palm = new THREE.Mesh(new THREE.BoxGeometry(...PALM.size), dark);
    palm.name = 'gripper-palm';
    palm.position.z = TOOL_LEN - PALM.aboveTip;
    this.tool.add(palm);
    for (let i = 0; i < 2; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(...FINGER.size), steel);
      f.name = i === 0 ? 'gripper-left' : 'gripper-right';
      f.position.z = TOOL_LEN - FINGER.aboveTip;
      this.fingers.push(f);
      this.tool.add(f);
    }
    this.setGap(FINGER_GAP_OPEN);
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

  private setGap(g: number): void {
    this.gap = g;
    this.fingers[0].position.x = -fingerOffset(g);
    this.fingers[1].position.x = fingerOffset(g);
  }

  /** Animate the finger gap toward open/closed over FINGER_ANIM_S. */
  updateGrip(closed: boolean, dt: number): void {
    const next = advanceGap(this.gap, closed, dt);
    if (next !== this.gap) this.setGap(next);
  }
}
