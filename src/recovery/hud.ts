import './style.css';

export type RecoveryAction =
  | 'steer-left' | 'steer-right' | 'capture' | 'confirm-left' | 'confirm-right'
  | 'baseline' | 'teach' | 'save' | 'replay' | 'next' | 'download' | 'enter-xr'
  | 'reset' | 'practice' | 'resume' | 'retry';

export type RecoveryPhase = 'standby' | 'baseline' | 'failed' | 'teaching' | 'saved' | 'replay' | 'complete';
export type FeedMode = 'local' | 'connecting' | 'live' | 'error';

export interface RunMetrics {
  success?: boolean;
  pathM?: number;
  collisions?: number;
  durationS?: number;
}

export interface RecoveryHudState {
  mode?: FeedMode;
  phase?: RecoveryPhase;
  phaseLabel?: string;
  title?: string;
  caption?: string;
  incident?: string;
  feedCaption?: string;
  frameFrozen?: boolean;
  activeLane?: 'left' | 'right' | null;
  available?: readonly RecoveryAction[];
  metrics?: { clear?: RunMetrics; baseline?: RunMetrics; demonstration?: RunMetrics; recovery?: RunMetrics; fresh?: RunMetrics };
  runCount?: number;
  keyframes?: number;
  samples?: number;
  input?: string;
  timeline?: readonly {name: string; startStep: number; endStep: number}[];
  skillSteps?: number;
  playheadStep?: number;
  evidenceImage?: string | null;
  evidenceLabel?: string;
}

const phaseLabels: Record<RecoveryPhase, string> = {
  standby: 'Standby', baseline: 'Baseline run', failed: 'Intervention needed',
  teaching: 'Recording', saved: 'Skill saved', replay: 'Skill replay', complete: 'Run complete',
};

const modes: Record<FeedMode, string> = {
  local: 'Local rehearsal', connecting: 'Connecting', live: 'Live stream', error: 'Offline',
};

const conditionalActions = new Set<RecoveryAction>(['baseline', 'teach', 'save', 'replay', 'next', 'resume', 'retry']);

function setText(node: Element, value: string) {
  if (node.textContent !== value) node.textContent = value;
}

function setMetrics(row: HTMLTableRowElement, metrics?: RunMetrics) {
  const result = metrics?.success;
  row.dataset.success = result === undefined ? '' : String(result);
  const columns = [
    result === undefined ? '—' : result ? 'Completed' : 'Incomplete',
    metrics?.pathM == null ? '—' : `${metrics.pathM.toFixed(2)} m`,
    metrics?.collisions == null ? '—' : String(metrics.collisions),
    metrics?.durationS == null ? '—' : `${metrics.durationS.toFixed(1)} s`,
  ];
  columns.forEach((value, index) => setText(row.cells[index + 1], value));
}

