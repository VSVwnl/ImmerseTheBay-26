import type { EnvState } from '../env/env';
import type { Incident } from './engine';
import type { IncidentFrame } from './incident';

// Offline preview uses measured workcell coordinates. It never represents a generated video frame.
function drawPlan(ctx: CanvasRenderingContext2D, incident: Incident | null, state: EnvState) {
  const w = ctx.canvas.width,
    h = ctx.canvas.height;
  ctx.fillStyle = '#253631';
  ctx.fillRect(0, 0, w, h);
  const x = (metres: number) => ((metres + 0.48) / 0.96) * w;
  const z = (metres: number) => ((metres + 0.98) / 0.58) * h;
  ctx.strokeStyle = '#42594e';
  ctx.lineWidth = 1;
  for (let i = -0.5; i <= 0.51; i += 0.05) {
    ctx.beginPath();
    ctx.moveTo(x(i), 0);
    ctx.lineTo(x(i), h);
    ctx.stroke();
  }
  for (let i = -1; i <= -0.38; i += 0.05) {
    ctx.beginPath();
    ctx.moveTo(0, z(i));
    ctx.lineTo(w, z(i));
    ctx.stroke();
  }
  ctx.strokeStyle = '#e7bd50';
  ctx.lineWidth = 2;
  ctx.strokeRect(x(-0.38), z(-0.63), x(-0.22) - x(-0.38), z(-0.47) - z(-0.63));
  if (incident) {
    const { min, max } = incident.obstacle;
    ctx.fillStyle = '#327bd3';
    ctx.fillRect(x(min[0]), z(min[2]), x(max[0]) - x(min[0]), z(max[2]) - z(min[2]));
  }
  const pkg = state.cubes.red;
  if (pkg) {
    ctx.fillStyle = '#e8be89';
    ctx.fillRect(x(pkg[0]) - 8, z(pkg[2]) - 8, 16, 16);
  }
  const tip = state.tip;
  ctx.beginPath();
  ctx.strokeStyle = '#ff925e';
  ctx.lineWidth = 2;
  ctx.arc(x(tip[0]), z(tip[2]), 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#c5d7cb';
  ctx.fillText('TOP VIEW  /  SIMULATION', 10, h - 9);
}

export function createMonitor(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let source = '',
    image: HTMLImageElement | null = null;
  let lastDraw = 0;
  return {
    update(
      now: number,
      video: HTMLVideoElement | null,
      frame: IncidentFrame | null,
      incident: Incident | null,
      state: EnvState,
      remoteImage?: string | null,
    ) {
      if (now - lastDraw < 110) return false;
      lastDraw = now;
      const photo = remoteImage ?? frame?.image ?? '';
      if (source !== photo) {
        source = photo;
        if (!photo) image = null;
        else {
          const next = new Image();
          next.onload = () => {
            if (source !== photo) return;
            image = next;
            ctx.drawImage(next, 0, 0, canvas.width, canvas.height);
          };
          next.src = photo;
        }
      }
      if (image?.complete && image.naturalWidth) {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      } else if (video && video.readyState >= 2 && video.videoWidth) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } else if (!photo) drawPlan(ctx, incident, state);
      return true;
    },
  };
}
