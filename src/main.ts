export {};
// Renderer, scene, loop, mode switch (app / factory / eval).

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

const mode = new URLSearchParams(location.search).get('mode') ?? 'soundings';

async function launch() {
  if (mode === 'soundings' || mode === 'spectator') {
    const { startSoundings } = await import('./soundings/app');
    await startSoundings(mode === 'spectator');
    return;
  }
  const { createCore } = await import('./core');
  const core = createCore();
  if (mode === 'factory') (await import('./factory/factory')).startFactory(core);
  else if (mode === 'eval') (await import('./policy/eval')).startEval(core);
  else (await import('./app')).startApp(core);
}

void launch().catch(error => {
  console.error(error);
  const message = document.createElement('p');
  message.textContent = 'Unable to start the 3D view. Enable WebGL in your browser and reload.';
  document.body.prepend(message);
});
