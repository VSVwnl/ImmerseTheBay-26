# M3: data factory

Goal: turn demonstrations into an image dataset in which the same task is seen against many
generated worlds, and show that happening in the headset.

Target: working by 6:00 PM Saturday. Only start after the MVP (M1 + M2) passes its checks.

There are two parts. Part A is what the judge sees. Part B is what produces training data.
Build A first; it is small and it is the demo.

## Part A: Multiply, in the headset

- After the results card, a Multiply button appears if the user has a successful Place attempt.
- Pressing it replays that attempt: feed its recorded `target` and `grip` samples through `env`
  from the same seed, at the recorded 30 Hz.
- Each replay runs in a different world. Between replays call `setWorld(next, 'morph')`, wait
  about 4 s for it to settle, then replay.
- A counter panel shows "1 demo, N episodes" and climbs with each replay.
- A dataset wall panel shows a growing grid of thumbnails: one snapshot from the dataset camera
  (below) per replay, taken mid-episode, labeled with the world.
- Cycle through the eight training worlds once, then stop. A Stop button ends it early.

## Part B: the factory, on the laptop

Runs in a normal desktop browser tab at `/?mode=factory`. No headset.

### Dataset camera (`src/factory/camera.ts`)

- A fixed camera that sees the table, the arm, the bins and a large area of wall behind them.
  Start at position (0, 1.35, 0.15) looking at (0, 0.85, -0.80). Aim for the wall to fill roughly
  the top 40 to 50 percent of the image. This matters: if the wall is barely visible the
  experiment in M4 tests nothing.
- Renders to a 96x96 render target. Read the pixels back as RGB bytes.
- Hide panels, hands and the target marker in this camera's view (use layers).
- The wall in this render must show the current video frame.

### Observation and action (fixed; M4 depends on them)

- Image: 96x96x3, uint8.
- State: `[tip_x, tip_y, tip_z, grip]`, with positions scaled to [-1, 1] over the workspace.
- Action: `[target_x, target_y, target_z, grip]`, the same scaling, absolute target.
- Control rate: 10 Hz. One step is `env.step(action, 0.1)`.
- Task: Place (red cube into red bin) only.

### Scripted expert (`src/factory/expert.ts`)

A state-feedback controller, so it can recover from disturbances:

1. Move above the cube (0.10 above it), gripper open.
2. Descend to the cube.
3. Close. Hold two steps.
4. Lift to 0.15 above the table.
5. Move above the bin.
6. Open. Hold two steps.
7. Retreat upward.

At every step the expert's action is the current waypoint, limited to 0.04 from the current tip.
Advance to the next waypoint when the tip is within 0.01 of the current one.

Noise injection, which makes the learned policy far more robust: in half of the episodes, add
Gaussian noise (sigma 0.01 m) to the action that is executed, in random bursts of 5 to 10 steps.
The action that is saved is always the clean expert action for the state the arm is actually in.

### Human demos (`src/factory/replayer.ts`)

- Load successful Place attempts from `data/sessions/`.
- Resample their `target` and `grip` to 10 Hz, replay through `env` from the same seed, and keep
  only replays that still succeed.

### Factory loop (`src/factory/factory.ts`)

```
for each episode:
    pick the world for this episode from the dataset's schedule
    if the world changed: setWorld(world, 'fresh'), then wait until status() is 'live'
    env.reset(seed, 'place')
    until success or 150 steps:
        render the dataset camera, read the image, read the state
        compute the action (expert or replayed human)
        send { image, state, action, meta } to the Python server
        env.step(executedAction, 0.1)
    send end-of-episode with success flag
```

- The loop is not tied to real time. Run as many steps per second as rendering and the socket
  allow (aim for 30 or more). The wall shows whatever video frame is current.
- Pause the loop whenever the wall is not `live`. Never record frames of a loading or stub wall
  into a dataset.
- Show progress on the page: episodes done, steps per second, current world, a live preview of
  the 96x96 image.

### Datasets to build

Same seeds and same episodes in both, so the wall is the only difference.

| Dataset | Worlds | Episodes |
| --- | --- | --- |
| `single` | `lab` only | 300 expert, plus every successful human Place demo |
| `multi` | all eight training worlds, changing every 10 episodes | the same 300 expert and the same human demos |

The held-out worlds (`subway`, `forest`, `desert`) must never appear in either dataset.

Start URL: `/?mode=factory&dataset=multi&episodes=300`. The two datasets can be built in two tabs
at once (two Orbis sessions; the account limit is five).

Before building 300, run 10 and look at the contact sheet (below).

### Python data server (`py/data_server.py`)

- A WebSocket server on port 8765.
- Receives binary frames plus small JSON headers. Keep the protocol simple: one JSON message per
  step with the image as base64 is acceptable at this size if it reaches 30 steps per second;
  switch to binary only if it does not.
- Writes one file per episode: `data/datasets/<dataset>/ep_00042.npz` containing
  `images` uint8 [T, 96, 96, 3], `states` float32 [T, 4], `actions` float32 [T, 4],
  and a JSON string `meta` with world id, prompt, seed, source (`expert` or `human`),
  noise flag and success.
- Discards episodes that did not succeed.
- Check image orientation once: WebGL reads pixels bottom-up. Flip so the saved image is upright.

### Contact sheet (`py/view_dataset.py`)

Writes `data/datasets/<dataset>/contact.png`: a grid of random frames, grouped by world.
Look at it before training. Check that:

- images are upright and correctly colored,
- the wall is clearly visible and clearly different between worlds,
- the cube, gripper and bin are all in view.

## Acceptance checks

- [ ] Multiply works in the headset: the demo replays in eight worlds, the counter and the
      thumbnail wall fill, and the challenges still work afterwards.
- [ ] `/?mode=factory&dataset=multi&episodes=10` writes 10 episode files.
- [ ] The contact sheet passes the three checks above.
- [ ] Expert success rate is above 95 percent, with and without noise.
- [ ] Both full datasets are built, with the same seeds, and neither contains a held-out world.

## Out of scope for M3

Training, inference, changing the observation or action format.
