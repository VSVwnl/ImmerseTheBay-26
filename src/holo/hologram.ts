// The hologram's look: a small cyan scanline copy of the arm (and a faint copy of the table, bins, cubes) standing
// on a magenta emitter puck, with a light beam, rising sparks, a grab handle at its tip and a tether to the real
// tip while dragging. Lives only on the default layer, so the dataset/policy camera never sees it.
import * as THREE from 'three';
import { ArmModel } from '../arm/arm';
import { solveIK } from '../arm/ik';
import { ARM_BASE, BIN, BIN_POS, CUBE_SIZE, REACH_RADIUS, TABLE, type Vec3 } from '../config';
import type { EnvState } from '../env/env';
import { toHolo, type Anchor } from './link';

const CYAN = new THREE.Color(0x35e0ff);
const MAGENTA = new THREE.Color(0xff2bd6);

const HOLO_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uGlitch;
  varying vec3 vWorld;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // rare horizontal tearing in thin bands
    float band = floor(world.y * 140.0 + floor(uTime * 9.0) * 7.0);
    float tear = step(0.985, fract(sin(band * 12.9898) * 43758.5453));
    world.x += tear * uGlitch * 0.004 * sin(uTime * 40.0 + band);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    vViewV = -mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const HOLO_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uLines; // scanlines per meter (world)
  uniform float uBoost;
  varying vec3 vWorld;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewV))), 2.2);
    float scan = smoothstep(0.15, 0.5, abs(fract(vWorld.y * uLines - uTime * 1.6) - 0.5) * 2.0);
    float sweep = smoothstep(0.96, 1.0, fract(vWorld.y * 6.0 - uTime * 0.45)); // slow bright band moving up
    float flicker = 0.9 + 0.1 * sin(uTime * 61.0) * sin(uTime * 23.0);
    float a = (0.12 + 0.85 * fres) * (0.35 + 0.65 * scan) + sweep * 0.35;
    vec3 col = uColor * (0.55 + 1.3 * fres + 0.6 * sweep) * uBoost;
    gl_FragColor = vec4(col, clamp(a * flicker * uOpacity, 0.0, 1.0));
  }
