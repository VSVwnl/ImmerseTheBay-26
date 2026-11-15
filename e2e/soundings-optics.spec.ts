import { expect, test } from '@playwright/test';

// Exercise the actual browser video + GPU path with controlled decoded frames. The
// fixture makes the optical comparison reproducible without a paid Orbis session.
test('Soundings sensor responds to incoming pixels and relights the same recorded frame', async ({ page }) => {
  await page.route('**/optical-fixture.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<canvas id="scene"></canvas>' }),
  );
  await page.goto('/optical-fixture.html');
  const result = await page.evaluate(async () => {
    const load = (url: string) => import(url);
    const [{ createCore }, { SoundingsScene }, { SoundingsMission }] = await Promise.all([
      load('/src/core.ts'),
      load('/src/soundings/scene.ts'),
      load('/src/soundings/mission.ts'),
    ]);
    const { renderer } = createCore();
    const view = new SoundingsScene(renderer);
    const rig = { arm: 'port', lamp: 'inner', aim: 'inward' };
    const mission = new SoundingsMission('canyon', rig);
    view.update(mission.state, rig, 'canyon', 0);
    const source = document.createElement('canvas');
    source.width = 256;
    source.height = 144;
    const paint = source.getContext('2d')!;
    const stream = source.captureStream(0),
      track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    const nextFrame = async (field: boolean) => {
      const visible = new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve()));
      paint.fillStyle = '#102931';
      paint.fillRect(0, 0, 256, 144);
      if (field) {
        for (let y = 0; y < 144; y += 8)
          for (let x = 0; x < 256; x += 8) {
            paint.fillStyle = (x + y) % 16 ? '#cde6df' : '#f6fff0';
            paint.fillRect(x, y, 7, 7);
          }
      }
      track.requestFrame();
      await visible;
    };
    const play = video.play();
    await nextFrame(false);
    await play;
    view.setWater(video, true);
    view.renderPilot();
    const clear = view.captureEvidence();
    await nextFrame(true);
    view.renderPilot();
    const dense = view.captureEvidence();
    const repeat = view.compareEvidence(dense, rig);
    const outer = view.compareEvidence(dense, { ...rig, lamp: 'starboard' });
    // Inspect the stamped symbol on the cage as seen from the actual mast.
    const pos = view.pilotCamera.position.clone().set(0.282, 0.823, -0.472).project(view.pilotCamera);
    const px = Math.round(((pos.x + 1) * dense.pilot.width) / 2),
      py = Math.round(((1 - pos.y) * dense.pilot.height) / 2);
    function meanDelta(a: HTMLCanvasElement, b: HTMLCanvasElement) {
      const sample = (c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(px - 8, py - 8, 16, 16).data;
      const left = sample(a),
        right = sample(b);
      let total = 0;
      for (let i = 0; i < left.length; i += 4) total += Math.abs(left[i + 1] - right[i + 1]);
      return total / (left.length / 4);
    }
    // Measure the printed ring and surrounding paper separately at their projected
    // positions. A difference elsewhere in the scene cannot pass this legibility check.
    function symbolContrast(image: HTMLCanvasElement) {
      const center = view.pilotCamera.position.clone().set(0.282, 0.823, -0.472);
      const normal = center.clone().set(-0.38, 0.35, -0.59).normalize();
      const face = view.pilotCamera.quaternion.clone().setFromUnitVectors(center.clone().set(0, 0, 1), normal);
      const pixels = image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data;
      function medianLuminance(radius: number) {
        const samples: number[] = [];
        for (let n = 0; n < 24; n++) {
          const angle = (n * Math.PI) / 12;
          const p = center
            .clone()
            .set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
            .applyQuaternion(face)
            .add(center)
            .project(view.pilotCamera);
          const x = Math.floor(((p.x + 1) * image.width) / 2),
            y = Math.floor(((1 - p.y) * image.height) / 2);
          const i = (y * image.width + x) * 4;
          const linear = (v: number) => ((v / 255 + 0.055) / 1.055) ** 2.4;
          samples.push(
            0.2126 * linear(pixels[i]) + 0.7152 * linear(pixels[i + 1]) + 0.0722 * linear(pixels[i + 2]),
          );
        }
        samples.sort((a, b) => a - b);
        return (samples[11] + samples[12]) / 2;
      }
      return (medianLuminance(0.064 * 0.075) + 0.05) / (medianLuminance((0.064 * 34) / 128) + 0.05);
    }
    view.setWater(null, false);
    view.setTurbidity(true);
    view.renderPilot();
    const practice = view.captureEvidence();
    const rakingPractice = view.compareEvidence(practice, { ...rig, lamp: 'starboard' });
    const values = {
      clearSource: clear.source,
      denseSource: dense.source,
      waterChanged: clear.water.toDataURL() !== dense.water.toDataURL(),
      inputDelta: meanDelta(clear.pilot, dense.pilot),
      lampDelta: meanDelta(dense.pilot, outer),
      repeatMatches: dense.pilot.toDataURL() === repeat.toDataURL(),
      advanced: dense.mediaTime >= clear.mediaTime,
      center: [px, py],
      nearContrast: symbolContrast(practice.pilot),
      rakingContrast: symbolContrast(rakingPractice),
      denseContrast: symbolContrast(dense.pilot),
      clearContrast: symbolContrast(clear.pilot),
    };
    stream.getTracks().forEach((track) => track.stop());
    video.pause();
    renderer.dispose();
    return values;
  });
  expect(result.clearSource).toBe('live');
  expect(result.denseSource).toBe('live');
  expect(result.waterChanged).toBe(true);
  expect(result.advanced).toBe(true);
  expect(result.inputDelta).toBeGreaterThan(12);
  expect(result.lampDelta).toBeGreaterThan(8);
  expect(result.repeatMatches).toBe(true);
  expect(result.clearContrast).toBeGreaterThan(result.denseContrast * 1.5);
  expect(result.nearContrast).toBeLessThan(2);
  expect(result.rakingContrast).toBeGreaterThan(3);
  test.info().annotations.push({ type: 'pilot symbol measurements', description: JSON.stringify(result) });
});
