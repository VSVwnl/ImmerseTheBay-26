# Status

Updated: Sat Nov 14, 2:35 PM PST

## Current milestone: M4 and M5 done on smoke data (stub walls). Real datasets, results and headset need the key + you

### Done
- **M1** (desktop checks pass): deterministic env, closed-form IK, snap grasp, 30 Hz fixed-step loop + recorder,
  three challenges with countdown/timer/sounds/results card, `/api/log` → `data/sessions/<sessionId>/<attemptId>.json`,
  stub wall, desktop mouse/keys, XR hand + controller input, in-world poke panels with HTML mirror.
- **M2** (code complete, live path verified only against a fake Reactor):
  - `POST /api/token` mints a 6 h token scoped to `reactor/visko-orbis-stable`, `max_sessions: 200`;
    503 without a key; `GET /api/token` reports `{available}` without minting. Same-origin + localhost-host checks.
  - `src/world/orbis.ts` (only file importing the SDK, loaded lazily): token cached in memory, 1080p if offered,
    audio off, morph by default, rapid presses coalesced to one prompt per 4 s, fresh restart after 150 s,
    restart on `generation_complete`, `loading` until frames arrive then `live`, `pagehide` disconnects.
  - `src/world/manager.ts`: connects on the first click / Enter VR when a key exists; falls back to the stub
    (status `stub (live failed)`) on any error. Desktop has a Connect/Disconnect Orbis button.
  - Orbis usage heartbeat → `data/orbis-usage.json`; `GET /api/usage` returns `{sessions, minutes}`.
  - Polish done: scene light follows the wall video; a success sends one short follow-up prompt
    ("Golden confetti falls through the air." etc.); "Say a world" voice button when speech recognition exists.
- **M3**:
  - Part A, Multiply: after the results card, "Multiply my Place demo" replays the latest successful Place attempt
    at 30 Hz in each of the 8 training worlds (morph, 4 s settle, replay). Counter panel "1 demo, N episodes";
    dataset wall with one robot-camera thumbnail per replay, labeled by world; Stop button; challenges work after.
  - Part B, factory (`/?mode=factory&dataset=multi&episodes=300`): dataset camera (spec start values; wall fills
    ~40-45% of the image), scripted expert (100% success on 400 seeds, clean and with burst noise), human demo
    replayer (resampled to 10 Hz, kept only if still successful: 22/22), factory loop (~160 steps/s), Python data
    server writing `ep_00042.npz`, contact sheet `py/view_dataset.py`.
  - Guards: held-out worlds never scheduled and refused by the server; frames from a non-live wall are refused for
    any dataset not named `smoke*`; the factory stops with an error if asked for single/multi without a key.
  - Smoke datasets built on the stub: `smoke-multi` and `smoke-single`, 322 episodes each (300 expert + 22 human).
    These are for pipeline testing only. The real `single` and `multi` need the live wall.
- **M4** (`py/train.py`, `py/serve.py`, `/?mode=eval`, `py/report.py`, `GET /api/results`):
  - Training: same code and settings for both policies, 15 min each, best-val checkpoint, 90/10 split by episode,
    random shift ±4 px. 5-episode overfit check passes (train loss 0.00045). `py/diagnose.py` gives open-loop error.
  - Eval: fixed protocol (Place, 200 steps, seeds 9000-9019, lab + subway/forest/desert, both policies, fresh
    world per world). Development checks use `tag=dev*`, seeds 5000+ and the lab only, never the held-out worlds.
  - **Spec change (model)**: the image head is now a spatial-softmax keypoint layer (last two convs stride 1, 12x12
    map, x/y per channel) instead of global average pooling. `--pool avg` restores the spec model; old checkpoints
    load as avg. Reason below in "M4 debugging".
  - **Spec change (data size)**: 2,000 expert episodes per dataset instead of 300 (spec debug step 5).
  - Smoke results, official protocol, stub walls (run 2026-11-14T22-21-22-896Z, `data/results/summary-smoke.json`):

    | policy | lab | subway | forest | desert | held-out |
    |---|---|---|---|---|---|
    | single | 11/20 | 0/20 | 0/20 | 0/20 | 0/60 |
    | multi | 7/20 | 5/20 | 1/20 | 8/20 | 14/60 |

    These are stub canvas walls, not Orbis worlds. They show the pipeline works end to end and nothing more.
