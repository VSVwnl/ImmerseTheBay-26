# Soundings and Backlot

The Soundings branch opens the marine robotics game by default. See the Soundings section of `docs/IDEAS.md`, `docs/SOUNDINGS-DEMO.md`, and `src/soundings/`. Keep the original Backlot app reachable at `?mode=app` when editing shared IK, input, world or data code. The older milestone instructions below describe those research modes.

Hackathon project for Immerse the Bay 2026 (Stanford XR hackathon). One developer plus coding agents.
Hard deadline: Sunday Nov 15, 9:00 AM PST. We submit by 8:30 AM.

## What we are building

A WebXR app that runs in the Quest Browser on a Meta Quest 3.

- The user controls a simulated robot arm with their hand and completes three short challenges.
- Every attempt is recorded (time, success, arm motion).
- Behind the arm is a large curved wall showing a live AI-generated world. The video comes from
  Visko Orbis, a real-time video model, and the user switches worlds with buttons.
- Later milestones replay recorded demos in front of many generated worlds to build an image
  dataset, train a small camera-based policy on it, and let the trained robot do the task alone.

Why the wall matters: a robot that learns from camera images sees whatever is behind the arm.
Varying that background is how we test whether a policy can ignore it.

## Read these before writing code

1. `docs/PLAN.md` — milestones, order, deadlines, demo script, what we may and may not claim.
2. The spec for the milestone you were asked to build:
   - `docs/SPEC-M1-app.md` — arm, hand control, challenges, recording (stub wall)
   - `docs/SPEC-M2-orbis.md` — live Orbis wall. M1 + M2 = the MVP
   - `docs/SPEC-M3-factory.md` — replay demos across worlds, save an image dataset
   - `docs/SPEC-M4-policy.md` — train, evaluate, run the policy live (M4 and M5)

## Rules for agents

- Build one milestone at a time, in order. Stop when its acceptance checks pass and report how to test it.
- Never break a finished milestone to build the next one. If a change risks that, put it behind a flag.
- `npm run dev` must always work without an API key. The stub world exists for this.
- Desktop first. Everything must be usable with a mouse in a laptop browser before it is tested
  in the headset. The developer is alone and cannot wear the headset while debugging.
- No physics engine. The arm is kinematic with analytic IK and grasping is snap-to-grab.
  This is a decision, not an oversight: the learned policy needs grasps that work every time.
- Only `src/world/` may import the Reactor SDK. Everything else uses the `World` interface.
- The Reactor API key lives in `.env`, is read only by the dev server, and is never committed
  or sent to the browser.
- All tunable numbers live in `src/config.ts`.
- No React or other UI framework in the app. TypeScript (strict) + three.js only.
- Do not add dependencies beyond the ones listed below without saying why first.
- Do not refactor working code or add features that are not in the spec. Put ideas in
  `docs/IDEAS.md`.
- Where a spec gives a number, treat it as a starting value to tune, unless it says "fixed".
- When something in a spec turns out to be wrong or impossible, say so and propose the smallest
  change. Do not silently build something different.
- Commit after each acceptance check passes, with the milestone in the message (`M1: ...`).

## Stack

- Vite + TypeScript + three.js (current release)
- `@reactor-team/js-sdk` for Orbis (M2 onward)
- Dev-server middleware (a Vite plugin) for `/api/token`, `/api/log`, `/api/results`
- Python 3.10+ with PyTorch, numpy, websockets, pillow (M3 onward)
- Node 18+

## Commands

```
npm install
npm run dev                          # http://localhost:5173
adb reverse tcp:5173 tcp:5173        # headset reaches the laptop over USB as localhost
adb reverse tcp:8765 tcp:8765        # M3+: headset reaches the Python server
python py/data_server.py             # M3
python py/train.py                   # M4
python py/serve.py                   # M4, M5
```

WebXR needs HTTPS or localhost. `adb reverse` gives the headset `localhost`, so no certificate is needed.
The headset still needs internet (venue Wi-Fi) for the Orbis stream.

## Layout

```
src/
  main.ts               renderer, scene, loop, mode switch (app / factory / eval)
  config.ts             every tunable number
  scene/stage.ts        table, floor, lights, curved wall
  arm/arm.ts            arm model, analytic IK, gripper
  arm/grasp.ts          snap-grab, release, object settling
  env/env.ts            reset(seed), step(action), state(): the one place task logic lives
  input/desktop.ts      mouse + keyboard
  input/xr.ts           hand tracking, controller fallback
  tasks/challenges.ts   the three challenges, success checks, timer
  tasks/recorder.ts     per-attempt log and trajectory
  ui/panels.ts          in-world panels and poke buttons, HTML mirror on desktop
  world/world.ts        World interface + world list
  world/stub.ts         animated canvas as a video element
  world/orbis.ts        live Orbis (M2)
  factory/              dataset camera, expert, replayer, factory loop (M3)
  policy/               policy client, eval harness (M4, M5)
server/plugin.ts        Vite middleware: token, log, results
py/                     data server, training, inference, report
data/                   gitignored: logs, datasets, checkpoints, results
docs/
```

## Conventions

- three.js coordinates: Y up, meters, the user stands at the origin facing -Z.
- Table top is at y = 0.75. The arm base sits at the back of the table and reaches toward the user.
- "Tip" means the point between the gripper fingers. "Target" means where the tip is asked to go.
