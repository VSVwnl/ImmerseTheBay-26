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
  world: { pos: [-0.62, 1.05, -0.3] as Vec3, w: 0.32, h: 0.4 },
  status: { pos: [0, 1.62, -1.15] as Vec3, w: 0.6, h: 0.19 },
  side: { pos: [0.62, 1.05, -0.3] as Vec3, w: 0.36, h: 0.44 },
};
export const PANEL_FACE_POINT: Vec3 = [0, 1.4, 0]; // panels turn to face this point

// ---- World ----
export const WORLD_DEFAULT_MODE: 'morph' | 'fresh' = 'morph';
export const WORLD_MIN_INTERVAL_S = 4;
export const SESSION_REFRESH_S = 150;
export const ORBIS_MODEL = 'reactor/visko-orbis-stable';
export const TOKEN_REFRESH_MARGIN_S = 300;
