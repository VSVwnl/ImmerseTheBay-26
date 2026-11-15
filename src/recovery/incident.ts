import type { WorldDef, WorldStatus } from '../world/world';
import { ORBIS_MODEL } from '../config';
import type { Side } from './engine';

export const PACK_STATION: WorldDef = {
  id: 'parcel-station',
  label: 'Parcel induction station',
  prompt: 'Locked, level, wide camera on a warehouse parcel induction bench. Clear straight transfer lane down the middle, with low metal side rails on the left and right. A single bright blue plastic tote waits beside the workbench. A brown carton and its destination tray stay in place under white work lights.',
};

export interface IncidentWorld {
  current(): WorldDef | null;
  setWorld(def: WorldDef, mode: 'fresh'): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  status(): WorldStatus;
  getVideo(): HTMLVideoElement;
  steerIncident(prompt: string, signal: AbortSignal): Promise<void>;
  lastError: string;
}

export interface IncidentFrame {
  image: string;
  mediaTime: number;
  capturedAt: string;
}

export interface IncidentEvidence {
  id?: string; // Optional when loading an earlier saved observation.
  number?: number;
  source: 'practice' | 'orbis';
  side: Side;
  requestedSide: Side;
  prompt: string | null;
  model: typeof ORBIS_MODEL | null;
  stationPrompt: string | null;
  frame: IncidentFrame | null;
  observedAt: string;
}

export function incidentPrompt(side: Side): string {
  return `The blue tote slides in from the ${side} edge of the station and stops halfway into the central transfer lane, leaving the opposite side open.`;
}

/** The only model output used to choose geometry is a frame the operator can inspect. */
export function captureFrame(video: HTMLVideoElement): IncidentFrame {
  if (video.readyState < 2 || video.videoWidth < 1 || video.videoHeight < 1) {
    throw new Error('Wait for a decoded Orbis video frame.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(video.videoWidth, 640);
  canvas.height = Math.max(1, Math.round(canvas.width * video.videoHeight / video.videoWidth));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The browser could not capture this video frame.');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return { image: canvas.toDataURL('image/jpeg', 0.78), mediaTime: video.currentTime, capturedAt: new Date().toISOString() };
}

/** Wait for decoded frames. Connecting to Reactor can finish while the video is still black. */
export async function openStation(world: IncidentWorld, signal: AbortSignal): Promise<void> {
  if (world.current()?.id !== PACK_STATION.id) await world.setWorld(PACK_STATION, 'fresh');
  signal.throwIfAborted();
  if (world.status() !== 'live' && world.status() !== 'loading') await world.connect();
  signal.throwIfAborted();
  const deadline = Date.now() + 45000;
  while (world.status() === 'loading' && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    signal.throwIfAborted();
  }
  if (world.status() !== 'live') throw new Error(world.lastError || 'Orbis has no live frames. Check the team key and connection.');
}
