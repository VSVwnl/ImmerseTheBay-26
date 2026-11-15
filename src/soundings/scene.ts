import * as T from 'three';
import { ArmModel } from '../arm/arm';
import type { Joints } from '../arm/ik';
import { L1, L2, SHOULDER_H, TOOL_LEN, type Vec3 } from '../config';
import {
  armBase,
  cameraAt,
  cradleAt,
  handleAt,
  lampAt,
  lipHeight,
  type MissionState,
  type Rig,
  type Site,
  type Source,
  CAGE_HALF_X,
  CAGE_HALF_Z,
  CRADLE_HALF_X,
  CRADLE_HALF_Z,
} from './mission';
import { makeCradle, makeLamp, makeRecorder, makeSource, makeVehicle } from './hardware';
import { makeOcean, makeOptics, surface, WaterFrame } from './water';

export type Socket = 'camera' | 'inner' | 'port' | 'starboard';

type Pose = Pick<MissionState, 'tip' | 'requested' | 'joints' | 'grip' | 'handle'>;
export interface FrozenEvidence {
  pilot: HTMLCanvasElement;
  water: HTMLCanvasElement;
  source: Source;
  /** Media timestamp of the video sampled into this pilot frame, or practice time. */
  mediaTime: number;
  capturedAt: string;
  rig: Rig;
  site: Site;
  pose: Pose;
}

const WIDTH = 640,
  HEIGHT = 360;
