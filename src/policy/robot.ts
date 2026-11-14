// M5: Robot's turn. The trained policy drives the arm: every 100 ms render the dataset camera, send image + state,
// apply the returned action with env.step(action, 0.1). The renderer interpolates between steps.
import { TaskEnv, type EnvState } from '../env/env';
import { actionFromVec, CONTROL_DT, stateVec } from '../factory/obs';
import type { PolicyClient } from './client';

export const ROBOT = { maxSteps: 200, pauseAfterS: 2.0 };

export type RobotPhase = 'thinking' | 'success' | 'fail' | 'error';

export class RobotTurn {
  readonly env = new TaskEnv(0, 'place');
  prev: EnvState;
  curr: EnvState;
  acc = 0;
  phase: RobotPhase = 'thinking';
  policy: string;
  tries = 0;
  successes = 0;
  lastError = '';
  private inflight = false;
  private ready = false; // an action arrived and waits for its tick
  private pauseT = 0;
  private stopped = false;

  constructor(
    private client: PolicyClient,
    /** renders the scene for the current env state and returns the 96x96 RGB image */
    private capture: (s: EnvState) => Uint8Array,
    private newSeed: () => number,
    policy?: string,
  ) {
    this.policy = policy ?? client.defaultPolicy;
    this.prev = this.env.snapshot();
    this.curr = this.prev;
    this.reset();
  }

  get steps(): number {
    return this.env.state().steps;
  }

  reset(): void {
    this.env.reset(this.newSeed(), 'place');
    this.prev = this.env.snapshot();
    this.curr = this.prev;
    this.acc = 0;
    this.phase = 'thinking';
    this.inflight = false;
    this.ready = false;
    this.pending = null;
  }

  setPolicy(p: string): void {
    this.policy = p;
    this.reset();
  }

  stop(): void {
    this.stopped = true;
  }

  private pending: number[] | null = null;

  private request(): void {
    if (this.inflight || this.ready || this.stopped) return;
    this.inflight = true;
    const s = this.env.state();
    const rgb = this.capture(s);
    const seedAtRequest = s.seed;
    this.client
      .act(rgb, stateVec(s), this.policy)
      .then((a) => {
        if (this.env.state().seed !== seedAtRequest || this.stopped) return; // a reset happened meanwhile
        this.pending = a;
        this.ready = true;
      })
      .catch((e) => {
        this.phase = 'error';
        this.lastError = String(e?.message ?? e);
      })
      .finally(() => {
        this.inflight = false;
      });
  }

  /** Real-time update. Steps the env at most once per CONTROL_DT, when an action is available. */
  update(frameDt: number): void {
    if (this.stopped || this.phase === 'error') return;
    const dt = Math.min(frameDt, 0.1);
    if (this.phase === 'success' || this.phase === 'fail') {
      this.pauseT += dt;
      if (this.pauseT >= ROBOT.pauseAfterS) this.reset();
      return;
    }
    this.acc = Math.min(this.acc + dt, CONTROL_DT);
    if (!this.ready) this.request();
    if (this.acc >= CONTROL_DT && this.ready && this.pending) {
      this.acc = 0;
      this.ready = false;
      this.prev = this.curr;
      this.env.step(actionFromVec(this.pending), CONTROL_DT);
      this.pending = null;
      this.curr = this.env.snapshot();
      const st = this.env.state();
      if (st.success || st.steps >= ROBOT.maxSteps) {
        this.tries++;
        if (st.success) this.successes++;
        this.phase = st.success ? 'success' : 'fail';
        this.pauseT = 0;
      } else this.request(); // fetch the next action while this step animates
    }
  }

  /** interpolation factor for rendering between prev and curr */
  get alpha(): number {
    return this.acc / CONTROL_DT;
  }
}
