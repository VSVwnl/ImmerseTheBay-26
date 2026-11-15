# Backlot Recovery

**Stanford track** — AI Horizons (AI x XR · Technical Depth)

**Sponsor target** — Visko Living Worlds · Best Commercial Use Case

## Devpost copy

**Tagline** — When a parcel robot gets stuck, teach its next move with your hands.

**The problem** — A parcel robot can know what to pick and still have no clear route to the tray. Plus One Robotics sells remote exception handling as part of its induction system. Amazon describes its Robin robot calling for human help after unsuccessful picks. Our first prospective buyer is the integration team commissioning a parcel workcell. They could use a headset to rehearse a troublesome layout, capture an operator’s correction and give their controls engineers a reproducible test case. [Plus One Robotics](https://www.plusonerobotics.com/automated-parcel-induction) · [Amazon Science](https://www.amazon.science/latest-news/robin-deals-with-a-world-where-things-are-changing-all-around-it)

**The experience** — A judge chooses which side a blue tote should enter in a live Visko Orbis feed. They freeze the arriving tote and confirm where it actually appeared. Backlot places a matching obstruction in the virtual cell, and the robot runs its usual pick. When the route makes contact, the judge takes over on Quest. They lean in to judge the clearance, guide the open gripper past the tote, pinch the carton and release it over the tray. That movement gives the robot a continuous three-dimensional route with timed grip changes. Then the judge puts their hands down and watches the robot try it.

**What we built** — Backlot records robot state and operator input on a 30 Hz simulation clock. Quest hand trials can include wrist, thumb-tip and index-tip poses alongside the gripper command. The episode preserves the raw samples. A separate skill record identifies approach, grasp, transport and release from the carton’s attachment state. It smooths and reduces the trajectory while preserving grip changes, then checks that the processed commands can deliver the carton from the original checkpoint. The simulator measures completion, tool travel, contact entries and elapsed simulation time. The exported episode pairs each attempt with the incident evidence, including the confirmed Orbis frame for a live incident.

**What the demo proves** — A person can supply an executable recovery and compare it with the original attempt in the same virtual cell. A fresh incident gives the saved motion a chance to fail again. Learning a policy across many incidents and transferring it to a physical robot would be later experiments. A first commercial pilot would measure how often an integrator can reproduce a customer-reported failure and how much engineer time it takes to produce a verified correction.

## 90-second judging script

Open the spectator view on the audience display. Use the live Orbis path for the sponsor demo. The separately labeled local rehearsal lets the team practice without consuming stream time. Show the actual run outcomes, including a failed replay or an ambiguous generated frame.

| Time | What the judge sees or does | Presenter |
| --- | --- | --- |
| 0–10 s | The arm places a carton in a clear station. | “This robot already knows how to pick. What happens when its usual path disappears?” |
| 10–25 s | The judge steers the live infeed left or right, captures a frame and confirms the visible side. | “Bring the blue tote into the lane. Watch the feed and tell us which side it actually came from.” |
| 25–35 s | The local workcell takes the observed geometry. The arm tries again and the display marks the first contact. | “Same carton. Same destination. Here’s where the old motion meets the tote.” |
| 35–55 s | The judge selects **Teach recovery**, guides the gripper around the tote, pinches the carton, carries it clear and releases it over the tray. | “You can see the clearance from either side. Give the robot one route it can follow.” |
| 55–68 s | The judge releases the controls and starts **Replay skill**. The robot runs from the original starting state. | “Hands up. This time the robot is executing your saved commands.” |
| 68–78 s | Point to the measured baseline, human correction and replay rows. | “Read the completion and contact columns first. Now compare how far the gripper actually travelled.” |
| 78–90 s | Start a fresh incident on the other side. Leave the observed result on screen when it arrives. | “Would your route still work if the tote entered from the other side? A failed test gives the integration team its next recovery to teach.” |

If live generation takes longer, keep the audience on the infeed until the tote is visible. An unclear frame is a reason to steer again. A recorded rehearsal can stand on its own as a simulation walkthrough when clearly labeled.

The recorded rehearsal uses desktop input and a local incident. A new Quest hand-tracking trial and live Orbis steering trial for this recovery experience are pending access to the headset and team key.
