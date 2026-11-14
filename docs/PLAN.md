# Plan

## One-line pitch

Teach a robot a task once in VR, let a live world model show it that task in a hundred different
worlds, then watch it do the task alone in a world it has never seen.

## Milestones

Build in this order. Each milestone is a complete demo on its own. All times are Saturday Nov 14, PST.

| # | Milestone | Target | A judge sees | Spec |
| --- | --- | --- | --- | --- |
| M1 | App with stub wall | 12:30 PM | They control a robot arm by hand and finish three challenges | SPEC-M1-app.md |
| M2 | Live Orbis wall | 2:00 PM | The same, inside a live generated world they can switch | SPEC-M2-orbis.md |
| M3 | Data factory | 6:00 PM | Their one demo replays across eight worlds while an episode counter climbs | SPEC-M3-factory.md |
| M4 | Train and evaluate | 10:00 PM | A measured result: one-world policy vs many-world policy | SPEC-M4-policy.md |
| M5 | Policy live in headset | 1:00 AM Sun | The robot does the task alone in a world they name | SPEC-M4-policy.md |

**M1 + M2 is the MVP.** It qualifies for the Visko sponsor track by itself.
After the MVP works, decide what comes next from the clock:

- MVP done by about 3 PM: continue to M3.
- MVP done in the evening: polish the MVP (see "Polish" in SPEC-M2), make the video, stop.
- At any milestone: if it is two hours late, stop there and polish what works.

Sunday: sleep, rehearse at 7:00 AM, submit by 8:30 AM. The demo video and write-up are done
while M4 training runs, not at the end.

## Demo script (full version)

1. The judge puts on the headset. A robot arm stands on a table in front of a huge curved wall
   showing a live world.
2. They tap a world ("Night market"). The wall changes.
3. They complete three challenges by hand: reach, place, sort. A results card shows their data.
4. They press Multiply. The arm replays their place demo while the wall cycles through worlds,
   and a counter climbs.
5. They press Robot's turn and pick a world the robot never trained on. The arm does the place
   task by itself.
6. A panel shows the measured result: success rate of a policy trained on one world versus one
   trained on many, tested in unseen worlds.

Steps 1 to 3 are the MVP. Step 4 is M3. Steps 5 and 6 are M4 and M5.

## What we may claim

- M2: "A tool for collecting robot demonstrations in varied, live generated worlds."
- M3: "One demonstration becomes many visually different training episodes."
- M4: only what the numbers say. If the many-world policy is not better, say so.

What we may not claim:

- That this improves a real robot. Everything is simulated and the arm is kinematic.
- That Orbis simulates the robot. It only generates the video behind and around it.
- Any result we did not measure.

## Tracks

- Primary tracks (two allowed): AI Horizons and Wild West. Confirm with organizers whether
  Wild West, a "bonus" track, uses one of the two slots. If it does not, add Creative Zenith.
- Sponsor track: Visko Living Worlds. Target the "best commercial use case" prize.
- Not entering: ManageXR (needs smart glasses), Virtuous Reality, Game Changer.

## Visko track rules that constrain the build

- Orbis must generate the world live and the user must steer it (voice, hands, controllers,
  gaze or another agent). Our steering: hand-poked world buttons, plus the factory acting as
  "another agent" in M3.
- A working demo that streams Orbis live must be shown to Visko judges on Sunday. A video is not
  enough. The stub wall is for development only.
- Visko reviews the Orbis credits used on our key at 9:00 AM Sunday. Real usage must be on the
  key before then.

## Unknowns to test as early as possible

| Unknown | When to test | If it fails |
| --- | --- | --- |
| Does the Orbis stream play in Quest Browser on venue Wi-Fi? | Start of M2, with Reactor's stock template | Phone hotspot; then run the app in desktop Chrome with the Quest over Link |
| Does hand tracking work well enough to control the arm? | End of M1 | Controllers (grip position + trigger) |
| What does Orbis cost per second and how many credits do we have? | When collecting the API key | Ask for a top-up at the Visko table |
| Does the many-world policy beat the one-world policy? | M4 | Report the result honestly; the M3 demo still stands |

## Setup the developer needs

- Quest 3 in developer mode, USB cable, `adb` installed, hand tracking enabled in headset settings.
- A Reactor API key from the Visko table, saved as `REACTOR_API_KEY=rk_...` in `.env`.
- Node 18+, Python 3.10+, a PyTorch build that supports the laptop GPU.

## Submission checklist

- [ ] Live demo works end to end twice in a row in the headset
- [ ] Demo video recorded (headset capture plus a laptop view of the dataset or result)
- [ ] Write-up states what is real and what is simulated
- [ ] Tracks selected: AI Horizons, Wild West, Visko Living Worlds
- [ ] Repo pushed, README explains how to run without a key (stub) and with one
- [ ] Submitted by 8:30 AM Sunday
