# M4 and M5: train, evaluate, run live

Goal of M4: train two small camera-based policies, one on the `single` dataset and one on `multi`,
and measure how often each completes the Place task in worlds neither has seen.

Goal of M5: the trained policy runs the arm live in the headset.

Targets: M4 by 10:00 PM Saturday, M5 by 1:00 AM Sunday. Only start after M3 passes its checks.

## The question

Does a policy trained against many generated worlds work better in a new world than a policy
trained against one? This is an experiment. We do not know the answer, and we report whatever
we measure.

Rules that keep the result honest:

- Fix the evaluation protocol below before looking at any results.
- Both policies use the same code, the same hyperparameters, the same training time and the
  same episodes. Only the wall differs.
- No color or brightness augmentation. It would blur the comparison.
- Do not rerun evaluation until the numbers look good. One run, fixed seeds.

## Training (`py/train.py`)

```
python py/train.py --data data/datasets/multi  --out data/ckpt/multi.pt
python py/train.py --data data/datasets/single --out data/ckpt/single.pt
```

- Device: CUDA if available, then MPS, then CPU. Print which one is used.
- Input: image (96x96x3, scaled to [0, 1]) and state (4 numbers).
- Model, small and trained from scratch:
  - image encoder: five 3x3 conv layers with stride 2 (32, 64, 128, 256, 256 channels),
    GroupNorm and ReLU, then global average pooling;
  - state encoder: a two-layer MLP to 64;
  - head: concatenate, two layers of 256, output 4 numbers.
- Loss: mean squared error on the three target coordinates plus binary cross-entropy on grip.
- Augmentation: random shift of up to 4 pixels. Nothing else.
- Optimizer: AdamW, learning rate 3e-4, batch size 256.
- Split by episode, 90 percent train and 10 percent validation.
- Train for a fixed budget (start with 15 minutes per policy), saving the checkpoint with the
  best validation loss. Log train and validation loss every epoch.
- Save the normalization and the model definition with the checkpoint so `serve.py` needs nothing else.

A from-scratch encoder is deliberate. A pretrained one may already ignore backgrounds, which
would hide the effect we are measuring.

First run a sanity check: train on 5 episodes only and confirm the loss goes to near zero. If it
does not, there is a bug in the data or the model; fix that before anything else.

## Inference server (`py/serve.py`)

```
python py/serve.py --ckpt data/ckpt/multi.pt --port 8765
```

- WebSocket. Request: image bytes and state. Response: the 4-number action.
- Supports loading both checkpoints and choosing per request (`policy: 'single' | 'multi'`), so
  evaluation can switch without restarting.
- It must use exactly the same image preprocessing as training. A mismatch here is the most
  common reason a trained policy does nothing useful.
- Stop `data_server.py` first; both use port 8765.

## Evaluation (`src/policy/eval.ts`, `py/report.py`)

Runs in a desktop tab: `/?mode=eval`. Closed loop at 10 Hz of simulated time:
render the dataset camera, send image and state, receive the action, `env.step(action, 0.1)`.

Protocol (fixed):

- Task: Place. Success: the red cube rests in the red bin within 200 steps.
- 20 episodes per policy per world, with seeds 9000 to 9019. These seeds are not in any dataset.
- Worlds: the three held-out worlds (`subway`, `forest`, `desert`), plus `lab` as a check that
  both policies work where they were trained.
- For each world: `setWorld(world, 'fresh')`, wait for `live`, run both policies' episodes.
- Write every episode's outcome to `data/results/eval.json` through `/api/log`.

`py/report.py` reads that file and writes `data/results/summary.json` and prints:

```
                 lab    subway   forest   desert   held-out mean
single policy    ...    ...      ...      ...      ...
multi policy     ...    ...      ...      ...      ...
```

Add `GET /api/results` to the dev-server middleware to return `summary.json`.

## Reading the result

| Outcome | What we say |
| --- | --- |
| Multi clearly beats single in held-out worlds | The headline result. Show the table. |
| Both do well everywhere | Background variety was not needed for this setup. Say so. The data tool is still the product. |
| Both do badly even in `lab` | The policy is not learning. Debug in the order below. |
| Single beats multi | Report it. Likely the multi policy needs more data or training time; say that as a guess, not a finding. |

With 20 episodes per cell, differences of one or two episodes mean nothing. State the episode
count next to every number.

Debug order if nothing works:

1. The 5-episode overfit check.
2. Image orientation and color order identical in the dataset, in training and in `serve.py`.
3. Action and state scaling identical in the factory, in training and in evaluation.
4. Watch an evaluation episode: does the arm move toward the cube at all?
5. Build more data (more expert episodes) and train longer.

If it still does not work by 10:00 PM, stop. The M3 demo stands and the write-up says the
training experiment was attempted and did not finish.

## M5: Robot's turn, in the headset

- A Robot's turn button on the results card, shown only when `/api/results` and the policy
  server are reachable.
- The headset page connects to `ws://localhost:8765` (the developer runs
  `adb reverse tcp:8765 tcp:8765`).
- The user picks any world, including the held-out ones, which appear on the world panel in
  this mode. The scene resets with a fresh seed.
- Every 100 ms the page renders the dataset camera to the 96x96 target, sends image and state,
  and applies the returned action with `env.step(action, 0.1)`. Interpolate the arm visually
  between steps so it looks smooth at headset frame rate.
- The user's hand does not control the arm in this mode. A Take over button returns control.
- Uses the `multi` policy by default. A toggle switches to `single` so a judge can see the
  difference live.
- A results panel shows the table from `summary.json`, with episode counts.

The dataset camera render adds a second render pass every 100 ms. Confirm the headset frame
rate still holds.

## Acceptance checks

M4:

- [ ] The 5-episode overfit check passes.
- [ ] Both checkpoints exist, trained with identical settings.
- [ ] `/?mode=eval` completes the full protocol and `py/report.py` prints the table.
- [ ] The numbers in the write-up match `summary.json`.

M5:

- [ ] In the headset, Robot's turn runs the Place task with no human input.
- [ ] Switching world and switching policy both work without reloading.
- [ ] Take over returns hand control, and the challenges still work.

## Environment notes

- Install the current stable PyTorch build that supports the laptop's GPU and confirm
  `torch.cuda.is_available()` (or MPS on a Mac) before training. New laptop GPUs need recent builds.
- Python packages: torch, numpy, websockets, pillow.
