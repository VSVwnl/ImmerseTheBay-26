// Dataset wall: a growing grid of dataset-camera thumbnails, labeled with the world. In-world mesh + HTML mirror.
import * as THREE from 'three';
import { PANEL_FACE_POINT, type Vec3 } from '../config';

export class ThumbWall {
  readonly mesh: THREE.Mesh;
  readonly html: HTMLDivElement;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private thumbs: { img: HTMLCanvasElement; label: string }[] = [];
  static inScene = false;
  visible = false;

  constructor(
    private cols: number,
    private rows: number,
    w: number,
    pos: Vec3,
    htmlParent: HTMLElement,
  ) {
    const cell = 150;
    this.canvas.width = cols * cell;
    this.canvas.height = rows * (cell + 24) + 44;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const h = (w * this.canvas.height) / this.canvas.width;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false }));
    this.mesh.position.set(...pos);
    this.mesh.lookAt(PANEL_FACE_POINT[0], pos[1], PANEL_FACE_POINT[2]);
    this.html = document.createElement('div');
    this.html.className = 'panel panel-thumbs';
    htmlParent.appendChild(this.html);
    this.clear();
  }

  clear(): void {
    this.thumbs = [];
    this.draw();
  }

  add(img: HTMLCanvasElement, label: string): void {
    this.thumbs.push({ img, label });
    this.draw();
  }

  get count(): number {
    return this.thumbs.length;
  }

  sync(): void {
    this.mesh.visible = ThumbWall.inScene && this.visible;
    this.html.style.display = this.visible ? '' : 'none';
  }

  private draw(): void {
    const { ctx, canvas } = this;
    const cell = canvas.width / this.cols;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(14,16,22,0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#9fb3c8';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('DATASET (robot camera view)', 12, 10);
    this.thumbs.forEach((t, i) => {
      const c = i % this.cols;
      const r = Math.floor(i / this.cols);
      if (r >= this.rows) return;
      const x = c * cell + 6;
      const y = 44 + r * (cell + 24);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(t.img, x, y, cell - 12, cell - 12);
      ctx.fillStyle = '#eef2f6';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText(t.label, x, y + cell - 8, cell - 12);
    });
    this.tex.needsUpdate = true;

    this.html.replaceChildren();
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Dataset (robot camera view)';
    this.html.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'thumb-grid';
    for (const t of this.thumbs) {
      const fig = document.createElement('figure');
      const c = document.createElement('canvas');
      c.width = t.img.width;
      c.height = t.img.height;
      c.getContext('2d')!.drawImage(t.img, 0, 0);
      const cap = document.createElement('figcaption');
      cap.textContent = t.label;
      fig.append(c, cap);
      grid.appendChild(fig);
    }
    this.html.appendChild(grid);
  }
}
