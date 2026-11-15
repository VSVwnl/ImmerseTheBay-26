// Arm model: base, turret, two links, wrist, and a tool. Driven by joint angles from ik.ts.
// Built for one set of parts; the app builds a new one when parts change. The standard robot
// (Compact + Gripper) builds exactly the original meshes.
// Each tool's meshes come from its part file (src/workshop/parts/).
import * as THREE from 'three';
import { ARM_BASE, FINGER_ANIM_S, WORKSHOP } from '../config';
import type { Joints } from './ik';
import { ARMS, linksFor, shoulderHeight, STANDARD_ROBOT, TOOLS, type RobotParts } from './parts';
import type { ToolMats as Mats, ToolRig } from '../workshop/types';

export class ArmModel {
  readonly root = new THREE.Group();
  private turret = new THREE.Group();
  private upper = new THREE.Group();
  private fore = new THREE.Group();
  private tool = new THREE.Group();
  private rig: ToolRig;
  private gap: number;
  private padOn = 0; // 0..1 pad squash
  private slipT = 0; // seconds left of the failed-grab wobble
  readonly parts: RobotParts;

  constructor(parts: RobotParts = STANDARD_ROBOT) {
    this.parts = { arm: parts.arm, tool: parts.tool };
    const links = linksFor(parts.arm);
    const { l1: L1, l2: L2 } = links;
    const SH = shoulderHeight(links);
    const G = ARMS[parts.arm]?.girth ?? 1; // link thickness
    const m: Mats = {
      orange: new THREE.MeshStandardMaterial({ color: 0xf28a1e, roughness: 0.45, metalness: 0.2 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2d3036, roughness: 0.5, metalness: 0.5 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.8 }),
    };

    this.root.position.set(...ARM_BASE);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.04, 40), m.dark);
    base.position.y = 0.02;
    this.root.add(base);
    this.root.add(this.turret);

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, SH - 0.02, 32), m.orange);
    column.position.y = 0.04 + (SH - 0.04) / 2 - 0.01;
    this.turret.add(column);

    // shoulder pivot
    this.upper.position.y = SH;
    this.turret.add(this.upper);
    const shoulderHub = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * G, 0.055 * G, 0.13, 32), m.dark);
    shoulderHub.rotation.z = Math.PI / 2;
    this.upper.add(shoulderHub);
    const link1 = new THREE.Mesh(new THREE.BoxGeometry(0.07 * G, 0.06 * G, L1), m.orange);
    link1.position.z = L1 / 2;
    this.upper.add(link1);

    this.fore.position.z = L1;
    this.upper.add(this.fore);
    const elbowHub = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * G, 0.045 * G, 0.11, 28), m.dark);
    elbowHub.rotation.z = Math.PI / 2;
    this.fore.add(elbowHub);
    const link2 = new THREE.Mesh(new THREE.BoxGeometry(0.055 * G, 0.05 * G, L2), m.orange);
    link2.position.z = L2 / 2;
    this.fore.add(link2);

    this.tool.position.z = L2;
    this.fore.add(this.tool);
    const wristHub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 24), m.dark);
    wristHub.rotation.z = Math.PI / 2;
    this.tool.add(wristHub);
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 24), m.steel);
    flange.rotation.x = Math.PI / 2;
    flange.position.z = 0.035;
    this.tool.add(flange);
    this.rig = (TOOLS[parts.tool] ?? TOOLS.gripper).build(this.tool, m);
    this.gap = this.rig.gapOpen;
    this.setGap(this.rig.gapOpen);
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
    const f = this.rig.fingers;
    if (!f.length) return;
    this.gap = g;
    f[0].position.x = -(g / 2 + 0.006);
    f[1].position.x = g / 2 + 0.006;
  }

  /** Animate the grip toward open/closed over FINGER_ANIM_S. */
  updateGrip(closed: boolean, dt: number): void {
    if (this.slipT > 0) {
      this.slipT = Math.max(0, this.slipT - dt);
      const k = this.slipT / WORKSHOP.slipS;
      this.tool.position.x = 0.012 * k * Math.sin((1 - k) * 40);
    } else this.tool.position.x = 0;
    if (this.rig.pad) {
      const want = closed ? 1 : 0;
      this.padOn += Math.sign(want - this.padOn) * Math.min(Math.abs(want - this.padOn), dt / FINGER_ANIM_S);
      this.rig.pad.scale.y = 1 - 0.35 * this.padOn;
    }
    if (!this.rig.fingers.length) return;
    const { gapOpen, gapClosed } = this.rig;
    const target = closed ? gapClosed : gapOpen;
    const rate = (gapOpen - gapClosed) / FINGER_ANIM_S;
    const d = target - this.gap;
    const step = Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    if (step !== 0) this.setGap(this.gap + step);
  }
}
