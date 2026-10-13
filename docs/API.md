<!-- Generated from api/dfpong-api.json by api/build.mjs. Edit the spec, not this file. -->

# DFPONG API 1.0

The API grows a little every year. These rules let it change without breaking the controllers, games and admin panels already out there.

- Machine-readable: [api/dfpong-api.json](../api/dfpong-api.json). How to change it: [api/README.md](../api/README.md).
- How connecting works step by step (handshake, reconnecting, padding): [PROTOCOL.md](PROTOCOL.md).

## How the API changes

- The movement characteristic never changes: every controller since 2024 relies on it.
- Add, don't change. New settings, names, values and messages arrive in a minor version (1.0 → 1.1). Existing ones keep their meaning.
- Readers forgive. The game ignores settings it doesn't know (and lists them in its debug panel), uses the default for any value it can't use, and clamps numbers into range. Controllers and admin panels ignore fields they don't know.
- Experimental items can still change or disappear without a new major version. Try them; don't build a whole project on them yet.
- Deprecated items keep working for at least one more school year, and their replacement is named here.
- Breaking changes need a new major version (2.0) and a new configVersion. Avoid them: old controllers will still send configVersion 1 for years.

| Status | Meaning |
|---|---|
| stable | Safe to use. Will keep working the same way. |
| experimental | Works now, but may change or be removed in a minor version. |
| deprecated | Still works; use the replacement named in `replacedBy`. |
| planned | Reserved for a future version. Not implemented yet; the name is taken so nothing else uses it. |

Every item says its status and the version it arrived in (`since`). A controller's settings
carry `"v": 1`, the API's major version.

## Bluetooth

Each controller is a Bluetooth LE peripheral. The browser finds it by a service UUID that ends in the controller's number. UUID = base + suffix. Two hex digits: 13 + the controller number (controller 1 → 0e, controller 242 → ff). Every 2024 controller uses 14. Controller numbers: 1–242.

| Characteristic | UUID base | Properties | Status | What it does |
|---|---|---|---|---|
| `movement` | `19b10011-e8f2-537e-4f6c-d104768a12` | read, write, notify | stable · 1.0 | Controller → game: the paddle direction, sent as a notification when it changes. Game → controller: 3 (hello) during the handshake. The game also reads it every 1.5 s to check the controller is still there. |
| `config` | `19b10012-e8f2-537e-4f6c-d104768a12` | read, notify | stable · 1.0 | The controller's settings as one JSON object (see `settings`). The game reads it when connecting, and reads it again whenever the controller notifies a change. |
| `actions` | `19b10013-e8f2-537e-4f6c-d104768a12` | — | **planned** | A small, fast channel for things that happen during play (taunts, absolute paddle position, power-ups). Older games won't subscribe to it. |

Movement values (1 byte):

| Value | Name | Meaning |
|---|---|---|
| 0 | NEUTRAL | stop |
| 1 | UP | move up |
| 2 | DOWN | move down |
| 3 | HANDSHAKE | hello: sent by the controller until the game writes a 3 back |

Treated as NEUTRAL by every game version. Settings JSON: at most 512 bytes, updated at most every 250 ms.

| Timing | Value | Meaning |
|---|---|---|
| `handshakeRepeatMs` | 500 | how often a controller repeats its hello until the game answers |
| `subscribeTimeoutMs` | 10000 | how long a controller waits for the game to subscribe after connecting |
| `handshakeTimeoutMs` | 5000 | how long a controller waits for the handshake after the game subscribes |
| `aliveCheckMs` | 1500 | how often the game checks a connected controller still answers |
| `aliveTimeoutMs` | 2000 | how long the controller has to answer a check |
| `aliveStrikes` | 2 | missed checks in a row before the game reconnects (and pauses a match) |

## Controller settings

One JSON object on the config characteristic, for example:

```json
{"v":1,"name":"Thunderpaddle","color":"#d08b5b","moveSpeed":14,"hitSound":"pluck","pointsToWin":7}
```

All keys are optional. **player** settings only change your side; **requests** are shared game rules,
settled with the other player when the match starts (see policies). "During a match" says when a change
takes effect if the controller changes it mid-match (see below).

