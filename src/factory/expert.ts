// Scripted expert for Place: a state-feedback controller over waypoints, so it recovers from disturbances.
import { BIN_POS, TABLE, type Vec3 } from '../config';
import type { Action, EnvState } from '../env/env';
import { gaussian, mulberry32, type Rng } from '../env/rng';

export const EXPERT = {
  above: 0.1, // approach height above the cube
  liftY: TABLE.top + 0.15,
  retreatY: TABLE.top + 0.3,
  maxStep: 0.04, // action limited to this distance from the current tip
  reachTol: 0.01,
  holdSteps: 2,
  noiseSigma: 0.01,
  burstMin: 5,
  burstMax: 10,
};

type Phase = 'above' | 'descend' | 'close' | 'lift' | 'carry' | 'open' | 'retreat';

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export class PlaceExpert {
  phase: Phase = 'above';
  private hold = 0;

  reset(): void {
    this.phase = 'above';
    this.hold = 0;
  }

  /** The clean expert action for the state the arm is actually in. */
  act(s: EnvState): Action {
    const cube = s.cubes.red!;
    const bin = BIN_POS.red;
    // state feedback: re-plan when the world does not match the phase
    if (s.held === 'red' && (this.phase === 'above' || this.phase === 'descend')) this.phase = 'lift';
    if (s.held !== 'red' && (this.phase === 'lift' || this.phase === 'carry')) this.phase = 'above';
    if (s.held !== 'red' && this.phase === 'close' && s.grip === 1) this.phase = 'above'; // missed grasp

    let wp: Vec3;
    let grip: 0 | 1 = 0;
    for (let guard = 0; guard < 8; guard++) {
      switch (this.phase) {
        case 'above':
          wp = [cube[0], cube[1] + EXPERT.above, cube[2]];
          grip = 0;
          // never sweep through the cube: if low and far, go up first
          if (s.tip[1] < cube[1] + EXPERT.above - 0.02 && Math.hypot(s.tip[0] - cube[0], s.tip[2] - cube[2]) > 0.02)
            wp = [s.tip[0], cube[1] + EXPERT.above, s.tip[2]];
          if (dist(s.tip, [cube[0], cube[1] + EXPERT.above, cube[2]]) <= EXPERT.reachTol) {
            this.phase = 'descend';
            continue;
          }
          break;
        case 'descend':
          wp = [cube[0], cube[1], cube[2]];
          grip = 0;
          if (dist(s.tip, wp) <= EXPERT.reachTol) {
            this.phase = 'close';
            this.hold = 0;
            continue;
          }
          break;
        case 'close':
          wp = [cube[0], cube[1], cube[2]];
          grip = 1;
          if (s.held === 'red' && this.hold >= EXPERT.holdSteps) {
            this.phase = 'lift';
            continue;
          }
          this.hold++;
          break;
        case 'lift':
          wp = [s.tip[0], EXPERT.liftY, s.tip[2]];
          grip = 1;
          if (Math.abs(s.tip[1] - EXPERT.liftY) <= EXPERT.reachTol) {
            this.phase = 'carry';
            continue;
          }
          break;
        case 'carry':
          wp = [bin[0], EXPERT.liftY, bin[2]];
          grip = 1;
          if (dist(s.tip, wp) <= EXPERT.reachTol) {
            this.phase = 'open';
            this.hold = 0;
            continue;
          }
          break;
        case 'open':
          wp = [bin[0], EXPERT.liftY, bin[2]];
          grip = 0;
          if (this.hold >= EXPERT.holdSteps) {
            this.phase = 'retreat';
            continue;
          }
          this.hold++;
          break;
        case 'retreat':
          wp = [bin[0], EXPERT.retreatY, bin[2]];
          grip = 0;
          break;
      }
      break;
    }
    return { target: limit(s.tip, wp!), grip };
  }
}

function limit(from: Vec3, to: Vec3): Vec3 {
  const d = dist(from, to);
  if (d <= EXPERT.maxStep) return [...to];
  const k = EXPERT.maxStep / d;
  return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k];
}

/** Noise injection: Gaussian noise on the executed action in random bursts of 5-10 steps. */
export class BurstNoise {
  private rng: Rng;
  private left = 0;
  private gap = 0;

  constructor(seed: number) {
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    this.gap = this.nextGap();
  }

  private nextGap() {
    return 3 + Math.floor(this.rng() * 8);
  }

  apply(a: Action): Action {
    if (this.left === 0) {
      if (this.gap > 0) {
        this.gap--;
        return a;
      }
      this.left = EXPERT.burstMin + Math.floor(this.rng() * (EXPERT.burstMax - EXPERT.burstMin + 1));
    }
    this.left--;
    if (this.left === 0) this.gap = this.nextGap();
    const n = () => gaussian(this.rng) * EXPERT.noiseSigma;
    return { target: [a.target[0] + n(), a.target[1] + n(), a.target[2] + n()], grip: a.grip };
  }
}
