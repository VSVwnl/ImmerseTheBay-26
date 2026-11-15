import { SoundingsAudio } from './audio';
import './style.css';

export type SymbolAnswer = 'ring' | 'bars' | 'triangle';
type Prediction = 'clear' | 'scatter' | 'miss';
type SingleAction =
  | 'dock'
  | 'dive'
  | 'retry'
  | 'mirror'
  | 'reset'
  | 'xr'
  | 'connect'
  | 'debrief'
  | 'resume'
  | 'grip'
  | 'sound'
  | 'waterTest';
export type SoundingsAction =
  | { type: SingleAction }
  | { type: 'arm'; side: 'left' | 'right' }
  | { type: 'lamp'; mount: 'inner' | 'outer' }
  | { type: 'aim'; aim: 'handle' | 'forward' }
  | { type: 'prediction'; prediction: Prediction }
  | { type: 'symbol'; symbol: SymbolAnswer }
  | { type: 'compare'; mode: 'lamp' | 'water' };

export interface SoundingsViewState {
  phase: 'rig' | 'dock' | 'dive' | 'debrief';
  arm: 'left' | 'right';
  lamp: 'inner' | 'outer';
  aim: 'handle' | 'forward';
  prediction: Prediction | null;
  stream: 'live' | 'connecting' | 'practice';
  xrAvailable: boolean;
  spectator: boolean;
  missionSide: 'port' | 'starboard';
  success: boolean;
  elapsedSec: number;
  closestCm: number | null;
  jawStatus: 'open' | 'closed' | 'carrying';
  heightCm: number;
  beforeFrame: string | null;
  afterFrame: string | null;
  note: string;
  symbolAnswer: SymbolAnswer | null;
  mirrorAvailable: boolean;
  dockDone: boolean;
  waterTest: boolean;
  comparisonMode: 'lamp' | 'water';
  hasWaterPair: boolean;
  waterFrame: string | null;
  evidenceSource: 'live' | 'practice' | null;
  assessment: string;
}

const initial: SoundingsViewState = {
  phase: 'rig',
  arm: 'left',
  lamp: 'inner',
  aim: 'handle',
  prediction: null,
  stream: 'practice',
  xrAvailable: false,
  spectator: false,
  missionSide: 'port',
  success: false,
  elapsedSec: 0,
  closestCm: null,
  jawStatus: 'open',
  heightCm: 0,
  beforeFrame: null,
  afterFrame: null,
  note: '',
  symbolAnswer: null,
  mirrorAvailable: false,
  dockDone: false,
  waterTest: false,
  comparisonMode: 'lamp',
  hasWaterPair: false,
  waterFrame: null,
  evidenceSource: null,
  assessment: '',
};

