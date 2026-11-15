// Arm model: base, turret, two links, wrist, and a tool. Driven by joint angles from ik.ts.
// Built for one set of parts; the app builds a new one when parts change. The standard robot
// (Compact + Gripper) builds exactly the original meshes.
// To add a tool look, add a builder to TOOL_BUILDERS (simple primitives only).
import * as THREE from 'three';
import { ARM_BASE, FINGER_ANIM_S, FINGER_GAP_CLOSED, FINGER_GAP_OPEN, TOOL_LEN, WORKSHOP } from '../config';
import type { Joints } from './ik';
import { linksFor, shoulderHeight, STANDARD_ROBOT, type RobotParts, type ToolKind } from './parts';

interface Mats {
  orange: THREE.Material;
  dark: THREE.Material;
  steel: THREE.Material;
}
/** What the grip animation moves: two fingers (gap open/closed), or a pad that squashes. */
interface ToolRig {
  fingers: THREE.Mesh[];
  gapOpen: number;
  gapClosed: number;
  pad: THREE.Object3D | null;
}

function fingerRig(tool: THREE.Group, m: Mats, palmW: number, gapOpen: number, gapClosed: number, fingerLen = 0.065): ToolRig {
  const palm = new THREE.Mesh(new THREE.BoxGeometry(palmW, 0.035, 0.02), m.dark);
  palm.position.z = TOOL_LEN - 0.055;
  tool.add(palm);
  const fingers: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, fingerLen), m.steel);
    f.position.z = TOOL_LEN - 0.012;
    fingers.push(f);
    tool.add(f);
  }
  return { fingers, gapOpen, gapClosed, pad: null };
}

function stem(tool: THREE.Group, m: Mats, r = 0.012): void {
  const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r, TOOL_LEN - 0.07, 16), m.steel);
  s.rotation.x = Math.PI / 2;
  s.position.z = 0.06 + (TOOL_LEN - 0.07) / 2;
  tool.add(s);
}

const TOOL_BUILDERS: Record<ToolKind, (tool: THREE.Group, m: Mats) => ToolRig> = {
  gripper: (tool, m) => fingerRig(tool, m, 0.11, FINGER_GAP_OPEN, FINGER_GAP_CLOSED),
  suction: (tool, m) => {
    // stem down to a flat round rubber pad whose face is at the tip point
    stem(tool, m);
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.9, metalness: 0 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.014, 32), rubber);
    pad.rotation.x = Math.PI / 2;
    pad.position.z = TOOL_LEN - 0.007;
    tool.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.004, 8, 32), m.orange);
    ring.position.z = TOOL_LEN - 0.016;
    tool.add(ring);
    return { fingers: [], gapOpen: 0, gapClosed: 0, pad };
  },
  magnet: (tool, m) => {
    // stem to a red electromagnet puck with a steel face at the tip point
    stem(tool, m);
    const red = new THREE.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.5, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 28), red);
    body.rotation.x = Math.PI / 2;
    body.position.z = TOOL_LEN - 0.022;
    tool.add(body);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.007, 28), m.steel);
    face.rotation.x = Math.PI / 2;
    face.position.z = TOOL_LEN - 0.0035;
    tool.add(face);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.003, 6, 28), m.orange);
    coil.position.z = TOOL_LEN - 0.03;
    tool.add(coil);
    return { fingers: [], gapOpen: 0, gapClosed: 0, pad: face };
  },
};

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
    const shoulderHub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.13, 32), m.dark);
    shoulderHub.rotation.z = Math.PI / 2;
    this.upper.add(shoulderHub);
    const link1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, L1), m.orange);
    link1.position.z = L1 / 2;
    this.upper.add(link1);

    this.fore.position.z = L1;
    this.upper.add(this.fore);
    const elbowHub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 28), m.dark);
    elbowHub.rotation.z = Math.PI / 2;
    this.fore.add(elbowHub);
    const link2 = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, L2), m.orange);
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
    this.rig = (TOOL_BUILDERS[parts.tool] ?? TOOL_BUILDERS.gripper)(this.tool, m);
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
