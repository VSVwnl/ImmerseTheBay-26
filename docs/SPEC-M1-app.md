# M1: the app with a stub wall

Goal: a person controls the robot arm, completes three challenges and sees their recorded data.
It works with a mouse on the laptop and with a hand in the Quest 3. The wall shows a stub video.

Target: working by 12:30 PM Saturday.

## 1. Stage

Coordinates: Y up, meters. In WebXR use the `local-floor` reference space, so the user stands at
the origin facing -Z.

| Thing | Starting value |
| --- | --- |
| Table top | 1.2 wide (x) by 0.7 deep (z), surface at y = 0.75, centered at x = 0, z = -0.75 |
| Arm base | on the table at (0, 0.75, -1.0), reaching toward the user |
| Workspace for the tip | x in [-0.40, 0.40], y in [0.76, 1.20], z in [-0.90, -0.45] |
| Wall | a section of a cylinder centered on the user: radius 3.5, 120 degrees wide, centered on -Z, bottom at the floor, height set so the surface is 16:9 |
| Floor | dark matte disc, radius 4 |
| Lights | one hemisphere light and one directional light, kept as named objects so later code can tint them |

The wall uses an unlit material with a `VideoTexture` from `world.getVideo()`. Set the texture to
sRGB and turn tone mapping off for it. Check the video is not mirrored when seen from inside.

## 2. Arm

A simple 4-joint arm built from boxes and cylinders. Make it look like a small industrial arm,
not a stick figure: a base, two links, a wrist, a two-finger gripper.

| Part | Starting value |
| --- | --- |
| Shoulder pivot height above base (`SHOULDER_H`) | 0.12 |
| Upper link (`L1`) | 0.40 |
| Forearm (`L2`) | 0.40 |
| Wrist to fingertip (`TOOL_LEN`) | 0.12 |
| Finger gap | 0.07 open, 0.05 closed, animated over 150 ms |

The gripper always points straight down. That makes the IK exact and closed-form. Do not use an
iterative solver.

IK for a tip target `T`:

1. Wrist point `W = T + (0, TOOL_LEN, 0)`. Shoulder point `S = base + (0, SHOULDER_H, 0)`.
2. `yaw = atan2(W.x - S.x, W.z - S.z)`.
3. `r` = horizontal distance from `S` to `W`. `h = W.y - S.y`.
   `d = clamp(hypot(r, h), |L1 - L2| + 0.01, L1 + L2 - 0.01)`.
4. Elbow interior angle: `acos((L1^2 + L2^2 - d^2) / (2 * L1 * L2))`.
5. Shoulder elevation: `atan2(h, r) + acos((L1^2 + d^2 - L2^2) / (2 * L1 * d))` (elbow-up).
6. Wrist pitch: whatever keeps the tool axis pointing straight down in world space.

Then run forward kinematics and treat the result as the actual tip. If `d` was clamped, the tip
will not equal `T`; log the actual tip, not the request.

Joint vector for logging: `[yaw, shoulder, elbow, wristPitch]` in radians.

## 3. Environment (`src/env/env.ts`)

All task logic lives here so that the human app (M1), the data factory (M3) and the policy (M4)
run the exact same world. Nothing outside `env` moves the arm or the cubes.

```ts
type Action = { target: [number, number, number]; grip: 0 | 1 };  // 1 = closed
type EnvState = {
  tip: [number, number, number];
  joints: [number, number, number, number];
  grip: 0 | 1;
  held: null | 'red' | 'blue';
  cubes: { red: [number, number, number]; blue: [number, number, number] };
};

interface Env {
  reset(seed: number, layout: 'reach' | 'place' | 'sort'): void;
  step(action: Action, dt: number): void;   // dt in seconds
  state(): EnvState;
}
```

`step` rules:

- Clamp the target to the workspace.
- Move the tip toward the target at no more than `MAX_TIP_SPEED` (start at 0.6 m/s) times `dt`.
  This is what makes it feel like a robot and keeps recorded motion smooth.
- Solve IK and update the gripper.
- Apply the grasp rules below.
- `step` must be deterministic: the same seed, actions and `dt` values give the same result.
  Use a seeded random generator for layouts. No `Math.random()` or wall-clock time inside `env`.

Objects:

- Two cubes, 0.05 on a side: red and blue.
- Two open bins, 0.16 by 0.16 by 0.08: red at (-0.30, 0.75, -0.55), blue at (0.30, 0.75, -0.55).
- Three reach targets: spheres of radius 0.03, 0.15 above the table, spread across the workspace.
- Cube spawn area: x in [-0.15, 0.15], z in [-0.85, -0.60], at least 0.10 apart, chosen from the seed.

Grasp rules (no physics):

- When `grip` goes from 0 to 1 and a cube's center is within `GRAB_RADIUS` (start at 0.05) of the
  tip, the nearest such cube attaches to the gripper.
- When `grip` goes from 1 to 0 while holding, the cube detaches and comes to rest directly below:
  on the bin floor if it is over a bin's footprint, otherwise on the table. In `env` this is
  instant. The renderer may animate the fall for looks.
- A cube released off the table respawns in the spawn area.
- `drops` counts releases of a held cube anywhere except its own-colored bin.
  `wrongBin` counts releases into the other bin. The cube stays there and can be picked up again.

## 4. Control

Both input methods produce an `Action` every frame and call `env.step`.

Desktop (`src/input/desktop.ts`):

- Mouse move: the target follows the cursor on a horizontal plane at the target's current height.
- Mouse wheel, or W and S: raise and lower the target.
- Space or left click: toggle the gripper.
- Keys 1 to 6: switch world.
- Camera: fixed, roughly where a standing user's eyes would be, so desktop shows what the headset shows.

