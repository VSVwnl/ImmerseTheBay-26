// The one place task logic lives. Human app (M1), factory (M3) and policy (M4) all run this.
// Deterministic: same seed + same actions + same dt values => same result. No Math.random, no clocks.
import { solveIK, type Joints } from '../arm/ik';
import { COLORS, findGrab, restsIn, settle, type CubeColor } from '../arm/grasp';
import {
  CUBE_SIZE,
  CUBE_SPAWN,
  HOME_TIP,
  MAX_TIP_SPEED,
  REACH_HEIGHT,
  REACH_SUCCESS_DIST,
  TABLE,
  WORKSPACE,
  type Vec3,
} from '../config';
import { mulberry32, type Rng } from './rng';

export type Layout = 'reach' | 'place' | 'sort';
export type Action = { target: Vec3; grip: 0 | 1 };
export type Cubes = Partial<Record<CubeColor, Vec3>>;

export type EnvState = {
  layout: Layout;
  seed: number;
  tip: Vec3;
  joints: Joints;
  grip: 0 | 1;
  held: null | CubeColor;
  cubes: Cubes;
  reachTargets: Vec3[];
  reachIndex: number; // how many reach targets are done
  drops: number;
  wrongBin: number;
  success: boolean;
  steps: number;
};

export interface Env {
  reset(seed: number, layout: Layout): void;
  step(action: Action, dt: number): void;
  state(): EnvState;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const CUBE_REST_Y = TABLE.top + CUBE_SIZE / 2;

export function clampToWorkspace(t: Vec3): Vec3 {
  return [
    clamp(t[0], WORKSPACE.min[0], WORKSPACE.max[0]),
    clamp(t[1], WORKSPACE.min[1], WORKSPACE.max[1]),
    clamp(t[2], WORKSPACE.min[2], WORKSPACE.max[2]),
  ];
}

function spawnCube(rng: Rng, others: Vec3[]): Vec3 {
  for (let i = 0; i < 200; i++) {
    const p: Vec3 = [
      CUBE_SPAWN.xMin + rng() * (CUBE_SPAWN.xMax - CUBE_SPAWN.xMin),
      CUBE_REST_Y,
      CUBE_SPAWN.zMin + rng() * (CUBE_SPAWN.zMax - CUBE_SPAWN.zMin),
    ];
    if (others.every((o) => Math.hypot(o[0] - p[0], o[2] - p[2]) >= CUBE_SPAWN.minSep)) return p;
  }
  return [0, CUBE_REST_Y, -0.72];
}

function reachTargets(rng: Rng): Vec3[] {
  const cols: [number, number][] = [
    [-0.32, -0.16],
    [-0.08, 0.08],
    [0.16, 0.32],
  ];
  // shuffle column order
  for (let i = cols.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cols[i], cols[j]] = [cols[j], cols[i]];
  }
  return cols.map(([lo, hi]) => [lo + rng() * (hi - lo), TABLE.top + REACH_HEIGHT, -0.85 + rng() * 0.33] as Vec3);
}

export function successOf(s: Pick<EnvState, 'layout' | 'cubes' | 'held' | 'reachIndex' | 'reachTargets'>): boolean {
  switch (s.layout) {
    case 'reach':
      return s.reachIndex >= s.reachTargets.length;
    case 'place':
      return !!s.cubes.red && restsIn(s.cubes.red, 'red', s.held === 'red');
    case 'sort':
      return COLORS.every((c) => !!s.cubes[c] && restsIn(s.cubes[c]!, c, s.held === c));
  }
}

export class TaskEnv implements Env {
  private s!: EnvState;
  private rng: Rng = mulberry32(0);

  constructor(seed = 0, layout: Layout = 'place') {
    this.reset(seed, layout);
  }

  reset(seed: number, layout: Layout): void {
    this.rng = mulberry32(seed);
    const cubes: Cubes = {};
    let targets: Vec3[] = [];
    if (layout === 'reach') targets = reachTargets(this.rng);
    if (layout === 'place') cubes.red = spawnCube(this.rng, []);
    if (layout === 'sort') {
      cubes.red = spawnCube(this.rng, []);
      cubes.blue = spawnCube(this.rng, [cubes.red]);
    }
    const ik = solveIK(HOME_TIP);
    this.s = {
      layout,
      seed,
      tip: ik.tip,
      joints: ik.joints,
      grip: 0,
      held: null,
      cubes,
      reachTargets: targets,
      reachIndex: 0,
      drops: 0,
      wrongBin: 0,
      success: false,
      steps: 0,
    };
  }

  step(action: Action, dt: number): void {
    const s = this.s;
    const tgt = clampToWorkspace(action.target);
    if (s.held) tgt[1] = Math.max(tgt[1], CUBE_REST_Y); // a held cube never goes into the table

    // move toward target, speed-limited
    const dx = tgt[0] - s.tip[0];
    const dy = tgt[1] - s.tip[1];
    const dz = tgt[2] - s.tip[2];
    const d = Math.hypot(dx, dy, dz);
    const maxStep = MAX_TIP_SPEED * dt;
    const k = d > maxStep ? maxStep / d : 1;
    const want: Vec3 = [s.tip[0] + dx * k, s.tip[1] + dy * k, s.tip[2] + dz * k];
    const ik = solveIK(want);
    s.tip = ik.tip;
    s.joints = ik.joints;

    // grasp rules on grip edges
    const g = action.grip;
    if (g === 1 && s.grip === 0 && !s.held) {
      s.held = findGrab(s.tip, s.cubes);
    } else if (g === 0 && s.grip === 1 && s.held) {
      const c = s.held;
      s.held = null;
      const rest = settle(s.tip);
      if (rest.offTable) {
        s.cubes[c] = spawnCube(this.rng, COLORS.filter((o) => o !== c && s.cubes[o]).map((o) => s.cubes[o]!));
      } else {
        s.cubes[c] = rest.pos;
      }
      if (rest.bin !== c) s.drops++;
      if (rest.bin && rest.bin !== c) s.wrongBin++;
    }
    s.grip = g;
    if (s.held) s.cubes[s.held] = [s.tip[0], s.tip[1], s.tip[2]];

    // reach progress
    if (s.layout === 'reach' && s.reachIndex < s.reachTargets.length) {
      if (dist(s.tip, s.reachTargets[s.reachIndex]) <= REACH_SUCCESS_DIST) s.reachIndex++;
    }
    s.success = successOf(s);
    s.steps++;
  }

  state(): EnvState {
    return this.s;
  }

  /** Deep copy, safe to keep. */
  snapshot(): EnvState {
    return JSON.parse(JSON.stringify(this.s));
  }
}
