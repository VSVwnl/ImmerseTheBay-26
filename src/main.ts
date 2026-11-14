// Renderer, scene, loop, mode switch (app / factory / eval).
import { createCore } from './core';

declare global {
  interface Window {
    __backlot: unknown;
  }
}

const mode = new URLSearchParams(location.search).get('mode') ?? 'app';
const core = createCore();

if (mode === 'factory') {
  void import('./factory/factory').then((m) => m.startFactory(core));
} else if (mode === 'eval') {
  void import('./policy/eval').then((m) => m.startEval(core));
} else {
  void import('./app').then((m) => m.startApp(core));
}
