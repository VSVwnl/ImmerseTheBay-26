# M2: live Orbis wall

Goal: the wall shows a live Visko Orbis stream, and the user switches worlds by poking buttons.
With M1 this is the MVP.

Target: working by 2:00 PM Saturday.

## Read the docs first

The facts below were checked against the Reactor docs on Nov 14, 2026. APIs move, so read the
current pages before writing code and trust them over this file.

- Index for agents: https://docs.reactor.inc/llms.txt
- Model overview: https://docs.reactor.inc/model-api-reference/visko-orbis-stable/overview
- Commands, events, state: https://docs.reactor.inc/model-api-reference/visko-orbis-stable/schema.md
- Prompt guide: https://docs.reactor.inc/model-api-reference/visko-orbis-stable/prompt-guide.md
- Tutorial: https://docs.reactor.inc/model-api-reference/visko-orbis-stable/tutorial.md
- Using the SDK: https://docs.reactor.inc/sdk-reference/using-the-sdk.md
- Authentication: https://docs.reactor.inc/authentication.md
- Rate limits: https://docs.reactor.inc/resources/rate-limits.md
- Billing: https://docs.reactor.inc/resources/billing.md

## What Orbis is

- A real-time video model. Input: a text prompt and an optional start image. Output: a continuous
  video track called `main_video` (and an audio track, `main_audio`).
- It generates at 832x480, about 18 fps, and can deliver upscaled to 1080p, 2k or 4k.
- There are no camera or action commands. The only steering is the prompt text.
- Video is produced in chunks of 33 frames (about 1.8 s). A new prompt takes effect at the next
  chunk boundary and takes 2 to 4 s to settle. It morphs; it does not cut.
- The first chunk emits no frames, so a short blank period after `start` is normal.
- A start image is only read at `start`. Sent mid-run it does nothing until `reset` and a new `start`.
- A scene holds together best for its first couple of minutes. For a clean scene, `reset` and start again.
- A run ends after 2000 chunks (about an hour) with `generation_complete` and does not restart itself.
- Model slug: `reactor/visko-orbis-stable`. A second variant, `reactor/visko-orbis-dynamic`, is
  documented identically; we use stable.

## Commands we use

| Command | Payload | Notes |
| --- | --- | --- |
| `set_prompt` | `{ prompt }` | before start, or mid-run to morph |
| `set_resolution` | `{ resolution }` | must be one of `state.available_resolutions`; read at `start` |
| `set_audio_enabled` | `{ audio_enabled }` | read at `start`; `false` makes chunks cheaper |
| `start` | none | fails with `command_error` if no prompt is set |
| `reset` | none | clears prompt and image, keeps resolution and audio settings |

Failures arrive as `command_error` events, not exceptions. `sendCommand` resolves `undefined`
when a command is refused.

## Token route (`server/plugin.ts`)

Add `POST /api/token` to the dev-server middleware.

- It calls `POST https://api.reactor.inc/tokens` with headers `Reactor-API-Key: <key>` and
  `Content-Type: application/json`.
- Body:

```json
{
  "expires_after": 21600,
  "authorization_details": [
    {
      "type": "session",
      "resources": { "models": { "match": ["reactor/visko-orbis-stable"] } },
      "constraints": { "max_sessions": 200 }
    }
  ]
}
```

- It returns `{ jwt, expires_at }` to the browser with `Cache-Control: private, no-store`.
- The key comes from `REACTOR_API_KEY` in `.env` (keys start with `rk_`). If it is missing,
  return 503 so the client falls back to the stub.
- `max_sessions` counts sessions ever created with the token, not concurrent ones. Development
  creates many, so keep it high.

The client must cache the token in memory and reuse it until shortly before `expires_at`.
Minting a new token for every call breaks the session with a 403.

## Client (`src/world/orbis.ts`)

Implements the `World` interface from M1. Shape of the SDK usage:

```ts
import { Reactor } from '@reactor-team/js-sdk';

const reactor = new Reactor({ modelName: 'reactor/visko-orbis-stable' });

reactor.on('trackReceived', (name, track, stream) => {
  if (name === 'main_video') video.srcObject = stream;
});
reactor.on('statusChanged', (status) => { /* 'disconnected' | 'connecting' | 'waiting' | 'ready' */ });
reactor.on('message', (msg) => { /* state, command_error, generation_started, generation_complete ... */ });
reactor.on('error', (err) => { if (err.recoverable) reactor.reconnect(); });

await reactor.connect(jwt);
// once status is 'ready':
await reactor.sendCommand('set_resolution', { resolution: '1080p' });   // only if offered
await reactor.sendCommand('set_audio_enabled', { audio_enabled: false });
await reactor.sendCommand('set_prompt', { prompt });
await reactor.sendCommand('start', {});
```

Behavior:

- `connect()`: fetch the token, connect, wait for `ready`, pick `1080p` if it is in
  `available_resolutions`, turn audio off, then start the first world. `waiting` can take a while
  (the session is being placed on a GPU); show "loading world" on the wall.
- `setWorld(def, 'morph')`: send `set_prompt` mid-run. Ignore or queue calls that arrive less than
  4 s after the previous one; rapid re-steering produces a blurry mess.
- `setWorld(def, 'fresh')`: `reset`, `set_prompt`, `start`. Slower, but a clean scene.
- Default mode for the world buttons is `morph`, because the morph is the impressive part.
  If a full new-world prompt morphs badly, switch the default to `fresh` in `config.ts`.