- **M5** Robot's turn: after the results card, when a summary and `serve.py` exist, "Robot's turn" lets the policy
  drive the arm at 10 Hz from the dataset camera. Policy toggle (single/multi), all 6 button worlds + the 3
  held-out worlds (marked *), New scene, Take over (challenges work again), measured-results table (labelled SMOKE
  when it comes from the smoke run), per-session placed count. `GET /api/robot` checks for a summary and whether the
  policy port listens, so a plain `npm run dev` without the policy server shows no console errors.
- MIT license; `/api/log` hardened (no dot/traversal ids, no overwrite, JSON + same-origin only).

### Next
- Waiting on the key: build real `single` and `multi` (2,000 episodes each), train, run the protocol, report.
- Waiting on you: headset checklist below.

### M4 debugging (honest record)
- First smoke run (300 + 22 episodes, spec model, 10 min; run 2026-11-14T19-31-21-138Z, archived as
  `data/results/eval-smoke.2026-11-14T19-31-21-138Z.json`): single 1/20 lab, 0/60 held-out; multi 3/20 lab,
  15/60 held-out. Open-loop error was small (1.2-1.6 cm), but closed loop the arm went down 5-10 cm off the cube
  and never grasped: the policy could not locate a 3-4 px cube.
- Lab development check (seeds 5000-5019, lab only), 2,000-episode smoke sets:
  spec model (avg), 10 min: single 13/20, multi 1/20. Spatial softmax, 10 min: single 8/20, multi 6/20.
  Spatial softmax, 15 min: single 16/20, multi 6/20. Multi failed with the spec model, so both switched to
  spatial softmax (the default announced earlier). Then the official protocol ran once, results above.
- Multi is weaker than single in the lab: the lab is 1/8 of its data and all of single's.

### Test results
- Vitest: 128/128 (count grows with saved attempts replayed; adds `/api/robot` probe)
- pytest: 19/19 (adds model, overfit, checkpoint + serve websocket, report table, spatial softmax, avg compat)
- Playwright: 8/8 (adds M5: policy drives the arm, world + policy switch live, one episode completes, Take over,
  all three challenges after; no console errors). Earlier counts, M3:
- Vitest: 111/111 (env, IK, grasp, determinism, replay of every saved attempt, hand logic with fake joints,
  server safety, Orbis client vs fake Reactor, bundle has no key, expert >95% clean and noisy, obs format).
- pytest: 10/10 (npz schema, discard failures, held-out refusal, stub-only-into-smoke, bad input, websocket
  roundtrip, no overwrite, step cap, foreign browser origin refused).
- Playwright (headed Chromium): 7/7 — M1 playthrough; M2 stub/no-key, cross-origin token refusal, live failure
  fallback; M3 Multiply (8 episodes, 8 thumbnails, challenges after); factory 10 smoke episodes → 10 npz;
  factory refuses `multi` on the stub. One intermittent failure in the mouse-driving test helper (not the app);
  passed on rerun.

### Unverified / faked
- **No Orbis key**: live stream, `live` status, morphs, 1080p, dashboard session end are all untested for real.
- Headset: nothing tested in a Quest yet.
- Voice in Quest Browser: unknown whether speech recognition exists there.
- **M3 real datasets not built**: `single` and `multi` need the live Orbis wall. Only `smoke-*` (stub walls) exist.
- **M4/M5 real results do not exist yet**: all numbers are smoke (stub walls). Do not present them as Orbis results.
- Robot's turn in the headset untested (needs `adb reverse tcp:8765 tcp:8765`).
- Multiply in the headset not tried; dataset-camera render in XR (second pass at replay midpoints) unverified.

### Orbis minutes used
- 0 (no key). Once live: `curl http://localhost:5173/api/usage`.