`;

const BEAM_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float fade = pow(1.0 - vUv.y, 1.6);
    float rays = 0.65 + 0.35 * sin(vUv.x * 6.2832 * 9.0 + uTime * 1.3);
    float scan = 0.75 + 0.25 * sin((vUv.y * 40.0 - uTime * 4.0));
    gl_FragColor = vec4(uColor, fade * rays * scan * 0.35 * uOpacity);
  }
`;
const UV_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const SPARK_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  uniform float uPx;
  attribute vec3 seed;
  varying float vLife;
  void main() {
    float life = fract(seed.z + uTime * (0.25 + 0.2 * seed.y));
    vLife = life;
    float ang = seed.x * 6.2832 + life * 1.5;
    float r = (0.25 + 0.75 * seed.y) * (0.6 + 0.6 * life);
    vec3 p = vec3(cos(ang) * r, life * uHeight, sin(ang) * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uPx * (1.0 - life) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const SPARK_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vLife;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = 1.0 - smoothstep(0.1, 0.5, length(c));
    gl_FragColor = vec4(uColor, d * (1.0 - vLife) * uOpacity);
  }
`;

function holoMaterial(time: { value: number }, color: THREE.Color, boost = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: time,
      uGlitch: { value: 1 },
      uColor: { value: color.clone() },
      uOpacity: { value: 1 },
      uLines: { value: 260 },
      uBoost: { value: boost },
    },
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const lineMat = (color: THREE.Color, opacity: number) =>
  new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

export class Hologram {
  /** Add this to the scene. Holds the scaled copy (positioned per frame) and world-sized extras. */
  readonly group = new THREE.Group();
  readonly arm = new ArmModel();
  private wrap = new THREE.Group(); // anchor transform: scaled, ARM_BASE at the anchor
  private time = { value: 0 };
  private mats: THREE.ShaderMaterial[] = [];
  private cubes: Record<'red' | 'blue', THREE.Mesh>;
  private reach: THREE.Mesh;
  private handle: THREE.Mesh;
  private handleMat: THREE.MeshBasicMaterial;
  private tether: THREE.Line;
  private emitter = new THREE.Group(); // world-sized, sits at the anchor
  private ring: THREE.Mesh;
  private beamMat: THREE.ShaderMaterial;
  private sparkMat: THREE.ShaderMaterial;
  private fade = 0; // 0 hidden .. 1 shown
  /** the hologram's tip handle position (world), for tests and hit checks */
  tipWorld: Vec3 = [0, 0, 0];

  constructor() {
    this.group.name = 'hologram';
    this.group.add(this.wrap, this.emitter);
    this.wrap.add(this.arm.root);

    // arm: every mesh gets the hologram shader
    const armMat = holoMaterial(this.time, CYAN);
    this.mats.push(armMat);
    this.arm.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = armMat;
    });

    // faint table, bins, cubes, reach target, at real coordinates inside the scaled wrapper
    const tableEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(TABLE.width, 0.001, TABLE.depth)),
      lineMat(CYAN, 0.35),
    );
    tableEdges.position.set(TABLE.cx, TABLE.top, TABLE.cz);
    this.wrap.add(tableEdges);
    const grid = new THREE.GridHelper(TABLE.width, 12, CYAN, CYAN);
    grid.scale.z = TABLE.depth / TABLE.width;
    grid.position.set(TABLE.cx, TABLE.top, TABLE.cz);
    (grid.material as THREE.LineBasicMaterial).transparent = true;
    (grid.material as THREE.LineBasicMaterial).opacity = 0.08;
    (grid.material as THREE.LineBasicMaterial).blending = THREE.AdditiveBlending;
    (grid.material as THREE.LineBasicMaterial).depthWrite = false;
    this.wrap.add(grid);
    for (const c of ['red', 'blue'] as const) {
      const bin = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(BIN.w, BIN.h, BIN.d)), lineMat(c === 'red' ? new THREE.Color(0xff5577) : new THREE.Color(0x5599ff), 0.7));
      bin.position.set(BIN_POS[c][0], BIN_POS[c][1] + BIN.h / 2, BIN_POS[c][2]);
      this.wrap.add(bin);
    }
    const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    const red = holoMaterial(this.time, new THREE.Color(0xff3b6b), 1.3);
    const blue = holoMaterial(this.time, new THREE.Color(0x4d8dff), 1.3);
    this.mats.push(red, blue);
    this.cubes = { red: new THREE.Mesh(cubeGeo, red), blue: new THREE.Mesh(cubeGeo, blue) };
    this.wrap.add(this.cubes.red, this.cubes.blue);
    const reachMat = holoMaterial(this.time, new THREE.Color(0xffd34d), 1.4);
    this.mats.push(reachMat);
    this.reach = new THREE.Mesh(new THREE.SphereGeometry(REACH_RADIUS, 16, 12), reachMat);
    this.wrap.add(this.reach);

    // emitter (world size): magenta puck with a glowing core, cyan ring, beam, sparks
    const puck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.038, 0.012, 40),
      new THREE.MeshStandardMaterial({ color: 0x24262c, metalness: 0.7, roughness: 0.35 }),
    );
    puck.position.y = -0.012;
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.024, 0.016, 32),
      new THREE.MeshBasicMaterial({ color: MAGENTA, transparent: true, opacity: 0.95, toneMapped: false }),
    );
    core.position.y = -0.006;
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 24, 12),
      new THREE.MeshBasicMaterial({ color: MAGENTA, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    glow.scale.y = 0.45;
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.048, 0.0016, 6, 64),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.ring.rotation.x = Math.PI / 2;
    const ticks = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.002, 0.002), this.ring.material);
      const a = (i / 12) * Math.PI * 2;
      t.position.set(Math.cos(a) * 0.056, 0, Math.sin(a) * 0.056);
      t.rotation.y = -a;
      ticks.add(t);
    }
    this.ring.add(ticks);
    ticks.rotation.x = -Math.PI / 2;
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uColor: { value: CYAN.clone() }, uOpacity: { value: 1 } },
      vertexShader: UV_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.03, 0.12, 48, 1, true), this.beamMat);
    beam.position.y = 0.06;
    const N = 90;
    const seeds = new Float32Array(N * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    sparkGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uHeight: { value: 0.16 }, uPx: { value: 6 }, uColor: { value: CYAN.clone() }, uOpacity: { value: 1 } },
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sparks = new THREE.Points(sparkGeo, this.sparkMat);
    sparks.scale.set(0.05, 1, 0.05);
    sparks.frustumCulled = false;
    this.emitter.add(puck, core, glow, this.ring, beam, sparks);

    // grab handle at the hologram tip, and a tether to the real tip
    this.handleMat = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.5, wireframe: true, depthWrite: false, toneMapped: false });
    this.handle = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), this.handleMat);
    this.handle.renderOrder = 11;
    const tg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.tether = new THREE.Line(tg, new THREE.LineDashedMaterial({ color: MAGENTA, dashSize: 0.02, gapSize: 0.012, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
    this.tether.frustumCulled = false;
    this.group.add(this.handle, this.tether);
    this.group.traverse((o) => {
      o.renderOrder = Math.max(o.renderOrder, 9);
    });
    this.group.visible = false;
  }

  /**
   * anchor: where the hologram stands (null hides it, with a short fade). tip: the real tip as rendered this frame.
   * handleRadius: grab radius (world m) drawn around the hologram tip.
   */
  update(
    anchor: Anchor | null,
    tip: Vec3,
    s: EnvState,
    opts: { hover: boolean; grabbing: boolean; interactive: boolean; handleRadius: number },
    dt: number,
  ): void {
    this.time.value += dt;
    this.fade = THREE.MathUtils.clamp(this.fade + (anchor ? dt : -dt) / 0.25, 0, 1);
    if (!anchor && this.fade === 0) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    if (anchor) this.lastAnchor = anchor;
    const a = this.lastAnchor!;
    // materialize: grow from the puck
    const grow = 0.6 + 0.4 * easeOut(this.fade);
    const sc = a.scale * grow;
    this.wrap.scale.setScalar(sc);
    this.wrap.position.set(a.pos[0] - ARM_BASE[0] * sc, a.pos[1] - ARM_BASE[1] * sc, a.pos[2] - ARM_BASE[2] * sc);
    const es = a.scale / 0.3; // emitter scales with the hologram (sized for the headset scale)
    this.emitter.position.set(...a.pos);
    this.emitter.scale.setScalar(es);
    this.ring.rotation.z += dt * 0.8;

    this.arm.setJoints(solveIK(tip).joints);
    this.arm.updateGrip(s.grip === 1, dt);
    for (const c of ['red', 'blue'] as const) {
      const p = s.cubes[c];
      this.cubes[c].visible = !!p;
      if (p) this.cubes[c].position.set(...p);
    }
    const rt = s.layout === 'reach' ? s.reachTargets[s.reachIndex] : undefined;
    this.reach.visible = !!rt;
    if (rt) this.reach.position.set(...rt);

    const op = this.fade;
    for (const m of this.mats) {
      m.uniforms.uOpacity.value = op * (opts.grabbing ? 1.35 : 1);
      m.uniforms.uGlitch.value = this.fade < 1 ? 6 : 1;
    }
    this.beamMat.uniforms.uOpacity.value = op;
    this.sparkMat.uniforms.uOpacity.value = op;

    this.tipWorld = toHolo(tip, { pos: a.pos, scale: sc });
    this.handle.visible = opts.interactive;
    this.handle.position.set(...this.tipWorld);
    this.handle.scale.setScalar(opts.handleRadius * 0.45 * (opts.grabbing ? 0.8 : opts.hover ? 1.25 : 1));
    this.handle.rotation.y += dt * (opts.hover ? 3 : 0.8);
    this.handleMat.color.copy(opts.grabbing ? MAGENTA : opts.hover ? WHITE : CYAN);
    this.handleMat.opacity = op * (opts.grabbing || opts.hover ? 0.9 : 0.35);

    this.tether.visible = opts.grabbing;
    if (opts.grabbing) {
      const pos = this.tether.geometry.getAttribute('position') as THREE.BufferAttribute;
      pos.setXYZ(0, ...this.tipWorld);
      pos.setXYZ(1, ...tip);
      pos.needsUpdate = true;
      this.tether.computeLineDistances();
    }
  }

  private lastAnchor: Anchor | null = null;
}

const WHITE = new THREE.Color(0xffffff);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
