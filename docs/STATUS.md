# Status

Updated: Sat Nov 14, 10:55 AM PST

## Current milestone: M3 done on the stub (real datasets need the key); M4 next

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
- MIT license; `/api/log` hardened (no dot/traversal ids, no overwrite, JSON + same-origin only).

### Next
- M4: `py/train.py` (5-episode overfit check first), `py/serve.py`, `/?mode=eval`, `py/report.py`, `/api/results`.
  Without a key, everything runs on the smoke datasets and stub held-out worlds; results will be labeled smoke.

### Test results
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

### How to build the real datasets (needs the key; each run uses one Orbis session)
1. `npm run dev` and `.venv\Scripts\python py\data_server.py`
2. `node scripts/run-factory.mjs "dataset=multi&episodes=300"` and `node scripts/run-factory.mjs "dataset=single&episodes=300"`
   (or open `/?mode=factory&dataset=multi&episodes=300` and press Start). Run 10 first and check the contact sheet.
3. `.venv\Scripts\python pyiew_dataset.py data/datasets/multi`

### Installed
- npm: three, vite, typescript, @types/three, @types/node, vitest, @playwright/test; Playwright Chromium.
- npm: @reactor-team/js-sdk 3.4.0 (imports react as a peer; it is only in the lazy Orbis chunk).
- Python: `.venv` (with system site packages for the CUDA PyTorch 2.13 build) + websockets 17.4, pytest.
- `C:\Personal\orbis-test`: Reactor stock template (create-reactor-app), outside the repo, for the headset stream test.

### Notes
- The env runs at a fixed 30 Hz in the human app and the recorder samples once per step, so a record replays exactly.
- Panels use canvas textures and show in the headset only; desktop shows the HTML mirror.
- The dataset camera will use layer 6 (scene content only). Layers 1/2 are avoided: three's XR uses them per eye.
- EnvState extends the spec's type with layout, seed, reachTargets, reachIndex, drops, wrongBin, success, steps.
  Records add `hz: 30`. Cubes absent from a layout are omitted.
- Challenge start opens the desktop gripper.
