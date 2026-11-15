// In-world panels (canvas textures) with poke buttons, mirrored as plain HTML on desktop.
import * as THREE from 'three';
import { PANEL_FACE_POINT, PANEL_PX_PER_M, POKE_DEPTH, type Vec3 } from '../config';
import { PokeLatch } from './poke';

export interface PanelButton {
  id: string;
  label: string;
  active?: boolean; // highlighted (e.g. current world)
  disabled?: boolean;
  wide?: boolean; // spans the full row
  newRow?: boolean; // starts a new row (e.g. tools below arms)
}

export interface PanelLine {
  text: string;
  size?: number; // px at panel resolution
  color?: string;
  mono?: boolean;
  bold?: boolean;
  align?: 'left' | 'center';
}

export interface PanelContent {
  title?: string;
  lines?: PanelLine[];
  buttons?: PanelButton[];
  cols?: number;
  flash?: string | null; // background flash color
  hidden?: boolean;
}

interface ButtonRect {
  id: string;
  x: number; // meters, panel-local, origin at panel center, +x right, +y up
  y: number;
  w: number;
  h: number;
  disabled?: boolean;
}

export type PressHandler = (panel: string, buttonId: string) => void;

export class Panel {
  /** 3D panels only show in the headset; desktop uses the HTML mirror. */
  static inScene = false;
  readonly mesh: THREE.Mesh;
  readonly html: HTMLDivElement;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private content: PanelContent = {};
  private key = '';
  private rects: ButtonRect[] = [];
  private latch = new PokeLatch();

