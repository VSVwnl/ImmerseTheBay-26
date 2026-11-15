import { ORBIS_MODEL, SIM_HZ, type Vec3 } from '../config';
import type { Action } from '../env/env';
import { newSessionId } from '../tasks/recorder';
import { createIncident, nominalAction, RecoveryEngine, type HandPose, type Incident, type RecoveryAttempt, type RecoveryMetrics, type Side } from './engine';
import { captureFrame, incidentPrompt, openStation, PACK_STATION, type IncidentEvidence, type IncidentFrame, type IncidentWorld } from './incident';
import { buildSkill, replayAction, type RecoverySkill } from './skill';
import { browserStorage, type RecoveryStorage } from './storage';

export type RecoveryPhase = 'baseline' | 'ready' | 'steering' | 'observe' | 'blocked' | 'teaching' | 'saved' | 'replaying' | 'result';
type TrialKind = 'clear-pick' | 'nominal' | 'demonstration' | 'same-incident-replay' | 'fresh-incident-replay';
type OperatorInput = 'mouse' | 'hand' | 'controller';

export interface RecoveryTrial {
  id: string;
  kind: TrialKind;
  evidence: IncidentEvidence | null;
  attempt: RecoveryAttempt;
  skillId: string | null;
  skill?: RecoverySkill;
  interruption?: string;
  inputs: OperatorInput[];
  untrackedSeconds: number;
}

export interface RecoveryEpisode {
  version: 1;
  sessionId: string;
  trials: RecoveryTrial[];
}

interface SessionOptions {
  allowLive?: boolean;
  storage?: RecoveryStorage;
  capture?: (video: HTMLVideoElement) => IncidentFrame;
}

const emptyEpisode = (): RecoveryEpisode => ({ version: 1, sessionId: newSessionId(), trials: [] });
const otherSide = (side: Side): Side => side === 'left' ? 'right' : 'left';
const CLEAR_STATION = createIncident('left', 1);

export class RecoverySession {
  phase: RecoveryPhase = 'baseline';
  message = 'Watch the robot move a carton into the tray.';
  recordingStatus = '';
  incident: Incident | null = null;
  evidence: IncidentEvidence | null = null;
  frame: IncidentFrame | null = null;
  trace: Vec3[] = [];
  failedTrace: Vec3[] = [];
  contact: Vec3 | null = null;
  skillTrace: Vec3[] = [];
  baselineMetrics: RecoveryMetrics | null = null;
  replayMetrics: RecoveryMetrics | null = null;
  skill: RecoverySkill | null = null;
  canRestore = false;

  private episode = emptyEpisode();
  private engine = new RecoveryEngine(CLEAR_STATION, undefined, false);
  private start = this.engine.snapshot();
  private skillId: string | null = null;
  private baselineContact: Vec3 | null = null;
  private replayKind: 'same-incident-replay' | 'fresh-incident-replay' = 'same-incident-replay';
  private replayIndex = 0;
  private crossTest = false;
  private steering: AbortController | null = null;
  private desiredSide: Side = 'left';
  private sentAtMediaTime = 0;
  private prompt = '';
  private activeInputs = new Set<OperatorInput>();
  private untrackedTicks = 0;
  private revision = 0;
  private saveQueue = Promise.resolve();
  private allowLive: boolean;
  private storage: RecoveryStorage;
  private captureVideo: (video: HTMLVideoElement) => IncidentFrame;

  constructor(private world: IncidentWorld, options: SessionOptions = {}) {
    this.allowLive = options.allowLive ?? true;
    this.storage = options.storage ?? browserStorage;
    this.captureVideo = options.capture ?? captureFrame;
    void this.storage.load().then((episode) => {
      if (episode?.version === 1 && episode.trials.some((trial) => !!trial.skill)) this.canRestore = true;
    }).catch(() => {});
  }

  get source() {
    if (this.phase === 'steering' || this.phase === 'observe') return null;
    return this.evidence?.source ?? null;
  }
  get metrics() { return this.engine.metrics; }
  get incidentNumber() { return this.evidence?.number ?? this.incident?.seed ?? 0; }
  get saved() { return this.skill ? this.episode : null; }
  state() { return this.engine.state(); }
  exportEpisode() { return this.episode; }

  private startEngine(engine: RecoveryEngine) {
    this.revision++;
    this.engine = engine;
    this.trace = [[...engine.state().tip]];
    this.activeInputs.clear();
    this.untrackedTicks = 0;
  }

