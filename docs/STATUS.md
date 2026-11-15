# Status

Updated: Sat Nov 14, 4:45 PM PST

## Current milestone: M1-M5 done with real Orbis data and a real evaluation. Remaining: headset checks (you)

### Autonomous Workshop run (Sun 03:10-06:30 PST, branch `modular`, tag `safe-start` = 9e3ca17)
Goal: "pick the right robot for the job". One addition per commit; modular tests only per addition
(`npm run test:modular`, `npm run e2e:modular`); the whole suite once at 06:00.

Decisions (made without asking):
- `ENABLED_PARTS` / `ENABLED_CHALLENGES` in `src/config.ts` list only Workshop items. Reach/Place/Sort and the
  standard robot are always on outside the Workshop (expert, datasets, training, Robot's turn need them).
  Switching off `compact` or `gripper` only hides them in the Workshop, which then starts on the first enabled
  parts. With every challenge off, the Robot Workshop button disappears.
- Random world per attempt: only in Workshop mode, picked from the six button worlds, never the one already on
  the wall; picked at each countdown (a part change restarts the countdown, so it re-picks). Recorded in the
  attempt file's `world` as before.
- Grab rules are now per tool, reading object tags (material, shape, size, weight); labels come from the rule.
  Challenges are data (`src/env/workshop.ts`): a list of steps (object, spawn, goal), so two-step challenges need
  no new code.

Items (commit = where it was added; later moved to one file each in `src/workshop/parts/` and
`src/workshop/challenges/`):

| Item | Type | Commit | Parts it needs | Configurations that solve it |
|---|---|---|---|---|
| Compact arm | part (arm) | 9e3ca17 (standard) | | |
| Long arm | part (arm) | 9e3ca17 | | |
| Gripper | part (tool) | 9e3ca17 (standard) | | |
| Suction | part (tool) | 9e3ca17 | | |
| Plate | challenge | 9e3ca17 | Suction + an arm that reaches the table | Compact+Suction, Long+Suction, Heavy-duty+Suction |
| Far | challenge | 9e3ca17 | Long + Gripper or Magnet | Long+Gripper, Long+Magnet |
| Heavy | challenge | 9e3ca17 | Compact or Heavy-duty + Gripper or Magnet | Compact+Gripper, Compact+Magnet, Heavy-duty+Gripper, Heavy-duty+Magnet |
| Magnet | part (tool) | 96bdd6e | | |
| Washer | challenge | 96bdd6e | Magnet | Compact+Magnet, Long+Magnet, Heavy-duty+Magnet |
| Wide gripper | part (tool) | 751b458 | | |
| Crate | challenge | 751b458 | Wide gripper + Compact or Heavy-duty | Compact+Wide, Heavy-duty+Wide |
| Heavy-duty arm | part (arm) | c72c181 | | |
| Anvil | challenge | c72c181 | Heavy-duty + Gripper or Magnet | Heavy-duty+Gripper, Heavy-duty+Magnet |
| Scoop | part (tool) | 161dc39 | | |
| Marbles | challenge | 161dc39 | Scoop | Compact+Scoop, Long+Scoop, Heavy-duty+Scoop |
| Tall base | part (arm) | f4f164e | | |
| Shelf | challenge | SHELF_COMMIT | Tall base + Gripper | Tall base+Gripper |

Decisions after the 03:30 rule update (`docs/AUTONOMOUS.md`):
- Moved every part and challenge into its own file (registry in `src/workshop/registry.ts`). Numbers stay in
  `src/config.ts` (project rule). Each challenge declares `solutions`; a test checks them against the real rules
  by solving every challenge with every robot.
- A challenge hides itself when none of its solving robots can be built from `ENABLED_PARTS` (tested by
  switching each part off in turn).
- Tall base + Shelf were working but not committed when the new rules arrived; set aside and re-added as two
  separate `ADD` commits after the restructure.

Additions:
1. Groundwork: switches, part/challenge registries, random world per attempt, modular test folders.
   Interesting because every later part or challenge is one data entry plus one row of expected outcomes, and
   the tests check every robot against every challenge automatically.
2. Magnet tool + Washer challenge (steel washer -> blue tray). Interesting because the washer defeats both
   original tools for different reasons (gripper: flat; suction: air leaks through the hole) and the magnet,
   which can't lift anything non-metal, is the only answer; the magnet also turns out to solve Far (Long +
   Magnet) and Heavy (Compact + Magnet), so the old one-answer challenges now have two.
   Also: `?challenges=washer` limits the Workshop to the listed challenges for quick testing;
   `scripts/panel-shot.mjs` renders a headset panel to a PNG; the parts panel is taller/wider in the headset.
