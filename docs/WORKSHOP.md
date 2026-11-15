# Robot Workshop (branch `modular`)

Additive feature. The standard robot (Compact arm + Gripper) and the Reach / Place / Sort challenges behave
exactly as on `main`. Not merged.

## What it is

- **Parts** (Workshop parts panel; in the headset it is to your left, beside the Worlds panel):
  - Arm: **Compact** (the original arm, payload 2) or **Long** (links 35% longer, payload 1, reaches further).
  - Tool: **Gripper** (the original) or **Suction** (flat rubber pad).
  - Changing a part rebuilds the arm at once. A challenge in progress restarts from its countdown and the
    unfinished attempt is not saved.
- **Grab rules** (tags on each object, checked when you close the tool on it):
  - `needsTool`: plate needs Suction, can and pot need the Gripper.
  - `weight`: the pot weighs 2, so the Long arm (payload 1) can't lift it.
  - Reaching for an object the arm can't get to says "Out of reach".
  - A failed grab is obvious: the tool wobbles, a short buzz plays, and a red label floats up with the reason
    ("Too heavy for this arm", "Can't grip a flat plate", "Out of reach").
- **Challenges** (new layout ids, each 60 s):

  | Challenge | Task | Works with |
  |---|---|---|
  | Plate | plate near the robot -> rack | Suction, either arm |
  | Far | can at the right edge of the table -> green bin | Long + Gripper |
  | Heavy | pot near the robot -> glowing zone | Compact + Gripper |

  The hint "Pick the right parts for the job" shows on the idle screen and in every countdown.
- **Recording**: every attempt file now has `arm`, `tool`, `success` and `grabFails`. Standard attempts record
  `compact` + `gripper`. Replays rebuild the recorded robot, and older files without parts replay as the standard robot.
- **Standard-robot only**: the scripted expert, the datasets, training, Multiply and Robot's turn. In Workshop
  mode, Multiply and Robot's turn are shown disabled: "standard robot only, off in Workshop". Leaving the
  Workshop ("Back to the standard robot") restores Compact + Gripper and Reach / Place / Sort.

Tunables: `WORKSHOP` and `PANELS.workshop` in `src/config.ts`.

## Headset checks

Setup as usual: `adb reverse tcp:5173 tcp:5173`, open `http://localhost:5173/?orbis=0` (no paid Orbis) or
`http://localhost:5173/` (live wall), Enter VR.

1. [ ] On the side panel (right), poke **Robot Workshop**. The status panel says "Pick the right parts for the
   job" and a **Workshop: parts** panel appears to your **left**, beside the Worlds panel. Can you find it
   and poke it comfortably without stepping? If it's awkward, say where it should go.
2. [ ] Poke **Long arm** and **Suction**: the arm rebuilds at once (visibly longer links, round pad instead
   of fingers). Poke **Compact arm** and **Gripper**: back to the original look.
3. [ ] Poke **Start**. **Plate** with the Gripper: pinch on the plate. Nothing is picked up, the tool
   wobbles, you hear a short buzz, and "Can't grip a flat plate" floats up. Is the label readable?
4. [ ] Poke **Suction** during the challenge: it restarts with a countdown. Pinch on the plate, it sticks to
   the pad; release over the rack and the plate stays there. Success.
5. [ ] **Far** (the can at the right edge): with the Compact arm, reach for it. The tip stops short and
   pinching says "Out of reach". Switch to **Long arm** + **Gripper**, carry the can to the green bin.
6. [ ] **Heavy** (the pot): with the Long arm, pinching says "Too heavy for this arm". Switch to **Compact
   arm**, put the pot on the glowing zone. The results card shows Plate / Far / Heavy.
7. [ ] On the results card, Multiply and Robot's turn are greyed out with "standard robot only, off in Workshop".
8. [ ] Poke **Back to the standard robot**: the parts panel disappears, the arm is Compact + Gripper, and the
   side panel lists Reach / Place / Sort. Run them once: they play as before.
9. [ ] Hand-tracking feel with the Long arm: the arm-driving hand zone is the same, but the Long arm's tip
   goes further to the sides. Any accidental pokes on the parts panel while driving?
10. [ ] Frame rate holds after several part swaps (each swap builds a new arm model).
