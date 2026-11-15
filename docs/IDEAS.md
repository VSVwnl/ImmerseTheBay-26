# Backlot — Sunday product shortlist

## Recommended for the modular robotics brief — Soundings

Enter Stanford’s **Game Changer (Gaming)** and target Visko’s **Best showcase of interactivity**. The judge can steer the world with their own build and try the pickup again within a single live stream. [Event judging criteria](https://live.immersethebay.org/tracks)

Build a tabletop underwater robot with room to reach between its rails. Its first assignment is to bring a sound recorder back from Monterey Canyon. The obvious-looking build puts the floodlight beside the camera. In silty water that can illuminate the particles directly in front of the lens and hide the very handle the player wants to grab. The judge who moves the light and recovers the recorder gets to hear what it recorded. Marine engineers actually separate lights and cameras to control backscatter, and researchers use small remotely operated vehicles to recover seafloor instruments. [SubC guide to subsea lighting](https://www.subcimaging.com/case-studies/a-guide-to-subsea-lighting) · [ROV instrument recovery study](https://pmc.ncbi.nlm.nih.gov/articles/PMC7343139/) · [Monterey Bay sounds](https://www.mbari.org/project/soundscape-listening-room/)

**First customer.** A marine robotics instructor or MATE team coach can run a practice station before the next pool session. The student brings a mounting diagram, two camera images and a prediction about the physical build to the pool. A first paid pilot would be one lesson with one team. Test whether a student can light and reach a *new* target on the first attempt and explain the choice. MATE already asks students to design, build and pilot vehicles for ocean-workplace challenges. [MATE competition](https://robotics.nasa.gov/mate/)

### The Sunday robot and course

Give the player one camera, one floodlight and one two-finger arm. Cut four keyed sockets into a single foredeck. The center mast takes the camera. A socket beside the lens takes the lamp. The left and right front rails each take either the lamp or the arm, one part per rail. That gives four legal builds before the player aims the lamp. Moving the arm closer to the handle also takes that rail away from the lamp. Keep the top of the recorder's carry handle accessible to the existing downward-facing gripper.

| Challenge | Player decision | What counts |
| --- | --- | --- |
| Dock check | Mount the arm on either rail and touch an exposed practice handle in clear water. | Observe where the actual jaws stop relative to the requested hand position. |
| Recover the recorder | Choose which rail the arm gets and aim the lamp through the open face of the cage. | Lift the recorder clear of the lip and release it in the cradle. Keep the camera frame at each grasp so a missed approach is inspectable. |
| A second dive | Mirror the cage and handle. Before deploying, point at the handle, predict which mount can reach it and where the lamp should shine. | Record whether the learner can explain and complete a new layout on the first build. A first-try recovery in the main mission advances immediately. |

The actual sound of the instrument gives the team a reward worth recovering. Monterey Bay researchers placed a hydrophone using an ROV arm, and the 2025 MATE EXPLORER course gave student teams a hydrophone-handling task. Soundings proposes a fictional battery-powered recorder recovery. [MBARI hydrophone deployment](https://www.mbari.org/news/underwater-microphone-provides-tantalizing-new-perspective-on-monterey-bay/) · [MATE EXPLORER manual](https://20693798.fs1.hubspotusercontent-na1.net/hubfs/20693798/2025%20EXPLORER%20Manual_FINAL_1_6_withCover.pdf)

### The judge's two-minute dive

1. **Rig the deck.** Start with the camera clipped to a keyed center mast. Let the judge snap a floodlight into either the inner socket beside the lens or an outer rail socket, then aim it with their wrist. The two-finger arm fits either front corner. Show its reachable volume and the lens and lamp cones at the same scale. A far-side lamp can shadow the handle behind a cage bar. The camera can show the handle perfectly while an arm mounted on the far corner falls short.
2. **Try the pickup.** In a stationary pilot station, the mounted camera is the judge's only view of the gripper and handle. Their tracked hand guides the tip in depth and their pinch closes the jaws. Mirror the view for spectators. Start with a simple exposed handle, then introduce a cage lip and silty water in the recovery.
3. **Make the same light work.** Freeze the attempted reach, return to the deck and ask the judge to put a fingertip where the beam first crosses the camera's view. Move the lamp outward, aim it across the handle, then test it in the *running* dive. Show the previous captured frame next to the current one. The judge should decide when they can see well enough to lift. Save successful first tries too.
4. **Recover the recording.** Pinch the handle, clear the lip and drop the instrument into its cradle. Play a short credited whale call as the mission's recovered sound. Let the judge challenge a teammate with the handle tucked behind the opposite side of the cage.

### What Orbis does during play

Keep a single continuous underwater shot. Committing a light position and aim steers that live shot between front-lit suspended particles and a raking beam across the seafloor. Test one distinct change at a time. Use the actual bright particle detail from the incoming video as a translucent foreground in the pilot camera, weighted by the local overlap of the light beam and lens near the vehicle. The handle and gripper share that view, so the video can genuinely obscure the pickup. Local 3D geometry determines arm reach, cage occlusion, beam coverage, and grasp. Orbis supports mid-run steering at generation chunk boundaries. Judge the response from the visible frames. [Orbis Stable](https://docs.reactor.inc/model-api-reference/visko-orbis-stable/overview) · [Current steering implementation](../src/world/orbis.ts#L222)

**What a learner produces.** Extend the 30 Hz trajectory record with socket IDs, lamp aim, predicted outcome, timed steering events and the actual pilot-camera frames at the attempted grasp. Retain misses as well as successful grasps. At the debrief, pair the learner's prediction with the captured image, closest tip-to-handle distance and delivery outcome. An instructor can use these records to investigate poor visibility, insufficient reach or a mistimed grip. Tag each episode as human or replay so it can also be used as a configuration-labeled demonstration. For a controlled comparison, hold the geometry and recorded pose fixed and render both mounts against one captured water frame. Label that comparison as replay. [Trajectory format](../src/tasks/recorder.ts#L11) · [Existing replay](../src/factory/multiply.ts#L48)

**Sunday scope.** First prove on Quest that a judge can tell when the live water obscures the same local handle and can clear the view by changing the light. Then add the keyed mounts, one stationary recovery, the audio payoff and the two-frame debrief, in that order. The second cage layout can be a mirror of the first. The existing arm, pinch input, Place challenge, recorder and Orbis client all carry forward. Mount-dependent kinematics, the pilot view and foreground compositing are new. The dedicated pilot view should be legible at headset size. The existing 96-pixel camera can continue to serve the data pipeline. The demo is ready to rehearse when a new player can steer, diagnose and recover the recorder twice on the headset. The team documented a hand-tracked Quest playthrough and desktop live streaming separately. A desktop morph still showed the previous scene after ten seconds in one test. [Quest playthrough](STATUS.md#first-headset-test-sat-610-pm-recorded-with-adb-shell-screenrecord-page-logged-with-scriptsquest-watchmjs) · [Live-stream observations](STATUS.md#unverified--faked) · [Dataset camera](../src/factory/camera.ts#L13)

**First integration check.** Put a stationary handle in the immersive Quest pilot view, connect the team-key stream and switch the lamp between two mounts. Use bright moving detail from a water-only crop of the live video as the scattering texture. Let a fresh tester identify the clearer view with the socket labels hidden. Include the actual live crop on the spectator display so a Visko judge can see what the model supplied. Prewarm before handing over the headset. Send one steer when a mount or aim is committed and let the learner inspect their reach while the water changes. If the headset falls back to the stub, mark the dive as practice and rehearse live steering again before judging.

**First paid pilot.** Offer a club one supervised Quest practice station before a pool session. Give its coach the mounting diagram and prediction from each learner. Have the learner rig a physical light for a new target and explain their choice. Track first-build recoveries and rebuilds needed in the pool. That result tests whether an instructor would buy a season's set of practice missions.

### Alternative — Blind Pick

**AI Horizons (AI x XR)** is the Stanford entry. Target Visko’s **Best commercial use case**. A technical education instructor gives each student one parcel and one loading hatch. Snap a camera into a left or right post and choose a hood or work light for the neighboring accessory socket. The hood cuts light from outside the lens angle and can clip the view. The lamp lights the package but the forearm can still block the lens. Demonstrate one pick with a pinch. Physically open the dock shutter toward the sensor to steer a live Orbis change from dark aisle to oncoming headlights. Freeze at grasp and inspect what the machine saw. Reuse the original recorded motion to compare mounts and log target visibility, image contrast and the learner's diagnosis. The existing learned picker can provide an extra comparison from its original, fixed camera if the saved models are available. This uses the most of Backlot’s existing picking and evaluation workflow. [VEX classroom arm curriculum](https://education.vex.com/stemlabs/cte/introduction-to-the-6-axis-arm/introduction-to-robotic-arms/introduction) · [Existing simulated policy evaluation](STATUS.md#real-result-m4-live-orbis-walls-run-2026-11-15t00-39-44-104z-dataresultssummaryjson)

### Alternative — Reach the Radio

**Virtuous Reality (Social Good and Social Impact)** is the Stanford entry. Target Visko’s **Best storytelling**. A response-robotics club practices getting a radio through one narrow opening. The student clips an inspection camera onto a side rail and a short or extended gripper arm onto one of two front sockets. The extension buys reach but a load held farther horizontally from the shoulder demands more torque. Use a simple payload limit and keep the mass and lever arm visible. The student points the camera and switches on its lamp to ask the live Orbis world for a view into the lit recess. A stranded person indicates which ledge they can reach. The student reads the visible gesture, chooses a mounting point and delivers the radio with their tracked hand. Replay from the receiving ledge and log the cued side, release position and payload margin. The course has a real precedent in NIST's response-robot tests. It carries the greatest demo risk because a stranger must be able to read the generated gesture. [NIST urban search and rescue robot test course](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=823372)

## Recommended pivot — Blind Side

**Stanford — Virtuous Reality (Social Good and Social Impact). Visko — Best showcase of interactivity.**

An excavator spotter sees a truck enter the work zone and raises a hand. The spotter can see the cab. Can the operator see the signal? Let one trainee experience both jobs during the exact same incident. A civil contractor's safety training manager is the prospective buyer. Cat Simulators describes McConnell Dowell using excavator and loader simulators to teach blind spots to employees and subcontractors. A Washington State investigation documents a spotter hidden from the operator behind the bucket. The proposed first product is one portable, instructor-led exercise on choosing a signaling position. [Contractor training program](https://catsimulators.com/wp-content/uploads/2025/03/McConnell-Dowell-VR-Simulator-Plant-Awareness-Program.pdf) · [Washington State incident report](https://stacks.cdc.gov/view/cdc/228920)

1. **Take the ground position.** Place the trainee at one of two marked positions outside the virtual boom's sweep. A short recorded movement drives the local excavator boom. The trainee steers the live Orbis view through the work-zone gate. They can call in a bright yellow truck or have dust roll across the access road. Once the event is actually visible, they give the instructor-agreed hold signal. Capture the displayed event, head pose, and the signaling hand's pose on the arm replay clock.
2. **See the same seconds from the cab.** Switch the trainee to a stationary cab at eye level. Replay the original gate imagery, boom path and a high-visibility avatar making the trainee's own gesture. A local barrier hides the access road from the cab. Depending on the chosen position and timing, the bucket may hide the glove too. Let the trainee mark the first moment they can identify the signal, or register that they lost visual contact. Keep visibility through the bucket separate from what a person actually noticed.
3. **Change one thing.** Move the virtual spotter to the other designated position and replay the same incident. Inspect both viewpoints at the same instant. For another live trial, let the trainee direct the truck to wait or leave the gate. The incident timing comes from the displayed stream. Keep the recorded pass labeled as replay; give the live Orbis session the scene-steering controls. [Orbis steering](https://docs.reactor.inc/model-api-reference/visko-orbis-stable/overview)

**Build order.** First test one obvious event through the gate in immersive Quest. Then scale the recorded arm movement to a boom, replace the gripper silhouette with a bucket, and add a seat, one barrier, two spotter positions and a glove. The existing recorder stores simulated arm targets and joints at 30 Hz. Add raw head and glove poses because the existing target includes a hand offset. Save a short timestamped strip of actual gate frames for the replay. A single decision frame plus a frozen side-by-side debrief is the lower-scope version if synchronized video capture runs poorly. The headset test and live desktop stream are documented separately. [Arm](../src/arm/arm.ts) · [Recorder](../src/tasks/recorder.ts) · [Hand mapping](../src/input/handlogic.ts) · [Headset test](STATUS.md#first-headset-test-sat-610-pm-recorded-with-adb-shell-screenrecord-page-logged-with-scriptsquest-watchmjs)

**Feature priority.** Put simultaneous spotter and cab views on the audience display at the decision instant. Next, add a rewind point where a line from the cab eye to the glove meets the bucket. Then give the instructor a way to record a different boom sweep on the existing tabletop arm. The classroom pilot would ask whether a trainee can choose a position with a clear view in a second unfamiliar layout and explain their choice.

### Alternate that retains the tabletop gripper — First Contact

**Stanford — Virtuous Reality (Social Good and Social Impact). Visko — Best storytelling.**

A technical-search instructor gives the trainee a simulated radio to place within reach of a person beyond a rubble opening. At the gate of a small local 3D recess, the trainee asks the Orbis-generated person to show where they can reach, waits for an observable response and guides the radio onto the corresponding ledge. Switch to the other side and replay the placement at arm's length. The trainee can try to retrieve their own delivery around the concrete lip. The drill measures this trainee's reach from the modeled position. First test whether people can independently agree on the visible cue in a live run. It is the riskier storytelling bet. Fire academies teach technical search using audio and video equipment, and NIST has described a response-robot test course involving delivery of a kit containing a radio. [Louisiana Fire & Emergency Training Academy](https://feta.la.gov/industrial-training/usar-technical-search-specialist/) · [NIST robot test course](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=823372)

## Archived direction — Second Take

**Stanford — Creative Zenith. Visko — Best commercial use case.**

A producer at a tabletop advertising studio needs to agree on one difficult shot with the agency before booking a motion-control stage. The cinematographer and hand performer use a Quest to rehearse a moving lens, a hand-held product and an environmental cue at tabletop scale. The producer leaves with the chosen four-second take and its blocking marks. G6 MoCo used scaled robot-arm previews, VR scouting, repeatable camera moves and LED reflections for a coffee commercial. Tungsten Media documents using a camera robot and a generated environment for a Morrisons product shot. A paid preproduction pilot for one shot would test demand for this specific tool. [G6 MoCo's production breakdown](https://www.g6moco.com/vp-case-study) · [Tungsten Media's Morrisons shoot](https://tungstenmedia.co.uk/casestudies/morrisons-vp)

### Put San Francisco in the palm of your hand

1. Make the robot wrist a camera. With the lens aimed at a fixed mark on the table, the judge guides it through a short pullback. Replay that path with the existing 30 Hz recorder. The judge is now free to perform in front of their own moving camera.
2. Give the judge a palm-sized virtual compact mirror. Behind the camera, an out-of-frame rectangular panel plays a live Orbis view of the Golden Gate Bridge. Let the judge steer the same shot into rolling fog or a vivid sunset. Start the camera move when the requested change is visible. As the lens pulls back, the judge lifts and tilts the mirror until the city stays in frame. On a monitor in the headset and for the people watching, show the clean view through the robot lens.
3. Screen the four-second take. It opens on the city and pulls back to reveal the judge's hand holding it. The angle of the wrist determines what the lens sees. A miss is visible and correctable on the next pass. Keep the hand model and mirror visible to the shooting camera. Hide rehearsal marks, controls and the robot supporting the lens from the film.

The robotics benchmark can run on a laptop. This rehearsal needs the performer's actual timing, reach and wrist angle in the same coordinate system as the moving lens. The live Orbis image supplies the subject that appears in the mirror. The virtual arm and the performer's tracked motion supply the rest of the shot.

### Build order

- **Prove the reflection on Quest first.** Start with a flat mirror, a stationary camera, one controller-driven prop and the live Orbis panel. Verify in the clean camera view that turning the wrist brings the bridge in and out of frame while the panel stays off camera. Frame a neutral pose that works on the first try. A view-dependent reflection of a finite panel is sufficient for this setup.
- **Add the camera move and playback.** Use the existing arm tool position with fixed camera aim, record one short move, then switch to performing. Add a shot camera at a useful preview resolution and capture a short take. The existing 96-pixel robot camera excludes hands. The existing recorder stores arm targets and joints. Prop orientation and the hand pose visible in the take need new capture. [Arm](../src/arm/arm.ts) · [Recorder](../src/tasks/recorder.ts) · [Camera layers](../src/scene/stage.ts) · [Robot camera](../src/factory/camera.ts)
- **If the core shot works, add matched takes.** Record the prop performance as well as the camera path, steer Orbis again, then replay both tracks for a matched edit. Preserve the actual captured frames for each take. A ghost of the previous prop pose can help the performer retry. A three-frame shot card with camera marks and the selected take gives the producer a handoff.

The team has recorded working hand-driven picking on Quest and a live stream on desktop. The live reflection, wrist-mounted camera and shot playback in the headset are proposed work. The product demo can run independently of the trained picking models. [Headset test](STATUS.md#first-headset-test-sat-610-pm-recorded-with-adb-shell-screenrecord-page-logged-with-scriptsquest-watchmjs)

## Previous recommendation — visual testing for robot picking

**Stanford — AI Horizons (AI x XR). Visko — Best commercial use case.**

Hand the headset to a robotics engineer and ask, “Can you change where this robot aims without touching the cube?” The engineer demonstrates one pick, freezes the workbench just before the grasp and directs a change in the live scene. Two translucent grippers show where the same robot wants to move before and after the change.

The first customer would be a robotics startup or manipulation lab with an external RGB camera that sees the surroundings of its picking station. Its engineer wants to choose which conditions deserve time on the physical bench. DROID documents the cost of collecting demonstrations across environments and describes a real setup with Quest teleoperation and external cameras. SIMPLER studies sensitivity to background, lighting and distractors. The first pilot would take one troublesome condition from one team and see whether the engineers use the resulting observations to design a physical test. [DROID](https://droid-dataset.github.io/) · [SIMPLER](https://simpler-env.github.io/)

### The judge's experiment

1. Let the judge guide the gripper with their hand, pinch a carton, lift it and release it into a tote. Replay their spatial trajectory up to the instant before the grasp. Hold the robot, carton, camera and gripper state there. Capture the robot's image and ask the policy for its next target.
2. Let the judge choose a change in the same live aisle, such as rolling a bright red stock cart behind the bench or turning on amber work lights. Keep Orbis running while the workbench is frozen. When the change is visible in the robot camera, capture the second image and query the same policy with the same gripper state. Keep comparison overlays out of both camera inputs. The stream also tints the local scene lighting. [Orbis steering](https://docs.reactor.inc/model-api-reference/visko-orbis-stable/overview) · [Scene lighting](../src/scene/streamlight.ts)
3. Draw the two commanded targets at actual scale and label their separation in centimeters. Let the judge lean around the carton to inspect depth. Resume the live policy from the frozen state and show whether it completes the pick. Nearly identical targets are a legitimate observation. Save both source images, gripper state, model identifier, prompt, outputs and outcome so an engineer can rerun the one-step comparison. [Policy input and output](../src/factory/obs.ts) · [Inference client](../src/policy/client.ts)

The team reports **15/60** successful placements for the lab-only model and **27/60** for the eight-world model on the same layouts in three held-out generated worlds. This was one simulated evaluation with 2,000 scripted training episodes per model. The judge supplies a fresh reference movement for the comparison. [Recorded result](STATUS.md#real-result-m4-live-orbis-walls-run-2026-11-15t00-39-44-104z-dataresultssummaryjson)

**First rehearsal on the demo machine.** Recover the team key, trained weights and result summary. Check that a judge wearing the Quest can steer a visible change, see it in the robot camera and get a real policy command. The team records working Quest hand control and desktop live streaming. The combined immersive path still needs a test. Build direct entry to Place, frozen-state capture and the two target markers first. If inference is unavailable, the same headset interaction can still capture a pair of camera observations for review, with the earlier policy result identified as a separate experiment. [Headset observations](STATUS.md#unverified--faked) · [App flow](../src/app.ts)

### Alternative for interactivity — Blind Lift

**Stanford — Virtuous Reality (Social Good). Visko — Best showcase of interactivity.**

A crane instructor needs an apprentice to experience what the operator can actually see. At ground level the judge gives one stop signal. Switch to a fixed cab and replay their recorded glove motion. From the cab, steer the live Orbis jobsite into low morning sun or a visually busy work shift and repeat the signal. Mark the instant the glove becomes hard to see, reposition the virtual signaler and retry. Reuse Quest hand input, replay, the second camera and live lighting. Add glove pose recording, two viewpoints and one cab pillar. The product is an instructor-reviewed visibility drill. OSHA requires communication to be maintained during operations that rely on signals. [OSHA crane signal requirements](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.1419)

### Alternative for storytelling — The Last Shot

**Stanford — Creative Zenith (Creative). Visko — Best storytelling.**

A film-school crew wants to choose the emotional beat for a five-second insert before booking stage time. In Quest the judge puppeteers the existing robot arm lifting a lost locket at a station. They crouch to set a camera at platform height, then direct Orbis to bring a train into the shot or let the last carriage disappear. Replay their exact foreground performance against each live-directed take. End by screening both shots and letting the judge choose the edit. New work is one prop, a placeable camera and short take capture. Epic documents shot composition and blocking as practical VR production workflows. [Epic's virtual scouting guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-scouting-in-unreal-engine)

## Earlier demo directions

### Exit 1R — an evacuation decision at one aircraft door

**Stanford — Virtuous Reality (Social Good). Visko — Best commercial use case.**

An airline cabin-safety instructor wants a trainee to practice one judgment call. The evacuation has been ordered. Based on what they can see outside their assigned exit, will they use it or redirect people down the aisle? During the American Airlines Flight 383 evacuation, a flight attendant blocked exit 1R because the fire was too close to its slide. Lufthansa Aviation Training already uses animated exterior hazards in a cabin trainer. A portable, instructor-steered rehearsal between sessions is the proposed product. [NTSB report](https://www.ntsb.gov/investigations/AccidentReports/Reports/aar1801.pdf) · [Lufthansa trainer](https://www.lufthansa-aviation-training.com/en/-/ceet-airbus-a330-340-virtual-slide-muc)

Give one judge the instructor controls on the laptop and one the crew position in Quest. The instructor changes a clear apron to a fire near the exit while the trainee faces the aisle. The trainee turns, leans into the window's sightline, and either reaches for the handle or guards the exit and points people along the aisle. At debrief, show the actual window frame at the first reach and replay the hand path. The instructor judges the decision against what appeared. With one judge, have a teammate take the trainee role for the first run and swap.

Build a short cabin wall, a window aperture, a handle, one aisle marker, two exterior prompts and a decision-frame capture. The foreground is local 3D and the existing Orbis wall becomes the view outside. The new work includes head-pose logging and mapping the existing tracked input to door actions. First test a visible fire from inside the window on Quest, before detailing the cabin. An instructor-reviewed practice drill is the scope.

### Night Shift — recover one missed robot pick

**Stanford — AI Horizons (AI x XR). Visko — Best showcase of interactivity.**

A warehouse supervisor practices taking control when a camera-guided picking robot needs help. The judge steers a brightly patterned cart through the live background and sees it enter the robot-camera feed. They can call for a handoff at any point. Freeze the arm and parcel in place, let the judge physically guide the gripper onto the parcel, then hand the same pick back to the policy. Save the intervention time, hand path and final placement outcome. Plus One Robotics markets remote human supervision for picking robots. [Yonder](https://www.plusonerobotics.com/human-in-the-loop)

This retains the most of Backlot. It needs a shared simulation state across handoff, a robot-camera inset and a correction replay. The existing Take Over action exits to idle. Recover the saved model checkpoints and verify inference on Quest before promising a live handback. Label any preselected prior miss as a replay, and let the live policy's actual outcome stand. [App flow](../src/app.ts) · [Policy loop](../src/policy/robot.ts)

### One Core — a Monterey Canyon sampling mission

**Stanford — Game Changer (Gaming). Visko — Best storytelling.**

An aquarium visitor pilots a stationary underwater robot to bring home one sediment core. Guide the gripper down in three dimensions, take the core and return the tube to its rack. A low sideways sweep sends a live silt-plume prompt to Orbis. Backing off gives the water time to clear. Composite the visible plume over the work area so the visitor must decide when they can see enough to try again. End with a cross-section of the recovered core and the number of times the pilot disturbed the simulated seabed. MBARI pilots collect real push cores using manipulator arms. [MBARI expedition log](https://www.mbari.org/news/wind-farm-expedition-2019-log-3/)

Keep the scene to one tube, rack and fixed sampling station. Reuse Place, hand control, stream-driven lighting and replay. New work is the coring motion, foreground visibility effect and end reveal. The core and scoring stay in the local simulation. The live Orbis response supplies the visual conditions for the next move.

**Build choice.** Exit 1R gives the strongest Visko pitch if the team can make one outside hazard legible through the window on Quest. Night Shift preserves the most working robotics code. One Core offers the strongest local story and a physical skill a first-time visitor can master. The latest headset test records working hand tracking, pinch grasp and completion of the three challenges. Live visual steering still needs a deliberate on-headset check. [Headset test](STATUS.md#first-headset-test-sat-610-pm-recorded-with-adb-shell-screenrecord-page-logged-with-scriptsquest-watchmjs)

## Original concepts

## 1. Backlot | A visual stress test for robot picking

**Stanford track — AI Horizons (AI x XR). Visko target — Best commercial use case.**

“A red carton goes in the tote. Does the robot still find it when a red cart rolls behind the bench?”

The first user is the vision engineer at a warehouse robotics integrator. Before booking a physical workcell, they need to choose which customer-site conditions to recreate. Give them a way to demonstrate one correct pick, generate a visual challenge and leave with a robot-camera image and an observed result to take to the hardware team. A plausible first sale is a pilot for one picking station. The pilot question is whether the engineer finds a case worth reproducing on the bench. Integrators already test customer applications before shipment, and robotics researchers study how backgrounds, lighting and visual distractions affect picking. [Applied Motion Systems](https://appliedmotionsystems.com/services/robotic-workcell-integration/bin-picking/) · [SIMPLER research](https://simpler-env.github.io/)

### The judge's 90-second experiment

1. **Demonstrate the pick.** Start at a quiet dispatch bench in Quest. Reach out, pinch the red cube, lift it over the bin lip and release. Record the three-dimensional path and gripper timing. Show one frame from the robot's fixed camera at the moment of grasp. Quest is the instrument the operator uses to author the movement. There is precedent for collecting manipulation demonstrations this way. [OPEN TEACH](https://open-teach.github.io/)
2. **Change what the robot sees.** Let the judge choose “Roll a red stock cart across the back aisle” or “Turn on the amber night-shift lights.” Send that prompt to the running Orbis stream and wait for the change to appear. Replay the judge's exact movement with the same object positions. Freeze the same instant from both camera views so the judge can see what changed around the gripper. Orbis generates the moving background, and the local scene samples its colors to light the arm and table. [Orbis steering](https://docs.reactor.inc/model-api-reference/visko-orbis-stable/overview) · [Backlot replay](../src/factory/multiply.ts) · [Backdrop lighting](../src/scene/streamlight.ts)
3. **Give the robot a turn.** Reset to the same starting layout. A previously trained policy attempts the pick using the 96 × 96 camera image and gripper state. Display the judge's chosen condition, camera frame and actual outcome. A miss gives the engineer a candidate for a physical test. A successful placement records one condition the simulated picker handled. A second policy can retry the layout if time permits. The live background continues moving between attempts. [Robot camera](../src/factory/camera.ts) · [Policy loop](../src/policy/robot.ts)

### Evidence to put beside the live trial

The repository reports one completed simulation run. On the same 20 starting layouts in each of three unseen Orbis environments (subway, snowy forest and red desert), the lab-only policy placed the cube **15/60 times (25%)**. The policy trained across eight worlds placed it **27/60 times (45%)**. Each used 2,000 scripted demonstrations. The judge's new hand recording creates a new example for replay. Warehouse-specific performance and transfer to physical equipment remain open questions. [Recorded evaluation](STATUS.md#real-result-m4-live-orbis-walls-run-2026-11-15t00-39-44-104z-dataresultssummaryjson)

### What to build first

1. On the demo machine, load the team key, both trained checkpoints and the result summary. Run one real steering command, one hand- or controller-driven placement and one autonomous attempt in Quest Browser. The recorded live checks were on desktop, and the data directory and checkpoints are absent from this checkout. [Headset checklist](STATUS.md#manual-headset-checklist)
2. Add a direct entry to Place. Retain the starting layout when switching world or policy. In the current flow, Robot's Turn appears after Reach, Place and Sort, and switching generates a new layout. [App flow](../src/app.ts) · [Policy reset](../src/policy/robot.ts)
3. Put the robot-camera view on the spectator display, show the two grasp frames and add the two warehouse prompts. Disable the automatic celebration prompt during the experiment. Prewarm the stream and rehearse the visible change on venue Wi-Fi. The recorded wide scene change sometimes took over ten seconds to become apparent. Keep the scored loop to one autonomous attempt. [Live observations](STATUS.md#unverified--faked)

## 2. Break My Robot | A hands-on AI literacy exhibit

**Stanford track — Virtuous Reality (Social Good). Visko target — Best showcase of interactivity.**

A science museum educator wants visitors to learn what one successful robot demo can establish. The visitor performs a pick at the 3D workbench, predicts whether the robot will repeat it and directs a new Orbis distraction. They compare the view from their own head position with the fixed robot-camera image. End with a third situation and ask the visitor to identify one visual change to test while holding the pick still. The observable learning outcome is whether the visitor can design that fair test. Reuse Place, world steering, camera capture and the policies. Add a prediction prompt and an exit question. A museum exhibit on how training data shapes AI is an existing precedent. [Museum of Science](https://www.mos.org/visit/exhibits/exploring-ai-making-invisible-visible)

## 3. The Last Shot | Rehearse one virtual-production insert

**Stanford track — Creative Zenith (Creative). Visko target — Best storytelling.**

A student cinematographer has one booked stage session and needs to decide how to frame a five-second pickup shot. In Quest, puppeteer the existing robot arm retrieving a lost locket on a station platform. Place a virtual camera at rail height. Replay the same performance while directing Orbis to clear the platform and let the last train pull away. Compare the two takes and choose which makes the retrieval feel like a goodbye. The headset is used for spatial blocking and prop performance. The moving platform backdrop supplies the story beat. Build one locket, one movable camera and take capture. This option needs the most new visual craft. [Emerson's virtual production stage](https://support.emerson.edu/hc/en-us/articles/24507948261147-EML-Virtual-Production-Studio) · [Epic's virtual scouting workflow](https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-scouting-in-unreal-engine)

The [Stanford dashboard](https://live.immersethebay.org/tracks) lists a Sunday, November 15 deadline of 9:00 a.m. Pacific. The Visko entry needs a live world stream that the user can steer. Register at the Visko table for the team key if still needed.