| Key | Kind | Type | Range | Permission | During a match | Library | Status |
|---|---|---|---|---|---|---|---|
| `name` | player | text | up to 20 characters | `name` | looks | `setPlayerName()` | stable · 1.0 |
| `color` | player | color | "#rrggbb" or a color name | `color` | looks | `setPlayerColor()` | stable · 1.0 |
| `moveSpeed` | player | number | 1–100, default 10 | `moveSpeed` | handling | `setMoveSpeed()` | stable · 1.0 |
| `paddleSize` | player | number | 50–200, default 100 | `paddleSize` | handling | `setPaddleSize()` | stable · 1.0 |
| `hitSound` | player | sound | up to 200 characters | `sounds` | looks | `setHitSound()` | stable · 1.0 |
| `scoreSound` | player | sound | up to 200 characters | `sounds` | looks | `setScoreSound()` | stable · 1.0 |
| `winSound` | player | sound | up to 200 characters | `sounds` | looks | `setWinSound()` | stable · 1.0 |
| `music` | player | music | up to 200 characters | `music` | next match | `setMusic()` | stable · 1.0 |
| `pointsToWin` | request | number | 1–21, default 10 | `requests` | next match | `requestPointsToWin()` | stable · 1.0 |
| `puckSpeed` | request | number | 1–20, default 5 | `requests` | next match | `requestPuckSpeed()` | stable · 1.0 |
| `speedIncrement` | request | number | 0–1, default 0.15 | `requests` | next match | `requestSpeedIncrement()` | stable · 1.0 |

- `name`: The controller's name in the game. A controllerName in the class list comes first; without either, the game uses the person's name from the class list.
- `color`: Paddle and trail color: "#rrggbb" or any CSS color name. Very dark colors are brightened so the paddle stays visible.
- `moveSpeed`: Paddle speed. 10 is normal.
- `paddleSize`: Paddle height in percent of normal.
- `hitSound`: Played when your paddle hits the puck: a built-in sound name (see `sounds`) or an https:// link to a short sound file.
- `scoreSound`: Played when you score.
- `winSound`: Played when you win the match.
- `music`: Background music for your matches: a track name (see `music`) or an https:// link. If both players bring music, the host chooses one or the game alternates each point.
- `pointsToWin`: Asks to play to this many points.
- `puckSpeed`: Asks for this starting puck speed. 5 is normal.
- `speedIncrement`: Asks for this much extra puck speed after every hit.

## When changes apply during a match

The host chooses (house setting `liveChanges`). **looks**: Name, color and sounds. **handling**: Paddle speed and size. **next match**: Shared with the other player (rule requests, music): always waits for the next match.

| `liveChanges` | Label | Looks | Handling | Status |
|---|---|---|---|---|
| `instant` | Right away | now | now | stable · 1.0 |
| `point` (default) | Between points | now | next serve | stable · 1.0 |
| `match` | Next match | match end | match end | stable · 1.0 |

## House settings

Permissions (which kinds of settings controllers may use):

| Permission | Label |
|---|---|
| `name` | Custom names |
| `color` | Custom colors |
| `sounds` | Custom sounds |
| `music` | Custom music |
| `moveSpeed` | Custom move speed |
| `paddleSize` | Custom paddle size |
| `requests` | Rule requests |

Policies (how two different rule requests are settled):

| Policy | Label |
|---|---|
| `average` (default) | Average the two requests |
| `random` | Coin flip between requests |
| `lower` | Use the lower request |
| `higher` | Use the higher request |
| `house` | Ignore requests (house rules) |

## Built-in sounds

For `hitSound`, `scoreSound` and `winSound`. Any `https://` link to a short sound file works too.

| Name | Kind | What it is |
|---|---|---|
| `pingpong` | recorded | one table-tennis ball hit |
| `claves` | recorded | one strike of hardwood claves |
| `tick` | recorded | a watch tick |
| `bell` | recorded | a freshly cast bronze bell |
| `gong` | recorded | one strike of a cone gong |
| `bikebell` | recorded | a bicycle bell |
| `flourish` | recorded | a band's ruffle and flourish |
| `applause` | recorded | clapping and cheering |
| `pip` | recorded | a time-signal pip |
| `pipgo` | recorded | the time signal's final tone |
| `quindar` | recorded | an Apollo-era Quindar tone |
| `clock` | recorded | a kitchen-clock tick |
| `blip` | synth | short square-wave beep |
| `boop` | synth | low falling boop |
| `pluck` | synth | plucked string |
| `click` | synth | tiny click |
| `laser` | synth | falling laser zap |
| `drum` | synth | small drum |
| `chirp` | synth | rising chirp |
| `zap` | synth | electric zap |
| `thud` | synth | soft thud |
| `wood` | synth | wood block |
| `glass` | synth | glass ping |
| `coin` | synth | arcade coin |
| `classic` | original | the 2024 paddle hit |
| `wall` | original | the 2024 wall bounce |
| `ding` | original | the 2024 point ding |

