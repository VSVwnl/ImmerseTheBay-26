// Fixed dataset camera: 96x96, sees the table, arm, bins and a large area of wall. Only DATASET_LAYER.
import * as THREE from 'three';
import { DATASET_CAMERA } from '../config';
import { DATASET_LAYER } from '../scene/stage';
import { IMG } from './obs';

export class DatasetCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly target: THREE.WebGLRenderTarget;
  private rgba = new Uint8Array(IMG * IMG * 4);
  readonly rgb = new Uint8Array(IMG * IMG * 3);

  constructor() {
    this.camera = new THREE.PerspectiveCamera(DATASET_CAMERA.fov, 1, 0.05, 20);
    this.camera.position.set(...DATASET_CAMERA.pos);
    this.camera.lookAt(...DATASET_CAMERA.lookAt);
    this.camera.layers.set(DATASET_LAYER);
    this.target = new THREE.WebGLRenderTarget(IMG, IMG, {
      colorSpace: THREE.SRGBColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      samples: 0,
    });
  }

  /** Render the scene and read back upright RGB bytes (WebGL reads bottom-up; rows are flipped here). */
  capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene): Uint8Array {
    const xrEnabled = renderer.xr.enabled;
    const prevTarget = renderer.getRenderTarget();
    renderer.xr.enabled = false; // render with this camera, not the headset's
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, this.camera);
    renderer.readRenderTargetPixels(this.target, 0, 0, IMG, IMG, this.rgba);
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = xrEnabled;
    for (let y = 0; y < IMG; y++) {
      const src = (IMG - 1 - y) * IMG * 4;
      const dst = y * IMG * 3;
      for (let x = 0; x < IMG; x++) {
        this.rgb[dst + x * 3] = this.rgba[src + x * 4];
        this.rgb[dst + x * 3 + 1] = this.rgba[src + x * 4 + 1];
        this.rgb[dst + x * 3 + 2] = this.rgba[src + x * 4 + 2];
      }
    }
    return this.rgb;
  }

  /** Draw the last capture into a canvas (preview / thumbnails). */
  toCanvas(canvas: HTMLCanvasElement, rgb: Uint8Array = this.rgb): HTMLCanvasElement {
    canvas.width = IMG;
    canvas.height = IMG;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(IMG, IMG);
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
      img.data[j] = rgb[i];
      img.data[j + 1] = rgb[i + 1];
      img.data[j + 2] = rgb[i + 2];
      img.data[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

export function rgbToBase64(rgb: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < rgb.length; i += CH) s += String.fromCharCode(...rgb.subarray(i, i + CH));
  return btoa(s);
}
