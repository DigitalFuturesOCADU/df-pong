# DF Pong: game pages

Every class gets its own page (its own URL, player list, and saved settings). Since 2026 the game code
lives in one shared, versioned engine, and each class page is just two small files.

```
game/
├── engine/2026/          the 2026 game engine (shared)
├── cc26/                 a class page
│   ├── index.html        title, instance id, which engine to use
│   └── players-config.json
├── test/                 controller test page (test mode)
├── builder/              Settings Builder (for students)
├── admin/                admin panel (for hosts)
├── _template/            copy this to make a new class page
└── cc25/ physComp26-501/ physComp26-502/
                          2025 pages, each with its own frozen copy of the 2025 code
```

## Make a page for a new class

1. Copy `_template/` and rename it, e.g. `game/cc27/`.
2. In `index.html`, set `instance` (a short id, used for saved settings and the admin room) and `title`.
3. Put the class list in `players-config.json` (same format as previous years):

   ```json
   {
     "players": [
       { "deviceNumber": 1, "name": "Kate" },
       { "deviceNumber": 2, "name": "Nick" }
     ]
   }
   ```

   Numbers can be anything from 1 to 242. Students can also type a number that isn't on the list.

Options in `index.html`:

| Option | Meaning |
|---|---|
| `instance` | Short id. Settings are saved per instance; it's also the admin room name. |
| `title` | Shown in the lobby and the browser tab. |
| `engine` | Path to the engine, e.g. `'../engine/2026/'`. |
| `roster` | The players file (default `players-config.json`). |
| `relay` | Admin relay for other devices, e.g. `'wss://pong-relay.example.com'`, or `'same-origin'` when served by `server/relay.js`. |
| `defaults` | Starting house rules: `pointsToWin`, `puckSpeed`, `speedIncrement`. |
| `testMode` | Opens *Controller details* and makes player 2 the computer. |

URL parameters override these: `?relay=…`, `?room=…`, `?debug=1`, `?test=1`.

## Versions and backwards compatibility

- **Pages are never upgraded in place.** The 2025 pages keep their own copy of the 2025 code and still work
  exactly as they did.
- **Engines are versioned by year.** For 2027, copy `engine/2026/` to `engine/2027/`, make changes there, and
  point the new class pages at it. Fixes to the 2026 engine reach every 2026 page at once.
- **Every controller generation must keep working** in every new engine: 2024 (shared UUID, name from the
  device), 2025 (per-number UUID), 2026 (plus the config characteristic). See
  [../docs/PROTOCOL.md](../docs/PROTOCOL.md). The engine tests (`engine/2026/tests/`) simulate all three.

## The 2026 engine

Plain JavaScript files, loaded in order by each page (no build step). Each file has one job:

| File | Job |
|---|---|
| `settings.js` | What can be customized, validation, house rules, settling rule requests |
| `ble.js` | Web Bluetooth: finding a controller by number, handshake, config, auto-reconnect |
| `audio.js` | Web Audio: synthesized and recorded sounds, custom sounds from URLs, pitch/pan by game state |
| `arena.js` | Physics in a fixed 1200 × 800 world at 120 steps per second; the computer player |
| `effects.js` | Sparks, rings, shake, confetti, flashes |
| `render.js` | Draws the arena with p5 into a 2D buffer |
| `postfx.js` | Optional WebGL pass: shockwaves, color fringing, vignette, grain |
| `player.js` | One side: who they are, how they play, their effective settings |
| `game.js` | Match states, scoring, what happens on every hit |
| `admin-link.js` | Talks to the admin panel (BroadcastChannel + WebSocket relay) |
| `ui.js` | Lobby, scoreboard, overlays, settings panel, controller details, touch controls |
| `sketch.js` | p5 `setup()`/`draw()`: wires everything together |

Speeds use the same units as previous years (units per 1/60 s in a 1200 × 800 world), so a puck speed of 5
and a paddle speed of 10 feel the same as before, now on every screen size and refresh rate.

### Sounds

`engine/2026/assets/sounds/manifest.json` lists the recorded sounds (public-domain, CC0 and CC BY recordings
from the Internet Archive and Wikimedia Commons; see `CREDITS.md` there). Each name can be used by players
(`setHitSound("name")`); the `roles` section picks what the game plays for hits, walls, points, the countdown,
the serve, the win, and the ambient room sound. More sounds are synthesized in `audio.js`, and every role
falls back to a synthesized sound if a file can't load.

### Tests

Run `node server/relay.js` and open http://localhost:5501/game/engine/2026/tests/. The page runs the real
`settings.js` and `ble.js` against simulated 2024, 2025, 2026 and library-1.2-on-ESP32 controllers, including
dropped connections and busy-GATT conditions.

## Running locally

```bash
node server/relay.js
```

Open http://localhost:5501/game/cc26/. Web Bluetooth needs `https://` or `localhost`.
