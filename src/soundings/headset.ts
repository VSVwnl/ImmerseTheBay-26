// The piloting console is a separate scene. Moving one's head never moves the mast camera.
import * as THREE from 'three';
import { XRInput } from '../input/xr';
import { Panel, type PanelButton } from '../ui/panels';
import type { Action } from '../env/env';
import type { Vec3 } from '../config';
import type { SoundingsScene } from './scene';
import type { Rig } from './mission';
import type { SoundingsAction, SoundingsViewState } from './ui';

type Socket = 'inner' | 'port' | 'starboard';
const sockets: Socket[] = ['inner', 'port', 'starboard'];

export class Headset {
  readonly input: XRInput;
  private readonly camera = new THREE.PerspectiveCamera(68, 1, 0.035, 40);
  private readonly cabin = new THREE.Scene();
  private readonly controls = new THREE.Group();
  private readonly panel: Panel;
  private readonly status: Panel;
  private readonly screens = new THREE.Group();
  private readonly monitor = new THREE.Group();
  private readonly sourceDisplay = new THREE.Group();
  private waterTexture: THREE.CanvasTexture;
  private shownWaterTime = -1;
  private readonly pictures: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private pictureKey = '';
  private readonly captions: THREE.Mesh[] = [];
  private pictureVersion = 0;
  private phase: SoundingsViewState['phase'] = 'rig';
  private rig: Rig = { arm: 'port', lamp: 'inner', aim: 'forward' };
  private dragging: { slot: number; part: 'arm' | 'lamp' } | null = null;
  private readonly ghost = new THREE.Mesh(
    new THREE.SphereGeometry(0.023, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xf9bd52, wireframe: true }),
  );
  private readonly ray = new THREE.Raycaster();
  private readonly beams: THREE.Line[] = [];
  private readonly actionMap = new Map<string, SoundingsAction>();
  private readonly station = new THREE.Vector3();
  private calibrated = false;
  private readonly selectingPanel = new Set<number>();
  private resumeInputAt = 0;
  private anchor: Vec3 | null = null;
  private armOrigin: Vec3 = [0, 1, -0.65];
  private eyeHeight = 1.55;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private view: SoundingsScene,
    private act: (action: SoundingsAction) => void,
  ) {
    this.input = new XRInput(renderer, true);
    const hidden = document.createElement('div');
    const press = (_: string, id: string) => {
      const a = this.actionMap.get(id);
      if (a) this.act(a);
    };
    this.panel = new Panel('instruments', 0.55, 0.44, [0.4, 1.22, -0.51], press, hidden);
    this.status = new Panel('operation', 0.55, 0.25, [-0.37, 1.28, -0.56], press, hidden);
    this.controls.add(this.panel.mesh, this.status.mesh, this.input.group, this.ghost);
    this.ghost.visible = false;
    this.cabin.background = new THREE.Color(0x07181e);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.05, 1.153),
      new THREE.MeshBasicMaterial({ map: view.pilotTexture, toneMapped: false }),
    );
    this.monitor.add(screen);
    this.cabin.add(this.monitor, this.screens, new THREE.HemisphereLight(0xe1f9ee, 0x406365, 2.1));
    this.waterTexture = new THREE.CanvasTexture(view.waterCanvas);
    this.waterTexture.colorSpace = THREE.SRGBColorSpace;
    const source = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.2025),
      new THREE.MeshBasicMaterial({ map: this.waterTexture, toneMapped: false }),
    );
    this.sourceDisplay.add(source);
    this.sourceDisplay.position.set(0.815, 0.432, 0.014);
    const sourceFrame = new THREE.Mesh(
      new THREE.PlaneGeometry(0.375, 0.218),
      new THREE.MeshBasicMaterial({ color: 0x84b4ae }),
    );
    sourceFrame.position.z = -0.004;
    this.sourceDisplay.add(sourceFrame);
    this.monitor.add(this.sourceDisplay);
    for (const x of [-0.53, 0.53]) {
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(1.02, 0.57375),
        new THREE.MeshBasicMaterial({ toneMapped: false }),
      );
      p.position.set(x, 0, 0);
      this.pictures.push(p);
      this.screens.add(p);
      const text = new THREE.Mesh(
        new THREE.PlaneGeometry(1.02, 0.085),
        new THREE.MeshBasicMaterial({ toneMapped: false }),
      );
      text.position.set(x, 0.343, 0);
      this.captions.push(text);
      this.screens.add(text);
    }
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.205, 0.035),
      new THREE.MeshBasicMaterial({ color: 0x1c383d }),
    );
    edge.position.z = -0.022;
    this.monitor.add(edge);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.55, 0.08, 56),
      new THREE.MeshStandardMaterial({ color: 0x152b2d, roughness: 0.86 }),
    );
    base.position.set(0, -0.046, -0.4);
    this.cabin.add(base);
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x305254, metalness: 0.23, roughness: 0.5 });
    for (const x of [-1.1, 1.1]) {
      const upright = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 2.85, 8), railMaterial);
      upright.position.set(x, 1.38, -1.48);
      this.cabin.add(upright);
    }
    this.layout();
    for (let i = 0; i < 2; i++) {
      const ctrl = renderer.xr.getController(i);
      const beam = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1.4)]),
        new THREE.LineBasicMaterial({ color: 0x65e1cd, transparent: true, opacity: 0.42 }),
      );
      ctrl.add(beam);
      this.beams.push(beam);
      ctrl.addEventListener('selectstart', () => this.select(i));
      ctrl.addEventListener('selectend', () => this.drop(i));
    }
    renderer.xr.addEventListener('sessionstart', () => {
      this.calibrated = false;
      this.anchor = null;
    });
    renderer.xr.addEventListener('sessionend', () => {
      this.dragging = null;
      this.ghost.visible = false;
      this.selectingPanel.clear();
    });
  }

  private layout() {
    const bench = this.phase === 'rig';
    const scale = bench ? 1 : 0.79;
    this.panel.mesh.position.set(0.4, this.eyeHeight - (bench ? 0.28 : 0.46), bench ? -0.51 : -0.54);
    this.status.mesh.position.set(-0.37, this.eyeHeight - (bench ? 0.17 : 0.46), bench ? -0.56 : -0.57);
    for (const p of [this.panel, this.status]) {
      p.mesh.scale.setScalar(scale);
      p.mesh.lookAt(0, bench ? p.mesh.position.y : this.eyeHeight - 0.08, 0);
    }
    this.monitor.position.set(0, this.eyeHeight + 0.21, -1.33);
    this.screens.position.set(0, this.eyeHeight + 0.14, -1.29);
  }
  async enter() {
    if (this.renderer.xr.isPresenting) {
      await this.renderer.xr.getSession()?.end();
      return;
    }
    if (!navigator.xr) throw new Error('Open in Quest Browser to enter VR.');
    const session = await navigator.xr.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking'],
    });
    await this.renderer.xr.setSession(session);
  }
  reanchor(tip: Vec3) {
    this.anchor = null;
    this.armOrigin = [...tip];
  }
  action(dt: number): Action | null {
    this.input.update(dt);
    const action = this.input.active && this.input.action();
    if (!action || this.selectingPanel.size || performance.now() < this.resumeInputAt) return null;
    // Relative to the pilot's neutral hand position, looking forward from the stern (+Z).
    if (!this.anchor) {
      // A trigger used on the launch panel must be released before driving the jaws.
      if (action.grip || Math.abs(action.target[0]) > 0.3) return null;
      this.anchor = [...action.target];
    }
    return {
      grip: action.grip,
      target: [
        this.armOrigin[0] - (action.target[0] - this.anchor[0]) * 1.65,
        this.armOrigin[1] + (action.target[1] - this.anchor[1]) * 1.35,
        this.armOrigin[2] - (action.target[2] - this.anchor[2]) * 1.55,
      ],
    };
  }

  private pointRay(i: number) {
    const c = this.renderer.xr.getController(i);
    c.updateWorldMatrix(true, false);
    this.ray.ray.origin.setFromMatrixPosition(c.matrixWorld);
    this.ray.ray.direction.set(0, 0, -1).transformDirection(c.matrixWorld);
  }
  private hitSocket(i: number): Socket | null {
    this.pointRay(i);
    let nearest: Socket | null = null,
      best = 0.1;
    for (const socket of sockets) {
      const center = this.view.socketPosition(socket);
      const d = this.ray.ray.distanceToPoint(center);
      if (d < best) {
        nearest = socket;
        best = d;
      }
    }
    return nearest;
  }
  private select(i: number) {
    this.pointRay(i);
    const hit = this.ray.intersectObjects([this.panel.mesh, this.status.mesh], false)[0];
    if (hit) {
      this.selectingPanel.add(i);
      (hit.object === this.panel.mesh ? this.panel : this.status).poke([hit.point], performance.now());
      return;
    }
    if (this.phase !== 'rig') return;
    const source = this.hitSocket(i);
    if (source && (source === this.rig.arm || source === this.rig.lamp)) {
      this.dragging = { slot: i, part: source === this.rig.arm ? 'arm' : 'lamp' };
      this.ghost.visible = true;
    }
  }
  private drop(i: number) {
    if (this.selectingPanel.delete(i)) this.resumeInputAt = performance.now() + 220;
    if (!this.dragging || this.dragging.slot !== i) return;
    const part = this.dragging.part,
      dest = this.hitSocket(i);
    this.dragging = null;
    this.ghost.visible = false;
    if (!dest || this.phase !== 'rig') return;
    if (part === 'arm' && dest !== 'inner' && dest !== this.rig.lamp)
      this.act({ type: 'arm', side: dest === 'port' ? 'left' : 'right' });
    if (part === 'lamp' && dest !== this.rig.arm)
      this.act({ type: 'lamp', mount: dest === 'inner' ? 'inner' : 'outer' });
  }

  set(s: SoundingsViewState, rig: Rig) {
    if (this.phase !== s.phase) {
      this.phase = s.phase;
      this.layout();
    }
    this.rig = rig;
    this.actionMap.clear();
    const buttons: PanelButton[] = [];
    const b = (label: string, action: SoundingsAction, active = false, disabled = false) => {
      const id = label;
      this.actionMap.set(id, action);
      buttons.push({ id, label, active, disabled });
    };
    if (s.phase === 'rig') {
      b('Port arm', { type: 'arm', side: 'left' }, rig.arm === 'port');
      b('Starboard arm', { type: 'arm', side: 'right' }, rig.arm === 'starboard');
      b('Inner light', { type: 'lamp', mount: 'inner' }, rig.lamp === 'inner');
      b('Rail light', { type: 'lamp', mount: 'outer' }, rig.lamp !== 'inner');
      b('Aim ahead', { type: 'aim', aim: 'forward' }, rig.aim === 'forward');
      b('Aim inward', { type: 'aim', aim: 'handle' }, rig.aim === 'inward');
      for (const [p, label] of [
        ['clear', 'Clear view'],
        ['scatter', 'Backscatter'],
        ['miss', 'Short reach'],
      ] as const)
        b(label, { type: 'prediction', prediction: p }, s.prediction === p);
      b(
        s.dockDone ? 'Launch dive' : 'Dock check',
        { type: s.dockDone ? 'dive' : 'dock' },
        true,
        !!s.dockDone && !s.prediction,
      );
    } else if (s.phase === 'debrief') {
      b('Refit rig', { type: 'retry' });
      if (s.mirrorAvailable) b('Mirror site', { type: 'mirror' }, true);
      if (s.hasWaterPair) {
        b('Compare lamps', { type: 'compare', mode: 'lamp' }, s.comparisonMode === 'lamp');
        b('Compare water', { type: 'compare', mode: 'water' }, s.comparisonMode === 'water');
      }
      if (s.success) b('Play call', { type: 'sound' });
      b('Next pilot', { type: 'reset' });
    } else {
      if (s.phase === 'dive')
        for (const symbol of ['ring', 'bars', 'triangle'] as const)
          b(symbol, { type: 'symbol', symbol }, s.symbolAnswer === symbol);
      b(s.waterTest ? 'Capture water' : 'Steer water', { type: 'waterTest' });
      b('Return to rig', { type: 'retry' });
      if (s.phase === 'dive') b('Review dive', { type: 'debrief' });
    }
    this.panel.set({
      title: s.phase === 'rig' ? 'Rigging deck' : s.phase === 'debrief' ? 'Dive review' : 'Pilot console',
      cols: 2,
      buttons,
    });
    this.actionMap.set('reset', { type: 'reset' });
    this.actionMap.set('connect', { type: 'connect' });
    const words = (s.note || '').split(/\s+/),
      rows: string[] = [''];
    for (const word of words) {
      let i = rows.length - 1;
      if ((rows[i] + ' ' + word).length > 43) {
        rows.push(word);
      } else rows[i] = (rows[i] + ' ' + word).trim();
    }
    this.status.set({
      title:
        s.phase === 'debrief'
          ? 'Replay · captured water'
          : s.stream === 'live'
            ? 'Orbis · live'
            : s.stream === 'connecting'
              ? 'Orbis · connecting'
              : 'Practice water',
      lines: [
        ...(s.phase === 'dock' || s.phase === 'dive'
          ? [
              {
                text: 'Jaws ' + s.jawStatus + '   ·   ' + s.heightCm + ' cm relative to pickup',
                size: 18,
                bold: true,
              },
            ]
          : []),
        ...rows.slice(0, 4).map((text) => ({ text, size: 17 })),
      ],
      cols: 2,
      buttons: [
        { id: 'reset', label: 'Reset dive' },
        ...(s.stream === 'practice' ? [{ id: 'connect', label: 'Connect Orbis' }] : []),
      ],
    });
    this.screens.visible = s.phase === 'debrief' && !!s.beforeFrame && !!s.afterFrame;
    this.monitor.visible = !this.screens.visible;
    this.sourceDisplay.visible = s.waterTest;
    const key = (s.beforeFrame ?? '') + s.comparisonMode;
    if (key !== this.pictureKey) {
      this.pictureKey = key;
      const labels =
        s.comparisonMode === 'water' ? ['BEFORE STEERING', 'AFTER STEERING'] : ['AS FLOWN', 'ALTERNATE LAMP'];
      this.captions.forEach((mesh, i) => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 48;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#0b2329';
        ctx.fillRect(0, 0, 512, 48);
        ctx.fillStyle = '#c9f7e4';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], 256, 33);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.map = new THREE.CanvasTexture(canvas);
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.needsUpdate = true;
      });
      const version = ++this.pictureVersion;
      [s.beforeFrame, s.afterFrame].forEach((src, i) => {
        const mat = this.pictures[i].material;
        mat.map?.dispose();
        mat.map = null;
        mat.needsUpdate = true;
        if (src)
          new THREE.TextureLoader().load(src, (tex) => {
            if (version !== this.pictureVersion) {
              tex.dispose();
              return;
            }
            tex.colorSpace = THREE.SRGBColorSpace;
            mat.map = tex;
            mat.needsUpdate = true;
          });
      });
    }
  }
  render(now: number) {
    Panel.inScene = true;
    if (!this.calibrated) {
      const xrCamera = this.renderer.xr.getCamera();
      xrCamera.getWorldPosition(this.station);
      if (this.station.y > 0.55) {
        this.eyeHeight = THREE.MathUtils.clamp(this.station.y, 1.03, 1.99);
        this.layout();
        this.calibrated = true;
      }
    }
    if (this.sourceDisplay.visible && this.view.waterMediaTime !== this.shownWaterTime) {
      this.waterTexture.needsUpdate = true;
      this.shownWaterTime = this.view.waterMediaTime;
    }
    const scene = this.phase === 'rig' ? this.view.scene : this.cabin;
    scene.add(this.controls);
    this.panel.sync();
    this.status.sync();
    this.panel.poke(this.input.pokeTips(), now);
    this.status.poke(this.input.pokeTips(), now);
    this.beams.forEach((beam) => {
      beam.visible = this.phase === 'rig' || this.phase === 'debrief';
    });
    if (this.dragging) {
      this.pointRay(this.dragging.slot);
      const socket = this.hitSocket(this.dragging.slot);
      if (socket) this.ghost.position.copy(this.view.socketPosition(socket));
      else this.ray.ray.at(0.72, this.ghost.position);
    }
    this.renderer.render(scene, this.camera);
    scene.remove(this.controls);
  }
}