Headset (`src/input/xr.ts`):

- Session: `immersive-vr`, `local-floor`, optional feature `hand-tracking`. Use the standard
  three.js WebXR button and hand APIs. Show the user's hands with the standard hand models.
- Right hand drives the arm. Pinch point = midpoint between thumb tip and index fingertip.
  `target = pinchPoint + HAND_OFFSET`, with `HAND_OFFSET` starting at (0, -0.05, -0.25) so the
  gripper sits beyond the hand and the hand does not hide it.
- Control is active while the right hand is tracked and above y = 0.70 and in front of z = -0.10.
  When it is not active the target holds its last position. Show the target as a small marker
  that is bright when active and dim when held.
- Pinch closes the gripper. Use hysteresis: closed when thumb-to-index distance is under 0.025,
  open when it is over 0.04.
- Low-pass the hand position before using it (start with a 0.35 blend per frame at 72 Hz).
- Controller fallback: if no hands are tracked, the right controller's grip position drives the
  target and its trigger closes the gripper.

## 5. Challenges (`src/tasks/challenges.ts`)

Run in order. Each starts with a 3-2-1 countdown and has a 60 second limit.

| # | Name | Layout | Success |
| --- | --- | --- | --- |
| 1 | Reach | three targets | the tip comes within 0.04 of each target, in order; the next target lights up |
| 2 | Place | red cube, red bin | the red cube rests in the red bin |
| 3 | Sort | both cubes, both bins | each cube rests in its own-colored bin |

Give clear feedback: a sound or flash on each success, and a visible timer.

## 6. Recording (`src/tasks/recorder.ts`)

One record per attempt, sampled at a fixed 30 Hz (use a time accumulator, not the frame rate).

```json
{
  "sessionId": "2026-11-14T10-12-03Z-ab12",
  "attemptId": "0003",
  "challenge": "place",
  "seed": 12345,
  "world": { "id": "night-market", "prompt": "..." },
  "startedAt": "2026-11-14T18:12:40.120Z",
  "durationMs": 8420,
  "success": true,
  "drops": 0,
  "wrongBin": 0,
  "pathLengthM": 1.37,
  "input": "hand",
  "samples": [
    { "t": 0.0, "target": [0, 1.0, -0.6], "grip": 0,
      "tip": [0, 1.0, -0.6], "joints": [0, 0.9, 1.6, -0.9], "held": null,
      "cubes": { "red": [0.05, 0.775, -0.7], "blue": [-0.1, 0.775, -0.8] } }
  ]
}
```

`target` and `grip` are the action that was applied at that sample. Later milestones replay
attempts from these, so they must be exact.

When an attempt ends, POST the record to `/api/log`. The dev-server middleware writes it to
`data/sessions/<sessionId>/<attemptId>.json`. On desktop also offer a download button.

## 7. Panels and buttons (`src/ui/panels.ts`)

HTML is not visible inside a VR session, so the UI is drawn in the scene.

- Panels are flat meshes with a canvas texture.
- Buttons are poked: a button fires when either index fingertip enters its box. Debounce 400 ms.
  With controllers, the controller tip pokes the same way.
- World panel, left of the table, angled toward the user: six buttons from the world list.
- Status panel above the table: challenge name, countdown, timer.
- Results card after challenge 3: for each challenge the time, success, drops and path length,
  and a Run again button.
- On desktop, mirror all of this as plain HTML over the canvas.

## 8. World interface and stub (`src/world/`)

```ts
interface WorldDef { id: string; label: string; prompt: string; }

interface World {
  connect(): Promise<void>;
  setWorld(def: WorldDef, mode?: 'morph' | 'fresh'): Promise<void>;
  getVideo(): HTMLVideoElement;
  status(): 'idle' | 'loading' | 'live' | 'stub' | 'error';
  current(): WorldDef | null;
  disconnect(): Promise<void>;
}
```

The stub draws an animated gradient and the world's label on a canvas, turns it into a video
element with `canvas.captureStream`, and changes palette when `setWorld` is called. It needs no
network and no asset files. The world list with prompts is in SPEC-M2-orbis.md; create it now in
`src/world/world.ts`.

Start video playback from a user gesture (the Enter VR click on the headset, any click on
desktop). Browsers block autoplay otherwise.

## 9. Dev server (`server/plugin.ts`)

A Vite plugin that adds middleware on the same port, so the headset sees one origin:

- `POST /api/log` writes the JSON body to `data/sessions/...` and returns `{ ok: true }`.

`data/` is in `.gitignore`.

## Acceptance checks

Desktop:

- [ ] `npm run dev` starts with no `.env` file and no errors.
- [ ] All three challenges can be completed with the mouse.
- [ ] Each attempt produces a JSON file under `data/sessions/` matching the schema above.
- [ ] World keys 1 to 6 change the stub wall.
- [ ] Replaying a saved attempt's `target` and `grip` samples through `env` from the same seed
      ends in the same success state. (Write this as a small script or test; M3 depends on it.)

Headset, via `adb reverse tcp:5173 tcp:5173` and `http://localhost:5173` in Quest Browser:

- [ ] Enter VR works and the wall video plays.
- [ ] Hands are visible, the arm follows the right hand and pinching grabs a cube.
- [ ] All three challenges can be completed and the results card appears.
- [ ] Poking world buttons changes the wall.
- [ ] Frame rate holds at the headset's refresh rate.

## Out of scope for M1

Live Orbis, voice input, saving video, anything in `factory/` or `policy/`, physics.
