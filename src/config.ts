// Every tunable number lives here. Values from the specs are starting values unless marked fixed.

export type Vec3 = [number, number, number];

// ---- Stage ----
export const TABLE = { width: 1.2, depth: 0.7, top: 0.75, cx: 0, cz: -0.75, thickness: 0.04 };
export const FLOOR_RADIUS = 4;
export const WALL = {
  radius: 3.5,
  arcDeg: 120,
  // height chosen so the curved surface is 16:9
  get height() {
    return (this.radius * (this.arcDeg * Math.PI) / 180) * (9 / 16);
  },
};

// ---- Arm ----
export const ARM_BASE: Vec3 = [0, 0.75, -1.0];
export const SHOULDER_H = 0.12;
export const L1 = 0.4;
export const L2 = 0.4;
export const TOOL_LEN = 0.12;
export const FINGER_GAP_OPEN = 0.07;
export const FINGER_GAP_CLOSED = 0.05;
export const FINGER_ANIM_S = 0.15;

// Tip workspace
export const WORKSPACE = {
  min: [-0.4, 0.76, -0.9] as Vec3,
  max: [0.4, 1.2, -0.45] as Vec3,
};
export const HOME_TIP: Vec3 = [0, 1.0, -0.65];

// ---- Env ----
export const MAX_TIP_SPEED = 0.6; // m/s
export const GRAB_RADIUS = 0.05;
export const CUBE_SIZE = 0.05;
export const BIN = { w: 0.16, d: 0.16, h: 0.08, wall: 0.006 };
export const BIN_POS = {
  red: [-0.3, 0.75, -0.55] as Vec3,
  blue: [0.3, 0.75, -0.55] as Vec3,
};
export const REACH_RADIUS = 0.03;
export const REACH_HEIGHT = 0.15; // above table
export const REACH_SUCCESS_DIST = 0.04;
export const CUBE_SPAWN = { xMin: -0.15, xMax: 0.15, zMin: -0.85, zMax: -0.6, minSep: 0.1 };

// ---- Sim timing ----
export const SIM_HZ = 30; // human app: fixed-step env + recording rate (fixed: replay depends on it)
export const SIM_DT = 1 / SIM_HZ;

// ---- Challenges ----
export const COUNTDOWN_S = 3;
export const CHALLENGE_LIMIT_S = 60;

// ---- Desktop input ----
export const DESKTOP_CAMERA = { pos: [0, 1.55, 0.05] as Vec3, lookAt: [0, 0.97, -1.0] as Vec3, fov: 60 };
export const WHEEL_STEP = 0.0006; // m per wheel delta unit
export const KEY_RAISE_SPEED = 0.3; // m/s for W/S

// ---- XR input ----
export const HAND_OFFSET: Vec3 = [0, -0.05, -0.25];
export const HAND_ACTIVE_MIN_Y = 0.7;
export const HAND_ACTIVE_MAX_Z = -0.1;
export const PINCH_CLOSE = 0.025;
export const PINCH_OPEN = 0.04;
export const HAND_SMOOTH = 0.35; // blend per frame at 72 Hz
export const HAND_SMOOTH_REF_HZ = 72;

// ---- Panels ----
export const POKE_DEBOUNCE_MS = 400;
export const POKE_DEPTH = 0.025; // m in front/behind panel surface that counts as inside the button box
export const PANEL_PX_PER_M = 900;
export const PANELS = {
  // Panels with buttons sit above the hand's working height while driving the arm (about 0.8-1.25 m, up to
  // ~0.5 m to each side); at 1.05 m the right hand poked Start/Stop by accident in the headset test.
  world: { pos: [-0.72, 1.55, -0.4] as Vec3, w: 0.32, h: 0.46 },
  status: { pos: [0, 1.62, -1.15] as Vec3, w: 0.6, h: 0.19 },
  side: { pos: [0.72, 1.55, -0.4] as Vec3, w: 0.36, h: 0.44 },
  counter: { pos: [0.72, 1.24, -0.4] as Vec3, w: 0.36, h: 0.09 }, // no buttons, so it may sit lower
  thumbs: { pos: [0.95, 1.55, -0.95] as Vec3, w: 0.72, h: 0 },
  // Robot Workshop parts: to the user's left, beside the World panel, above the hand zone
  // tall enough for 6 rows of part buttons; bottom edge at ~1.27 m, just above the hand zone
  workshop: { pos: [-0.8, 1.56, 0.0] as Vec3, w: 0.42, h: 0.58 },
};
export const PANEL_FACE_POINT: Vec3 = [0, 1.4, 0]; // panels turn to face this point

