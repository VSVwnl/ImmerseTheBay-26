# Robot Workshop (branch `modular`)

"Pick the right robot for the job." Additive: the standard robot (Compact arm + Gripper) and the Reach / Place /
Sort challenges behave exactly as on `main`; the expert, datasets, training, Multiply and Robot's turn stay on the
standard robot. Not merged.

## How it works

- **Robot Workshop** button (side panel) opens Workshop mode: a parts panel (headset: to your left, beside Worlds;
  desktop: bottom left) and the Workshop challenges in order, in the normal challenge flow (countdown, 60 s,
  recording). **Back to the standard robot** leaves it.
- Every attempt switches the wall to a random world (never the one already showing). With live Orbis the new world
  fades in 5-9 s into the attempt (morph).
- Changing a part rebuilds the arm at once and restarts the current challenge, except in swap challenges
  (Dinner, Restock), where parts change mid-run (not while holding something).
- A failed grab: the tool wobbles, a short buzz, and a floating label says why.
- Attempt files: `arm`, `tool`, `success`, `grabFails`, `world`, and `swaps` in swap challenges. Replays rebuild the
  recorded robot, including swaps.

## Parts (one file each in `src/workshop/parts/`)

| Part | Strength | Weakness |
|---|---|---|
| Compact arm (standard) | payload 2 | middle reach |
| Long arm | reaches the table's right edge | payload 1 |
| Heavy-duty arm | payload 3 | reaches only the middle of the table |
| Tall base | reaches a high shelf | can't come down to the table |
| Extra-long arm | reaches past the table edge | payload 0.5 |
| Gripper (standard) | anything with sides, up to the arm's payload | flat, loose, big, fragile |
| Suction | flat smooth things | holes, slats, round sides, loose bits |
| Magnet | any metal | anything else |
| Wide gripper | big things | anything not big; things that spill |
| Scoop | loose bits | anything solid |
| Soft gripper | fragile things | over weight 1; flat, loose, big |
| Hook | anything with a handle | anything without one |

## Challenges (one file each in `src/workshop/challenges/`)

| Challenge | Task | Solved by |
|---|---|---|
| Plate | plate -> rack | Suction + Compact / Long / Heavy-duty |
| Far | can at the right edge -> green bin | Long + Gripper / Magnet / Soft |
| Heavy | pot (weight 2) -> zone | Compact or Heavy-duty + Gripper / Magnet |
| Washer | steel washer -> blue tray | Magnet + Compact / Long / Heavy-duty |
| Crate | big slatted crate (weight 2) -> pallet | Wide gripper + Compact / Heavy-duty |
| Anvil | anvil (weight 3) -> red zone | Heavy-duty + Gripper / Magnet |
| Marbles | loose marbles -> bowl | Scoop + Compact / Long / Heavy-duty |
| Shelf | jar on a high shelf -> basket | Tall base + Gripper / Soft |
| Cart | light parcel on a side cart -> outbox | Extra-long + Gripper / Suction / Soft |
| Egg | fragile egg -> carton | Soft gripper + Compact / Long / Heavy-duty / Extra-long |
| Scrap | washer -> tray AND can -> bin, one robot | Long + Magnet |
| Restock | parcel from the cart, then the anvil (swap arms) | Extra-long, then Heavy-duty |
| Dinner | plate -> rack, then pot -> zone (swap tools) | Suction, then Gripper / Magnet on Compact / Heavy-duty |
| Bucket | pail of sand with a handle (weight 2) -> sandy zone | Hook + Compact / Heavy-duty |

## Switches and testing

- `ENABLED_PARTS` / `ENABLED_CHALLENGES` in `src/config.ts`: delete a word to turn an item off. A challenge hides
  itself when no robot that solves it can be built from the enabled parts.
- `?challenges=egg,bucket` in the URL limits the Workshop to those challenges (quick testing, demos).
- `npm run test:modular` (unit: every robot against every challenge, reach, grab rules, swaps, switches) and
  `npm run e2e:modular` (desktop, mouse: each challenge with wrong then right parts; every part button).
- `node scripts/workshop-live-check.mjs`: one short live Orbis session checking the per-attempt world switch.
- `node scripts/panel-shot.mjs workshop out.png`: renders the headset parts panel to a PNG.

## Headset checks

In order, in `docs/STATUS.md` ("Headset checks for the autonomous run", all NOT YET TESTED ON HEADSET). Setup:
`adb reverse tcp:5173 tcp:5173`, open `http://localhost:5173/?orbis=0` (stub) or `http://localhost:5173/` (live
wall; restart `npm run dev` first), Enter VR, poke **Robot Workshop**.
