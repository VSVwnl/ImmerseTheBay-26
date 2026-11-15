// Per-attempt log and trajectory. Samples are taken once per fixed sim step (SIM_HZ, 30 Hz),
// so a record replays exactly: reset(seed, layout) then step(sample.target/grip, 1/hz) per sample.
import { SIM_HZ, type Vec3 } from '../config';
import type { Action, Cubes, EnvState, HeldId, Items, Layout } from '../env/env';
import { TaskEnv } from '../env/env';
import type { Joints } from '../arm/ik';
import { partsOf, STANDARD_ROBOT, type ArmKind, type ToolKind } from '../arm/parts';

export type InputKind = 'mouse' | 'hand' | 'controller' | 'replay' | 'policy';

export interface Sample {
  t: number;
  target: Vec3;
  grip: 0 | 1;
  tip: Vec3;
  joints: Joints;
  held: HeldId | null;
  cubes: Cubes;
  /** Workshop objects; absent in the standard challenges */
  items?: Items;
}

export interface AttemptRecord {
  sessionId: string;
  attemptId: string;
  challenge: Layout;
  seed: number;
  hz: number;
  /** robot parts; replays rebuild this robot. Files without them were made with Compact + Gripper. */
  arm: ArmKind;
  tool: ToolKind;
  world: { id: string; prompt: string } | null;
  startedAt: string;
  durationMs: number;
  success: boolean;
  drops: number;
  wrongBin: number;
  /** failed grab attempts (wrong tool, too heavy, out of reach) */
  grabFails: number;
  pathLengthM: number;
  input: InputKind;
  samples: Sample[];
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const v4 = (v: Vec3): Vec3 => [r4(v[0]), r4(v[1]), r4(v[2])];

export function newSessionId(now: Date = new Date()): string {
  const iso = now.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
  const tag = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${iso}-${tag}`;
}

export class Recorder {
  private rec: AttemptRecord | null = null;
  private lastTip: Vec3 | null = null;

  start(opts: {
    sessionId: string;
    attemptId: string;
    challenge: Layout;
    seed: number;
    world: { id: string; prompt: string } | null;
    input: InputKind;
    startedAt?: Date;
    arm?: ArmKind;
    tool?: ToolKind;
  }): void {
    this.rec = {
      sessionId: opts.sessionId,
      attemptId: opts.attemptId,
      challenge: opts.challenge,
      seed: opts.seed,
      hz: SIM_HZ,
      arm: opts.arm ?? STANDARD_ROBOT.arm,
      tool: opts.tool ?? STANDARD_ROBOT.tool,
      world: opts.world,
      startedAt: (opts.startedAt ?? new Date()).toISOString(),
      durationMs: 0,
      success: false,
      drops: 0,
      wrongBin: 0,
      grabFails: 0,
      pathLengthM: 0,
      input: opts.input,
      samples: [],
    };
    this.lastTip = null;
  }

  get active(): boolean {
    return this.rec !== null;
  }

  setInput(input: InputKind): void {
    if (this.rec && this.rec.input === 'mouse') this.rec.input = input;
  }

  /** Call once per fixed step with the state BEFORE the step and the action applied at it.
   *  Targets and grip are stored unrounded so replay is exact. */
  sample(state: EnvState, action: Action): void {
    if (!this.rec) return;
    const n = this.rec.samples.length;
    this.rec.samples.push({
      t: r4(n / this.rec.hz),
      target: [action.target[0], action.target[1], action.target[2]],
      grip: action.grip,
      tip: v4(state.tip),
      joints: state.joints.map(r4) as Joints,
      held: state.held,
      cubes: Object.fromEntries(Object.entries(state.cubes).map(([k, v]) => [k, v4(v!)])) as Cubes,
      ...(Object.keys(state.items ?? {}).length
        ? { items: Object.fromEntries(Object.entries(state.items).map(([k, v]) => [k, v4(v!)])) as Items }
        : {}),
    });
    if (this.lastTip) {
      this.rec.pathLengthM += Math.hypot(
        state.tip[0] - this.lastTip[0],
        state.tip[1] - this.lastTip[1],
        state.tip[2] - this.lastTip[2],
      );
    }
    this.lastTip = [...state.tip];
  }

  finish(final: EnvState, finalTip?: Vec3): AttemptRecord | null {
    const rec = this.rec;
    if (!rec) return null;
    if (this.lastTip) {
      const t = finalTip ?? final.tip;
      rec.pathLengthM += Math.hypot(t[0] - this.lastTip[0], t[1] - this.lastTip[1], t[2] - this.lastTip[2]);
    }
    rec.pathLengthM = r4(rec.pathLengthM);
    rec.durationMs = Math.round((rec.samples.length / rec.hz) * 1000);
    rec.success = final.success;
    rec.drops = final.drops;
    rec.wrongBin = final.wrongBin;
    rec.grabFails = final.grabFails ?? 0;
    this.rec = null;
    return rec;
  }

  abort(): void {
    this.rec = null;
  }
}

/** Replay a record's actions through a fresh env from the same seed, with the same robot parts. */
export function replayRecord(rec: Pick<AttemptRecord, 'seed' | 'challenge' | 'samples' | 'hz'> & { arm?: string; tool?: string }): EnvState {
  const env = new TaskEnv(rec.seed, rec.challenge, partsOf(rec));
  const dt = 1 / (rec.hz || SIM_HZ);
  for (const s of rec.samples) env.step({ target: s.target, grip: s.grip }, dt);
  return env.snapshot();
}
