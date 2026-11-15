// Acceptance: every saved attempt replays (its target/grip samples, same seed) to the same success state.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { replayRecord, type AttemptRecord } from '../src/tasks/recorder';
import { RecoveryEngine } from '../src/recovery/engine';
import type { RecoveryEpisode, RecoveryTrial } from '../src/recovery/session';
import { validateReplay } from '../src/recovery/skill';

function expectVector(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 9);
}

function checkRecoveryTrial(trial: RecoveryTrial) {
  const { attempt } = trial;
  const env = new RecoveryEngine(attempt.incident, attempt.start, trial.kind !== 'clear-pick');
  for (const sample of attempt.samples) env.step(sample, sample.hand ?? null);
  const replay = env.finish();

  // Chromium and Node can round the last floating-point bits of FK and collision calculations differently.
  const { pathLengthM, ...metrics } = attempt.metrics;
  expect(replay.metrics).toMatchObject(metrics);
  expect(replay.metrics.pathLengthM).toBeCloseTo(pathLengthM, 9);
  expect(replay.contacts).toEqual(attempt.contacts);
  expect(replay.contactEvents).toHaveLength(attempt.contactEvents.length);
  for (const [index, event] of attempt.contactEvents.entries()) {
    const { point, t, ...contact } = event;
    expect(replay.contactEvents[index]).toMatchObject(contact);
    expect(replay.contactEvents[index].t).toBeCloseTo(t, 9);
    expectVector(replay.contactEvents[index].point, point);
  }

  const { tip, joints, cubes, tipOrientation, fingerGapM, ...final } = attempt.final;
  expect(replay.final).toMatchObject(final);
  expectVector(replay.final.tip, tip);
  expectVector(replay.final.joints, joints);
  expectVector(replay.final.cubes.red!, cubes.red!);
  expectVector(replay.final.tipOrientation, tipOrientation);
  expect(replay.final.fingerGapM).toBeCloseTo(fingerGapM, 9);
  if (trial.skill) expect(validateReplay(trial.skill, attempt).valid).toBe(true);
}

const evidence = new URL('../docs/media/rehearsal-episode.json.gz', import.meta.url);
const published: RecoveryEpisode = JSON.parse(gunzipSync(fs.readFileSync(evidence)).toString('utf8'));
describe('published desktop rehearsal', () => {
  it('includes all seven measured trials', () => {
    expect(published.trials.map(trial => trial.kind)).toEqual([
      'clear-pick', 'nominal', 'demonstration', 'same-incident-replay',
      'same-incident-replay', 'nominal', 'fresh-incident-replay',
    ]);
  });
  it.each(published.trials)('$kind ($id)', checkRecoveryTrial);
});

const files: string[] = [];
for (const root of [path.join('data', 'sessions'), path.join('data', 'recovery')]) {
  if (!fs.existsSync(root)) continue;
  for (const sid of fs.readdirSync(root)) {
    for (const f of fs.readdirSync(path.join(root, sid))) {
      if (!f.endsWith('.json')) continue;
      const file = path.join(root, sid, f);
      // Prototype files in the legacy directory used a different swept-contact model.
      if (path.basename(root) === 'sessions' && JSON.parse(fs.readFileSync(file, 'utf8')).kind === 'recovery-trial') continue;
      files.push(file);
    }
  }
}

describe.skipIf(files.length === 0)(`replay of ${files.length} saved attempts`, () => {
  it.each(files)('%s', (file) => {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (record.kind === 'recovery-trial') {
      checkRecoveryTrial(record.trial);
      return;
    }
    const rec = record as AttemptRecord;
    const out = replayRecord(rec);
    expect(out.success).toBe(rec.success);
    expect(out.drops).toBe(rec.drops);
    expect(out.wrongBin).toBe(rec.wrongBin);
  });
});
