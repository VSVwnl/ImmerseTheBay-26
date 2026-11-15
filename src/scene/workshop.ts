// Robot Workshop props: every challenge's objects and goals (meshes come from each challenge's file in
// src/workshop/challenges/), and the floating label that explains a failed grab.
import * as THREE from 'three';
import { TABLE, WORKSHOP, type Vec3 } from '../config';
import type { EnvState } from '../env/env';
import { ITEM_IDS, ITEMS, type ItemId } from '../arm/items';
import { WORKSHOP_LAYOUTS, WORKSHOP_TASKS, type WorkshopLayout } from '../env/workshop';
import { GOAL_MESHES } from '../workshop/goals';
import { markDataset } from './stage';

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
  readonly items: Record<ItemId, THREE.Object3D>;
  /** goal meshes per challenge, shown only during that challenge */
  private goals = new Map<WorkshopLayout, THREE.Object3D[]>();
  private label = new FloatLabel();
  /** the last failed-grab text shown (for tests) */
  lastLabel: string | null = null;

  constructor() {
    this.items = Object.fromEntries(ITEM_IDS.map((id) => [id, ITEMS[id].mesh()])) as Record<ItemId, THREE.Object3D>;
    this.root.add(...Object.values(this.items));
    for (const layout of WORKSHOP_LAYOUTS) {
      const meshes = WORKSHOP_TASKS[layout].steps.map((st) => {
        const m = GOAL_MESHES[st.goal.kind](st.goal);
        m.position.set(st.goal.pos[0], TABLE.top, st.goal.pos[2]);
        return m;
      });
      meshes.push(...(WORKSHOP_TASKS[layout].scenery?.() ?? []));
      for (const m of meshes) {
        m.visible = false;
        this.root.add(m);
      }
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