  reset() {
    this.interruptTeaching('Station reset by the operator.');
    this.steering?.abort();
    this.episode = emptyEpisode();
    this.skill = null;
    this.skillId = null;
    this.incident = this.evidence = this.frame = null;
    this.failedTrace = [];
    this.contact = this.baselineContact = null;
    this.skillTrace = [];
    this.baselineMetrics = this.replayMetrics = null;
    this.crossTest = false;
    this.recordingStatus = '';
    this.phase = 'baseline';
    this.message = 'Watch the robot move a carton into the tray.';
    this.startEngine(new RecoveryEngine(CLEAR_STATION, undefined, false));
    this.start = this.engine.snapshot();
  }

  async steer(side: Side = this.desiredSide) {
    await this.requestIncident(side, false);
  }

  async challenge(side: Side = otherSide(this.skill?.incident.side ?? 'left')) {
    if (!this.skill || this.phase === 'steering') return;
    if (this.source === 'practice') {
      if (side === this.skill.incident.side) {
        this.message = 'Choose the opposite side to test a changed layout.';
        return;
      }
      this.applyPractice(side, true);
      return;
    }
    await this.requestIncident(side, true);
  }

  private async requestIncident(side: Side, crossTest: boolean) {
    if (!this.allowLive) {
      this.message = 'Live Orbis is disabled for this run. Choose Practice for a simulated incident.';
      return;
    }
    if (this.phase === 'steering') return;
    this.revision++;
    this.steering?.abort();
    const ticket = new AbortController();
    this.steering = ticket;
    this.desiredSide = side;
    this.prompt = incidentPrompt(side);
    this.crossTest = crossTest;
    this.frame = null;
    this.phase = 'steering';
    this.message = 'Connecting to the live parcel station…';
    try {
      await openStation(this.world, ticket.signal);
      ticket.signal.throwIfAborted();
      this.message = 'Steering the running world. Look for the blue tote.';
      await this.world.steerIncident(this.prompt, ticket.signal);
      ticket.signal.throwIfAborted();
      this.sentAtMediaTime = this.world.getVideo().currentTime;
      this.phase = 'observe';
      this.message = 'Watch the stream. Freeze a frame once the tote enters the lane.';
    } catch (error) {
      if (ticket.signal.aborted) return;
      this.phase = this.skill ? 'result' : 'ready';
      this.message = 'Live steering unavailable. Retry Orbis or choose Practice. ' + (error instanceof Error ? error.message : '');
    }
  }

  async retrySteer() { await this.requestIncident(this.desiredSide, this.crossTest); }

  capture(): boolean {
    if (this.phase !== 'observe') return false;
    try {
      const video = this.world.getVideo();
      if (this.world.status() !== 'live') throw new Error('Live stream interrupted. Retry Orbis or choose Practice.');
      if (video.currentTime <= this.sentAtMediaTime) throw new Error('Wait for a new frame after steering.');
      this.frame = this.captureVideo(video);
      this.message = 'Which side does the tote enter from in this frame? Confirm left or right, or recapture.';
      return true;
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Frame capture failed. Retry or choose Practice.';
      return false;
    }
  }

  observe(side: Side): boolean {
    if (this.phase !== 'observe' || !this.frame) return false;
    if (this.crossTest && side === this.skill?.incident.side) {
      this.message = 'This is the trained layout. Recapture or steer again when the opposite lane is blocked.';
      return false;
    }
    this.install({ source: 'orbis', side, requestedSide: this.desiredSide, frame: this.frame,
      prompt: this.prompt, model: ORBIS_MODEL, stationPrompt: PACK_STATION.prompt, observedAt: new Date().toISOString() }, this.crossTest);
    return true;
  }

  practice(side: Side = 'left') { this.applyPractice(side, false); }

  private applyPractice(side: Side, crossTest: boolean) {
    this.steering?.abort();
    void this.world.disconnect().catch(() => {
      if (this.source === 'practice') this.message = 'Local rehearsal is running. Could not confirm closure of the earlier Orbis session.';
    });
    this.install({ source: 'practice', side, requestedSide: side, frame: null, prompt: null, model: null, stationPrompt: null,
      observedAt: new Date().toISOString() }, crossTest);
  }

