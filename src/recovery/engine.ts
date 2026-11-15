import {
  BIN_POS,
  CUBE_SIZE,
  FINGER_GAP_CLOSED,
  FINGER_GAP_OPEN,
  SIM_DT,
  SIM_HZ,
  TABLE,
  type Vec3,
} from '../config';
import { advanceGap } from '../arm/gripper';
import { firstImpact } from './collision';
import { solveIK, toolOrientation, type Quaternion } from '../arm/ik';
import { TaskEnv, type Action, type EnvState } from '../env/env';
import { captureSample, type HandPose, type Sample } from '../tasks/recorder';

export type { HandPose } from '../tasks/recorder';
export type RecoveryState = EnvState & { fingerGapM: number; tipOrientation: Quaternion };
export type Side = 'left' | 'right';
export interface Bounds {
  min: Vec3;
  max: Vec3;
}
export interface Incident {
  side: Side;
  seed: number;
  carton: Vec3;
  tray: Vec3;
  obstacle: Bounds;
}

export interface RecoveryMetrics {
  success: boolean;
  pathLengthM: number;
  collisions: number;
  durationS: number;
}

export interface ContactEvent {
  step: number;
  /** Sim time of first impact within this fixed step, in seconds. */
  t: number;
  body: 'gripper' | 'carton';
  part: 'palm' | 'left-finger' | 'right-finger' | 'carton';
  point: Vec3;
}

export interface RecoveryAttempt {
  hz: number;
  coordinates: {
    referenceSpace: 'local-floor';
    upAxis: 'Y';
    distanceUnit: 'm';
    timeUnit: 's';
    quaternionOrder: 'xyzw';
    cartonOrientation: Quaternion;
  };
  incident: Incident;
  start: RecoveryState;
  final: RecoveryState;
  samples: Sample[];
  /** Zero-based sample indices of distinct contact entries against the tote. */
  contacts: number[];
  contactEvents: ContactEvent[];
  metrics: RecoveryMetrics;
}

/** The carton and destination stay fixed, including across incident branches. */
export function createIncident(side: Side, seed = 1, widthM = 0.3): Incident {
  const width = Number.isFinite(widthM) ? Math.max(0.2, Math.min(0.4, widthM)) : 0.3;
  const minX = side === 'left' ? 0.005 - width : -0.095;
  return {
    side,
    seed,
    carton: [0.12, TABLE.top + CUBE_SIZE / 2, -0.86],
    tray: [...BIN_POS.red],
    obstacle: { min: [minX, TABLE.top, -0.766], max: [minX + width, TABLE.top + 0.19, -0.65] },
  };
}

const HOME: Vec3 = [-0.18, 0.9, -0.53];
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const copy = <T>(value: T): T => structuredClone(value);

export class RecoveryEngine {
  readonly incident: Incident;
  readonly start: RecoveryState;
  private env: TaskEnv;
  private samples: Sample[] = [];
  private contactEvents: ContactEvent[] = [];
  private inContact = false;
  private distance = 0;

  constructor(
    incident: Incident,
    start?: EnvState & { fingerGapM?: number },
    private collisionEnabled = true,
  ) {
    this.incident = copy(incident);
    this.env = new TaskEnv(incident.seed, 'place');
    const s = this.env.state();
    if (start) Object.assign(s, copy(start));
    else {
      const ik = solveIK(HOME);
      s.tip = ik.tip;
      s.joints = ik.joints;
      s.cubes.red = [...incident.carton];
    }
    this.state().fingerGapM = start?.fingerGapM ?? (s.grip ? FINGER_GAP_CLOSED : FINGER_GAP_OPEN);
    this.state().tipOrientation = toolOrientation(s.joints);
    this.start = this.snapshot();
  }

  state(): RecoveryState {
    return this.env.state() as RecoveryState;
  }
  snapshot(): RecoveryState {
    return copy(this.state());
  }
  get firstContact(): ContactEvent | null {
    return this.contactEvents[0] ?? null;
  }

  step(action: Action, hand: HandPose | null = null): void {
    const before = this.snapshot();
    const step = this.samples.length;
    this.samples.push(captureSample(step / SIM_HZ, before, action, hand));
    this.env.step(action, SIM_DT);
    const after = this.state();
    after.fingerGapM = advanceGap(before.fingerGapM, after.grip === 1, SIM_DT);
    after.tipOrientation = toolOrientation(after.joints);
    const contact = this.collisionEnabled ? firstImpact(before, after, this.incident.obstacle, step) : null;
    if (contact) {
      if (!this.inContact) this.contactEvents.push(contact);
      // Reject the intersecting motion (and grip edge) but advance the clock.
      Object.assign(after, before, { steps: before.steps + 1 });
    } else this.distance += dist(before.tip, after.tip);
    this.inContact = !!contact;
  }

  get metrics(): RecoveryMetrics {
    return {
      success: this.env.state().success,
      pathLengthM: this.distance,
      collisions: this.contactEvents.length,
      durationS: this.samples.length / SIM_HZ,
    };
  }

  finish(): RecoveryAttempt {
    return {
      coordinates: {
        referenceSpace: 'local-floor',
        upAxis: 'Y',
        distanceUnit: 'm',
        timeUnit: 's',
        quaternionOrder: 'xyzw',
        cartonOrientation: [0, 0, 0, 1],
      },
      hz: SIM_HZ,
      incident: copy(this.incident),
      start: copy(this.start),
      final: this.snapshot(),
      samples: copy(this.samples),
      contacts: this.contactEvents.map((e) => e.step),
      contactEvents: copy(this.contactEvents),
      metrics: this.metrics,
    };
  }
}

/** Existing-style direct pick path, intentionally unaware of changes around the workcell. */
export function nominalAction(s: EnvState, incident: Incident): Action {
  if (s.held) {
    const drop: Vec3 = [incident.tray[0], incident.tray[1] + 0.12, incident.tray[2]];
    return { target: drop, grip: dist(s.tip, drop) < 0.01 ? 0 : 1 };
  }
  const target = s.cubes.red ?? incident.carton;
  return { target: [...target], grip: dist(s.tip, target) < 0.012 ? 1 : 0 };
}