3. Wide gripper tool + Crate challenge (big slatted wooden crate, weight 2 -> wooden pallet). Interesting
   because it needs a two-part answer: only the wide gripper takes something that big (gripper: too big; suction:
   air leaks through the slats; magnet: wood), and only the Compact arm can lift it (Long: too heavy). The wide
   gripper's weakness: it can't hold anything that isn't big, so it fails every other challenge.
4. Heavy-duty arm (links 20% shorter and drawn thicker, payload 3, reaches only the middle of the table) +
   Anvil challenge (weight 3 -> red zone). Interesting because strength and reach now trade off across three
   arms: the anvil is "Too heavy" for Compact and Long, while Heavy-duty can't get near the far can ("Out of
   reach"). Heavy-duty also lifts the crate with the wide gripper. (Out-of-reach hint radius 0.20 -> 0.25 m so
   the short arm still explains itself at the far can.)
5. Scoop tool + Marbles challenge (a handful of glass marbles -> blue bowl). Interesting because a "thing" that is
   really many small loose bits defeats every grasping idea at once (fingers: slip through; suction: loose;
   magnet: glass; wide: loose), and the scoop, which can't pick up anything solid, is the only answer with any arm.
6. ADD part: tall base (`src/workshop/parts/tall.ts`): the standard links on a column 0.3 m taller. Interesting
   because its weakness is the opposite of every other arm's: it reaches higher than any of them but its tip
   can't come down to the table, so every table job says "Out of reach". (A variation on the suggested "can't
   reach the near table edge": a shelf is only interesting if the other arms truly can't get up there.)
7. ADD challenge: shelf (`src/workshop/challenges/shelf.ts`): a honey jar on a high shelf -> tall wicker basket.
   Interesting because it's the first job where the arm's height, not its strength or the tool, decides:
   every other arm says "Out of reach", and the jar is glass with a round side, so only the gripper holds it.

Headset checks for the autonomous run (all NOT YET TESTED ON HEADSET; base checks in `docs/WORKSHOP.md`):
- [ ] 1 Groundwork (NOT YET TESTED ON HEADSET): in the Workshop, each countdown switches the wall to a different
      world; with the live key the new world shows within a few seconds; the parts panel lines (part + strength /
      weakness) are readable.
- [ ] 2 Magnet + Washer (NOT YET TESTED ON HEADSET): the parts panel (left) shows Magnet; with Suction, pinching the
      washer says "Air leaks through the hole"; with Magnet the washer sticks under the red puck and drops into the
      blue tray; the magnet refuses the plate ("Magnet only lifts metal"). The washer is small: is it easy to see?
- [ ] 3 Wide gripper + Crate (NOT YET TESTED ON HEADSET): Long + Wide says "Too heavy for this arm"; Compact + Wide
      carries the crate onto the pallet; the wide fingers open and close visibly; the crate reads as "big and
      heavy"; with the wide gripper the can says "Too small for the wide gripper".
- [ ] 4 Heavy-duty + Anvil (NOT YET TESTED ON HEADSET): the Heavy-duty arm looks short and thick; with Compact the
      anvil says "Too heavy for this arm"; Heavy-duty + Gripper (or Magnet) moves it to the red zone; in the Far
      challenge Heavy-duty stops short and says "Out of reach". Does the hand target feel cramped (smaller reach)?
