// Stub world: an animated canvas turned into a video element. No network, no assets.
import type { World, WorldDef, WorldStatus } from './world';

const PALETTES: Record<string, [string, string, string]> = {
  lab: ['#dfe7ee', '#9fb4c7', '#5c7186'],
  'night-market': ['#1a0630', '#d12a6a', '#1e5bd8'],
  warehouse: ['#2c3440', '#7d8a99', '#d8b13a'],
  'lunar-base': ['#05060a', '#5d5f66', '#2b5fa8'],
  kitchen: ['#f3d9a8', '#b8743d', '#6b3b1d'],
  greenhouse: ['#d9f2c7', '#4f9a3d', '#1f5a2a'],
  factory: ['#3a3d42', '#a0a4ab', '#f08a24'],
  beach: ['#ffb36b', '#ff6f3c', '#2a6f9e'],
  subway: ['#e9ecef', '#c7cdd3', '#e5c02a'],
  forest: ['#1c2f55', '#5b7fb6', '#e8f0ff'],
  desert: ['#f2a65a', '#b8462e', '#5e1f14'],
};

export class StubWorld implements World {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private video: HTMLVideoElement;
  private def: WorldDef | null = null;
  private t0 = performance.now();
  private raf = 0;
  private timer = 0;
  private fade = 1;
  private prevPal: [string, string, string] | null = null;
  private overlay = '';

  constructor(width = 1280, height = 720) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.video.loop = true;
    this.draw();
    this.video.srcObject = this.canvas.captureStream(30);
    // Keep drawing even when rAF is throttled (XR session owns the frame loop).
    this.timer = window.setInterval(() => this.draw(), 1000 / 30);
  }

  async connect(): Promise<void> {}

  async setWorld(def: WorldDef): Promise<void> {
    this.prevPal = this.def ? (PALETTES[this.def.id] ?? PALETTES.lab) : null;
    this.def = def;
    this.fade = 0;
  }

  getVideo(): HTMLVideoElement {
    return this.video;
  }

  status(): WorldStatus {
    return 'stub';
  }

  current(): WorldDef | null {
    return this.def;
  }

  async disconnect(): Promise<void> {
    cancelAnimationFrame(this.raf);
    clearInterval(this.timer);
  }

  /** Text drawn over the stub, e.g. "Loading live world..." while Orbis connects. */
  setOverlay(text: string): void {
    this.overlay = text;
  }

  /** Expose the canvas so non-video paths (tests) can read it. */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  private draw = () => {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const t = (performance.now() - this.t0) / 1000;
    const pal = PALETTES[this.def?.id ?? 'lab'] ?? PALETTES.lab;
    this.fade = Math.min(1, this.fade + 1 / 45);
    const paint = (p: [string, string, string], alpha: number) => {
      ctx.globalAlpha = alpha;
      const g = ctx.createLinearGradient(0, 0, w * (0.5 + 0.5 * Math.sin(t * 0.2)), h);
      g.addColorStop(0, p[0]);
      g.addColorStop(0.55 + 0.1 * Math.sin(t * 0.5), p[1]);
      g.addColorStop(1, p[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };
    if (this.prevPal && this.fade < 1) paint(this.prevPal, 1);
    paint(pal, this.prevPal ? this.fade : 1);
    ctx.globalAlpha = 1;
    // moving soft blobs so motion is obvious
    for (let i = 0; i < 6; i++) {
      const x = w * (0.5 + 0.42 * Math.sin(t * (0.13 + i * 0.05) + i * 1.7));
      const y = h * (0.5 + 0.35 * Math.cos(t * (0.11 + i * 0.04) + i));
      const r = h * (0.08 + 0.04 * i);
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,0.22)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // horizon line
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, h * 0.62, w, h * 0.38);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `bold ${Math.round(h * 0.09)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.def?.label ?? 'Backlot', w / 2, h * 0.3);
    ctx.font = `${Math.round(h * 0.035)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(this.overlay ? '' : 'stub world', w / 2, h * 0.4);
    if (this.overlay) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, h * 0.45, w, h * 0.12);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(h * 0.05)}px system-ui, sans-serif`;
      const dots = '.'.repeat(1 + (Math.floor(t * 2) % 3));
      ctx.fillText(this.overlay + dots, w / 2, h * 0.51);
    }
  };
}
