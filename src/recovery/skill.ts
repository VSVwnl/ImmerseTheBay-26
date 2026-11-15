import { SIM_HZ, type Vec3 } from '../config';
import type { Action, EnvState } from '../env/env';
import { RecoveryEngine, type Incident, type RecoveryAttempt, type RecoveryMetrics } from './engine';

export type SkillPhase = 'approach' | 'grasp' | 'transport' | 'release';
export interface PhaseSpan {
  name: SkillPhase;
  startStep: number;
  endStep: number;
}
export interface Keyframe extends Action {
  step: number;
}
export interface RecoverySkill {
  version: 1;
  incident: Incident;
  start: EnvState;
  hz: number;
  steps: number;
  phases: PhaseSpan[];
  keyframes: Keyframe[];
  smoothingWeight: number;
  reductionToleranceM: number;
}

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lerp = (a: Vec3, b: Vec3, k: number): Vec3 => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

/** The step that actually acquires or drops the carton owns the corresponding phase boundary. */
export function segmentAttempt(attempt: RecoveryAttempt): PhaseSpan[] {
  const spans: PhaseSpan[] = [];
  let attachedAt: Vec3 | null = null;
  for (let i = 0; i < attempt.samples.length; i++) {
    const before = attempt.samples[i];
    const after = attempt.samples[i + 1] ?? attempt.final;
    let name: SkillPhase;
    if (!before.held && after.held) {
      name = 'grasp';
      attachedAt = after.tip;
    } else if (before.held && !after.held) {
      name = 'release';
      attachedAt = null;
    } else if (before.held) {
      name = attachedAt && distance(attachedAt, after.tip) <= 0.008 ? 'grasp' : 'transport';
      if (name === 'transport') attachedAt = null;
    } else {
      name =
        spans.at(-1)?.name === 'release' && i > 0 && distance(before.tip, after.tip) < 0.0002
          ? 'release'
          : 'approach';
    }
    const last = spans.at(-1);
    if (last && last.name === name) last.endStep = i;
    else spans.push({ name, startStep: i, endStep: i });
  }
  return spans;
}

function anchors(attempt: RecoveryAttempt, phases: PhaseSpan[]): number[] {
  const keep = new Set([0, attempt.samples.length - 1]);
  for (const p of phases) {
    keep.add(p.startStep);
    keep.add(p.endStep);
  }
  for (let i = 1; i < attempt.samples.length; i++) {
    const prev = attempt.samples[i - 1];
    const curr = attempt.samples[i];
    if (curr.grip !== prev.grip || curr.hand?.tracked !== prev.hand?.tracked) {
      keep.add(i - 1);
      keep.add(i);
    }
  }
  return [...keep].sort((a, b) => a - b);
}

/** Local triangular filter. Pinned indices keep grip edges and phase endpoints exact. */
function filtered(attempt: RecoveryAttempt, pinned: number[], weight: number): Vec3[] {
  const fixed = new Set(pinned);
  return attempt.samples.map((sample, i, all) => {
    if (fixed.has(i) || !weight) return [...sample.target];
    const neighbours = lerp(all[i - 1].target, all[i + 1].target, 0.5);
    // A desktop operator may deliberately jump the target to a distant waypoint.
    // Limit displacement so filtering that transition cannot cut a large corner.
    const offset = distance(sample.target, neighbours);
    return lerp(sample.target, neighbours, offset ? Math.min(weight, 0.003 / offset) : 0);
  });
}

/** Reduce by temporal interpolation error, retaining pauses and speed changes along straight paths. */
function simplify(points: Vec3[], pinned: number[], tolerance: number): number[] {
  const retained = new Set(pinned);
  const ranges: [number, number][] = pinned.slice(1).map((b, i) => [pinned[i], b]);
  while (ranges.length) {
    const [a, b] = ranges.pop()!;
    let largestError = tolerance;
    let split = -1;
    for (let i = a + 1; i < b; i++) {
      const pred = lerp(points[a], points[b], (i - a) / (b - a));
      const err = distance(pred, points[i]);
      if (err > largestError) {
        split = i;
        largestError = err;
      }
    }
    if (split !== -1) {
      retained.add(split);
      ranges.push([a, split], [split, b]);
    }
  }
  return [...retained].sort((a, b) => a - b);
}

/** Execute against fixed sim steps. Grip is discrete and only changes on its recorded edge. */
export function replayAction(skill: RecoverySkill, step: number): Action | null {
  if (!Number.isInteger(step) || step < 0 || step >= skill.steps || !skill.keyframes.length) return null;
  const frames = skill.keyframes;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frames[mid].step <= step) lo = mid;
    else hi = mid - 1;
  }
  const a = frames[lo];
  const b = frames[lo + 1];
  const target: Vec3 =
    !b || a.step === step ? [...a.target] : lerp(a.target, b.target, (step - a.step) / (b.step - a.step));
  return { target, grip: a.grip };
}

export function validateReplay(
  skill: RecoverySkill,
  attempt: RecoveryAttempt,
): {
  valid: boolean;
  metrics: RecoveryMetrics;
  maxTipErrorM: number;
} {
  const env = new RecoveryEngine(attempt.incident, attempt.start);
  let sameAttachments = true;
  let maxTipErrorM = 0;
  for (let i = 0; i < attempt.samples.length; i++) {
    const action = replayAction(skill, i);
    if (!action) return { valid: false, metrics: env.metrics, maxTipErrorM };
    env.step(action);
    const actual = env.state();
    const expected = attempt.samples[i + 1] ?? attempt.final;
    if (actual.held !== expected.held) sameAttachments = false;
    maxTipErrorM = Math.max(maxTipErrorM, distance(actual.tip, expected.tip));
  }
  const metrics = env.metrics;
  const valid =
    skill.steps === attempt.samples.length &&
    metrics.success &&
    !metrics.collisions &&
    sameAttachments &&
    maxTipErrorM <= 0.012;
  return { valid, metrics, maxTipErrorM };
}

/** A processed demonstration becomes a skill only after an independent executable replay. */
export function buildSkill(attempt: RecoveryAttempt): RecoverySkill {
  if (attempt.hz !== SIM_HZ || !attempt.metrics.success || attempt.metrics.collisions || !attempt.samples.length) {
    throw new Error('A skill needs a completed, contact-free 30 Hz recovery.');
  }
  const phases = segmentAttempt(attempt);
  if (new Set(phases.map((p) => p.name)).size !== 4) {
    throw new Error('Demonstrate the approach, grasp, transport and release before saving.');
  }
  const pinned = anchors(attempt, phases);
  for (const [weight, tolerance] of [
    [0.5, 0.006],
    [0.2, 0.002],
    [0, 0.000001],
    [0, 0],
  ]) {
    const points = filtered(attempt, pinned, weight);
    // Keep every original command on the lossless fallback, including its exact floating-point value.
    const indices = tolerance ? simplify(points, pinned, tolerance) : points.map((_, i) => i);
    const skill: RecoverySkill = {
      version: 1,
      incident: structuredClone(attempt.incident),
      start: structuredClone(attempt.start),
      steps: points.length,
      hz: attempt.hz,
      phases,
      smoothingWeight: weight,
      reductionToleranceM: tolerance,
      keyframes: indices.map((i) => ({ step: i, target: points[i], grip: attempt.samples[i].grip })),
    };
    if (validateReplay(skill, attempt).valid) return skill;
  }
  throw new Error('The recorded recovery could not be replayed from its checkpoint.');
}