- [ ] 5 Scoop + Marbles (NOT YET TESTED ON HEADSET): with the Gripper the marbles say "Loose bits slip through the
      fingers"; with the Scoop they sit in the orange-walled tray and land in the blue bowl; the marbles are small:
      visible enough? Frame rate with 7 marble spheres fine?
- [ ] 6 Tall base (NOT YET TESTED ON HEADSET): poke "Tall base arm": the column grows; the hand target stops well
      above the table; reaching for the plate says "Out of reach". Is the tall arm's motion still comfortable?
- [ ] 7 Shelf (NOT YET TESTED ON HEADSET): the high shelf and the jar on it are visible behind-left of the arm;
      with Long, reaching up says "Out of reach"; Tall base + Gripper lifts the jar off and drops it in the basket.
      Is the shelf at a comfortable hand height (jar ~1.42 m)?

### Branch `modular`: Robot Workshop (Sun 2:20 AM, not merged; `main` untouched)
- Additive: Compact/Long arm, Gripper/Suction tool, grab rules (needsTool, weight vs payload, out of reach) with
  slip + buzz + floating reason label; Plate / Far / Heavy challenges; arm + tool + grabFails in every attempt
  file; replays rebuild the recorded robot. Expert, datasets, training, Multiply and Robot's turn stay on the
  standard robot and are disabled with a label in Workshop mode. Details and headset checks: `docs/WORKSHOP.md`.
- Desktop verified: `e2e/workshop.spec.ts` plays all three with the mouse, wrong parts first (each fails with
  its label), then the right parts; files on disk carry the parts. Vitest 343 (adds `tests/workshop.test.ts`:
  IK for both arms incl. full-stretch clamping, grab rules for every object x robot, every challenge solvable
  only with the right parts, replay keeps the robot). Headset: not tested yet.

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

### Real result (M4, live Orbis walls, run 2026-11-15T00-39-44-104Z, `data/results/summary.json`)

| policy | lab | subway* | forest* | desert* | held-out* |
|---|---|---|---|---|---|
| single (trained on lab only) | 8/20 (40%) | 7/20 (35%) | 8/20 (40%) | 0/20 (0%) | 15/60 (25%) |
| multi (trained on 8 worlds) | 10/20 (50%) | 9/20 (45%) | 10/20 (50%) | 8/20 (40%) | 27/60 (45%) |

\* never seen in training. Fixed protocol: Place, 200 steps, seeds 9000-9019, a fresh live generation per world,
both policies on the same seeds; all 160 episodes ran on a live wall. Run once; nothing tuned on it.
- What it says: in unseen generated worlds the many-world policy placed the cube 27/60 times, the one-world policy
  15/60. Same seed and world compared: multi alone succeeded 20 times, single alone 8 (exact McNemar p = 0.036).
- Limits: 20 seeds per world, one run. Neither policy is reliable even in the lab (40-50%). Simulated kinematic arm
  with snap grasping; says nothing about a real robot. The image head was chosen on smoke (stub) data.
- Datasets: `multi` and `single`, 2,000 scripted-expert episodes each, all frames from a live wall, `humans=0`.
  multi: 8 worlds, 240-260 episodes each, world changes every 20 episodes (~100 generations). single: lab only.
- Training: 15 min each, 140 epochs, best val 0.022 (multi) and 0.029 (single). Overfit check passes (0.00016).

### First headset test (Sat ~6:10 PM, recorded with `adb shell screenrecord`, page logged with `scripts/quest-watch.mjs`)
- Hand tracking works: right hand drives the arm, pinch grabs; all three challenges completed in ~35 s.
- Bug found and fixed: one fingertip poke on Stop also pressed Start (the button under the finger changes to
  Start in the same place), so the countdown restarted ("the scene refreshes"). A panel now ignores presses until
  the fingertip has left it (`src/ui/poke.ts`, unit tested).