// ---- World ----
export const WORLD_DEFAULT_MODE: 'morph' | 'fresh' = 'morph';
export const WORLD_MIN_INTERVAL_S = 4;
export const SESSION_REFRESH_S = 150;
export const ORBIS_MODEL = 'reactor/visko-orbis-stable';
// After a reset Orbis streams black frames until the new world renders. The wall counts as live only once a
// 16x9 sample of the video has a mean brightness (0-255) above this.
export const ORBIS_BLANK_LUMA = 12;
// Frames in the first moment after generation_started can still be the old world; ignore them for this long.
export const ORBIS_GEN_SETTLE_MS = 1000;
export const TOKEN_REFRESH_MARGIN_S = 300;

// ---- Polish ----
export const STREAM_LIGHT = { periodS: 0.25, blendS: 0.8, whiteMix: 0.45 };
export const SUCCESS_NUDGES = [
  'Golden confetti falls through the air.',
  'Fireworks burst in the sky in the distance.',
  'Warm golden light washes over the scene.',
  'Colorful balloons float up into the air.',
];

// ---- Dataset camera (M3) ----
export const DATASET_CAMERA = { pos: [0, 1.35, 0.15] as Vec3, lookAt: [0, 0.85, -0.8] as Vec3, fov: 60 };

// ---- Multiply (M3 Part A) ----
export const MULTIPLY_SETTLE_S = 4;

// ---- Factory (M3 Part B) ----
// worldEvery: spec start value 10; 20 halves the live world switches (~8-27 s of Orbis each) to fit the time budget.
export const FACTORY = { seedBase: 1000, worldEvery: 20, stubSettleMs: 1700 };

// ---- Switches: delete one word to turn a Workshop part or challenge off ----
// The standard robot (compact + gripper) and Reach/Place/Sort always exist outside the Workshop: the expert,
// datasets, training and Robot's turn depend on them. Turning compact or gripper off only hides them here.
export const ENABLED_PARTS: string[] = ['compact', 'long', 'heavyduty', 'tall', 'xlong', 'gripper', 'suction', 'magnet', 'wide', 'scoop', 'soft', 'hook'];
export const ENABLED_CHALLENGES: string[] = ['plate', 'far', 'heavy', 'washer', 'crate', 'anvil', 'marbles', 'shelf', 'cart', 'dinner', 'egg', 'scrap', 'restock', 'bucket'];