export function createRecoveryHud(onAction: (action: RecoveryAction) => void) {
  const template = document.querySelector<HTMLTemplateElement>('#recovery-template')!;
  const scene = document.querySelector<HTMLCanvasElement>('#scene')!;
  const consoleEl = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
  const el = <T extends HTMLElement = HTMLElement>(key: string) =>
    consoleEl.querySelector<T>(`[data-el="${key}"]`)!;
  const stage = el('stage');
  const feed = el<HTMLCanvasElement>('feed');
  const controls = Array.from(consoleEl.querySelectorAll<HTMLButtonElement>('button[data-action]'));
  const baselineRow = consoleEl.querySelector<HTMLTableRowElement>('[data-result="baseline"]')!;
  const clearRow = consoleEl.querySelector<HTMLTableRowElement>('[data-result="clear"]')!;
  const recoveryRow = consoleEl.querySelector<HTMLTableRowElement>('[data-result="recovery"]')!;
  const demonstrationRow = consoleEl.querySelector<HTMLTableRowElement>('[data-result="demonstration"]')!;
  const freshRow = consoleEl.querySelector<HTMLTableRowElement>('[data-result="fresh"]')!;
  const field = {
    mode: el('mode'), phase: el('phase'), title: el('title'), caption: el('caption'), lane: el('lane'),
    feedCaption: el('feed-caption'), input: el('input'), runCount: el('run-count'), record: el('record'),
    incident: el('incident'), samples: el('samples'), confirm: el('confirm'), source: el('source'), stamp: el('feed-stamp'),
    skill: el('skill'), timeline: el('timeline'), bands: el('bands'), phaseList: el('phase-list'),
    playhead: el('playhead'), timelineCount: el('timeline-count'), evidence: el('evidence'),
    evidenceImage: el<HTMLImageElement>('evidence-image'), evidenceLabel: el('evidence-label'),
  };
  const previousTitle = document.title;
  const sceneParent = scene.parentElement!;
  const sceneNext = scene.nextSibling;
  document.body.classList.add('recovery');
  document.title = 'Backlot Recovery · Parcel workcell';
  document.body.append(consoleEl);
  stage.append(scene);
  const abort = new AbortController();
  consoleEl.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button[data-action]');
    if (button && !button.disabled) onAction(button.dataset.action as RecoveryAction);
  }, { signal: abort.signal });

  let current: RecoveryHudState = {
    mode: 'local', phase: 'standby', available: ['reset', 'practice'],
    input: matchMedia('(pointer: coarse)').matches
      ? 'Use a Quest headset to guide the arm by hand, or connect a mouse and keyboard.'
      : 'Mouse moves the arm · Wheel or W/S changes height · Click or Space grips',
  };
  let timelineKey = '';

  function updateTimeline() {
    const spans = current.timeline ?? [];
    const steps = current.skillSteps ?? 0;
    field.skill.hidden = !spans.length || !steps;
    if (field.skill.hidden) return;
    const key = JSON.stringify([steps, spans]);
    if (timelineKey !== key) {
      timelineKey = key;
      field.bands.replaceChildren();
      field.phaseList.replaceChildren();
      for (const span of spans) {
        const band = document.createElement('i');
        band.dataset.phase = span.name;
        band.style.left = `${span.startStep / steps * 100}%`;
        band.style.width = `${(span.endStep - span.startStep + 1) / steps * 100}%`;
        field.bands.append(band);
        const legend = document.createElement('li');
        legend.textContent = span.name;
        legend.dataset.phase = span.name;
        legend.title = `Samples ${span.startStep + 1}–${span.endStep + 1}`;
        field.phaseList.append(legend);
      }
      field.timeline.setAttribute('aria-label', spans.map(span =>
        `${span.name}, samples ${span.startStep + 1} through ${span.endStep + 1}`).join('. '));
    }
    const step = current.playheadStep;
    const playing = step !== undefined && Number.isFinite(step) && step >= 0 && step < steps;
    field.playhead.hidden = !playing;
    if (playing) field.playhead.style.left = `${(step + .5) / steps * 100}%`;
    Array.from(field.phaseList.children).forEach((legend, i) => {
      legend.classList.toggle('current', playing && step >= spans[i].startStep && step <= spans[i].endStep);
    });
    setText(field.timelineCount, playing ? `Sample ${step + 1} / ${steps}` : `${steps} samples`);
    const image = current.evidenceImage;
    field.evidence.hidden = !image?.startsWith('data:image/jpeg;base64,');
    if (!field.evidence.hidden && image && field.evidenceImage.getAttribute('src') !== image) field.evidenceImage.src = image;
    if (field.evidence.hidden) field.evidenceImage.removeAttribute('src');
    setText(field.evidenceLabel, current.evidenceLabel || 'Captured incident');
  }

  function update(state: Partial<RecoveryHudState>, replace = false) {
    current = replace ? state : { ...current, ...state };
    const mode = current.mode ?? 'local';
    const phase = current.phase ?? 'standby';
    consoleEl.dataset.mode = mode;
    consoleEl.dataset.phase = phase;
    setText(field.mode, modes[mode]);
    setText(field.source, mode === 'local' ? 'Local infeed' : 'Visko Orbis');
    setText(field.phase, current.phaseLabel ?? phaseLabels[phase]);
    if (current.title !== undefined) setText(field.title, current.title);
    if (current.caption !== undefined) setText(field.caption, current.caption);
    if (current.feedCaption !== undefined) setText(field.feedCaption, current.feedCaption);
    if (current.input !== undefined) {
      const touch = matchMedia('(pointer: coarse)').matches && /mouse/i.test(current.input);
      setText(field.input, touch ? 'Enter VR on Quest to teach by hand. Desktop teaching uses a mouse and keyboard.' : current.input);
    }
    setText(field.lane, current.activeLane ? `${current.activeLane} side` : 'Awaiting incident');
    const available = new Set(current.available);
    const confirming = available.has('confirm-left') || available.has('confirm-right');
    setText(field.stamp, current.frameFrozen || confirming ? 'Captured frame' : mode === 'live' ? 'Infeed camera' : 'Workcell plan');
    field.confirm.hidden = !confirming;
    for (const button of controls) {
      const action = button.dataset.action as RecoveryAction;
      const enabled = available.has(action);
      button.disabled = !enabled;
      if (conditionalActions.has(action)) button.hidden = !enabled;
      if (action === 'capture') button.hidden = confirming && !enabled;
      if (action === 'enter-xr') button.title = enabled ? 'Enter immersive mode' : 'Open in Meta Quest Browser to enter VR';
      if (action === 'steer-left' || action === 'steer-right') {
        button.title = 'Steer again if the generated frame is unclear.';
      }
    }
    setMetrics(baselineRow, current.metrics?.baseline);
    setMetrics(recoveryRow, current.metrics?.recovery);
    clearRow.hidden = !current.metrics?.clear;
    setMetrics(clearRow, current.metrics?.clear);
    demonstrationRow.hidden = !current.metrics?.demonstration;
    freshRow.hidden = !current.metrics?.fresh;
    setMetrics(demonstrationRow, current.metrics?.demonstration);
    setMetrics(freshRow, current.metrics?.fresh);
    field.runCount.hidden = current.runCount == null;
    setText(field.runCount, current.runCount == null ? '' : `${current.runCount} measured ${current.runCount === 1 ? 'run' : 'runs'}`);
    setText(field.incident, current.incident ?? '');
    const counts: string[] = [];
    if (current.samples != null && !current.timeline?.length) counts.push(`${current.samples} samples`);
    if (current.keyframes != null) counts.push(`${current.keyframes} keyframes`);
    setText(field.samples, counts.join(' · '));
    field.record.hidden = !current.incident && !counts.length;
    updateTimeline();
  }

  update({});
  return {
    stage, feed, update,
    dispose() {
      abort.abort();
      if (sceneNext?.parentNode === sceneParent) sceneParent.insertBefore(scene, sceneNext);
      else sceneParent.append(scene);
      consoleEl.remove();
      document.body.classList.remove('recovery');
      document.title = previousTitle;
    },
  };
}
