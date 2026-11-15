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

// Soundings workcell, in metres; canyon and mirror share geometry reflected across X.
export const SUBSEA = {
  railX: .30, baseZ: -1, camera: [0, 1.16, -1.12] as Vec3,
  innerLamp: [.055, 1.16, -1.12] as Vec3, railLampY: .99,
  dockHandle: [0, .84, -.62] as Vec3, canyonHandle: [.38, .81, -.46] as Vec3,
  cradle: [0, .82, -.75] as Vec3, cageHalfX: .082, cageHalfZ: .065,
  cradleHalfX: .082, cradleHalfZ: .07, cageRimY: .86, clearanceBelowHandle: .07,
};
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