- After `SESSION_REFRESH_S` (start at 150) in the same run, do a `fresh` restart of the current
  world at the next world change, to avoid drift.
- On `generation_complete`, start again.
- The video element is muted and `playsInline`. Call `play()` from the same user gesture that
  enters VR.
- `status()` reports `loading` until frames are actually arriving (check `video.readyState` or
  use `requestVideoFrameCallback`), then `live`.
- `disconnect()` calls `reactor.disconnect()`. Call it on `pagehide`. Add a visible Disconnect
  button on desktop.
- If there is no key, the token route fails, or the connection errors out, fall back to the stub
  and show `stub` in the status panel.

## Cost and limits

- Billing is per second from the moment a session is `ready`, even if nothing is generated.
  Do not leave tabs connected. The per-second price is not in the docs; check the dashboard.
- 5 concurrent sessions per account, 10 new sessions per minute (burst of 3). Hot-reload can burn
  through this. Do not reconnect on every code change: keep the `Reactor` instance on
  `import.meta.hot.data` or require a click to connect.

## World list (`src/world/world.ts`)

Prompts follow the prompt guide: who does what where, plus camera, in one to three sentences.
The camera is always static and wide because the wall is a backdrop. Describe what is there;
the guide warns that negations ("no people") tend to add the thing.

Shared prefix: `Wide shot, static camera, eye-level, deep depth of field.`

| id | label | prompt after the prefix |
| --- | --- | --- |
| lab | Robotics lab | A bright robotics lab with white walls, workbenches and shelves of equipment, soft daylight from tall windows, an engineer in a grey hoodie walking slowly between benches in the background. |
| night-market | Night market | A narrow night market street in steady rain, neon signs glowing red and blue, wet pavement reflecting the lights, people with umbrellas walking past food stalls in the distance. |
| warehouse | Warehouse | A large warehouse with tall metal shelving and stacked cardboard boxes, cool overhead strip lights, a yellow forklift driving slowly across the far aisle. |
| lunar-base | Lunar base | The interior of a lunar base with a wide window onto grey cratered ground and a black sky, Earth above the horizon, an astronaut in a white suit walking past outside. |
| kitchen | Kitchen | A warm home kitchen with wooden cabinets and a tiled wall, morning sunlight through a window, steam rising from a pot on the stove, a ginger cat walking along the counter. |
| greenhouse | Greenhouse | A glass greenhouse with long rows of tomato plants, humid air, sunlight flickering through the roof, a sprinkler misting water, leaves moving in a light breeze. |
| factory | Factory floor | An automotive factory floor with a moving conveyor line, sparks from welding in the distance, grey concrete floor, bright industrial lighting. |
| beach | Beach | A sandy beach at sunset under an orange sky, waves rolling in steadily, palm trees swaying, two people walking along the waterline in the distance. |
| subway | Subway (held out) | An underground subway platform with white tiled walls and yellow edge markings, fluorescent lights, a train arriving and passengers walking along the platform. |
| forest | Snowy forest (held out) | A snowy pine forest at dusk in blue light, snow falling steadily, a deer walking between the trees. |
| desert | Red desert (held out) | A red rocky desert under a pale orange sky, dust devils moving across the plain, a rover driving slowly in the distance. |

The six world buttons in the MVP are the first six rows. The three "held out" worlds are reserved
for testing the policy in M4 and must never be used when building training data.

## First thing to do: prove the stream plays in the headset

Before integrating, isolate the unknown. Scaffold Reactor's own template in a scratch folder
outside this repo and open it in Quest Browser:

```
npx create-reactor-app orbis-test --model=visko-orbis-stable
# add REACTOR_API_KEY to .env, then: npm run dev   (Next.js, port 3000)
adb reverse tcp:3000 tcp:3000
```

If the stock template streams in Quest Browser, any later problem is in our code. If it does not,
tell the developer immediately; do not spend time integrating. Things to try: a phone hotspot
instead of venue Wi-Fi, then running our app in desktop Chrome with the Quest connected over Link.

## Acceptance checks

- [ ] With a key: on desktop, the wall shows live Orbis video after connecting, and the status
      panel says `live`.
- [ ] World buttons change the world. Rapid presses do not break the stream.
- [ ] In the headset: the same, inside VR, while the challenges still work at full frame rate.
- [ ] Without a key: the app runs on the stub and says `stub`.
- [ ] The API key appears nowhere in the client bundle or in git.
- [ ] Closing the tab ends the session (check the Reactor dashboard).
- [ ] Each attempt record's `world` field holds the world that was showing.

## Polish (only after the checks pass, in this order)

1. Light from the stream. Every 250 ms draw the video into a 16x9 canvas, average the top half
   into the hemisphere light's sky color and the bottom half into its ground color, and tint the
   directional light with the overall average. Blend over time so it does not flicker.
2. The world reacts to success. When a challenge is completed, send one short follow-up prompt
   that describes a single visible change, for example "Golden confetti falls through the air."
   Follow-up prompts describe only the change and do not restate the scene.
3. Voice. If `SpeechRecognition` or `webkitSpeechRecognition` exists in the browser, a spoken
   phrase becomes a custom world (prefix plus the phrase). Feature-detect it; whether Quest
   Browser supports it is unverified. Buttons remain the baseline.
