// Renderer, scene, loop, mode switch (app / factory / eval).
import { createCore } from './core';

declare global {
  interface Window {
    __backlot: unknown;
  }
}

// URL keys are read case-sensitively; typed on a headset keyboard, "?Orbis=0" must still mean orbis=0 (no paid session).
{
  const q = new URLSearchParams(location.search);
  let changed = false;
  for (const [k, v] of [...q]) {
    const low = k.toLowerCase();
    if (k !== low && ['orbis', 'mode', 'tag', 'dataset'].includes(low) && !q.has(low)) {
      q.delete(k);
      q.set(low, v);
      changed = true;
    }
  }
  if (changed) history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
}

const mode = new URLSearchParams(location.search).get('mode') ?? 'recovery';
const core = createCore();

if (mode === 'factory') {
  void import('./factory/factory').then((m) => m.startFactory(core));
} else if (mode === 'eval') {
  void import('./policy/eval').then((m) => m.startEval(core));
} else if (mode === 'app') {
  void import('./app').then((m) => m.startApp(core));
} else {
  void import('./recovery/app').then((m) => m.startRecovery(core));
}
