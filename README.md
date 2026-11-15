# Backlot Recovery

A warehouse robot's routine fails when a tote enters its path. In Backlot Recovery, an operator steers a live Visko Orbis warehouse feed, identifies the obstruction and teaches a simulated arm how to complete the pick. The station saves the motion, replays it hands-free and scores it again on a changed layout.

Built for Meta Quest Browser with Three.js and WebXR. The judging targets are **Visko Living Worlds · Best Commercial Use Case** and **Stanford AI Horizons**.

[Watch the desktop rehearsal](docs/media/backlot-recovery.mp4) · [Measured rehearsal results](docs/rehearsal.md) · [90-second pitch and Devpost copy](docs/submission.md)

## Start the station

Use Node 22.12+ or Node 24 and a recent Chromium browser. Only the optional legacy model tooling uses Python.

```sh
npm ci
npm run dev
```

Open **http://localhost:5173/** for the operator console. Open **http://localhost:5173/?mode=spectator** in another window on the same computer for the audience. The spectator receives the running workcell, paths, source preview and measurements. The host prioritizes a connected immersive session.

For a built rehearsal, run `npm run build`, stop the dev server, and run `npm run preview`. This serves both the production assets and the same-origin recording, cast and token endpoints.

## Connect Orbis and Quest

1. Put your team key in `REACTOR_API_KEY` in a root `.env` file using `.env.example` as the template. Start or restart the server. The server mints scoped tokens. Keep the team key on the host.
2. Connect a USB-debugging-enabled Quest and authorize the computer inside the headset. Run `adb devices -l`, then `adb reverse tcp:5173 tcp:5173`. Open **http://localhost:5173/** in Quest Browser and choose **Enter VR**. Keep the headset online for Orbis.
3. Watch the automatic clear pick. Choose **Steer left** or **Steer right**. Inspect the generated camera view, freeze a frame when a blue tote is visible and mark its actual side. A second steering command changes the running stream. The confirmed side instantiates a calibrated tote in the simulated cell.
4. For offline practice, choose **Local rehearsal** after the clear pick, or open **http://localhost:5173/?orbis=0**. This mode displays a diagram and uses a labeled local obstacle. The export records the source of every incident.

## Rehearse the recovery

| Beat | Operator action and evidence |
| --- | --- |
| Clear lane | Watch the initial carton reach the yellow outfeed tray. |
| Blockage | Confirm a visible Orbis incident or introduce the local rehearsal tote. The red path ends at the first gripper or payload contact. |
| Teach | Choose **Teach recovery**. Bring an open right hand toward the starting tool. Guide the amber target around the tote, pinch while the gripper is at the carton, carry it clear, then release over the tray. The arm points downward. The left hand operates the panels while recording. |
| Replay | Successful placement automatically processes the demonstration. Lift your hands and choose **Replay skill**. The motion executes from the original pre-pick state. Compare completion, path length, contact count and elapsed simulation time. |
| Challenge | Choose **Next incident**. For Orbis, inspect and confirm the new frame. The saved skill is tested against the updated obstruction. You can teach another path if it hits the tote. |
| Restore or reset | **Reset** starts a clean judging session. **Load saved skill** restores the latest saved demonstration and its original conditions after a reload, in the same browser profile and origin. |

On desktop, move the mouse over the 3D workcell to set horizontal position, use **W/S** or the **wheel** for height, and **click** or press **Space** to toggle the gripper. With the left-side practice tote, its free end is on the right. Move sideways on the near side before reaching back for the carton. For a changed-layout test that genuinely challenges the saved skill, use that free side in both directions.

## What the data captures

Each attempt runs at 30 Hz in a local-floor, Y-up frame in metres. Samples retain tool targets, measured tip pose, joint angles, grip state, carton position and available hand tracking. At tracking loss the arm holds its pose. Collision events identify the moving part, contacted position and simulation time. The simulator checks individual fingers, palm and carton against the tote. It measures successful release in the destination tray and integrates actual tip travel.

A successful teaching episode yields approach, grasp, transport and release spans. A phase-local smoother and time-aware keyframe reduction pin the actual grip transitions. Backlot executes the processed commands in a fresh simulator and checks outcome, contact count, grasp timing and trajectory tolerance before offering the skill. Replay uses the saved demonstration. The earlier visual policy experiment is documented separately in [the original project status](docs/STATUS.md).

**Export episode** exports the recorded trials, raw samples, calibration, Orbis evidence for live trials, skill and measured metrics as JSON. The browser keeps the last restorable skill in IndexedDB. The host also writes independent trial files under `data/recovery/<session-id>/`, including failures. Origin changes (for example, switching between `localhost` and `127.0.0.1`) create separate browser storage.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm run e2e -- e2e/recovery.spec.ts e2e/recovery-stream.spec.ts
```

The operator test drives mouse and keyboard, reloads the saved skill, tries a new incident, checks the spectator and verifies disk and JSON outputs. The stream test runs a labeled local video fixture through the Orbis client to check frame confirmation, re-steering and reconnect behavior. See [the rehearsal report](docs/rehearsal.md) for actual run results and the remaining physical headset and team-key check.

## Original training workbench

The original Reach, Place and Sort challenges remain at **http://localhost:5173/?mode=app**. Factory and evaluation modes retain their existing routes. The following setup applies to that earlier experiment.

The legacy factory, model and regression tests use Python. Set up a virtual environment and use a PyTorch build compatible with your machine. On macOS or Linux:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install numpy pillow torch 'websockets>=15' pytest
```

On Windows, create the environment with `py -m venv .venv` and activate it with `.venv\Scripts\Activate.ps1` in PowerShell. Use the activated environment for the commands below.

1. **Multiply** (in the app): finish the challenges, then press *Multiply my Place demo*. Your Place
   demo replays in all eight training worlds while a counter and a thumbnail wall fill.
2. **Build datasets** (laptop browser, needs the live wall for `single` and `multi`):

   ```bash
   python py/data_server.py
   node scripts/run-factory.mjs "dataset=multi&episodes=2000"
   node scripts/run-factory.mjs "dataset=single&episodes=2000"
   python py/view_dataset.py data/datasets/multi     # contact sheet
   ```

   Without a key, use `dataset=smoke-multi&schedule=multi` (stub walls, pipeline testing only).
   On the smoke data, 300 episodes per dataset was too few for the policies to learn the task; 2,000 worked.
3. **Train** (same code and settings for both, 15 minutes each; run the overfit check first). The image head
   is a spatial-softmax keypoint layer by default; `--pool avg` gives the spec's global-average-pooling model:

   ```bash
   python py/train.py --data data/datasets/multi --overfit 5
   python py/train.py --data data/datasets/multi  --out data/ckpt/multi.pt
   python py/train.py --data data/datasets/single --out data/ckpt/single.pt
   ```
4. **Evaluate** (stop the data server first; both use port 8765):

   ```bash
   python py/serve.py --ckpt multi=data/ckpt/multi.pt --ckpt single=data/ckpt/single.pt
   node scripts/run-eval.mjs            # or open /?mode=eval and press Run
   python py/report.py
   ```
5. **Robot's turn** (M5): with `serve.py` running and a summary present, the results card shows
   *Robot's turn*. In the headset also run `adb reverse tcp:8765 tcp:8765`.

### Tests

```bash
npm test                                   # unit tests
npm run e2e                                # Playwright end-to-end in Chromium
python -m pytest py/tests    # data server, training, serving, report
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