  constructor(
    readonly name: string,
    readonly w: number,
    readonly h: number,
    pos: Vec3,
    private onPress: PressHandler,
    htmlParent: HTMLElement,
  ) {
    this.canvas.width = Math.round(w * PANEL_PX_PER_M);
    this.canvas.height = Math.round(h * PANEL_PX_PER_M);
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false }),
    );
    this.mesh.position.set(...pos);
    const face = new THREE.Vector3(PANEL_FACE_POINT[0], pos[1], PANEL_FACE_POINT[2]);
    this.mesh.lookAt(face);
    this.mesh.name = `panel:${name}`;

    this.html = document.createElement('div');
    this.html.className = `panel panel-${name}`;
    this.html.dataset.panel = name;
    htmlParent.appendChild(this.html);
  }

  set(content: PanelContent): void {
    const key = JSON.stringify(content);
    if (key === this.key) return;
    this.key = key;
    this.content = content;
    this.html.style.display = content.hidden ? 'none' : '';
    this.draw();
    this.drawHtml();
  }

  private layoutButtons(): ButtonRect[] {
    const btns = this.content.buttons ?? [];
    const cols = this.content.cols ?? 1;
    const pad = 0.012;
    const bh = 0.05;
    const rects: ButtonRect[] = [];
    // count rows from the bottom
    const rows: PanelButton[][] = [];
    let row: PanelButton[] = [];
    for (const b of btns) {
      if (b.newRow && row.length) {
        rows.push(row);
        row = [];
      }
      if (b.wide) {
        if (row.length) rows.push(row);
        rows.push([b]);
        row = [];
        continue;
      }
      row.push(b);
      if (row.length === cols) {
        rows.push(row);
        row = [];
      }
    }
    if (row.length) rows.push(row);
    const nRows = rows.length;
    rows.forEach((r, ri) => {
      const n = r[0]?.wide ? 1 : cols;
      const bw = (this.w - pad * (n + 1)) / n;
      const yTop = -this.h / 2 + pad + (nRows - ri) * (bh + pad) - pad;
      r.forEach((b, ci) => {
        rects.push({
          id: b.id,
          x: -this.w / 2 + pad + ci * (bw + pad) + bw / 2,
          y: yTop - bh / 2,
          w: bw,
          h: bh,
          disabled: b.disabled,
        });
      });
    });
    return rects;
  }

  private draw(): void {
    const { ctx, canvas, content } = this;
    const W = canvas.width;
    const H = canvas.height;
    const s = PANEL_PX_PER_M;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = content.flash ?? 'rgba(14,16,22,0.88)';
    roundRect(ctx, 0, 0, W, H, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    ctx.stroke();
    let y = 16;
    if (content.title) {
      ctx.fillStyle = '#9fb3c8';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(content.title.toUpperCase(), 20, y);
      y += 38;
    }
    for (const l of content.lines ?? []) {
      const size = l.size ?? 28;
      ctx.font = `${l.bold ? 'bold ' : ''}${size}px ${l.mono ? 'ui-monospace, Consolas, monospace' : 'system-ui, sans-serif'}`;
      ctx.fillStyle = l.color ?? '#eef2f6';
      ctx.textBaseline = 'top';
      if (l.align === 'center') {
        ctx.textAlign = 'center';
        ctx.fillText(l.text, W / 2, y);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(l.text, 20, y);
      }
      y += size * 1.25;
    }
    this.rects = this.layoutButtons();
    const byId = new Map((content.buttons ?? []).map((b) => [b.id, b]));
    for (const r of this.rects) {
      const b = byId.get(r.id)!;
      const px = (r.x - r.w / 2 + this.w / 2) * s;
      const py = (this.h / 2 - (r.y + r.h / 2)) * s;
      ctx.fillStyle = b.disabled ? 'rgba(80,80,90,0.5)' : b.active ? '#f28a1e' : '#2b3a52';
      roundRect(ctx, px, py, r.w * s, r.h * s, 10);
      ctx.fill();
      ctx.fillStyle = b.disabled ? '#888' : '#fff';
      ctx.font = `bold ${Math.round(r.h * s * 0.42)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, px + (r.w * s) / 2, py + (r.h * s) / 2, r.w * s - 12);
    }
    this.tex.needsUpdate = true;
  }

  private drawHtml(): void {
    const { content } = this;
    const el = this.html;
    el.replaceChildren();
    el.style.background = content.flash ?? '';
    if (content.title) {
      const t = document.createElement('div');
      t.className = 'panel-title';
      t.textContent = content.title;
      el.appendChild(t);
    }
    for (const l of content.lines ?? []) {
      const d = document.createElement('div');
      d.className = 'panel-line' + (l.mono ? ' mono' : '') + (l.bold ? ' bold' : '');
      d.style.color = l.color ?? '';
      if (l.size && l.size >= 40) d.style.fontSize = '1.5em';
      d.textContent = l.text;
      el.appendChild(d);
    }
    const bwrap = document.createElement('div');
    bwrap.className = 'panel-buttons';
    bwrap.style.gridTemplateColumns = `repeat(${content.cols ?? 1}, 1fr)`;
    for (const b of content.buttons ?? []) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      btn.dataset.id = b.id;
      btn.disabled = !!b.disabled;
      if (b.active) btn.classList.add('active');
      if (b.wide) btn.style.gridColumn = '1 / -1';
      else if (b.newRow) btn.style.gridColumnStart = '1';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onPress(this.name, b.id);
      });
      bwrap.appendChild(btn);
    }
    el.appendChild(bwrap);
  }

  /** Feed fingertip world positions every frame; fires buttons on entry with debounce. */
  /** call every frame */
  sync(): void {
    this.mesh.visible = Panel.inScene && !this.content.hidden;
  }

  poke(tips: THREE.Vector3[], nowMs: number): void {
    if (!this.mesh.visible || !this.rects.length) return;
    const local = new THREE.Vector3();
    const nowInside = new Set<string>();
    for (const tip of tips) {
      local.copy(tip);
      this.mesh.worldToLocal(local);
      if (Math.abs(local.z) > POKE_DEPTH) continue;
      for (const r of this.rects) {
        if (r.disabled) continue;
        if (Math.abs(local.x - r.x) <= r.w / 2 && Math.abs(local.y - r.y) <= r.h / 2) nowInside.add(r.id);
      }
    }
    const fired = this.latch.update(nowInside, nowMs);
    if (fired) this.onPress(this.name, fired);
  }

  /** World position of a button's center (tests use it to poke). */
  buttonWorld(id: string): THREE.Vector3 | null {
    const r = this.rects.find((q) => q.id === id);
    if (!r) return null;
    this.mesh.updateMatrixWorld();
    return this.mesh.localToWorld(new THREE.Vector3(r.x, r.y, 0));
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
