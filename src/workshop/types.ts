// Robot Workshop definitions. Each part and each challenge lives in its own file under parts/ and challenges/
// and is listed once in registry.ts. Numbers stay in src/config.ts (WORKSHOP).
import type * as THREE from 'three';
import type { Vec3 } from '../config';

export type ArmKind = string;
export type ToolKind = string;
export type ItemId = string;
export type WorkshopLayout = string;

export interface RobotParts {
  arm: ArmKind;
  tool: ToolKind;
}
export interface Links {
  l1: number;
  l2: number;
  /** shoulder pivot above the base; default SHOULDER_H */
  shoulderH?: number;
}
export interface Workspace {
  min: Vec3;
  max: Vec3;
}

export interface ArmDef {
  kind: 'arm';
  id: ArmKind;
  label: string;
  links: Links;
  /** heaviest object weight it lifts */
  payload: number;
  /** where the tip may be commanded */
  workspace: Workspace;
  /** strength / weakness, shown on the parts panel */
  blurb: string;
  /** drawn link thickness relative to the standard arm */
  girth?: number;
}

export interface ToolMats {
  orange: THREE.Material;
  dark: THREE.Material;
  steel: THREE.Material;
}
/** What the grip animation moves: two fingers (gap open/closed), or a pad that squashes. */
export interface ToolRig {
  fingers: THREE.Mesh[];
  gapOpen: number;
  gapClosed: number;
  pad: THREE.Object3D | null;
}

export interface ToolDef {
  kind: 'tool';
  id: ToolKind;
  label: string;
  blurb: string;
  /** why this tool can't hold the object, or null if it can */
  rule: (it: ItemSpec) => string | null;
  /** adds the tool's meshes to the tool group (tip at z = TOOL_LEN, pointing +z) */
  build: (tool: THREE.Group, m: ToolMats) => ToolRig;
}

export type Material = 'ceramic' | 'metal' | 'wood' | 'glass' | 'plastic' | 'paper';
/** flat: no sides to grip; cylinder/box/pot: has sides; ring: flat with a hole; loose: many small bits */
export type Shape = 'flat' | 'cylinder' | 'box' | 'pot' | 'ring' | 'loose';
export type Size = 'small' | 'normal' | 'big';

export interface ItemSpec {
  id: ItemId;
  name: string;
  material: Material;
  shape: Shape;
  size: Size;
  /** compared with the arm's payload */
  weight: number;
  /** center height when resting on the table */
  restY: number;
  /** horizontal radius (keeps it inside bins) */
  radius: number;
  /** a smooth flat top suction can seal on (flat things always have one) */
  smoothTop?: boolean;
  /** render offset while held (e.g. a plate hangs under the pad) */
  holdDrop?: number;
  /** why suction fails on it, when the generic text doesn't fit */
  suctionText?: string;
  /** simple primitive meshes, centered on the item's position */
  mesh: () => THREE.Object3D;
}

export type GoalKind = 'rack' | 'pallet' | 'bin' | 'zone' | 'bowl' | 'basket';
export interface Goal {
  kind: GoalKind;
  pos: Vec3; // center on the table top
  w: number;
  d: number;
  /** rack/pallet: height of the top; bin/basket: wall height; zone: 0 */
  h: number;
  color: number;
}
export type Rng = () => number;
export interface TaskStep {
  item: ItemId;
  goal: Goal;
  spawn: (rng: Rng) => Vec3;
}
export interface ChallengeDef {
  layout: WorkshopLayout;
  name: string;
  hint: string;
  /** objects this challenge brings (an object may be shared by several challenges) */
  items: ItemSpec[];
  steps: TaskStep[];
  /** every robot that solves it; the tests check this against the real rules. The challenge hides itself
   *  when none of these robots can be built from ENABLED_PARTS. */
  solutions: RobotParts[];
  /** extra fixed scenery (e.g. a high shelf), positioned in world coordinates */
  scenery?: () => THREE.Object3D[];
  /** Multi-step jobs where parts may be swapped mid-challenge (not while holding something) without a restart.
   *  stepSolutions[i] lists the robots that can do step i; `solutions` (single robots) is then usually empty. */
  swap?: boolean;
  stepSolutions?: RobotParts[][];
}
