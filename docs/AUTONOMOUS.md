# Autonomous Workshop run: rules (Sun Nov 15, until 06:30 PST / 14:30 UTC)

Saved verbatim in substance from the developer's instructions. Re-read this file after any context compaction.

## Goal
Keep inventing and building new robot parts and new challenges, so the project becomes "pick the right robot
for the job". Every new challenge runs in the main challenge flow: same controls, same recording, and a random
Orbis world on the wall for each attempt. Do not ask questions: decide, log the decision in docs/STATUS.md, keep going.

## Git rules (strict)
- Stay on the current branch (`modular`). Never create, switch, merge, rebase or delete a branch. Never force-push.
- The starting commit is tagged `safe-start` (a tag, not a branch).
- One addition per commit. Commit only when the tests pass. Push after each commit. No co-author or attribution lines.
- If an addition can't be made to pass within 20 minutes, undo it (git revert, or discard the uncommitted
  changes) and move to the next idea.
- Each new part and each new challenge lives in its own file, with one commit per item. Commit message format:
  `ADD part: <name>` or `ADD challenge: <name>`.

## Time rules (strict)
- Check the time with `date -u` before starting each addition.
- Do not start a new addition after 13:45 UTC (05:45 Pacific).
- From 14:00 UTC (06:00 Pacific): no new work. Only fix, test and tidy.
- At 14:30 UTC (06:30 Pacific): stop completely, with everything committed and pushed, tests passing,
  STATUS.md updated and the final report sent.

## What must not break
- The standard robot (Compact + Gripper) and the original three challenges behave exactly as before.
- The scripted expert, datasets, training, evaluation and "Robot's turn" stay on the standard robot and the
  original challenges.
- `npm run dev` works without an Orbis key (stub world).
- No physics engine, no new heavy dependencies, simple primitive meshes only. Smooth on a Quest 3.

## A good part
- A clear strength and a clear weakness: no part is best at everything.
- Works with the current arm maths: the tool points straight down.
- Starting ideas: magnet (metal only), scoop (round or loose items), wide gripper (big items, can't pick small
  ones), extra-long arm (very weak), heavy-duty arm (strong, short), tall base (reaches a raised shelf, can't
  reach the near table edge). Invent others too.

## A good challenge
- At least one robot configuration solves it and at least one fails; a failure shows a clear reason label.
- Under 60 seconds, reads at a glance, one-line hint.
- Fits the theme; a random Orbis world per attempt through the existing world list and World interface.
  Record world, arm, tool and result in the attempt file.
- Harder challenges (two steps, or a part change mid-challenge) only after the simple ones work.

## Switches
- `ENABLED_PARTS` and `ENABLED_CHALLENGES` in `src/config.ts` list every part and challenge; deleting one word
  turns an item off. Nothing may crash when an item is off.
- If a part is switched off, any challenge that needs it hides itself automatically.

## For every addition
1. One line in docs/STATUS.md: what it is and why it's interesting.
2. Build it. Unit tests: reach, grab rules, solvable with the right parts, not with the wrong ones.
3. Quick desktop check of the new item with Playwright, and look at the screenshot.
4. Run the modular tests (`npm run test:modular`; desktop: `npm run e2e:modular`), not the whole suite.
   Commit and push when they pass.
5. Add its headset checks to docs/STATUS.md, marked "NOT YET TESTED ON HEADSET".
- Keep a table in docs/STATUS.md: item, commit hash, which parts a challenge needs, which configurations solve it.
- Finish one addition completely before starting the next. Quality over count.

## Testing
- Per addition: only the modular tests (parts, grab rules, new challenges), runnable alone with one command.
- The whole suite exactly once, at 14:00 UTC (06:00 Pacific), as the final check. If anything outside the
  modular code fails, fix it or revert the addition that caused it before 14:30 UTC.

## Orbis
If the key is present, test with the live stream where it matters: one session at a time, always disconnect,
log the minutes used. Otherwise use the stub world.

## Final report at 06:30 Pacific
One message: branch name and last commit; parts and challenges added and which configurations solve each;
anything reverted; test results; Orbis minutes used; the headset checklist in the order to try things.