function timeLabel(total: number): string {
  const t = Math.floor(Math.max(0, total));
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

const actions: Record<string, SoundingsAction> = {
  compareLamp: { type: 'compare', mode: 'lamp' },
  compareWater: { type: 'compare', mode: 'water' },
  port: { type: 'arm', side: 'left' },
  starboard: { type: 'arm', side: 'right' },
  inner: { type: 'lamp', mount: 'inner' },
  outer: { type: 'lamp', mount: 'outer' },
  forward: { type: 'aim', aim: 'forward' },
  inward: { type: 'aim', aim: 'handle' },
  clear: { type: 'prediction', prediction: 'clear' },
  scatter: { type: 'prediction', prediction: 'scatter' },
  miss: { type: 'prediction', prediction: 'miss' },
  ring: { type: 'symbol', symbol: 'ring' },
  bars: { type: 'symbol', symbol: 'bars' },
  triangle: { type: 'symbol', symbol: 'triangle' },
};
const commands: SingleAction[] = [
  'dock',
  'dive',
  'retry',
  'mirror',
  'reset',
  'xr',
  'connect',
  'debrief',
  'resume',
  'grip',
  'sound',
  'waterTest',
];
for (const name of commands) actions[name] = { type: name };

function optionBar(label: string, options: [string, string][]): string {
  return (
    '<fieldset class="sd-field"><legend>' +
    label +
    '</legend><div class="sd-options">' +
    options
      .map(
        ([id, text]) =>
          '<button type="button" data-action="' + id + '" aria-pressed="false">' + text + '</button>',
      )
      .join('') +
    '</div></fieldset>'
  );
}

const wordmark =
  '<span class="sd-mark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span>Soundings</span>';

export class SoundingsUI {
  readonly viewport: HTMLElement;
  readonly audio = new SoundingsAudio();
  private readonly root: HTMLElement;
  private readonly fields = new Map<string, HTMLElement>();
  private readonly buttons = new Map<string, HTMLButtonElement[]>();
  private state: SoundingsViewState = { ...initial };
  private readonly onClick: (event: MouseEvent) => void;

  constructor(host: HTMLElement, callbacks: { onAction: (action: SoundingsAction) => void }) {
    this.root = document.createElement('main');
    this.root.className = 'sd-console';
    this.root.innerHTML = `
      <header class="sd-header">
        <div class="sd-brand">${wordmark}</div>
        <div class="sd-headrule" aria-hidden="true"></div>
        <div class="sd-header-actions">
          <button class="sd-status" type="button" data-action="connect" title="Connect to the Visko Orbis live water stream">
            <i class="sd-status-dot" aria-hidden="true"></i><span data-field="stream"></span>
          </button>
          <button class="sd-quiet" type="button" data-action="mute" aria-label="Mute recording"></button>
          <button class="sd-headset" type="button" data-action="xr"><span class="sd-headset-icon" aria-hidden="true"></span>Enter VR</button>
        </div>
      </header>
      <div class="sd-layout">
        <section class="sd-stage" aria-label="Robot and camera views">
          <div class="sd-viewport" data-field="viewport"></div>
          <div class="sd-stage-title">
            <div class="sd-eyebrow sd-site"><i aria-hidden="true"></i> Monterey Canyon</div>
            <h1 data-field="title"></h1>
            <p class="sd-brief" data-field="brief"></p>
          </div>
          <div class="sd-frozen" data-field="frames" hidden>
            <figure><img alt="Pilot camera image captured at the attempt"><figcaption data-field="beforeCaption">Captured pilot frame</figcaption></figure>
            <figure><img alt="The alternate lamp configuration at the same robot pose and water frame"><figcaption data-field="afterCaption">Alternate lamp placement</figcaption></figure>
          </div>
          <div class="sd-view-caption">
            <span class="sd-camera-mode"><i></i><span data-field="camera"></span></span>
            <span data-field="clock"></span>
          </div>
        </section>
        <aside class="sd-controls" aria-label="Dive controls">
          <div class="sd-phase-row" aria-label="Mission progress">
            <span data-phase="rig">Rig</span><i></i><span data-phase="dock">Dock</span><i></i>
            <span data-phase="dive">Dive</span><i></i><span data-phase="debrief">Review</span>
          </div>
          <section data-field="rigSection">
            <h2>Rig workbench</h2>
            <p class="sd-lede">Fit the arm and lamp to the foredeck. Each rail holds one component.</p>
            ${optionBar('Arm rail', [
              ['port', 'Port'],
              ['starboard', 'Starboard'],
            ])}
            ${optionBar('Lamp socket', [
              ['inner', 'Beside lens'],
              ['outer', 'Outer rail'],
            ])}
            ${optionBar('Beam aim', [
              ['inward', 'At handle'],
              ['forward', 'Forward'],
            ])}
            ${optionBar('Predict the pickup', [
              ['clear', 'Clear view'],
              ['scatter', 'Backscatter'],
              ['miss', 'Short reach'],
            ])}
            <button class="sd-primary" type="button" data-action="dock">Run dock check <b aria-hidden="true">→</b></button>
            <button class="sd-primary" type="button" data-action="dive">Launch recovery <b aria-hidden="true">→</b></button>
          </section>
          <section data-field="pilotSection" hidden>
            <h2 data-field="pilotHeading"></h2>
            <p class="sd-lede" data-field="objective"></p>
            <div data-field="answerGroup">${optionBar('Which symbol is beside the handle?', [
              ['ring', '○ Ring'],
              ['bars', 'Ⅱ Bars'],
              ['triangle', '△ Triangle'],
            ])}</div>
            <dl class="sd-instrument-data" data-field="rangeGroup">
              <div><dt>Jaws</dt><dd data-field="jaw">Open</dd></div>
              <div><dt>Jaw height</dt><dd data-field="height">—</dd></div>
              <div><dt>Closest approach</dt><dd data-field="range">—</dd></div>
            </dl>
            <button class="sd-primary" type="button" data-action="grip">Toggle gripper <b aria-hidden="true">↕</b></button>
            <button class="sd-plain" type="button" data-action="retry">Return to workbench</button>
            <button class="sd-plain" type="button" data-action="debrief">Review attempt</button>
            <button class="sd-plain" type="button" data-action="waterTest"><span data-field="waterTestLabel"></span></button>
          </section>
          <section data-field="resultSection" hidden>
            <h2 data-field="resultHeading"></h2>
            <p class="sd-lede" data-field="resultIntro"></p>
            <div data-field="compareGroup">${optionBar('Frozen comparison', [
              ['compareLamp', 'Compare lamps'],
              ['compareWater', 'Compare water'],
            ])}</div>
            <figure class="sd-source-frame" data-field="sourceFigure" hidden><img alt="Water pixels supplied to the robot camera at capture"><figcaption data-field="sourceCaption"></figcaption></figure>
            <p class="sd-assessment" data-field="assessment" hidden></p>
            <div class="sd-telemetry"><span>Closest approach</span><strong data-field="resultRange">—</strong></div>
            <div data-field="audioSection" class="sd-recording">
              <button class="sd-plain" type="button" data-action="sound">▷ Play humpback song</button>
              <a href="/audio/CREDITS.txt" target="_blank" rel="noopener">Recording by Spyrogumas · CC0</a>
            </div>
            <button class="sd-primary" type="button" data-action="mirror">Try the opposite rail <b aria-hidden="true">→</b></button>
            <button class="sd-plain" type="button" data-action="retry">Refit this rig</button>
          </section>
          <section data-field="audienceSection" hidden>
            <h2>Pilot station</h2>
            <div class="sd-telemetry"><span>Arm rail</span><strong data-field="watchArm"></strong></div>
            <div class="sd-telemetry"><span>Floodlight</span><strong data-field="watchLamp"></strong></div>
            <div class="sd-telemetry"><span>Closest approach</span><strong data-field="watchRange">—</strong></div>
            <button type="button" class="sd-plain" data-action="sound">▷ Play recovered recording</button>
          </section>
          <div class="sd-note" role="status" data-field="note" hidden></div>
          <footer class="sd-panel-footer"><button class="sd-reset" type="button" data-action="reset">↺ &nbsp;Reset mission</button></footer>
        </aside>
      </div>
      <footer class="sd-footer"><span data-field="help"></span><span data-field="source"></span><a href="/?mode=spectator" target="_blank" rel="noopener">Spectator view ↗</a></footer>`;
    host.appendChild(this.root);
    this.root
      .querySelectorAll<HTMLElement>('[data-field]')
      .forEach((el) => this.fields.set(el.dataset.field!, el));
    this.root.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((button) => {
      const key = button.dataset.action!;
      this.buttons.set(key, [...(this.buttons.get(key) ?? []), button]);
    });
    this.viewport = this.field('viewport');
    this.onClick = (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
      if (!button || !this.root.contains(button) || button.disabled) return;
      void this.audio.unlock().catch(() => {});
      const id = button.dataset.action!;
      if (id === 'mute') {
        this.audio.setMuted(!this.audio.muted);
        this.showMute();
      } else if (actions[id]) callbacks.onAction(actions[id]);
    };
    this.root.addEventListener('click', this.onClick);
    this.render();
  }

  private field(id: string): HTMLElement {
    return this.fields.get(id)!;
  }
  private label(id: string, text: string): void {
    const el = this.field(id);
    if (el.textContent !== text) el.textContent = text;
  }
  private showButton(id: string, show: boolean): void {
    this.buttons.get(id)?.forEach((el) => {
      el.hidden = !show;
    });
  }
  private showMute(): void {
    const el = this.buttons.get('mute')![0];
    el.innerHTML = this.audio.muted
      ? '<i class="sd-speaker muted" aria-hidden="true"></i>'
      : '<i class="sd-speaker" aria-hidden="true"></i>';
    const label = this.audio.muted ? 'Unmute recording' : 'Mute recording';
    el.setAttribute('aria-label', label);
    el.title = label;
    el.setAttribute('aria-pressed', String(this.audio.muted));
  }

  setState(patch: Partial<SoundingsViewState>): void {
    const keys = Object.keys(patch) as (keyof SoundingsViewState)[];
    const changes = keys.filter((key) => !Object.is(patch[key], this.state[key]));
    if (!changes.length) return;
    Object.assign(this.state, patch);
    if (
      changes.every(
        (key) => key === 'elapsedSec' || key === 'closestCm' || key === 'jawStatus' || key === 'heightCm',
      )
    )
      this.telemetry();
    else this.render();
  }

  private telemetry(): void {
    const { phase, elapsedSec, closestCm } = this.state;
    const range =
      closestCm === null || !Number.isFinite(closestCm) ? '—' : Math.max(0, closestCm).toFixed(1) + ' cm';
    this.label('range', range);
    const { jawStatus, heightCm } = this.state;
    this.label('jaw', jawStatus === 'carrying' ? 'Carrying' : jawStatus === 'closed' ? 'Closed' : 'Open');
    this.label(
      'height',
      Math.abs(heightCm) < 0.5
        ? 'At handle plane'
        : Math.abs(heightCm).toFixed(0) + ' cm ' + (heightCm > 0 ? 'above' : 'below') + ' handle',
    );
    this.label('resultRange', range);
    this.label('watchRange', range);
    this.label('clock', phase === 'rig' && !this.state.spectator ? 'Drag to inspect' : timeLabel(elapsedSec));
  }

  private render(): void {
    const s = this.state,
      rig = s.phase === 'rig',
      dock = s.phase === 'dock',
      dive = s.phase === 'dive',
      review = s.phase === 'debrief';
    this.root.dataset.phase = s.phase;
    this.root.dataset.stream = s.stream;
    this.root.dataset.spectator = String(s.spectator);
    this.label(
      'stream',
      s.stream === 'live' ? 'Orbis live' : s.stream === 'connecting' ? 'Connecting…' : 'Practice water',
    );
    const connect = this.buttons.get('connect')![0];
    connect.disabled = s.spectator || s.stream !== 'practice';
    const xr = this.buttons.get('xr')![0];
    xr.disabled = !s.xrAvailable;
    xr.title = s.xrAvailable ? 'Enter immersive VR' : 'Open in Quest Browser to enter VR';
    this.showMute();
    this.field('brief').hidden = !rig || s.spectator;
    this.label(
      'brief',
      s.missionSide === 'starboard'
        ? 'Rig the vehicle for a second pickup across the cage.'
        : 'Bring up the acoustic recorder to hear its whale song.',
    );
    this.label(
      'title',
      rig
        ? 'Rig for recovery.'
        : dock
          ? 'Test the gripper.'
          : dive
            ? 'Recover the recorder.'
            : s.success
              ? 'Recorder recovered.'
              : 'Dive review.',
    );
    this.label(
      'camera',
      s.spectator && !review
        ? 'Relayed pilot camera'
        : rig
          ? 'Foredeck'
          : review
            ? 'Frozen evidence'
            : 'Pilot camera',
    );
    for (const link of this.root.querySelectorAll<HTMLElement>('[data-phase]')) {
      if (link === this.root) continue;
      const current = link.dataset.phase === s.phase;
      link.classList.toggle('current', current);
      if (current) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    }
    this.field('audienceSection').hidden = !s.spectator;
    this.label('watchArm', s.arm === 'left' ? 'Port' : 'Starboard');
    this.label('watchLamp', s.lamp === 'inner' ? 'Beside lens' : 'Outer rail');
    this.field('rigSection').hidden = !rig || s.spectator;
    this.field('pilotSection').hidden = !(dock || dive) || s.spectator;
    this.field('resultSection').hidden = !review || s.spectator;
    this.field('answerGroup').hidden = !dive;
    this.showButton('dock', rig && !s.dockDone);
    this.showButton('dive', rig && s.dockDone);
    this.showButton('debrief', dive);
    this.label('waterTestLabel', s.waterTest ? 'Capture changed water' : 'Steer water · hold pose');
    this.showButton('mirror', review && s.mirrorAvailable);
    this.field('audioSection').hidden = !review || !s.success;
    this.showButton('sound', review && s.success);
    this.showButton('reset', !s.spectator);
    this.showButton('xr', !s.spectator);
    const selected = [
      s.arm === 'left' ? 'port' : 'starboard',
      s.lamp,
      s.aim === 'handle' ? 'inward' : 'forward',
      s.prediction,
      s.symbolAnswer,
    ];
    for (const [id, buttons] of this.buttons)
      for (const button of buttons)
        if (button.closest('.sd-options'))
          button.setAttribute('aria-pressed', String(selected.includes(id as (typeof selected)[number])));
    this.label('pilotHeading', dock ? 'Dock check' : 'Recorder pickup');
    this.label(
      'objective',
      dock
        ? 'Guide the jaws to the practice handle in clear water.'
        : 'Read the marker, close the jaws on the handle, then lift and release the recorder into its cradle.',
    );
    this.field('compareGroup').hidden = !s.hasWaterPair;
    this.label('beforeCaption', s.comparisonMode === 'water' ? 'Water before steering' : 'Lamp as flown');
    this.label(
      'afterCaption',
      s.comparisonMode === 'water' ? 'Water after steering' : 'Alternate lamp placement',
    );
    this.field('sourceFigure').hidden = !s.waterFrame;
    const water = this.field('sourceFigure').querySelector('img')!;
    if (s.waterFrame && water.getAttribute('src') !== s.waterFrame) water.src = s.waterFrame;
    if (!s.waterFrame && water.hasAttribute('src')) water.removeAttribute('src');
    this.label(
      'sourceCaption',
      s.evidenceSource === 'live' ? 'Captured Orbis water' : 'Captured practice water',
    );
    this.field('assessment').hidden = !s.assessment;
    this.label('assessment', s.assessment);
    this.buttons.get('compareLamp')![0].setAttribute('aria-pressed', String(s.comparisonMode === 'lamp'));
    this.buttons.get('compareWater')![0].setAttribute('aria-pressed', String(s.comparisonMode === 'water'));
    this.label('resultHeading', s.success ? 'Recovery log' : 'Attempt log');
    this.label(
      'resultIntro',
      s.success
        ? 'Listen to the recovered song and inspect the view at pickup.'
        : 'Inspect the camera view and closest approach before changing the rig.',
    );
    const frames = this.field('frames');
    frames.hidden = !review || !(s.beforeFrame || s.afterFrame);
    const imgs = frames.querySelectorAll('img');
    [s.beforeFrame, s.afterFrame].forEach((url, i) => {
      const img = imgs[i];
      img.parentElement!.hidden = !url;
      if (url && img.getAttribute('src') !== url) img.src = url;
      if (!url && img.hasAttribute('src')) img.removeAttribute('src');
    });
    this.field('note').hidden = !s.note;
    this.label('note', s.note);
    this.label(
      'help',
      s.spectator
        ? 'Spectator view · Quest pilot in control'
        : rig
          ? 'Select a socket to change the rig.'
          : review
            ? s.comparisonMode === 'water'
              ? 'Water comparison holds the robot pose and lamp fixed.'
              : 'Lamp comparison uses one water frame and one robot pose.'
            : 'Move pointer to steer · Scroll to raise or lower · Space to grip',
    );
    this.label(
      'source',
      s.stream === 'live'
        ? 'Water imagery · Visko Orbis'
        : s.stream === 'connecting'
          ? 'Visko Orbis · awaiting live frames'
          : 'Local practice simulation',
    );
    this.telemetry();
  }

  dispose(): void {
    this.root.removeEventListener('click', this.onClick);
    this.audio.dispose();
    this.root.remove();
  }
}
