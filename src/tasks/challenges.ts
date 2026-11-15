// The three challenges in order, with countdown, timer, success checks and recording.
// Owns the fixed-step env loop for the human app: env.step(action, 1/SIM_HZ) per tick.
import { CHALLENGE_LIMIT_S, COUNTDOWN_S, SIM_DT, SIM_HZ } from '../config';
import { TaskEnv, type Action, type EnvState, type GrabFail, type Layout } from '../env/env';
import { sameParts, STANDARD_ROBOT, workshopStartParts, type RobotParts } from '../arm/parts';
import { enabledWorkshopLayouts, WORKSHOP_TASKS } from '../env/workshop';
import { Recorder, type AttemptRecord, type InputKind } from './recorder';

export interface ChallengeDef {
  layout: Layout;
  name: string;
  hint: string;
}

export const CHALLENGES: ChallengeDef[] = [
  { layout: 'reach', name: 'Reach', hint: 'Touch the glowing targets in order' },
  { layout: 'place', name: 'Place', hint: 'Put the red cube in the red bin' },
  { layout: 'sort', name: 'Sort', hint: 'Each cube into its own-colored bin' },
];

/** Robot Workshop challenges switched on in config (ENABLED_CHALLENGES), in registry order. */
export function workshopChallenges(): ChallengeDef[] {
  return enabledWorkshopLayouts().map((l) => ({ layout: l, name: WORKSHOP_TASKS[l].name, hint: WORKSHOP_TASKS[l].hint }));
}
export const WORKSHOP_HINT = 'Pick the right parts for the job';

export type Phase = 'idle' | 'countdown' | 'running' | 'between' | 'results';

export interface ChallengeResult {
  challenge: Layout;
  name: string;
  timeS: number;
  success: boolean;
  drops: number;
  pathLengthM: number;
  attemptId: string;
}

export type ChallengeEvent =
  | { type: 'countdown'; n: number }
  | { type: 'go' }
  | { type: 'progress' } // a reach target was hit
  | { type: 'success'; result: ChallengeResult }
  | { type: 'fail'; result: ChallengeResult }
  | { type: 'results'; results: ChallengeResult[] }
  | { type: 'grabfail'; fail: GrabFail }
  | { type: 'parts'; robot: RobotParts } // the robot was rebuilt
  | { type: 'attempt'; record: AttemptRecord };

export interface ChallengeDeps {
  sessionId: string;
  world: () => { id: string; prompt: string } | null;
  input: () => InputKind;
  seed: () => number;
  onEvent: (e: ChallengeEvent) => void;
}

const BETWEEN_S = 1.6;

export class Challenges {
  readonly env = new TaskEnv(0, 'place');
  phase: Phase = 'idle';
  index = 0;
  results: ChallengeResult[] = [];
  /** previous and current state for render interpolation */
  prev: EnvState = this.env.snapshot();
  curr: EnvState = this.env.snapshot();
  acc = 0;
  private phaseT = 0;
  private lastCount = 0;
  private recorder = new Recorder();
  private attemptN = 0;
  /** when false, the env does not step in idle/results (e.g. during Multiply) */
  freePlay = true;
  /** Robot Workshop mode: the workshop challenges, with parts the user picks */
  workshop = false;
  robot: RobotParts = { ...STANDARD_ROBOT };

  constructor(private deps: ChallengeDeps) {
    this.env.reset(deps.seed(), 'place');
    this.syncSnapshots();
  }

  get list(): ChallengeDef[] {
    return this.workshop ? workshopChallenges() : CHALLENGES;
  }

  get current(): ChallengeDef {
    return this.list[this.index] ?? this.list[0];
  }

  /** Enter or leave Workshop mode. Leaving always puts the standard robot back. Goes to the idle screen.
   *  Entering does nothing when every Workshop challenge is switched off. */
  setWorkshop(on: boolean): void {
    if (on === this.workshop) return;
    if (on && !workshopChallenges().length) return;
    this.recorder.abort();
    this.workshop = on;
    this.robot = on ? workshopStartParts() : { ...STANDARD_ROBOT };
    this.phase = 'idle';
    this.index = 0;
    this.results = [];
    this.env.reset(this.deps.seed(), on ? workshopChallenges()[0].layout : 'place', this.robot);
    this.syncSnapshots();
    this.deps.onEvent({ type: 'parts', robot: { ...this.robot } });
  }

