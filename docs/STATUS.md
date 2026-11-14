# Status

Updated: Sat Nov 14, ~10:40 AM PST

## Current milestone: M1 (app with stub wall), in progress

### Done
- Repo setup: CLAUDE.md, .gitignore, .env.example at root; docs pushed.
- Env (deterministic, seeded), closed-form IK, snap grasp, 30 Hz fixed-step loop and recorder.
- Stage (table, bins, cubes, curved 16:9 wall), arm model, stub world, desktop input, XR hand/controller input,
  in-world poke panels with HTML mirror, challenges with countdown, timer, sounds, results card.
- `/api/log` dev-server route writes `data/sessions/<sessionId>/<attemptId>.json`.

### Next
- Finish M1 checks, commit code, then M2 (live Orbis wall).

### Test results
- Vitest: 16/16 passing (env, IK, grasp, determinism, replay, hand logic).
- Playwright: M1 mouse playthrough (all three challenges, records saved, world keys) passing; flakiness check running.

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
