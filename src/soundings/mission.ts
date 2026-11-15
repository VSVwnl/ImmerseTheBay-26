import { graspDistance } from '../arm/grasp';
import { solveIK, type Joints } from '../arm/ik';
import {
  GRAB_RADIUS,
  HOME_TIP,
  MAX_TIP_SPEED,
  REACH_SUCCESS_DIST,
  SIM_DT,
  SIM_HZ,
  SUBSEA,
  TABLE,
  type Vec3,
} from '../config';
import { clampToWorkspace, type Action } from '../env/env';
import { motionSample } from '../tasks/recorder';

export type Rail = 'port' | 'starboard';
export type Rig = { arm: Rail; lamp: 'inner' | Rail; aim: 'forward' | 'inward' };
export type Site = 'dock' | 'canyon' | 'mirror';
export type Source = 'practice' | 'live';

export const CAGE_HALF_X = SUBSEA.cageHalfX;
export const CAGE_HALF_Z = SUBSEA.cageHalfZ;
export const CRADLE_HALF_X = SUBSEA.cradleHalfX;
export const CRADLE_HALF_Z = SUBSEA.cradleHalfZ;
export const CLEARANCE_BELOW_HANDLE = SUBSEA.clearanceBelowHandle;

export function validRig(rig: Rig): boolean {
  return (
    (rig.arm === 'port' || rig.arm === 'starboard') &&
    (rig.lamp === 'inner' || rig.lamp === 'port' || rig.lamp === 'starboard') &&
    rig.arm !== rig.lamp &&
    (rig.aim === 'forward' || rig.aim === 'inward')
  );
}

// The ROV faces +Z. Seen looking forward from its mast, port is +X.
const railX = (side: Rail) => (side === 'port' ? SUBSEA.railX : -SUBSEA.railX);
export const armBase = (rig: Rig): Vec3 => [railX(rig.arm), TABLE.top, SUBSEA.baseZ];
export const cameraAt = (): Vec3 => [...SUBSEA.camera];
export const lampAt = (rig: Rig): Vec3 =>
  rig.lamp === 'inner' ? [...SUBSEA.innerLamp] : [railX(rig.lamp), SUBSEA.railLampY, SUBSEA.baseZ];
export function handleAt(site: Site): Vec3 {
  if (site === 'dock') return [...SUBSEA.dockHandle];
  const [x, y, z] = SUBSEA.canyonHandle;
  return [site === 'mirror' ? -x : x, y, z];
}
export const cradleAt = (_site: Site): Vec3 => [...SUBSEA.cradle];
export const lipHeight = (site: Site): number => (site === 'dock' ? TABLE.top : SUBSEA.cageRimY);

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function inside(p: Vec3, anchor: Vec3, halfX: number, halfZ: number): boolean {
  return Math.abs(p[0] - anchor[0]) <= halfX && Math.abs(p[2] - anchor[2]) <= halfZ;
}

export interface MissionState {
  tip: Vec3;
  requested: Vec3;
  joints: Joints;
  grip: 0 | 1;
  held: boolean;
  /** World position of the recorder's graspable handle, including while suspended. */
  handle: Vec3;
  success: boolean;
  misses: number;
  drops: number;
  snagged: boolean;
  closestM: number;
  elapsedS: number;
}

type Contact = 'grasp' | 'miss' | 'drop' | 'snag' | 'dock' | 'delivery';
type MissionEvent =
  | { type: Contact; t: number; distanceM: number; tip: Vec3; handle: Vec3 }
  | { type: 'steer'; t: number; at: string; prompt: string; source: Source }
  | { type: 'symbol'; t: number; answer: string; expected: string; correct: boolean }
  | { type: 'frame'; t: number; at: string; source: Source; image: string; contactEvent: number | null };

export interface MissionRecord {
  kind: 'soundings';
  hz: number;
  site: Site;
  rig: Rig;
  prediction: string;
  startedAt: string;
  outcome: 'running' | 'aborted' | 'dock-cleared' | 'recovered';
  closestM: number;
  durationMs: number;
  samples: (ReturnType<typeof motionSample> & { held: boolean; handle: Vec3 })[];
  events: MissionEvent[];
}

/** The simulated clock drives the recorder. Metadata events also preserve observed wall time. */
export class SoundingsMission {
  readonly state: MissionState;
  readonly record: MissionRecord;
  readonly rig: Rig;
  private readonly base: Vec3;
  private readonly basket: Vec3;
  private readonly cradle: Vec3;
  private accumulator = 0;
  private lastClosure: number | null = null;

  constructor(
    readonly site: Site,
    rig: Rig,
    prediction = '',
  ) {
    if (!validRig(rig)) throw new Error('Arm and lamp require compatible, separate sockets.');
    this.rig = { ...rig };
    this.base = armBase(rig);
    this.basket = handleAt(site);
    this.cradle = cradleAt(site);
    const ik = solveIK(HOME_TIP, this.base);
    const closestM = distance(ik.tip, this.basket);
    this.state = {
      tip: ik.tip,
      requested: [...HOME_TIP],
      joints: ik.joints,
      grip: 0,
      held: false,
      handle: [...this.basket],
      success: false,
      misses: 0,
      drops: 0,
      snagged: false,
      closestM,
      elapsedS: 0,
    };
    this.record = {
      kind: 'soundings',
      hz: SIM_HZ,
      site,
      rig: { ...rig },
      prediction,
      startedAt: new Date().toISOString(),
      outcome: 'running',
      closestM,
      durationMs: 0,
      samples: [],
      events: [],
    };
  }

