import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listAttempts, writeAttempt } from '../server/plugin';
import { RecoveryEngine } from '../src/recovery/engine';
import { type Vec3 } from '../src/config';
import { type IncidentFrame, type IncidentWorld } from '../src/recovery/incident';
import { RecoverySession, type RecoveryEpisode, type RecoveryTrial } from '../src/recovery/session';
import type { RecoveryStorage } from '../src/recovery/storage';
import type { WorldDef, WorldStatus } from '../src/world/world';

function fixture(allowLive = true) {
  const video = { currentTime: 1 } as HTMLVideoElement;
  let current: WorldDef | null = null;
  let status: WorldStatus = 'live';
  const prompts: string[] = [];
  const world: IncidentWorld = {
    current: () => current,
    setWorld: async (def) => { current = def; },
    connect: async () => {},
    disconnect: async () => {},
    status: () => status,
    getVideo: () => video,
    steerIncident: async (prompt) => { prompts.push(prompt); },
    lastError: '',
  };
  let persisted: RecoveryEpisode | undefined;
  const archives: RecoveryTrial[] = [];
  const storage: RecoveryStorage = {
    load: async () => persisted && structuredClone(persisted),
    save: async (episode) => { if (episode.trials.some(t => !!t.skill)) persisted = structuredClone(episode); },
    archive: async (_, trial) => { archives.push(structuredClone(trial)); },
  };
  const capture = (): IncidentFrame => ({ image: 'data:image/jpeg;base64,AAAA', mediaTime: video.currentTime, capturedAt: 'sample time' });
  const make = () => new RecoverySession(world, { allowLive, storage, capture });
  return { session: make(), make, prompts, archives, storage, video, setStatus: (s: WorldStatus) => { status = s; } };
}

function run(session: RecoverySession) {
  for (let i = 0; i < 1000 && ['baseline', 'replaying'].includes(session.phase); i++) session.tick();
}

function teachRightRoute(session: RecoverySession) {
  expect(session.teach()).toBe(true);
  const { carton, tray } = session.incident!;
  // A judge keeps to the right of the left-hand tote while reaching and returning.
  const waypoints: [Vec3, 0 | 1][] = [
    [[carton[0], 0.89, -0.53], 0], [carton, 0], [carton, 1],
    [[carton[0], 0.89, -0.53], 1], [[tray[0], 0.89, tray[2]], 1], [[tray[0], 0.89, tray[2]], 0],
  ];
  for (const [target, grip] of waypoints) {
    for (let i = 0; i < 38 && session.phase === 'teaching'; i++) session.tick({ target, grip });
  }
  expect(session.phase).toBe('saved');
}