- The side and world panels sat at 1.05 m, where the right hand works while driving the arm; Stop/Start/Multiply
  were poked by accident. Panels with buttons moved up to 1.55 m and slightly out. **Not yet re-tested in the headset.**
- Also fixed: dev server listens on 127.0.0.1 (adb reverse could not reach it on ::1); `?Orbis=0` now means
  `orbis=0` (a capital O had opened a paid session: ~2.5 min).
- Desktop: the Multiply counter covered "Run again" when Robot's turn was shown; it now sits under the status panel.

### Live Orbis (key added Sat 3:15 PM)
- `node scripts/live-check.mjs`: connects, live in ~11 s, switches one world, disconnects. Works.
- Stream is 2560x1440 at 18 fps ("2k"); our 1080p request is only sent when offered.
- Live 30-episode factory trial (`data/datasets/trial-live`, 3 worlds): each world's episodes show that world.
- Bugs found and fixed by the live tests (all were invisible on the stub and the fake Reactor):
  1. Token request lacked the JSON content type the server requires, so the app fell back to the stub.
  2. Connecting with no world chosen (factory, eval) never started a run; the wall stayed `loading`.
  3. A fresh switch within 4 s of the last one was queued and returned at once, so the factory would have
     recorded the old world under the new label. Fresh switches now wait out the interval.
  4. After a reset Orbis keeps sending the old world for ~1.3 s, then black for ~4 s, then the new world
     (measured with `scripts/orbis-probe.mjs`). `live` now needs `generation_started` and a non-black frame.
  5. `run-factory.mjs` stops and disconnects if no episode is saved for 90 s, and always disconnects at the end.
  6. The M1 e2e test opened the app without `?orbis=0`, which with a key would start a paid session per run.
- A world switch costs ~7 s of streaming. Estimate: ~30 min of Orbis for `multi` (200 switches), ~12 min for
  `single`, ~5 min for the eval. About 50 min in total.
- "Human" demos: the 34 Place attempts in `data/sessions` were recorded by the Playwright tests, not a person.
  Real datasets use `humans=0` unless you record real Place demos first (the smoke sets included the bot ones).

### Next
- Headset checklist below (M1-M5), now with the live wall and the real policies.
- For Robot's turn: `.venv\Scripts\python py\serve.py --ckpt single=data/ckpt/single.pt --ckpt multi=data/ckpt/multi.pt`
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
- After the live fixes: Vitest 152/152, typecheck clean, Playwright 7 passed + 1 skipped (the no-key test skips
  with a key). The M5 test failed once in the full run and passed 3 times alone (intermittent, cause not found).
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
- Live stream verified on desktop Chromium only. Not yet in the Quest Browser. Morph (button) switches are slow
  to show: 10 s after a morph the lab was still visible; fresh switches take ~5.5 s to show the new world.
- Dashboard session end not checked (you can see it on the Reactor dashboard).
- Headset: nothing tested in a Quest yet.
- Voice in Quest Browser: unknown whether speech recognition exists there.
- **M3 real datasets not built**: `single` and `multi` need the live Orbis wall. Only `smoke-*` (stub walls) exist.
- The smoke numbers further down are stub walls; the real result is the table at the top.
- Robot's turn in the headset untested (needs `adb reverse tcp:8765 tcp:8765`).
- Multiply in the headset not tried; dataset-camera render in XR (second pass at replay midpoints) unverified.

### Orbis minutes used
- **48.5 min over 12 sessions** (Sat 3:15-6:00 PM; +2.5 min from the accidental `?Orbis=0` headset tab), by our own log (`curl http://localhost:5173/api/usage`):
  testing and debugging ~12 min (live check, trials, probe, two stalled trials ~7 min, one aborted multi build
  2.2 min), `multi` dataset ~25 min, `single` ~7 min, evaluation 3 min. The Reactor dashboard is authoritative.

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
