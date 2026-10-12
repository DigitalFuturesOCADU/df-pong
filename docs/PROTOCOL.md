# DF Pong Protocol Reference (2026)

This document is the single source of truth for how controllers, the game, and the
admin panel talk to each other. The game (`game/cc26/`), the Arduino library
([df-pong-controller](https://github.com/DigitalFuturesOCADU/df-pong-controller)),
and the admin relay (`server/`) all implement this spec.

**Golden rule:** every controller generation ever handed to students must keep working.
New features are only ever *added* next to the old ones — nothing old changes meaning.

---

## 1. Controller generations

| Generation | Firmware | How it is found | Player name comes from | Settings |
|---|---|---|---|---|
| **2024** | Raw ArduinoBLE sketch (`Pong-Controller` repo) | One fixed UUID shared by every 2024 controller (suffix `14`) | BLE device name (`BLE.setLocalName`) | none |
| **2025** | Raw sketch with `DEVICE_NUMBER`, or DFPongController 1.x | Unique UUID per controller number | `players-config.json` | none |
| **2026** | DFPongController 2.x | Same as 2025 | `players-config.json` (optionally overridden by the controller) | config characteristic (section 4) |

The 2026 game supports all three. A 2026 controller also still works in the 2025 game
(the extra characteristic is simply ignored there).

---

## 2. UUIDs

Every UUID is a 34-character base plus a two-digit lowercase hex suffix:

```
suffix = hex(13 + controllerNumber)          controllerNumber: 1 … 242
         controller 1  → "0e"
         controller 2  → "0f"
         controller 242 → "ff"
```

| Role | Base | Generation |
|---|---|---|
| Service | `19b10010-e8f2-537e-4f6c-d104768a12` + suffix | 2024, 2025, 2026 |
| Movement characteristic | `19b10011-e8f2-537e-4f6c-d104768a12` + suffix | 2024, 2025, 2026 |
| Config characteristic | `19b10012-e8f2-537e-4f6c-d104768a12` + suffix | 2026 only (optional) |

**2024 legacy controllers** all use suffix `14` (which is also what controller #7 uses).
The game offers a "2024 controller" option that filters on suffix `14` and shows the
browser's device chooser, where students pick their controller by its BLE name.

The browser only shows devices that **advertise** the service UUID, so firmware must
put the service UUID in its advertising packet (both ArduinoBLE and NimBLE do this
with `setAdvertisedServiceUuid` / `addServiceUUID`).

---

## 3. Movement characteristic (all generations — never change this)

- Properties: `READ | WRITE | NOTIFY`, 1 byte.
- Controller → game (notify):

| Value | Meaning |
|---|---|
| `0` | NEUTRAL — paddle stops |
| `1` | UP |
| `2` | DOWN |
| `3` | HANDSHAKE ("hello, I'm here") |
| anything else | treated as NEUTRAL by every game version |

### Handshake

The handshake exists so the controller knows a game (not just any BLE central) is listening.

1. Game connects and subscribes to notifications on the movement characteristic.
2. **Game writes `3` right after subscribing** (2026 game). This rescues controllers whose
   own hello was sent before the game subscribed (library 1.x on ESP32 always does this).
3. Controller sends `3` (notify) until it receives a written `3`.
   - 2026 library: repeats every 500 ms while connected, subscribed and not yet complete.
   - 2024/2025 sketches and library 1.x: send it once.
4. Controller marks the handshake complete when it receives a written `3`, then sends a
   normal movement value (`0` at first).
5. The game treats the first `0`/`1`/`2` it receives as "handshake complete".

**Echo warning:** ArduinoBLE (Nano 33 IoT, Nano 33 BLE, UNO R4) notifies subscribers of
any value the browser writes, so every `3` the game writes comes straight back as a `3`.
A game that blindly answers every `3` ping-pongs forever (the 2025 game does, harmlessly
but wastefully). The 2026 game therefore:

- answers a `3` only while the handshake is incomplete, and not within 400 ms of its own write;
- if no movement value has arrived, writes `3` again once a second;
- ignores `3` entirely once the handshake is complete. (A `3` never changes the paddle's direction.)

**Timeouts on the controller:**
- Library 1.x disconnects if the handshake isn't complete 5 s after connecting.
- Library 2.x allows 10 s for the game to subscribe, then 5 s for the handshake.

Never delay the game's hello behind slow work.

---

## 4. Config characteristic (2026)

A read-only JSON document describing the player's custom settings.

- UUID: `19b10012-…12` + suffix (same suffix as the service).
- Properties: `READ | NOTIFY`.
- Value: UTF-8 JSON object, **at most 512 bytes**, no trailing NUL required (the game strips NULs).
  Trailing spaces are allowed (see below).
- Always present on 2026 firmware, even when empty: `{"v":1}`.

### Reading

The game reads the full value with a normal GATT read (long reads are handled by the
browser and both BLE stacks, so values longer than one packet are fine).

**Packet-boundary padding.** ArduinoBLE 2.1.0 answers a read that starts exactly at the
end of a value with an error rather than an empty reply. A browser reads long values in
(MTU − 1)-byte pieces, so a value whose length is an exact multiple of that size could fail
to load. Library 2.x pads the JSON with trailing spaces so its length is never a multiple of
22, 184, 241, 243, 246, 250 or 511 (the packet sizes of common boards, computers and phones).

### Live updates

If the controller changes a setting after connecting, it updates the value and sends a
notification. The notification payload may be cut off at the packet size, so **the game
ignores the payload and re-reads the characteristic**. The library sends at most one
update every 250 ms.

### Keys

All keys are optional. Unknown keys are ignored by the game (and listed in the debug
panel), so new keys can be added in future years without breaking anything.

| Key | Type | Range / format | Default | Kind |
|---|---|---|---|---|
| `v` | int | schema version, currently `1` | `1` | meta |
| `name` | string | ≤ 20 characters (Unicode characters, not bytes) | roster name | player |
| `color` | string | `"#rrggbb"` (any CSS color accepted) | slot color | player |
| `moveSpeed` | number | 1 – 100 | 10 | player |
| `paddleSize` | number | 50 – 200 (percent of normal) | 100 | player |
| `hitSound` | string | built-in sound name **or** `https://` URL (≤ 200 chars) | built-in | player |
| `scoreSound` | string | same as above | built-in | player |
| `winSound` | string | same as above | built-in | player |
| `pointsToWin` | int | 1 – 21 | 10 | game request |
| `puckSpeed` | number | 1 – 20 | 5 | game request |
| `speedIncrement` | number | 0 – 1 | 0.15 | game request |

Example:

```json
{"v":1,"name":"Kate","color":"#d08b5b","moveSpeed":14,"hitSound":"pluck","pointsToWin":7}
```

### Validation (game side)

- Numbers are clamped to range; the debug panel notes "clamped".
- Colors that would be invisible on the dark background are lightened just enough to be seen.
- Sound URLs must be `https://` (an `http://` URL is upgraded to `https://` first).
  The sound must load within 8 seconds and be under 2 MB. Anything that fails falls
  back to the default sound, and the lobby shows why.
- If the JSON can't be parsed at all, every setting uses its default.

### Built-in sound names

These names always work. They ship with the game; the synthesized ones are generated in the
browser, and `bell` and `gong` fall back to synthesized versions if their recordings can't load.

- Recorded: `pingpong`, `claves`, `tick`, `bell`, `gong`, `bikebell`, `flourish`, `applause`, `pip`, `pipgo`, `quindar`, `clock`
- Synthesized: `blip`, `boop`, `pluck`, `click`, `laser`, `drum`, `chirp`, `zap`, `thud`, `wood`, `glass`, `coin`
- Originals (2024): `classic`, `wall`, `ding`

`game/cc26/assets/sounds/manifest.json` is the authoritative list. Names are case-insensitive. A name the game doesn't know falls
back to the default sound (and the lobby says so).

---

## 5. Settings: who decides?

**Player settings** (`name`, `color`, `moveSpeed`, `paddleSize`, sounds) only affect that
player, so there is no conflict — the controller's value is used unless the admin has
disabled that kind of customization.

**Game settings** (`pointsToWin`, `puckSpeed`, `speedIncrement`) are shared, so the two
players' requests can conflict. They are resolved once, when the match starts, and the
result is shown on the "Match Rules" card before the countdown:

1. If the admin **locked** a setting → the admin's value wins.
2. If both players asked for different values → apply the **conflict policy**:

   | Policy | Result |
   |---|---|
   | `average` (default) | the mean, rounded to the setting's step |
   | `random` | a coin flip between the two requests |
   | `lower` / `higher` | the smaller / larger request |
   | `house` | ignore player requests, use the house value |

3. If only one player asked → that request is used.
4. If nobody asked → the house value (admin / local settings panel / instance default).

Requests that change mid-match apply to the next match.

---

## 6. Admin protocol

The admin panel (`game/cc26/admin/`) changes house rules and permissions and can send
commands. It can reach the game two ways:

- **Same browser**: `BroadcastChannel` named `dfpong:<room>` — zero setup.
- **Any device**: WebSocket relay (`server/relay.js`), URL `ws(s)://host/relay`.

`<room>` defaults to the game instance name (e.g. `cc26`).

Every message is a JSON object with a `type`.

### Joining the relay

```json
{"type":"hello","role":"game","room":"cc26","id":"g-4f2a"}
{"type":"hello","role":"admin","room":"cc26","key":"optional-admin-key"}
```

If the server was started with `ADMIN_KEY`, admin sockets must present it. The relay
only forwards `admin:*` messages from authenticated admin sockets, and only forwards
`game:*` messages from game sockets. Messages over 16 KB are dropped.

### Admin → game

```json
{"type":"admin:rules",
 "rules":{"pointsToWin":7,"puckSpeed":5,"speedIncrement":0.15},
 "locks":{"pointsToWin":true},
 "policy":"average",
 "permissions":{"name":true,"color":true,"moveSpeed":true,"paddleSize":false,"sounds":true,"requests":true}}

{"type":"admin:command","command":"start|pause|resume|reset|lobby|rematch","target":"g-4f2a"}

{"type":"admin:hello"}          // asks every game to send its state now
```

Fields may be partial; the game merges them into its house rules and clamps every value.
`target` is optional; without it every game in the room obeys.

### Game → admin

```json
{"type":"game:state","id":"g-4f2a","instance":"cc26",
 "state":"lobby|rules|countdown|playing|paused|serve|won",
 "score":[3,5],
 "players":[{"slot":1,"name":"Kate","device":12,"gen":"2026","connected":true,
             "settings":{"color":"#d08b5b"},"issues":["hitSound: could not load"]},
            {"slot":2,"name":"Keyboard","device":null,"gen":null,"connected":false}],
 "rules":{"pointsToWin":10,"puckSpeed":5,"speedIncrement":0.15},
 "house":{…},"locks":{…},"policy":"average","permissions":{…}}
```

Sent on every state change and at least once every 2 seconds.

Any device that can open a WebSocket (a laptop, a phone, or a Wi-Fi microcontroller)
can act as an admin by speaking these messages.
