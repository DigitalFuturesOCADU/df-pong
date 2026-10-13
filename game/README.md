# DF Pong: game versions

Every class gets its own folder, with its own copy of the game. A new version never changes an older one,
so a link from a past class keeps working exactly as it did.

```
game/
├── cc26/                 Creation & Computation 2026 (the 2026 game)
│   ├── index.html        page settings: title, instance id, admin relay, default rules
│   ├── players-config.json
│   ├── js/               the game code
│   ├── css/
│   ├── assets/sounds/    recorded sounds, manifest.json, CREDITS.md
│   ├── assets/music/     recorded music tracks, manifest.json, CREDITS.md
│   ├── builder/          Settings Builder (for students)
│   ├── admin/            admin panel (for hosts)
│   └── tests/            engine tests with simulated controllers
├── physComp26-501/       Physical Computing 2026, section 501 (2025 game)
├── physComp26-502/       Physical Computing 2026, section 502 (2025 game)
├── cc25/                 Creation & Computation 2025 (2025 game)
├── test/                 2025 controller test page
├── _template/            2025 template
└── builder/, admin/      forward old links to cc26/builder/ and cc26/admin/
```

## Make a new version

Copy the most recent version's folder, then rename it with the course and year:

1. Copy `cc26/` to, for example, `physComp27-501/`.
2. In `index.html`, change `instance` (a short id, also used for saved settings and the admin room) and `title`.
3. Put the class list in `players-config.json`:

   ```json
   {
     "players": [
       { "deviceNumber": 1, "name": "Kate", "controllerName": "Thunderpaddle" },
       { "deviceNumber": 2, "name": "Nick", "controllerName": "Big Blue" }
     ]
   }
   ```

   - `name` is the person: it helps them find themselves in the lobby's list.
   - `controllerName` is what the game calls them: scoreboard, NAME vs NAME before the countdown, pause
     messages and the win screen. Optional; without it the game uses the name the controller gives itself,
     then the person's name.
   - Numbers can be anything from 1 to 242. Students can also type a number that isn't on the list.
   - Older games read the same file and simply ignore `controllerName`.

Because the copy has its own `js/`, `css/` and `assets/`, you can change it freely without touching
any other class.

Options in `index.html`:

| Option | Meaning |
|---|---|
| `instance` | Short id. Settings are saved per instance; it's also the admin room name. |
| `title` | Shown in the lobby and the browser tab. |
| `engine` | Where the game files are, relative to the page (`'./'`: this folder). |
| `roster` | The players file (default `players-config.json`). |
| `relay` | Admin relay for other devices, e.g. `'wss://pong-relay.example.com'`, or `'same-origin'` when served by `server/relay.js`. |
| `defaults` | Starting house rules: `pointsToWin`, `puckSpeed`, `speedIncrement`. |
| `testMode` | Opens *Controller details* and makes player 2 the computer. |

URL parameters override these: `?test=1` (controller test mode), `?relay=…`, `?room=…`, `?debug=1`.

## Backwards compatibility

- **Older folders are never edited.** Each one keeps the code it shipped with.
- **Every controller generation keeps working** in every new version: 2024 (shared UUID, name from the
  device), 2025 (per-number UUID), 2026 (plus the config characteristic with custom settings). See
  [../docs/PROTOCOL.md](../docs/PROTOCOL.md). `cc26/tests/` simulates all three.
- A 2026 controller works in the 2025 pages too; it just plays without its custom settings.

## The 2026 game (`cc26/js/`)

Plain JavaScript files, loaded in order by `index.html` (no build step). Each file has one job:

| File | Job |
|---|---|
| `api.js` | The DFPONG API this folder follows. **Generated** from `api/dfpong-api.json` by `node api/build.mjs`: don't edit it here |
| `settings.js` | What can be customized (built from `api.js`), validation, house rules, settling rule requests |
| `ble.js` | Web Bluetooth: finding a controller by number, handshake, config, auto-reconnect |
| `audio.js` | Web Audio: recorded and synthesized sounds, custom sounds from URLs, pitch/pan by game state |
| `music.js` | Background music: generated tracks, recorded tracks (`assets/music/`), players' music links |
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

`cc26/assets/sounds/manifest.json` lists the recorded sounds (public-domain, CC0 and CC BY recordings from
the Internet Archive and Wikimedia Commons; see `CREDITS.md` there). Each name can be used by players
(`setHitSound("name")`); the `roles` section picks what the game plays for hits, walls, points, the countdown,
the serve, the win, and the room sound. More sounds are synthesized in `audio.js`, and every role falls back
to a synthesized sound if a file can't load.

### Tests

Run `node server/relay.js` and open http://localhost:5501/game/cc26/tests/. The page runs the real
`settings.js` and `ble.js` against simulated 2024, 2025, 2026 and library-1.2-on-ESP32 controllers,
including dropped connections, echoing ArduinoBLE controllers and busy-GATT conditions.

## Running locally

```bash
node server/relay.js
```

Open http://localhost:5501/game/cc26/. Web Bluetooth needs `https://` or `localhost`.