// ---- Robot Workshop (additive; the standard robot is Compact + Gripper and uses the values above) ----
export const WORKSHOP = {
  longScale: 1.35, // Long arm links are this much longer than L1/L2
  payload: { compact: 2, long: 1, heavyduty: 3, tall: 2, xlong: 0.5 },
  // Extra-long: links 70% longer; reaches past the table's side edges but lifts only light things
  xlongScale: 1.7,
  xlongWorkspace: { min: [-0.85, 0.76, -0.95] as Vec3, max: [0.85, 1.3, -0.42] as Vec3 },
  // Tall base: shoulder 0.3 m higher; reaches high shelves but its tip can't come down to the table
  tallRise: 0.3,
  tallWorkspace: { min: [-0.35, 0.9, -0.95] as Vec3, max: [0.35, 1.45, -0.6] as Vec3 },
  heavyScale: 0.8, // Heavy-duty links are this much shorter (and drawn thicker)
  // Heavy-duty reach: about the middle of the table only (its full stretch is 0.63 m)
  heavyWorkspace: { min: [-0.3, 0.76, -0.92] as Vec3, max: [0.3, 1.05, -0.58] as Vec3 },
  // the Long arm may command the tip further out than WORKSPACE; Compact keeps WORKSPACE exactly
  longWorkspace: { min: [-0.56, 0.76, -0.95] as Vec3, max: [0.56, 1.3, -0.45] as Vec3 },
  // a grab attempt that misses an object outside the arm's workspace by up to this (m, horizontal) says "Out of reach"
  reachHintRadius: 0.55,
  reachHintDy: 0.4, // ... and up to this far above or below it (the shelf jar is high above the other arms)
  slipS: 0.45, // tool wobble after a failed grab
  labelS: 1.8, // floating reason label lifetime
  plate: { radius: 0.06, thick: 0.012, spawnX: [-0.1, 0.1] as [number, number], spawnZ: [-0.85, -0.75] as [number, number] },
  can: { radius: 0.03, height: 0.11, x: 0.51, spawnZ: [-0.8, -0.62] as [number, number] },
  pot: { radius: 0.055, height: 0.08, spawnX: [-0.12, 0.12] as [number, number], spawnZ: [-0.85, -0.75] as [number, number] },
  rack: { pos: [0.3, 0.75, -0.56] as Vec3, w: 0.18, d: 0.18, h: 0.03 },
  canBin: { pos: [-0.3, 0.75, -0.56] as Vec3 }, // same box size as BIN
  zone: { pos: [0.3, 0.75, -0.56] as Vec3, size: 0.18 },
  washer: { radius: 0.03, thick: 0.007, spawnX: [-0.12, 0.12] as [number, number], spawnZ: [-0.85, -0.75] as [number, number] },
  tray: { pos: [0.3, 0.75, -0.56] as Vec3 }, // parts tray (bin-sized)
  crate: { size: 0.13, spawnX: [-0.1, 0.1] as [number, number], spawnZ: [-0.86, -0.8] as [number, number] },
  pallet: { pos: [-0.28, 0.75, -0.58] as Vec3, w: 0.22, d: 0.2, h: 0.02 },
  wideGap: { open: 0.17, closed: 0.135 },
  softGap: { open: 0.075, closed: 0.052 },
  softMaxWeight: 1, // the soft gripper's foam fingers let anything heavier slip
  anvil: { w: 0.1, h: 0.065, d: 0.05, spawnX: [0.12, 0.22] as [number, number], spawnZ: [-0.86, -0.76] as [number, number] },
  dropZone: { pos: [-0.24, 0.75, -0.66] as Vec3, size: 0.16 },
  marbles: { r: 0.011, spread: 0.03, spawnX: [-0.14, -0.02] as [number, number], spawnZ: [-0.86, -0.76] as [number, number] },
  bowl: { pos: [0.27, 0.75, -0.62] as Vec3, r: 0.08, h: 0.045 },
  // high shelf (top surface height) with a glass jar on it, and a tall basket whose rim the tall base can reach
  shelf: { pos: [-0.3, 0.75, -0.86] as Vec3, top: 1.37, w: 0.2, d: 0.14 },
  jar: { r: 0.03, h: 0.1, spawnX: [-0.36, -0.24] as [number, number], spawnZ: [-0.89, -0.83] as [number, number] },
  basket: { pos: [0.3, 0.75, -0.66] as Vec3, w: 0.16, d: 0.16, h: 0.2 },
  // side cart beside the table's back-right corner, top level with the table, with a light parcel on it
  cart: { pos: [0.72, 0.75, -0.92] as Vec3, w: 0.18, d: 0.2 },
  parcel: { size: 0.07, spawnX: [0.69, 0.75] as [number, number], spawnZ: [-0.94, -0.88] as [number, number] },
  outbox: { pos: [-0.05, 0.75, -0.55] as Vec3 },
  egg: { r: 0.024, stretch: 1.3, weight: 0.3, spawnX: [-0.12, 0.12] as [number, number], spawnZ: [-0.86, -0.76] as [number, number] },
  carton: { pos: [0.28, 0.75, -0.6] as Vec3, w: 0.16, d: 0.1, h: 0.03 },
  // Scrap (two steps, one robot): a washer near the robot and a can at the far right edge
  scrap: { washerX: [-0.14, -0.04] as [number, number], washerZ: [-0.86, -0.76] as [number, number] },
  // a big plastic pail of sand with a carrying handle (weight 2) -> sandy zone
  bucket: { r: 0.06, h: 0.09, spawnX: [-0.14, -0.02] as [number, number], spawnZ: [-0.86, -0.78] as [number, number] },
  sandZone: { pos: [0.28, 0.75, -0.62] as Vec3, size: 0.17 },
  // Dinner (two steps, swap tools between): plate -> rack on the right, pot -> zone on the left
  dinner: {
    plateX: [-0.16, -0.08] as [number, number], potX: [0.08, 0.16] as [number, number], spawnZ: [-0.86, -0.76] as [number, number],
    rack: [0.3, 0.75, -0.6] as Vec3, zone: [-0.3, 0.75, -0.6] as Vec3,
  },
};
