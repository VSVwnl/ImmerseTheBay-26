# Backlot

Teach a robot a task once in VR, let a live world model show it that task in a hundred different
worlds, then watch it do the task alone in a world it has never seen.

Built for Immerse the Bay 2026 (Stanford XR hackathon). Runs in the Quest Browser on a Meta Quest 3
via WebXR, and on a laptop browser with a mouse.

- You control a simulated robot arm with your hand (or the mouse) and complete three challenges:
  **Reach**, **Place**, **Sort**. Every attempt is recorded (time, success, arm motion).
- Behind the arm is a large curved wall showing a live AI-generated world from
  **Visko Orbis** (a real-time video model). You switch worlds with buttons.
- Later milestones replay your demos in front of many generated worlds to build an image dataset,
  train a small camera-based policy on it, and let the trained robot do the task alone.

## What is real and what is simulated

- The arm is simulated and kinematic (closed-form IK, snap-to-grab, no physics engine).
- Orbis generates only the video on the wall behind the arm. It does not simulate the robot.
- Nothing here claims to improve a real robot. Results are reported only as measured.

## Run it

Requirements: Node 18+. Python 3.10+ with PyTorch for the data and training milestones.

```bash
npm install
npm run dev          # http://localhost:5173
```

**Without a key** the wall runs on a built-in stub world (an animated canvas, no network).
Everything works except the live Orbis stream.

**With a key**, copy `.env.example` to `.env` and set `REACTOR_API_KEY=rk_...`. The key is read
only by the dev server, which mints short-lived session tokens; it is never sent to the browser.

### Desktop controls

| Input | Action |
| --- | --- |
| Mouse move | arm target follows the cursor (horizontal plane) |
| Wheel or W / S | raise / lower the target |
| Click or Space | toggle the gripper |
| 1 to 6 | switch world |

### Quest 3

```bash
adb reverse tcp:5173 tcp:5173
```

Open `http://localhost:5173` in Quest Browser and press Enter VR. The right hand drives the arm
(pinch to grip); poke the panels with a fingertip. Controllers work as a fallback (grip pose +
trigger). The headset still needs internet for the Orbis stream.

### Hologram control (`?holo=1`)

Open `http://localhost:5173/?holo=1` (add `&orbis=0` to stay on the stub wall). A small cyan hologram of the
arm stands on a magenta projector puck; the real arm copies whatever you do to the hologram.

| Where | Show the hologram | Move the arm | Gripper |
| --- | --- | --- | --- |
| Desktop | always, on a pedestal left of the table | drag the hologram's tip (wheel or W/S: height) | click the tip without dragging, or Space |
| Quest, hands | turn your left palm up | pinch the hologram's tip with your right hand and drag | a quick pinch on the tip |
| Quest, controllers | left controller holds it | right trigger on the tip and drag | a quick trigger pull on the tip |

The hologram is 0.3 of the real size in the headset (0.35 on desktop), so 1 cm of hand movement moves the
real arm about 3 cm. Drags are relative: grabbing never makes the arm jump. Challenges, recording and
Multiply work as usual (the recorded input is still `hand` / `controller` / `mouse`). During Multiply or Robot's
turn the hologram only mirrors the arm. It is never in the dataset camera's view. Numbers live in `HOLO` in
`src/config.ts`. Without `?holo=1` nothing changes.

### Multiply, data factory, training, evaluation

Python setup (one time). PyTorch must support your GPU; RTX 50-series needs a CUDA 12.8+ build:

```bash
python -m venv --system-site-packages .venv
.venv/Scripts/python -m pip install websockets pytest
```

1. **Multiply** (in the app): finish the challenges, then press *Multiply my Place demo*. Your Place
   demo replays in all eight training worlds while a counter and a thumbnail wall fill.
2. **Build datasets** (laptop browser, needs the live wall for `single` and `multi`):

   ```bash
   .venv/Scripts/python py/data_server.py
   node scripts/run-factory.mjs "dataset=multi&episodes=2000"
   node scripts/run-factory.mjs "dataset=single&episodes=2000"
   .venv/Scripts/python py/view_dataset.py data/datasets/multi     # contact sheet
   ```

   Without a key, use `dataset=smoke-multi&schedule=multi` (stub walls, pipeline testing only).
   On the smoke data, 300 episodes per dataset was too few for the policies to learn the task; 2,000 worked.
3. **Train** (same code and settings for both, 15 minutes each; run the overfit check first). The image head
   is a spatial-softmax keypoint layer by default; `--pool avg` gives the spec's global-average-pooling model:

   ```bash
   .venv/Scripts/python py/train.py --data data/datasets/multi --overfit 5
   .venv/Scripts/python py/train.py --data data/datasets/multi  --out data/ckpt/multi.pt
   .venv/Scripts/python py/train.py --data data/datasets/single --out data/ckpt/single.pt
   ```
4. **Evaluate** (stop the data server first; both use port 8765):

   ```bash
   .venv/Scripts/python py/serve.py --ckpt multi=data/ckpt/multi.pt --ckpt single=data/ckpt/single.pt
   node scripts/run-eval.mjs            # or open /?mode=eval and press Run
   .venv/Scripts/python py/report.py
   ```
5. **Robot's turn** (M5): with `serve.py` running and a summary present, the results card shows
   *Robot's turn*. In the headset also run `adb reverse tcp:8765 tcp:8765`.

### Tests

```bash
npm test                                   # unit tests
npm run e2e                                # Playwright end-to-end in headed Chromium
.venv/Scripts/python -m pytest py/tests    # data server, training, serving, report
```

## Docs

- [docs/PLAN.md](docs/PLAN.md) — milestones, demo script, what we may and may not claim
- [docs/SPEC-M1-app.md](docs/SPEC-M1-app.md) — arm, challenges, recording
- [docs/SPEC-M2-orbis.md](docs/SPEC-M2-orbis.md) — live Orbis wall
- [docs/SPEC-M3-factory.md](docs/SPEC-M3-factory.md) — data factory
- [docs/SPEC-M4-policy.md](docs/SPEC-M4-policy.md) — policy training, evaluation, live mode
- [docs/STATUS.md](docs/STATUS.md) — current build status

## License

MIT. See [LICENSE](LICENSE).