describe('recovery session', () => {
  it('runs a clear autonomous pick, stops on measured contact and replays the saved skill from the same snapshot', async () => {
    const { session, archives } = fixture();
    run(session);
    expect(session.phase).toBe('ready');
    expect(archives[0].attempt.metrics.success).toBe(true);
    session.practice('left');
    run(session);
    expect(session.phase).toBe('blocked');
    expect(session.contact).not.toBe(null);
    const baseline = archives[1];
    expect(baseline.attempt.metrics.collisions).toBe(1);
    teachRightRoute(session);
    const demo = archives[2];
    expect(demo.attempt.start).toEqual(baseline.attempt.start);
    expect(demo.evidence?.source).toBe('practice');
    expect(demo.skill!.phases.map(p => p.name)).toEqual(['approach', 'grasp', 'transport', 'release']);
    expect(session.replay()).toBe(true);
    run(session);
    expect(archives[3].attempt.start).toEqual(baseline.attempt.start);
    expect(archives[3].attempt.metrics).toMatchObject({ success: true, collisions: 0 });
    expect(archives[3].skillId).toBe(demo.id);
    const archiveRoot = mkdtempSync(join(tmpdir(), 'backlot-recovery-'));
    const envelope = { kind: 'recovery-trial', sessionId: session.exportEpisode().sessionId,
      attemptId: demo.id, trial: demo };
    const file = writeAttempt(archiveRoot, envelope);
    expect(file.startsWith(join(archiveRoot, 'recovery'))).toBe(true);
    const archived = JSON.parse(readFileSync(file, 'utf8')).trial as RecoveryTrial;
    const env = new RecoveryEngine(archived.attempt.incident, archived.attempt.start);
    for (const sample of archived.attempt.samples) env.step(sample, sample.hand ?? null);
    expect(env.metrics).toEqual(archived.attempt.metrics);
    expect(env.state()).toEqual(archived.attempt.final);
    expect(listAttempts(archiveRoot, null, false)).toEqual([]);
    await session.challenge();
    run(session);
    expect(session.evidence?.side).toBe('right');
    expect(archives[5].kind).toBe('fresh-incident-replay');
    expect(archives[5].attempt.metrics).toMatchObject({ success: false, collisions: 1 });
    expect(archives[5].skillId).toBe(demo.id);
    expect(session.contact).toEqual(archives[5].attempt.contactEvents[0].point);
    expect(session.exportEpisode().trials).toHaveLength(6);
    session.reset();
    expect(await session.restore()).toBe(true);
    expect(session.replay()).toBe(true);
    run(session);
    expect(session.replayMetrics?.success).toBe(true);
  });

  it('requires an actual frozen post-steer frame and derives the collider from the confirmed side', async () => {
    const { session, prompts, video, setStatus } = fixture();
    run(session);
    await session.steer('left');
    expect(prompts[0]).toContain('left');
    expect(session.observe('right')).toBe(false);
    expect(session.capture()).toBe(false);
    video.currentTime = 3;
    expect(session.capture()).toBe(true);
    setStatus('error');
    expect(session.observe('right')).toBe(true);
    expect(session.frame).toBe(null);
    expect(session.incident?.side).toBe('right');
    expect(session.evidence).toMatchObject({ requestedSide: 'left', side: 'right', source: 'orbis', frame: { mediaTime: 3 } });
    run(session);
    expect(session.phase).toBe('blocked');
  });

  it('tracks missing hand feedback as fixed-time hold samples and preserves partial joint data', () => {
    const { session, archives } = fixture();
    session.practice();
    run(session);
    session.teach();
    const tip = [...session.state().tip];
    const partial = { tracked: false, wrist: null, thumbTip: [1, 2, 3] as Vec3, indexTip: null };
    session.tick(null, partial, 'hand');
    expect(session.state().tip).toEqual(tip);
    for (let i = 0; i < 400 && session.phase === 'teaching'; i++) {
      session.tick({ target: session.incident!.carton, grip: 0 }, { ...partial, tracked: true }, 'hand');
    }
    expect(archives[1].untrackedSeconds).toBeCloseTo(1 / 30);
    expect(archives[1].attempt.samples[0].hand).toEqual(partial);
    expect(archives[1].attempt.samples[1].t).toBeCloseTo(1 / 30);
  });

  it('keeps a failed or disabled live request out of scored practice data', async () => {
    const { session, setStatus } = fixture();
    setStatus('stub');
    await session.steer('right');
    expect(session.phase).toBe('ready');
    expect(session.source).toBe(null);
    expect(session.incident).toBe(null);
    const offline = fixture(false);
    await offline.session.steer();
    expect(offline.prompts).toEqual([]);
  });

  it('archives interrupted hand teaching, holds the last hand pose on disconnect, and preserves a partial attempt on reset', async () => {
    const { session, archives, storage } = fixture();
    const save = vi.spyOn(storage, 'save');
    session.practice(); run(session); session.teach();
    session.tick({ target: session.state().tip, grip: 0 }, null, 'controller');
    const last = structuredClone(session.state());
    // Some browsers dispatch their first desktop frame before XR sessionend.
    session.tick({ target: session.incident!.carton, grip: 1 }, null, 'mouse');
    expect(session.phase).toBe('blocked');
    expect(session.state()).toEqual(last);
    expect(archives.at(-1)).toMatchObject({ kind: 'demonstration', interruption: 'Headset input ended.', inputs: ['controller'], skillId: null });
    expect(archives.at(-1)!.attempt.samples).toHaveLength(1);
    expect(session.interruptTeaching('Duplicate sessionend')).toBe(false);
    session.teach();
    session.tick({ target: session.state().tip, grip: 0 });
    session.reset();
    expect(archives.at(-1)).toMatchObject({ interruption: 'Station reset by the operator.', skillId: null });
    expect(await session.restore()).toBe(false);
    expect(save.mock.calls.at(-1)![0].trials.at(-1)!.attempt.samples).toHaveLength(1);
    expect(session.phase).toBe('baseline');
  });

  it('keeps a delayed restore and archive error from overwriting a reset', async () => {
    const { session, storage } = fixture();
    session.practice(); run(session); teachRightRoute(session);
    const stored = structuredClone(session.exportEpisode());
    let resolveLoad!: (episode: RecoveryEpisode) => void;
    const pendingLoad = new Promise<RecoveryEpisode>(resolve => { resolveLoad = resolve; });
    const load = vi.spyOn(storage, 'load').mockReturnValue(pendingLoad);
    const restore = session.restore();
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    let rejectArchive!: (error: Error) => void;
    const pendingArchive = new Promise<void>((_, reject) => { rejectArchive = reject; });
    vi.spyOn(storage, 'archive').mockReturnValue(pendingArchive);
    session.teach(); session.reset();
    rejectArchive(new Error('old archive error'));
    resolveLoad(stored);
    expect(await restore).toBe(false);
    expect(session.recordingStatus).toBe('');
    expect(session.phase).toBe('baseline');
    expect(session.skill).toBeNull();
    expect(session.exportEpisode().sessionId).not.toBe(stored.sessionId);
  });

  it('assigns independent seeds and incident IDs when two operators resume one demonstration', async () => {
    const { session, make } = fixture();
    session.practice(); run(session); teachRightRoute(session);
    expect(await session.restore()).toBe(true);
    const other = make();
    expect(await other.restore()).toBe(true);
    await Promise.all([session.challenge(), other.challenge()]);
    expect(session.incidentNumber).toBe(other.incidentNumber);
    expect(session.incident?.seed).not.toBe(other.incident?.seed);
    expect(session.evidence?.id).not.toBe(other.evidence?.id);
    run(session); run(other);
    expect(session.exportEpisode().trials.at(-1)!.id).not.toBe(other.exportEpisode().trials.at(-1)!.id);
  });
});
