// Multiply (M3 Part A): replay one successful Place attempt in each training world, at its recorded rate.
// Between replays: setWorld(next, 'morph'), wait for the world to settle, then replay.
import { MULTIPLY_SETTLE_S, SIM_HZ } from '../config';
import { TaskEnv, type EnvState } from '../env/env';
import type { AttemptRecord } from '../tasks/recorder';
import { partsOf } from '../arm/parts';
import type { WorldDef } from '../world/world';

export type MultiplyPhase = 'settle' | 'replay' | 'done';

export interface MultiplyDeps {
  setWorld: (def: WorldDef) => void;
  /** called once per replay, mid-episode, to take a dataset-camera snapshot */
  snapshot: (world: WorldDef, episode: number) => void;
  onEpisode?: (n: number, success: boolean) => void;
}

export class Multiply {
  readonly env: TaskEnv;
  phase: MultiplyPhase = 'settle';
  episodes = 0;
  index = 0;
  prev: EnvState;
  curr: EnvState;
  acc = 0;
  private t = 0;
  private i = 0;
  private dt: number;
  readonly hz: number;

  constructor(
    readonly demo: AttemptRecord,
    readonly worlds: WorldDef[],
    private deps: MultiplyDeps,
    private settleS = MULTIPLY_SETTLE_S,
  ) {
    this.hz = demo.hz || SIM_HZ;
    this.dt = 1 / this.hz;
    this.env = new TaskEnv(demo.seed, demo.challenge, partsOf(demo)); // same robot as the demo
    this.prev = this.env.snapshot();
    this.curr = this.prev;
    this.beginWorld();
  }

  get world(): WorldDef | null {
    return this.worlds[this.index] ?? null;
  }

  private beginWorld() {
    this.phase = 'settle';
    this.t = 0;
    this.env.reset(this.demo.seed, this.demo.challenge, partsOf(this.demo));
    this.prev = this.env.snapshot();
    this.curr = this.prev;
    this.acc = 0;
    this.i = 0;
    this.deps.setWorld(this.worlds[this.index]);
  }

  stop(): void {
    this.phase = 'done';
  }

  update(frameDt: number): void {
    const dt = Math.min(frameDt, 0.1);
    if (this.phase === 'settle') {
      this.t += dt;
      if (this.t >= this.settleS) this.phase = 'replay';
      return;
    }
    if (this.phase !== 'replay') return;
    this.acc += dt;
    const mid = Math.floor(this.demo.samples.length / 2);
    while (this.acc >= this.dt && this.phase === 'replay') {
      this.acc -= this.dt;
      const s = this.demo.samples[this.i];
      this.prev = this.curr;
      this.env.step({ target: s.target, grip: s.grip }, this.dt);
      this.curr = this.env.snapshot();
      this.i++;
      if (this.i === mid) this.deps.snapshot(this.worlds[this.index], this.episodes + 1);
      if (this.i >= this.demo.samples.length) {
        this.episodes++;
        this.deps.onEpisode?.(this.episodes, this.env.state().success);
        this.index++;
        if (this.index >= this.worlds.length) this.phase = 'done';
        else this.beginWorld();
      }
    }
  }
}