const pilotLayer = 4;
const defaultRig: Rig = { arm: 'port', lamp: 'inner', aim: 'forward' };
const sites: Site[] = ['dock', 'canyon', 'mirror'];
function copyCanvas(from: HTMLCanvasElement) {
  const to = surface(from.width, from.height);
  to.getContext('2d')!.drawImage(from, 0, 0);
  return to;
}
const vector = (p: Vec3) => new T.Vector3(...p);
const clonePose = (p: Pose): Pose => ({
  tip: [...p.tip],
  requested: [...p.requested],
  joints: [...p.joints],
  grip: p.grip,
  handle: [...p.handle],
});
const makeLines = (p: T.Vector3[], color: number, opacity: number) => {
  const geo = new T.BufferGeometry().setFromPoints(p);
  return new T.LineSegments(
    geo,
    new T.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
};
function socketLabel(text: string, anchor: T.Vector3, position: T.Vector3) {
  const c = surface(256, 64),
    g = c.getContext('2d')!;
  g.fillStyle = 'rgba(7,28,34,.90)';
  g.beginPath();
  g.roundRect(2, 2, 252, 60, 7);
  g.fill();
  g.fillStyle = '#84d5bf';
  g.fillRect(2, 10, 5, 44);
  g.fillStyle = '#dff8eb';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '600 32px monospace';
  g.fillText(text, 130, 33);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  const label = new T.Sprite(
    new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  label.position.copy(position);
  label.scale.set(0.151, 0.038, 1);
  const group = new T.Group();
  group.add(label, makeLines([anchor, position], 0x8bbfb0, 0.62));
  return group;
}

export class SoundingsScene {
  readonly scene = new T.Scene();
  readonly benchCamera = new T.PerspectiveCamera(44, 1, 0.03, 24);
  // The optical centre and pose stay fixed on the mast across dives and mount changes.
  readonly pilotCamera = new T.PerspectiveCamera(69, WIDTH / HEIGHT, 0.025, 22);
  readonly pilotCanvas = surface(WIDTH, HEIGHT);
  readonly pilotTexture = new T.CanvasTexture(this.pilotCanvas);
  private readonly pilotCtx = this.pilotCanvas.getContext('2d', { alpha: false })!;
  private readonly target = new T.WebGLRenderTarget(WIDTH, HEIGHT, { colorSpace: T.SRGBColorSpace });
  private readonly pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  private readonly image = this.pilotCtx.createImageData(WIDTH, HEIGHT);
  private readonly water = new WaterFrame();
  private readonly ocean = makeOcean(this.water.texture);
  private readonly optics = makeOptics(this.water.texture);
  private readonly arm = new ArmModel();
  private readonly lamp = makeLamp();
  private readonly bracket = new T.Mesh(
    new T.CylinderGeometry(0.012, 0.016, 0.235, 10),
    new T.MeshStandardMaterial({ color: 0xb5c3ba, metalness: 0.46, roughness: 0.55 }),
  );
  private readonly beam = new T.SpotLight(0xffefc9, 5, 2, 0.52, 0.62, 1);
  private readonly recorder = makeRecorder();
  private readonly cradles = new T.Group();
  private readonly baskets: Record<Site, T.Group>;
  private readonly guides = new T.Group();
  private readonly reach: T.LineSegments;
  private readonly beamGuide: T.LineSegments;
  private readonly ray = new T.Raycaster();
  private readonly plane = new T.Plane(new T.Vector3(0, 1, 0));
  private readonly hit = new T.Vector3();
  private rig: Rig = { ...defaultRig };
  private site: Site = 'dock';
  private pose: Pose = {
    tip: [0, 1, -0.65],
    requested: [0, 1, -0.65],
    joints: [0, 0, 2, 0] as Joints,
    grip: 0,
    handle: handleAt('dock'),
  };
  private lastPose: Pose = clonePose(this.pose);
  private lastRig: Rig = { ...defaultRig };
  private lastSite: Site = 'dock';
  private capturedAt = '';
  private elapsed = 0;
  private dense = false;

  constructor(private renderer: T.WebGLRenderer) {
    this.pilotCanvas.setAttribute('aria-label', 'Mounted pilot camera');
    this.pilotCanvas.setAttribute('role', 'img');
    this.pilotTexture.colorSpace = T.SRGBColorSpace;
    this.pilotTexture.generateMipmaps = false;
    this.pilotTexture.minFilter = T.LinearFilter;
    this.water.texture.generateMipmaps = false;
    this.water.texture.minFilter = T.LinearFilter;
    this.scene.fog = new T.FogExp2(0x15515c, 0.32);
    const hardware = makeVehicle();
    const light = new T.HemisphereLight(0xa2d6d8, 0x6d877a, 1.38);
    const key = new T.DirectionalLight(0xffedce, 2.4);
    key.position.set(-1.7, 3.8, -0.36);
    key.target.position.set(0, 0.67, -1.02);
    this.scene.add(key.target);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.normalBias = 0.001;
    Object.assign(key.shadow.camera, { left: -1.25, right: 1.25, top: 1.25, bottom: -1.25, near: 0.1, far: 8 });
    key.shadow.camera.updateProjectionMatrix();
    const rim = new T.DirectionalLight(0x87dfeb, 1.75);
    rim.position.set(0.6, 2.6, -3.9);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    this.baskets = Object.fromEntries(
      sites.map((site) => [site, makeSource(site, handleAt(site), CAGE_HALF_X, CAGE_HALF_Z, lipHeight(site))]),
    ) as Record<Site, T.Group>;
    this.cradles.add(makeCradle(cradleAt('canyon'), CRADLE_HALF_X, CRADLE_HALF_Z));
    this.scene.add(
      this.ocean.group,
      light,
      key,
      rim,
      hardware,
      this.arm.root,
      this.lamp,
      this.bracket,
      this.beam,
      this.beam.target,
      this.recorder,
      this.cradles,
      ...Object.values(this.baskets),
    );
    this.scene.traverse((object) => object.layers.enable(pilotLayer));
    for (const assembly of [
      hardware,
      this.arm.root,
      this.recorder,
      this.lamp,
      this.cradles,
      ...Object.values(this.baskets),
    ]) {
      assembly.traverse((p) => {
        if (p instanceof T.Mesh) {
          p.castShadow = true;
          p.receiveShadow = true;
        }
      });
    }
    this.ocean.group.children.forEach((p) => {
      if (p instanceof T.Mesh) p.receiveShadow = true;
    });

    this.pilotCamera.layers.set(pilotLayer);
    this.pilotCamera.position.set(...cameraAt());
    this.pilotCamera.lookAt(0, 0.828, -0.57);
    this.pilotCamera.updateMatrixWorld();
    this.scene.add(this.optics);
    // Bench-only guides show the reachable boundary at handle height and the two optical cones.
    const arc: T.Vector3[] = [];
    for (let i = 0; i < 32; i++) {
      const a = -0.92 + (i * 1.84) / 32,
        b = a + 1.84 / 32;
      arc.push(new T.Vector3(Math.sin(a), 0, Math.cos(a)), new T.Vector3(Math.sin(b), 0, Math.cos(b)));
    }
    this.reach = makeLines(arc, 0x91f0ca, 0.74);
    const cone = (length: number, width: number, color: number) => {
      const pts: T.Vector3[] = [];
      for (let i = 0; i < 20; i++) {
        const a = (i * Math.PI) / 10,
          b = ((i + 1) * Math.PI) / 10;
        const pt = new T.Vector3(Math.cos(a) * width, Math.sin(a) * width, length);
        pts.push(pt, new T.Vector3(Math.cos(b) * width, Math.sin(b) * width, length));
        if (i % 5 === 0) pts.push(new T.Vector3(), pt);
      }
      return makeLines(pts, color, 0.48);
    };
    this.beamGuide = cone(0.55, 0.18, 0xffd181);
    const cameraGuide = cone(0.27, 0.16, 0x89deeb);
    cameraGuide.position.copy(this.pilotCamera.position);
    cameraGuide.lookAt(0, 0.828, -0.57);
    this.guides.add(this.reach, this.beamGuide, cameraGuide);
    this.scene.add(this.guides);
    for (const [socket, text, offset] of [
      ['port', 'PORT', [0.13, 0.05, -0.01]],
      ['starboard', 'STBD', [-0.13, 0.055, 0.025]],
      ['camera', 'CAMERA', [-0.115, 0.058, -0.05]],
      ['inner', 'LAMP', [0.12, 0.024, 0.006]],
    ] as [Socket, string, Vec3][]) {
      const anchor = this.socketPosition(socket);
      this.scene.add(socketLabel(text, anchor, anchor.clone().add(vector(offset))));
    }
    this.resize(1100, 680);
    this.apply(this.pose, this.rig, this.site);
  }

  setWater(video: HTMLVideoElement | null, live: boolean) {
    this.water.setVideo(video, live);
  }
  get waterCanvas() {
    return this.water.canvas;
  }
  get waterSource(): Source {
    return this.water.source;
  }
  get waterMediaTime() {
    return this.water.mediaTime;
  }
  setTurbidity(dense: boolean) {
    this.dense = dense;
  }
  setGuides(visible: boolean) {
    this.guides.visible = visible;
  }
  resize(width: number, height: number) {
    this.benchCamera.aspect = Math.max(0.2, width / Math.max(height, 1));
    const center = new T.Vector3(0, 0.803, -0.99);
    const offset = new T.Vector3(0.63, 0.69, 1.51).multiplyScalar(Math.max(1, 1.32 / this.benchCamera.aspect));
    this.benchCamera.position.copy(center).add(offset);
    this.benchCamera.lookAt(center);
    this.benchCamera.updateProjectionMatrix();
    this.benchCamera.updateMatrixWorld();
  }
  socketPosition(socket: Socket) {
    if (socket === 'camera') return vector(cameraAt());
    if (socket === 'inner') return vector(lampAt({ ...defaultRig, lamp: 'inner' }));
    return vector(armBase({ ...defaultRig, arm: socket }));
  }
  pointerTarget(
    clientX: number,
    clientY: number,
    rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
    height: number,
  ): Vec3 | null {
    if (!rect.width || !rect.height) return null;
    const ndc = new T.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    );
    this.ray.setFromCamera(ndc, this.pilotCamera);
    this.plane.constant = -height;
    return this.ray.ray.intersectPlane(this.plane, this.hit) ? (this.hit.toArray() as Vec3) : null;
  }
  update(state: MissionState, rig: Rig, site: Site, dt: number) {
    this.elapsed += Math.max(0, dt);
    this.pose = clonePose(state);
    this.rig = { ...rig };
    this.site = site;
    this.apply(this.pose, rig, site);
  }
  private apply(pose: Pose, rig: Rig, site: Site) {
    this.arm.root.position.set(...armBase(rig));
    this.arm.setJoints(pose.joints);
    // Fixed aperture at the recording instant makes same-pose stills exactly reproducible.
    this.arm.updateGrip(Boolean(pose.grip), 1);
    this.recorder.position.set(...pose.handle);
    sites.forEach((s) => (this.baskets[s].visible = s === site));
    this.cradles.visible = site !== 'dock';
    const pos = vector(lampAt(rig)),
      handle = vector(handleAt(site));
    const direction =
      rig.aim === 'inward' ? handle.clone().sub(pos).normalize() : new T.Vector3(0, -0.34, 1).normalize();
    const aim = pos.clone().add(direction);
    this.lamp.position.copy(pos);
    this.lamp.lookAt(aim);
    this.bracket.visible = rig.lamp !== 'inner';
    this.bracket.position.set(pos.x, 0.87, pos.z - 0.038);
    this.beam.position.copy(pos);
    this.beam.target.position.copy(aim);
    this.beam.target.updateMatrixWorld();
    this.beamGuide.position.copy(pos);
    this.beamGuide.lookAt(aim);
    const base = armBase(rig);
    this.reach.position.set(base[0], handle.y, base[2]);
    const shoulderToWristY = handle.y + TOOL_LEN - (base[1] + SHOULDER_H);
    const radius = Math.sqrt(Math.max(0, (L1 + L2 - 0.01) ** 2 - shoulderToWristY ** 2));
    this.reach.scale.setScalar(radius);
    const u = this.optics.material.uniforms;
    u.lampOrigin.value.copy(pos).applyMatrix4(this.pilotCamera.matrixWorldInverse);
    u.lampDirection.value.copy(direction).transformDirection(this.pilotCamera.matrixWorldInverse);
    const tan = Math.tan(T.MathUtils.degToRad(this.pilotCamera.fov / 2));
    u.halfFov.value.set(tan * this.pilotCamera.aspect, tan);
    u.density.value = 1.7;
  }
  // The headset's eye cameras stay attached to the immersion pass. This independent
  // sensor render uses its own viewport/target and restores the XR framebuffer afterwards.
  private drawSensor(ctx: CanvasRenderingContext2D, water: T.Texture, source: Source) {
    this.optics.material.uniforms.water.value = water;
    this.ocean.dome.uniforms.water.value = water;
    this.ocean.dome.uniforms.isLive.value = source === 'live' ? 1 : 0;
    const r = this.renderer,
      xr = r.xr.enabled,
      prev = r.getRenderTarget();
    const face = r.getActiveCubeFace(),
      mip = r.getActiveMipmapLevel();
    try {
      r.xr.enabled = false;
      r.setRenderTarget(this.target);
      r.clear(true, true, true);
      r.render(this.scene, this.pilotCamera);
      r.readRenderTargetPixels(this.target, 0, 0, WIDTH, HEIGHT, this.pixels);
      const stride = WIDTH * 4;
      for (let y = 0; y < HEIGHT; y++)
        this.image.data.set(this.pixels.subarray((HEIGHT - y - 1) * stride, (HEIGHT - y) * stride), y * stride);
      ctx.putImageData(this.image, 0, 0);
    } finally {
      r.setRenderTarget(prev, face, mip);
      r.xr.enabled = xr;
    }
  }
  renderPilot() {
    this.water.sample(this.elapsed, this.site, this.dense);
    this.drawSensor(this.pilotCtx, this.water.texture, this.water.source);
    this.pilotTexture.needsUpdate = true;
    this.lastPose = clonePose(this.pose);
    this.lastRig = { ...this.rig };
    this.lastSite = this.site;
    this.capturedAt = new Date().toISOString();
  }
  captureEvidence(): FrozenEvidence {
    if (!this.capturedAt) this.renderPilot();
    return {
      pilot: copyCanvas(this.pilotCanvas),
      water: copyCanvas(this.water.canvas),
      source: this.water.source,
      mediaTime: this.water.mediaTime,
      capturedAt: this.capturedAt,
      rig: { ...this.lastRig },
      site: this.lastSite,
      pose: clonePose(this.lastPose),
    };
  }
  compareEvidence(frozen: FrozenEvidence, rig: Rig) {
    const alternate = surface(WIDTH, HEIGHT),
      texture = new T.CanvasTexture(frozen.water);
    texture.generateMipmaps = false;
    texture.minFilter = T.LinearFilter;
    // The recorded arm rail is held fixed. Changing arm configuration cannot move this pose.
    const lighting: Rig = { ...frozen.rig, lamp: rig.lamp, aim: rig.aim };
    try {
      this.apply(frozen.pose, lighting, frozen.site);
      this.drawSensor(alternate.getContext('2d')!, texture, frozen.source);
    } finally {
      this.apply(this.pose, this.rig, this.site);
      this.optics.material.uniforms.water.value = this.water.texture;
      this.ocean.dome.uniforms.water.value = this.water.texture;
      this.ocean.dome.uniforms.isLive.value = this.water.source === 'live' ? 1 : 0;
      texture.dispose();
    }
    return alternate;
  }
}
