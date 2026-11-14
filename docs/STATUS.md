# Status

Updated: Sat Nov 14, 10:25 AM PST

## Current milestone: M1 done (desktop); M2 (live Orbis wall) next

### Done
- Repo setup: CLAUDE.md, .gitignore, .env.example at root; docs pushed.
- Env (deterministic, seeded), closed-form IK, snap grasp, 30 Hz fixed-step loop and recorder.
- Stage (table, bins, cubes, curved 16:9 wall), arm model, stub world, desktop input, XR hand/controller input,
  in-world poke panels with HTML mirror, challenges with countdown, timer, sounds, results card.
- `/api/log` dev-server route writes `data/sessions/<sessionId>/<attemptId>.json`.

- M1 desktop acceptance checks pass: dev server with no .env, all three challenges by mouse,
  JSON per attempt under data/sessions/, keys 1-6 change the stub wall, saved attempts replay to the same result.

### Next
- M2: /api/token route, Orbis client (src/world/orbis.ts, loaded lazily), status + fallback to stub.

### Test results
- Vitest: 47/47 passing (env, IK, grasp, determinism, replay incl. 31 real saved attempts, hand logic with fake joints).
- Playwright (headed Chromium): M1 mouse playthrough passing; 7 of 8 runs green. The one failure was in the
  test's mouse helper (async wheel timing), since fixed; app behaviour was correct.

### Unverified / faked
- No Orbis key yet: wall is the stub world.
- Headset behaviour (hand tracking, poking, frame rate) not yet tested.

### Orbis minutes used
- 0

### Open questions for the developer
1. Orbis key: none in `.env`. Default: stub world; M3/M4 validated on a `smoke` dataset until a key exists.
2. Stock Reactor template headset test needs the key and the headset.
3. Panel layout: worlds left of table, status above the arm, Start/results on the right.

### Manual headset checklist (M1)
- [ ] `adb reverse tcp:5173 tcp:5173`, open http://localhost:5173 in Quest Browser, Enter VR: wall video plays.
- [ ] Hands visible; arm follows right hand; pinch grabs a cube.
- [ ] All three challenges completable; results card appears.
- [ ] Poking world buttons changes the wall.
- [ ] Frame rate holds (no judder).

### Installed
- npm: three, vite, typescript, @types/three, @types/node, vitest, @playwright/test; Playwright Chromium.
- npm: @reactor-team/js-sdk 3.4.0 (pulls react as a peer import; loaded lazily so the stub path has no React).

### Notes
- The env runs at a fixed 30 Hz in the human app and the recorder samples once per step, so a record replays exactly.
- Panels use canvas textures and show in the headset only; desktop shows the HTML mirror.
- The dataset camera will use layer 6 (scene content only). Layers 1/2 are avoided: three's XR uses them per eye.
- EnvState extends the spec's type with layout, seed, reachTargets, reachIndex, drops, wrongBin, success, steps.
  Records add `hz: 30`. Cubes absent from a layout are omitted.
- Challenge start opens the desktop gripper.