## Music

For `music`. Any `https://` link to a music file works too.

| Name | Kind | Mood | Credit | Licence |
|---|---|---|---|---|
| `drift` | generated | calm | DF Pong |  |
| `tabletop` | generated | steady groove | DF Pong |  |
| `arcade` | generated | bright | DF Pong |  |
| `nightbus` | generated | lo-fi | DF Pong |  |
| `gymnopedie` | recorded | calm piano | Satie, played by Robin Alciatore (Musopen) | Public domain |
| `smallsteps` | recorded | calm ambient | Lee Rosevere | CC BY 4.0 |
| `bounce` | recorded | minimal pulse | Loyalty Freak Music | CC0 |
| `currents` | recorded | lo-fi groove | HoliznaCC0 | CC0 |
| `palmleaf` | recorded | light ragtime | Scott Joplin, rendered by James Brigham | CC0 |
| `spacemtv` | recorded | light chiptune | Komiku | CC0 |

## Class list

The class list each game folder ships with: { "players": [ … ] }. Older games read the same file and ignore fields they don't know. File: `players-config.json`.

| Field | Type | Limits | Status | Meaning |
|---|---|---|---|---|
| `deviceNumber` (required) | number | 1–242 | stable · 1.0 | The controller's number. |
| `name` | text | up to 40 characters | stable · 1.0 | The person. Shown in the lobby's list so people can find themselves, and under the controller's name. |
| `controllerName` | text | up to 30 characters | stable · 1.0 | What the game calls this controller everywhere. Comes before the controller's own name setting. |

## Admin messages

Admin panels and games talk through a BroadcastChannel (same browser) or the WebSocket relay (server/relay.js). Every message is a JSON object with a `type`. Games only act on admin:* messages and admins only read game:* messages. Every game and admin joins a room (default: the game folder's instance name, e.g. cc26; change it with ?room=…). Rooms never see each other.

### `admin:rules`

admin → game · stable · 1.0

Changes house rules. Every field is optional and validated by the game.

| Field | Meaning |
|---|---|
| `rules` | { pointsToWin, puckSpeed, speedIncrement } (house values) |
| `locks` | { key: true } — locked rules ignore what controllers ask for |
| `policy` | one of `policies` |
| `liveChanges` | one of `liveChanges` |
| `music` | 'auto' (players' choice), 'off', 'p1', 'p2' or a music name |
| `permissions` | { permission: true\|false } for each of `permissions` |
| `target` | optional game id; without it every game in the room obeys |

### `admin:command`

admin → game · stable · 1.0

| Field | Meaning |
|---|---|
| `command` | start \| pause \| resume \| reset \| lobby \| rematch |
| `target` | optional game id |

### `admin:table`

admin → game · stable · 1.0

Names one game ("Table A"). Ignored without a target.

| Field | Meaning |
|---|---|
| `name` | up to 24 characters; empty clears it |
| `target` | required game id |

### `admin:hello`

admin → game · stable · 1.0

Asks every game in the room to send its state now.

### `game:state`

game → admin · stable · 1.0

Sent on every change and at least every 2 seconds.

| Field | Meaning |
|---|---|
| `id` | the game's id (kept when its tab reloads) |
| `instance` | game folder, e.g. cc26 |
| `title` | class title |
| `table` | table name, or empty |
| `state` | lobby \| versus \| rules \| countdown \| serve \| playing \| paused \| won |
| `score` | [left, right] |
| `rules` | the rules in play |
| `house` | house rules |
| `locks` | locks |
| `policy` | policy |
| `liveChanges` | live-change mode |
| `permissions` | permissions |
| `musicChoice` | the house music choice |
| `music` | what that means right now |
| `players` | for each side: slot, name, person, device, kind, status, gen, color, moveSpeed, paddleSize, requests, sounds, music, issues |

## Planned

- **actions** (planned): In-game actions over the actions characteristic: taunts (a sound and a flash, rate-limited), absolute paddle position (for potentiometers and distance sensors, still speed-limited like touch), power-ups with cooldowns the game enforces.
- **feedback** (planned): The game tells the controller which settings it accepted and why any were refused, so the Serial Monitor can show it.

## Changelog

### 1.0 (2026-10-13)

- First written spec. Describes what the 2026 game (cc26) and DFPongController 2.1 do: movement and config characteristics, every setting, built-in sounds and music, house settings, the class list and admin messages.