  private install(evidence: IncidentEvidence, crossTest: boolean) {
    const id = crypto.randomUUID();
    // Restored tabs may both start their next incident at the same ordinal. Give each
    // observation a unique identity and keep the human-readable sequence independent.
    const seed = Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16);
    const ordinal = this.episode.trials.reduce((highest, trial) =>
      Math.max(highest, trial.evidence?.number ?? (trial.evidence ? trial.attempt.incident.seed : 0)), 0) + 1;
    this.evidence = { ...evidence, id, number: ordinal };
    // Keep the evidence image in the record; release the monitor back to the moving stream.
    this.frame = null;
    this.incident = createIncident(evidence.side, seed);
    this.crossTest = crossTest;
    this.startEngine(new RecoveryEngine(this.incident));
    this.start = this.engine.snapshot();
    this.failedTrace = [];
    this.contact = this.baselineContact = null;
    this.baselineMetrics = this.replayMetrics = null;
    this.phase = 'baseline';
    this.message = 'Robot attempting the standard pick with the tote in its path.';
  }

  teach(): boolean {
    if (!this.incident || !['blocked', 'result', 'saved'].includes(this.phase)) return false;
    this.startEngine(new RecoveryEngine(this.incident, this.start));
    this.contact = this.baselineContact;
    this.phase = 'teaching';
    this.message = 'Guide the open gripper around the tote, pinch the carton, carry it to the tray, then release.';
    return true;
  }

  interruptTeaching(reason: string): boolean {
    if (this.phase !== 'teaching') return false;
    this.revision++;
    this.addTrial('demonstration', undefined, this.engine.finish(), reason);
    this.phase = 'blocked';
    this.message = reason + ' Partial demonstration recorded. Choose Teach to begin again.';
    return true;
  }

  replay(): boolean {
    if (!this.skill || !this.incident || !['saved', 'result', 'blocked'].includes(this.phase)) return false;
    this.startEngine(new RecoveryEngine(this.incident, this.start));
    this.contact = this.baselineContact;
    this.replayKind = this.incident.seed === this.skill.incident.seed && this.incident.side === this.skill.incident.side
      ? 'same-incident-replay' : 'fresh-incident-replay';
    this.phase = 'replaying';
    this.replayIndex = 0;
    this.message = 'Hands clear. Running the saved recovery through the simulator.';
    return true;
  }

  /** Called once per SIM_DT, including during tracking gaps. Preserve actual partial joint data
   *  and hold the last robot state until a usable operator target returns. */
  tick(action: Action | null = null, hand: HandPose | null = null, input: OperatorInput = hand ? 'hand' : 'mouse') {
    const phase = this.phase;
    let command: Action | null;
    if (phase === 'baseline') {
      command = nominalAction(this.engine.state(), this.incident ?? CLEAR_STATION);
    } else if (phase === 'replaying' && this.skill) {
      command = replayAction(this.skill, this.replayIndex++);
      if (!command) { this.endReplay(); return; }
    } else if (phase === 'teaching') {
      if (input === 'mouse' && (this.activeInputs.has('hand') || this.activeInputs.has('controller'))) {
        this.interruptTeaching('Headset input ended.');
        return;
      }
      if (!action || (input === 'hand' && !hand?.tracked)) {
        this.untrackedTicks++;
        this.message = 'Tracking paused. Move your hand back over the bench to continue.';
        const state = this.engine.state();
        command = { target: [...state.tip], grip: state.grip };
        if (input === 'hand' && !hand) hand = { tracked: false, wrist: null, thumbTip: null, indexTip: null };
      } else {
        this.message = 'Pinch to pick up the carton, carry it around the tote and release it over the tray.';
        command = action;
      }
      this.activeInputs.add(input);
    } else return;
    this.engine.step(command, phase === 'teaching' ? hand : null);
    this.trace.push([...this.engine.state().tip]);
    const metrics = this.metrics;
    if (phase === 'baseline' && (metrics.success || metrics.collisions || metrics.durationS >= 20)) {
      this.endBaseline();
    } else if (phase === 'teaching' && (metrics.success || metrics.collisions || metrics.durationS >= 90)) {
      this.endTeaching();
    } else if (phase === 'replaying' && (metrics.collisions || this.replayIndex >= this.skill!.steps)) {
      this.endReplay();
    }
  }

  private endBaseline() {
    this.addTrial(this.incident ? 'nominal' : 'clear-pick');
    if (!this.incident) {
      this.phase = 'ready';
      this.message = this.metrics.success ? 'Clear pick complete. Steer Orbis to obstruct the lane.' : 'Clear run ended. Steer an incident or reset to retry.';
      return;
    }
    this.baselineMetrics = { ...this.metrics };
    this.failedTrace = this.trace.slice();
    this.contact = this.baselineContact = this.engine.firstContact?.point ?? null;
    this.phase = 'blocked';
    this.message = this.metrics.collisions ? 'Contact. Teach a recovery from the same pre-pick position.' : 'Standard pick ended. Teach a different route.';
    if (this.crossTest && this.skill) this.replay();
  }

  private endTeaching() {
    const attempt = this.engine.finish();
    this.contact = this.engine.firstContact?.point ?? this.baselineContact;
    try {
      if (!attempt.metrics.success || attempt.metrics.collisions) {
        throw new Error(attempt.metrics.collisions ? 'The gripper or carton hit the tote.' : 'The carton did not reach the tray.');
      }
      const skill = buildSkill(attempt);
      this.skill = skill;
      this.skillTrace = this.trace.slice();
      this.crossTest = false;
      this.addTrial('demonstration', skill, attempt);
      this.phase = 'saved';
      this.message = 'Recovery recorded and replay checked. Release the controls and run the saved skill.';
    } catch (error) {
      this.addTrial('demonstration', undefined, attempt);
      this.phase = 'blocked';
      this.message = (error instanceof Error ? error.message : 'Recovery incomplete.') + ' Choose Teach to try again.';
    }
  }

  private endReplay() {
    this.contact = this.engine.firstContact?.point ?? this.baselineContact;
    this.replayMetrics = { ...this.metrics };
    this.addTrial(this.replayKind);
    this.phase = 'result';
    this.message = this.metrics.success && !this.metrics.collisions
      ? 'Parcel delivered. Compare the paths or challenge the skill with another incident.'
      : 'The saved skill did not clear this incident. Teach a correction from the same start.';
  }

  private addTrial(kind: TrialKind, skill?: RecoverySkill, attempt = this.engine.finish(), interruption?: string) {
    const number = this.episode.trials.length + 1;
    const id = 'trial-' + String(number).padStart(3, '0') + '-' + crypto.randomUUID();
    if (skill) this.skillId = id;
    const trial: RecoveryTrial = { id, kind, evidence: this.evidence, attempt,
      skillId: skill || kind.endsWith('replay') ? this.skillId : null,
      inputs: [...this.activeInputs], untrackedSeconds: this.untrackedTicks / SIM_HZ,
      ...(skill ? { skill } : {}), ...(interruption ? { interruption } : {}) };
    const episode = this.episode;
    episode.trials.push(trial);
    void this.storage.archive(episode.sessionId, trial).catch(() => {
      if (this.episode === episode) this.recordingStatus = 'Server archive unavailable. Download the session to keep a copy.';
    });
    const snapshot = { ...episode, trials: episode.trials.slice() };
    this.saveQueue = this.saveQueue.then(() => this.storage.save(snapshot)).then(() => {
      if (snapshot.trials.some(t => t.skill)) this.canRestore = true;
    }).catch(() => {
      if (this.episode === episode) this.recordingStatus = 'Browser save unavailable. Download the session to keep a copy.';
    });
  }

  async restore(): Promise<boolean> {
    if (this.phase === 'teaching' || this.phase === 'steering' || this.phase === 'observe' || this.phase === 'replaying') return false;
    const revision = ++this.revision;
    await this.saveQueue;
    try {
      const episode = await this.storage.load();
      if (revision !== this.revision || !episode || episode.version !== 1) return false;
      const demo = [...episode.trials].reverse().find((trial) => trial.skill);
      if (!demo?.skill || !demo.evidence) return false;
      this.steering?.abort();
      this.episode = episode;
      this.evidence = demo.evidence;
      this.frame = null;
      this.incident = demo.attempt.incident;
      this.skill = demo.skill;
      this.skillId = demo.id;
      this.start = demo.attempt.start;
      this.skillTrace = demo.attempt.samples.map((sample) => sample.tip);
      const nominal = episode.trials.find((trial) => trial.kind === 'nominal' && trial.attempt.incident.seed === this.incident!.seed);
      this.failedTrace = nominal?.attempt.samples.map((sample) => sample.tip) ?? [];
      this.contact = this.baselineContact = nominal?.attempt.contactEvents?.[0]?.point ?? null;
      this.baselineMetrics = nominal?.attempt.metrics ?? null;
      this.replayMetrics = null;
      this.startEngine(new RecoveryEngine(this.incident, this.start));
      this.crossTest = false;
      this.phase = 'saved';
      this.message = 'Saved recovery restored at its original pre-pick position.';
      return true;
    } catch {
      if (this.revision === revision) this.message = 'The saved recovery could not be loaded.';
      return false;
    }
  }
}