  steer(prompt: string, source: Source): void {
    this.record.events.push({
      type: 'steer',
      t: this.state.elapsedS,
      at: new Date().toISOString(),
      prompt,
      source,
    });
  }

  frame(image: string, source: Source): void {
    this.record.events.push({
      type: 'frame',
      t: this.state.elapsedS,
      at: new Date().toISOString(),
      image,
      source,
      contactEvent: this.lastClosure,
    });
  }

  reportSymbol(answer: string, expected: string): void {
    this.record.events.push({
      type: 'symbol',
      t: this.state.elapsedS,
      answer,
      expected,
      correct: answer === expected,
    });
  }

  abort(): void {
    if (this.record.outcome === 'running') this.record.outcome = 'aborted';
  }

  /** Same jaw target and grip replay identically at any renderer refresh rate. */
  step(action: Action, dt: number): void {
    if (this.record.outcome !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
    this.accumulator += dt;
    while (this.accumulator >= SIM_DT - 1e-10 && this.record.outcome === 'running') {
      this.accumulator = Math.max(0, this.accumulator - SIM_DT);
      this.tick(action);
    }
  }

  private contact(type: Contact): void {
    const s = this.state;
    const index =
      this.record.events.push({
        type,
        t: s.elapsedS,
        distanceM: distance(s.tip, s.handle),
        tip: [...s.tip],
        handle: [...s.handle],
      }) - 1;
    if (type === 'grasp' || type === 'miss') this.lastClosure = index;
  }

  private tick(action: Action): void {
    const s = this.state;
    // Input with the state before the step matches Backlot's Recorder convention.
    this.record.samples.push({
      ...motionSample(this.record.samples.length, SIM_HZ, action, s.tip, s.joints),
      held: s.held,
      handle: [...s.handle],
    });
    s.elapsedS = this.record.samples.length / SIM_HZ;
    this.record.durationMs = Math.round(s.elapsedS * 1000);
    const requested = clampToWorkspace(action.target);
    s.requested = requested;
    if (s.held) requested[1] = Math.max(requested[1], this.basket[1]);
    const length = distance(requested, s.tip);
    const fraction = length > 0 ? Math.min(1, (MAX_TIP_SPEED * SIM_DT) / length) : 1;
    const next = s.tip.map((v, i) => v + (requested[i] - v) * fraction) as Vec3;
    // The recorder hangs below its grip point. Stop a sideways pull at the basket wall
    // while allowing vertical motion, so the pilot can lift out of a snag.
    const wasSnagged = s.snagged;
    s.snagged =
      s.held &&
      this.site !== 'dock' &&
      next[1] < lipHeight(this.site) + CLEARANCE_BELOW_HANDLE &&
      inside(s.tip, this.basket, CAGE_HALF_X, CAGE_HALF_Z) !==
        inside(next, this.basket, CAGE_HALF_X, CAGE_HALF_Z);
    if (s.snagged) {
      next[0] = s.tip[0];
      next[2] = s.tip[2];
      if (!wasSnagged) this.contact('snag');
    }
    const ik = solveIK(next, this.base);
    s.tip = ik.tip;
    s.joints = ik.joints;
    if (!s.held) s.closestM = Math.min(s.closestM, distance(s.tip, s.handle));
    this.record.closestM = s.closestM;

    if (this.site === 'dock') {
      if (distance(s.tip, s.handle) <= REACH_SUCCESS_DIST) {
        s.success = true;
        this.record.outcome = 'dock-cleared';
        this.contact('dock');
      }
    } else if (action.grip === 1 && s.grip === 0) {
      s.held = graspDistance(s.tip, s.handle) !== null;
      if (!s.held) s.misses++;
      this.contact(s.held ? 'grasp' : 'miss');
    } else if (action.grip === 0 && s.grip === 1 && s.held) {
      s.held = false;
      s.success = inside(s.tip, this.cradle, CRADLE_HALF_X, CRADLE_HALF_Z);
      this.contact(s.success ? 'delivery' : 'drop');
      if (s.success) {
        this.record.outcome = 'recovered';
        s.handle = [...this.cradle];
      } else {
        s.drops++;
        s.handle = [s.tip[0], this.basket[1], s.tip[2]];
      }
    }
    s.grip = action.grip;
    if (s.held) s.handle = [...s.tip];
  }

  diagnosis(): string {
    const s = this.state;
    if (s.success)
      return this.site === 'dock' ? 'Dock contact confirmed.' : 'Recorder secured in the cradle.';
    const unreachableM = distance(solveIK(s.handle, this.base).tip, s.handle);
    if (unreachableM > GRAB_RADIUS) {
      return `This rail leaves the jaws ${Math.round(unreachableM * 100)} cm short. Move the arm to the other rail.`;
    }
    if (s.snagged)
      return 'The recorder caught the cage lip. Lift straight up before carrying it toward the cradle.';
    if (s.held) return 'Handle gripped. Lift clear of the cage, carry to the cradle and release.';
    if (s.drops)
      return 'Released outside the cradle. Regrip the recorder and center it over the cradle before opening.';
    const symbol = this.record.events.filter((e) => e.type === 'symbol').at(-1);
    if (symbol?.type === 'symbol' && !symbol.correct)
      return 'The reported symbol differs from the plate. Inspect the pilot frame and lamp angle.';
    if (s.misses)
      return 'The jaws closed outside grasp range. Line up the actual jaws with the top handle before pinching.';
    return 'Guide the jaws to the handle.';
  }
}
