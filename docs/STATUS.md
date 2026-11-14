# Status

Updated: Sat Nov 14, 10:35 AM PST

## Current milestone: M2 done on the stub (live stream unverified: no key); M3 next

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
- MIT license; `/api/log` hardened (no dot/traversal ids, no overwrite, JSON + same-origin only).

### Next
- M3: Multiply in the headset (Part A), then dataset camera, expert, replayer, factory loop, Python data server.

### Test results
- Vitest: 73/73 (env, IK, grasp, determinism, replay of saved attempts, hand logic with fake joints,
  server safety, Orbis client vs fake Reactor, bundle contains no key).
- Playwright (headed Chromium): 4/4 — M1 mouse playthrough; M2 no-key stub; token route rejects cross-origin;
  live-connect failure falls back to the stub and challenges still run.

### Unverified / faked
- **No Orbis key**: live stream, `live` status, morphs, 1080p, dashboard session end are all untested for real.
- Headset: nothing tested in a Quest yet.
- Voice in Quest Browser: unknown whether speech recognition exists there.

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

### Installed
- npm: three, vite, typescript, @types/three, @types/node, vitest, @playwright/test; Playwright Chromium.
- npm: @reactor-team/js-sdk 3.4.0 (imports react as a peer; it is only in the lazy Orbis chunk).
- `C:\Personal\orbis-test`: Reactor stock template (create-reactor-app), outside the repo, for the headset stream test.

### Notes
- The env runs at a fixed 30 Hz in the human app and the recorder samples once per step, so a record replays exactly.
- Panels use canvas textures and show in the headset only; desktop shows the HTML mirror.
- The dataset camera will use layer 6 (scene content only). Layers 1/2 are avoided: three's XR uses them per eye.
- EnvState extends the spec's type with layout, seed, reachTargets, reachIndex, drops, wrongBin, success, steps.
  Records add `hz: 30`. Cubes absent from a layout are omitted.
- Challenge start opens the desktop gripper.
