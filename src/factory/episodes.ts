// Episode sources for the factory: scripted expert (with optional noise) and replayed human demos.
// Both are step-wise so the factory can render and record between steps.
import { TaskEnv, type Action, type EnvState } from '../env/env';
import { BurstNoise, PlaceExpert } from './expert';
import { CONTROL_DT, MAX_STEPS } from './obs';
import type { AttemptRecord } from '../tasks/recorder';

export interface EpisodeSource {
  kind: 'expert' | 'human';
  seed: number;
  noise: boolean;
  /** human demos: id of the source attempt */
  from?: string;
  /** saved (clean) action and executed action for the current state, or null when the script is over */
  next(s: EnvState): { saved: Action; executed: Action } | null;
}

export function expertSource(seed: number, noise: boolean): EpisodeSource {
  const ex = new PlaceExpert();
  const nz = noise ? new BurstNoise(seed) : null;
  return {
    kind: 'expert',
    seed,
    noise,
    next(s) {
      const saved = ex.act(s);
      return { saved, executed: nz ? nz.apply(saved) : saved };
    },
  };
}

/** Resample a 30 Hz human Place attempt to 10 Hz actions (one action per 0.1 s). */
export function resampleActions(rec: Pick<AttemptRecord, 'samples' | 'hz'>, hz = 1 / CONTROL_DT): Action[] {
  const ratio = (rec.hz || 30) / hz;
  const out: Action[] = [];
  for (let k = 0; ; k++) {
    const i = Math.round(k * ratio);
    if (i >= rec.samples.length) break;
    // use the grip of the latest sample in the window so short pinches are not lost
    const j = Math.min(rec.samples.length - 1, Math.round((k + 1) * ratio) - 1);
    out.push({ target: rec.samples[j].target, grip: rec.samples[j].grip });
  }
  return out;
}

export function humanSource(rec: AttemptRecord): EpisodeSource {
  const actions = resampleActions(rec);
  let i = 0;
  return {
    kind: 'human',
    seed: rec.seed,
    noise: false,
    from: `${rec.sessionId}/${rec.attemptId}`,
    next() {
      if (i >= actions.length) return null;
      const a = actions[i++];
      return { saved: a, executed: a };
    },
  };
}

/** Run an episode headless; returns success and step count. */
export function runHeadless(src: EpisodeSource, maxSteps = MAX_STEPS): { success: boolean; steps: number; env: TaskEnv } {
  const env = new TaskEnv(src.seed, 'place');
  let steps = 0;
  while (steps < maxSteps && !env.state().success) {
    const a = src.next(env.state());
    if (!a) break;
    env.step(a.executed, CONTROL_DT);
    steps++;
  }
  return { success: env.state().success, steps, env };
}

/** Human demos that still succeed when resampled to 10 Hz and replayed from the same seed. */
export function usableHumanDemos(recs: AttemptRecord[]): AttemptRecord[] {
  return recs.filter((r) => r.challenge === 'place' && r.success && runHeadless(humanSource(r), 600).success);
}
