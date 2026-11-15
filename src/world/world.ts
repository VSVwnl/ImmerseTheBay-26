// World interface + world list. Only src/world/ may import the Reactor SDK.

export interface WorldDef {
  id: string;
  label: string;
  prompt: string;
  heldOut?: boolean;
}

export type WorldStatus = 'idle' | 'loading' | 'live' | 'stub' | 'error';

export interface World {
  connect(): Promise<void>;
  setWorld(def: WorldDef, mode?: 'morph' | 'fresh'): Promise<void>;
  getVideo(): HTMLVideoElement;
  status(): WorldStatus;
  current(): WorldDef | null;
  disconnect(): Promise<void>;
}

export const PROMPT_PREFIX = 'Wide shot, static camera, eye-level, deep depth of field.';

const W = (id: string, label: string, body: string, heldOut = false): WorldDef => ({
  id,
  label,
  prompt: `${PROMPT_PREFIX} ${body}`,
  ...(heldOut ? { heldOut } : {}),
});

export const WORLDS: WorldDef[] = [
  W('lab', 'Robotics lab', 'A bright robotics lab with white walls, workbenches and shelves of equipment, soft daylight from tall windows, an engineer in a grey hoodie walking slowly between benches in the background.'),
  W('night-market', 'Night market', 'A narrow night market street in steady rain, neon signs glowing red and blue, wet pavement reflecting the lights, people with umbrellas walking past food stalls in the distance.'),
  W('warehouse', 'Warehouse', 'A large warehouse with tall metal shelving and stacked cardboard boxes, cool overhead strip lights, a yellow forklift driving slowly across the far aisle.'),
  W('lunar-base', 'Lunar base', 'The interior of a lunar base with a wide window onto grey cratered ground and a black sky, Earth above the horizon, an astronaut in a white suit walking past outside.'),
  W('kitchen', 'Kitchen', 'A warm home kitchen with wooden cabinets and a tiled wall, morning sunlight through a window, steam rising from a pot on the stove, a ginger cat walking along the counter.'),
  W('greenhouse', 'Greenhouse', 'A glass greenhouse with long rows of tomato plants, humid air, sunlight flickering through the roof, a sprinkler misting water, leaves moving in a light breeze.'),
  W('factory', 'Factory floor', 'An automotive factory floor with a moving conveyor line, sparks from welding in the distance, grey concrete floor, bright industrial lighting.'),
  W('beach', 'Beach', 'A sandy beach at sunset under an orange sky, waves rolling in steadily, palm trees swaying, two people walking along the waterline in the distance.'),
  W('subway', 'Subway (held out)', 'An underground subway platform with white tiled walls and yellow edge markings, fluorescent lights, a train arriving and passengers walking along the platform.', true),
  W('forest', 'Snowy forest (held out)', 'A snowy pine forest at dusk in blue light, snow falling steadily, a deer walking between the trees.', true),
  W('desert', 'Red desert (held out)', 'A red rocky desert under a pale orange sky, dust devils moving across the plain, a rover driving slowly in the distance.', true),
];

/** The world buttons (1-8): the eight training worlds; the held-out ones appear only in Robot's turn. */
export const BUTTON_WORLDS = WORLDS.slice(0, 8);
/** The eight training worlds (M3). Held-out worlds must never be used for training data. */
export const TRAINING_WORLDS = WORLDS.filter((w) => !w.heldOut);
export const HELD_OUT_WORLDS = WORLDS.filter((w) => w.heldOut);

export function worldById(id: string): WorldDef | undefined {
  return WORLDS.find((w) => w.id === id);
}