### Open questions for the developer
1. Orbis key: put `REACTOR_API_KEY=rk_...` in `.env` (repo root). Default until then: stub; M3/M4 use a `smoke` dataset only.
2. Stock-template headset test (spec M2 step 1) needs you + key; it is scaffolded, steps below.

### Manual headset checklist
M1:
- [ ] `adb reverse tcp:5173 tcp:5173`, open http://localhost:5173 in Quest Browser, Enter VR: wall video plays.
- [ ] Hands visible; arm follows right hand; pinch grabs a cube.
- [ ] All three challenges completable; results card appears.
- [ ] Poking world buttons changes the wall.
- [ ] Frame rate holds (no judder).

M2 (needs the key):
- [ ] Stock template first: `cd C:\Personal\orbis-test`, `cp .env.example .env.local`, add the key, `pnpm dev`,
      `adb reverse tcp:3000 tcp:3000`, open http://localhost:3000 in Quest Browser. Does it stream?
- [ ] Our app with the key in `.env`: Enter VR, wall says `loading` then `live`, world buttons morph the wall.
- [ ] Rapid world pokes do not break the stream; challenges still run smoothly.
- [ ] Close the tab; the session ends on the Reactor dashboard.
- [ ] Does "Say a world" appear in Quest Browser? If so, say a place.

M3:
- [ ] After the results card, poke "Multiply my Place demo": the arm replays your Place in 8 worlds, the counter
      climbs to "1 demo, 8 episodes", thumbnails appear up-right; frame rate holds; challenges work afterwards.

M5 (needs `serve.py` running and a summary):
- [ ] `adb reverse tcp:8765 tcp:8765` as well as 5173. Finish the three challenges: "Robot's turn" appears.
- [ ] The arm moves on its own; status shows "The robot is working", then "Placed it!" or "Missed".
- [ ] Switch to single / multi, poke Subway * / Snowy forest * / Red desert *: no reload, the robot keeps going.
- [ ] Results table readable; Take over gives you the arm back and the challenges run again.
- [ ] Frame rate holds while the robot runs (one policy call per 0.1 s).

### How to build the real datasets (needs the key; each run uses one Orbis session)
1. `npm run dev` and `.venv\Scripts\python py\data_server.py`
2. `node scripts/run-factory.mjs "dataset=multi&episodes=2000"` and `node scripts/run-factory.mjs "dataset=single&episodes=2000"`
   (or open `/?mode=factory&dataset=multi&episodes=2000` and press Start). Run 10 first and check the contact sheet.
3. `.venv\Scripts\python py/view_dataset.py data/datasets/multi`

4. Train, serve, eval, report: see README "M3-M5". `python py/train.py --data data/datasets/multi --out data/ckpt/multi.pt`
   (and single), `python py/serve.py --ckpt multi=... --ckpt single=...`, `node scripts/run-eval.mjs`, `python py/report.py`.

### Installed
- npm: three, vite, typescript, @types/three, @types/node, vitest, @playwright/test; Playwright Chromium.
- npm: @reactor-team/js-sdk 3.4.0 (imports react as a peer; it is only in the lazy Orbis chunk).
- Python: `.venv` + websockets 17.4, pytest, numpy, pillow; PyTorch 2.13.0 **cu130** installed into `.venv`
  (`--index-url https://download.pytorch.org/whl/cu130`): the cu126 build has no kernels for the RTX 5070 (sm_120).
- `C:\Personal\orbis-test`: Reactor stock template (create-reactor-app), outside the repo, for the headset stream test.

### Notes
- The env runs at a fixed 30 Hz in the human app and the recorder samples once per step, so a record replays exactly.
- Panels use canvas textures and show in the headset only; desktop shows the HTML mirror.
- The dataset camera will use layer 6 (scene content only). Layers 1/2 are avoided: three's XR uses them per eye.
- EnvState extends the spec's type with layout, seed, reachTargets, reachIndex, drops, wrongBin, success, steps.
  Records add `hz: 30`. Cubes absent from a layout are omitted.
- Challenge start opens the desktop gripper.
- The factory and eval drivers launch Chromium with background-throttling disabled; without it a covered window
  slows timers to about once a minute and the factory stalls.
