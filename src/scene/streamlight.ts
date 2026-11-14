// Polish: light the scene from the wall video. Every 250 ms the video is drawn into a 16x9 canvas;
// the top half sets the hemisphere sky color, the bottom half its ground color, the overall average
// tints the directional light. Colors blend over time so they do not flicker.
import * as THREE from 'three';
import { STREAM_LIGHT } from '../config';

export class StreamLight {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private sky = new THREE.Color(0xdde6ff);
  private ground = new THREE.Color(0x302a26);
  private avg = new THREE.Color(0xffffff);
  private tSky = this.sky.clone();
  private tGround = this.ground.clone();
  private tAvg = this.avg.clone();
  private acc = 0;
  enabled = true;

  constructor(
    private hemi: THREE.HemisphereLight,
    private sun: THREE.DirectionalLight,
    private video: () => HTMLVideoElement,
  ) {
    this.canvas.width = 16;
    this.canvas.height = 9;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  private sample() {
    const v = this.video();
    if (v.readyState < 2 || !v.videoWidth) return;
    try {
      this.ctx.drawImage(v, 0, 0, 16, 9);
      const d = this.ctx.getImageData(0, 0, 16, 9).data;
      const sum = (y0: number, y1: number) => {
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = y0; y < y1; y++)
          for (let x = 0; x < 16; x++) {
            const i = (y * 16 + x) * 4;
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
          }
        return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
      };
      this.tSky = sum(0, 4).lerp(new THREE.Color(1, 1, 1), STREAM_LIGHT.whiteMix);
      this.tGround = sum(5, 9);
      this.tAvg = sum(0, 9).lerp(new THREE.Color(1, 1, 1), STREAM_LIGHT.whiteMix);
    } catch {
      // cross-origin or not ready: keep the current colors
    }
  }

  update(dt: number) {
    if (!this.enabled) return;
    this.acc += dt;
    if (this.acc >= STREAM_LIGHT.periodS) {
      this.acc = 0;
      this.sample();
    }
    const k = 1 - Math.exp(-dt / STREAM_LIGHT.blendS);
    this.sky.lerp(this.tSky, k);
    this.ground.lerp(this.tGround, k);
    this.avg.lerp(this.tAvg, k);
    this.hemi.color.copy(this.sky);
    this.hemi.groundColor.copy(this.ground);
    this.sun.color.copy(this.avg);
  }
}