  /** Change robot parts (Workshop mode only). Rebuilds at once and resets the challenge in progress:
   *  a running attempt is discarded and the same challenge starts again from its countdown. */
  setParts(parts: Partial<RobotParts>): void {
    if (!this.workshop) return;
    const next: RobotParts = { arm: parts.arm ?? this.robot.arm, tool: parts.tool ?? this.robot.tool };
    if (sameParts(next, this.robot)) return;
    this.robot = next;
    this.deps.onEvent({ type: 'parts', robot: { ...next } });
    if (this.phase === 'countdown' || this.phase === 'running') {
      this.recorder.abort();
      this.beginCountdown();
    } else if (this.phase === 'between') {
      this.nextChallenge(); // skip the pause so the new robot shows at once
      if ((this.phase as Phase) === 'results') {
        this.env.reset(this.deps.seed(), this.env.state().layout, this.robot);
        this.syncSnapshots();
      }
    } else {
      this.env.reset(this.deps.seed(), this.env.state().layout, this.robot);
      this.syncSnapshots();
    }
  }

  /** seconds into the running challenge (sim time) */
  get elapsedS(): number {
    return this.phase === 'running' ? this.env.state().steps / SIM_HZ : 0;
  }

  get countdownLeft(): number {
    return this.phase === 'countdown' ? Math.max(0, COUNTDOWN_S - this.phaseT) : 0;
  }

  start(): void {
    this.results = [];
    this.index = 0;
    this.beginCountdown();
  }

  abort(): void {
    this.recorder.abort();
    this.phase = 'idle';
  }

  private beginCountdown(): void {
    this.phase = 'countdown';
    this.phaseT = 0;
    this.lastCount = 0;
    this.env.reset(this.deps.seed(), this.current.layout, this.robot);
    this.syncSnapshots();
  }

  private syncSnapshots() {
    this.prev = this.env.snapshot();
    this.curr = this.prev;
    this.acc = 0;
  }

  /** Advance real time. `action` is read at each fixed step. */
  update(frameDt: number, action: () => Action): void {
    const dt = Math.min(frameDt, 0.1);
    this.phaseT += dt;
    switch (this.phase) {
      case 'countdown': {
        const n = Math.ceil(COUNTDOWN_S - this.phaseT);
        if (n !== this.lastCount && n > 0) {
          this.lastCount = n;
          this.deps.onEvent({ type: 'countdown', n });
        }
        if (this.phaseT >= COUNTDOWN_S) {
          this.phase = 'running';
          this.phaseT = 0;
          this.attemptN++;
          this.recorder.start({
            sessionId: this.deps.sessionId,
            attemptId: String(this.attemptN).padStart(4, '0'),
            challenge: this.current.layout,
            seed: this.env.state().seed,
            world: this.deps.world(),
            input: this.deps.input(),
            arm: this.robot.arm,
            tool: this.robot.tool,
          });
          this.deps.onEvent({ type: 'go' });
        }
        return;
      }
      case 'running':
        this.fixedSteps(dt, action, true);
        return;
      case 'between':
        if (this.phaseT >= BETWEEN_S) this.nextChallenge();
        return;
      case 'idle':
      case 'results':
        if (this.freePlay) this.fixedSteps(dt, action, false);
        return;
    }
  }

  private nextChallenge(): void {
    this.index++;
    if (this.index >= this.list.length) {
      this.phase = 'results';
      this.deps.onEvent({ type: 'results', results: this.results });
    } else this.beginCountdown();
  }

  private fixedSteps(dt: number, action: () => Action, record: boolean): void {
    this.acc += dt;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      const a = action();
      const before = this.env.state();
      const reachBefore = before.reachIndex;
      const failsBefore = before.grabFails;
      if (record) {
        this.recorder.setInput(this.deps.input());
        this.recorder.sample(before, a);
      }
      this.prev = this.curr;
      this.env.step(a, SIM_DT);
      this.curr = this.env.snapshot();
      const s = this.env.state();
      if (s.grabFails > failsBefore && s.grabFail) this.deps.onEvent({ type: 'grabfail', fail: { ...s.grabFail } });
      if (!record) continue;
      if (s.reachIndex > reachBefore && !s.success) this.deps.onEvent({ type: 'progress' });
      const timeout = s.steps >= CHALLENGE_LIMIT_S * SIM_HZ;
      if (s.success || timeout) {
        this.endAttempt(s);
        return;
      }
    }
  }

  private endAttempt(s: EnvState): void {
    const rec = this.recorder.finish(s);
    if (!rec) return;
    const result: ChallengeResult = {
      challenge: rec.challenge,
      name: this.current.name,
      timeS: rec.durationMs / 1000,
      success: rec.success,
      drops: rec.drops,
      pathLengthM: rec.pathLengthM,
      attemptId: rec.attemptId,
    };
    this.results.push(result);
    this.deps.onEvent({ type: 'attempt', record: rec });
    this.deps.onEvent(rec.success ? { type: 'success', result } : { type: 'fail', result });
    this.phase = 'between';
    this.phaseT = 0;
    this.acc = 0;
  }
}
