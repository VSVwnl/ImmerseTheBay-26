// Robot Workshop props (plate + rack, can + green bin, pot + target zone) and the floating label that
// explains a failed grab. Matches the stage: matte standard materials, the arm's orange as the accent.
import * as THREE from 'three';
import { TABLE, WORKSHOP, type Vec3 } from '../config';
import type { EnvState } from '../env/env';
import { ITEM_IDS, type ItemId } from '../arm/items';
import { WORKSHOP_LAYOUTS, WORKSHOP_TASKS, type Goal, type GoalKind, type WorkshopLayout } from '../env/workshop';
import { makeBin, markDataset } from './stage';

const ORANGE = 0xf28a1e;

function makePlate(): THREE.Group {
  const g = new THREE.Group();
  const { radius: r, thick: t } = WORKSHOP.plate;
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.35 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, t, 40), white));
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(r * 0.93, t * 0.28, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0x2a6fd6, roughness: 0.4 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = t / 2;
  g.add(rim);
  return g;
}

function makeCan(): THREE.Group {
  const g = new THREE.Group();
  const { radius: r, height: h } = WORKSHOP.can;
  const alu = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.3, metalness: 0.8 });
  const label = new THREE.MeshStandardMaterial({ color: 0xd6332b, roughness: 0.5, metalness: 0.1 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), alu));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.55, 32), label));
  return g;
}

function makePot(): THREE.Group {
  const g = new THREE.Group();
  const { radius: r, height: h } = WORKSHOP.pot;
  const iron = new THREE.MeshStandardMaterial({ color: 0x2d3036, roughness: 0.55, metalness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.45 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, h, 36), iron));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.008, 36), iron);
  lid.position.y = h / 2 + 0.004;
  g.add(lid);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), accent);
  knob.position.y = h / 2 + 0.014;
  g.add(knob);
  for (const sx of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 16, Math.PI), iron);
    handle.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    handle.position.set(sx * r, h * 0.25, 0);
    g.add(handle);
  }
  // orange weight plate on the front so "heavy" reads at a glance
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.003), accent);
  tag.position.set(0, 0, r * 0.97);
  g.add(tag);
  return g;
}

function makeRack(g0: Goal): THREE.Group {
  const g = new THREE.Group();
  const { w, d, h } = g0;
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.8 });
  const accent = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.45 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, h, 8), steel);
      leg.position.set((sx * w) / 2, h / 2, (sz * d) / 2);
      g.add(leg);
    }
  for (let i = 0; i <= 6; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, 0.004), steel);
    bar.position.set(0, h, -d / 2 + (d * i) / 6);
    g.add(bar);
  }
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, d), accent);
    rail.position.set((sx * w) / 2, h, 0);
    g.add(rail);
  }
  return g;
}

function makeZone(g0: Goal): THREE.Object3D {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(g0.w, g0.d),
    new THREE.MeshStandardMaterial({ color: g0.color, emissive: new THREE.Color(g0.color).multiplyScalar(0.45), transparent: true, opacity: 0.55, roughness: 0.8 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.001;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** Goal meshes by kind. To add a goal kind, add a builder here. */
const GOAL_MESHES: Record<GoalKind, (g: Goal) => THREE.Object3D> = {
  rack: makeRack,
  bin: (g) => makeBin(g.color),
  zone: makeZone,
};

/** Object meshes. To add an object, add a builder here (simple primitives only). */
const ITEM_MESHES: Record<ItemId, () => THREE.Group> = {
  plate: makePlate,
  can: makeCan,
  pot: makePot,
};

/** A label that floats up and fades out. Not on the dataset layer. */
class FloatLabel {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private t = 0;
  private base: Vec3 = [0, 0, 0];

  constructor() {
    this.canvas.width = 640;
    this.canvas.height = 112;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, toneMapped: false }));
    this.sprite.scale.set(0.34, 0.34 * (112 / 640), 1);
    this.sprite.renderOrder = 20;
    this.sprite.visible = false;
  }

  show(text: string, at: Vec3): void {
    const c = this.canvas.getContext('2d')!;
    c.clearRect(0, 0, 640, 112);
    c.fillStyle = 'rgba(20,12,12,0.88)';
    c.strokeStyle = '#ff7b6b';
    c.lineWidth = 6;
    c.beginPath();
    c.roundRect(4, 4, 632, 104, 22);
    c.fill();
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = 'bold 50px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 320, 58, 600);
    this.tex.needsUpdate = true;
    this.base = [at[0], Math.max(at[1], TABLE.top) + 0.14, at[2]];
    this.t = WORKSHOP.labelS;
    this.update(0);
  }

  update(dt: number): void {
    this.t = Math.max(0, this.t - dt);
    const k = this.t / WORKSHOP.labelS;
    this.sprite.position.set(this.base[0], this.base[1] + 0.05 * (1 - k), this.base[2]);
    (this.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, k * 3);
    this.sprite.visible = this.t > 0;
  }
}

export class WorkshopProps {
  readonly root = new THREE.Group();
  readonly items: Record<ItemId, THREE.Group>;
  /** goal meshes per challenge, shown only during that challenge */
  private goals = new Map<WorkshopLayout, THREE.Object3D[]>();
  private label = new FloatLabel();
  /** the last failed-grab text shown (for tests) */
  lastLabel: string | null = null;

  constructor() {
    this.items = Object.fromEntries(ITEM_IDS.map((id) => [id, ITEM_MESHES[id]()])) as Record<ItemId, THREE.Group>;
    this.root.add(...Object.values(this.items));
    for (const layout of WORKSHOP_LAYOUTS) {
      const meshes = WORKSHOP_TASKS[layout].steps.map((st) => {
        const m = GOAL_MESHES[st.goal.kind](st.goal);
        m.position.set(st.goal.pos[0], TABLE.top, st.goal.pos[2]);
        m.visible = false;
        this.root.add(m);
        return m;
      });
      this.goals.set(layout, meshes);
    }
    markDataset(this.root);
    this.root.add(this.label.sprite);
  }

  get labelVisible(): boolean {
    return this.label.sprite.visible;
  }

  showFail(text: string, at: Vec3): void {
    this.lastLabel = text;
    this.label.show(text, at);
  }

  update(s: EnvState, items: Partial<Record<ItemId, Vec3>>, dt: number): void {
    for (const id of ITEM_IDS) {
      const p = items[id];
      this.items[id].visible = !!p;
      if (p) this.items[id].position.set(p[0], p[1], p[2]);
    }
    for (const [layout, meshes] of this.goals) for (const m of meshes) m.visible = s.layout === layout;
    this.label.update(dt);
  }
}
