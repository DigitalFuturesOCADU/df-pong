![DF Pong 2026: the lobby](docs/images/cc26-lobby.png)

# DF Pong

**Two-player Pong in the browser, played with Bluetooth controllers you build yourself.**

Students build a controller from any sensor they like (buttons, light, distance, tilt, sound, conductive fabric…),
give it a number, and connect it to the game with one click. In 2026, controllers can also bring their own
color, sounds, music, paddle size and speed, ask for the rules they'd like to play by, and (experimental)
steer with a knob or send taunts.

## Play

| Version | | Folder |
|---|---|---|
| **CC26** · Creation & Computation 2026 | [Play](https://digitalfuturesocadu.github.io/df-pong/game/cc26/) | `game/cc26/` |
| CC26 controller test · try your controller against the computer, see its settings | [Open](https://digitalfuturesocadu.github.io/df-pong/game/cc26/?test=1) | `game/cc26/` |
| CC26 Settings Builder · design your custom settings, test sound addresses, get the code | [Open](https://digitalfuturesocadu.github.io/df-pong/game/cc26/builder/) | `game/cc26/builder/` |
| CC26 admin panel · change rules and run the game from another window or device | [Open](https://digitalfuturesocadu.github.io/df-pong/game/cc26/admin/) | `game/cc26/admin/` |
| PhysComp26-501 · Physical Computing 2026, section 501 | [Play](https://digitalfuturesocadu.github.io/df-pong/game/physComp26-501/) | `game/physComp26-501/` |
| PhysComp26-502 · Physical Computing 2026, section 502 | [Play](https://digitalfuturesocadu.github.io/df-pong/game/physComp26-502/) | `game/physComp26-502/` |
| CC25 · Creation & Computation 2025 | [Play](https://digitalfuturesocadu.github.io/df-pong/game/cc25/) | `game/cc25/` |
| Controller test (2025) | [Open](https://digitalfuturesocadu.github.io/df-pong/game/test/) | `game/test/` |

Every version lives in its own folder with its own copy of the code, so a new version never changes an older one.

Controllers need **Chrome or Edge** on a computer or Android phone (Web Bluetooth). Safari, Firefox and
iPhones/iPads can still play with the keyboard, touch, or against the computer.

---

## Controllers: every year still works

| Controller | Works in the 2026 game | How to connect |
|---|---|---|
| **2026**: DFPongController library 2.x | ✓ with custom settings (2.3 adds knob steering and taunts) | Pick your number, press Connect |
| **2025**: library 1.x or the raw `DEVICE_NUMBER` sketch | ✓ | Pick your number, press Connect |
| **2024**: raw sketch with a custom name | ✓ | Choose **"2024 controller"**, then pick it by name in the browser's list |

A 2026 controller also still works in the 2025 game pages; it just plays without its custom settings.

Everything a controller, the game and the admin panel can send each other is the **DFPONG API**:
one spec ([api/dfpong-api.json](api/dfpong-api.json)) that the game, the Arduino library, the Settings
Builder and the reference ([docs/API.md](docs/API.md)) are generated from. It's built to grow: see
[api/README.md](api/README.md). Step by step (handshake, reconnecting): [docs/PROTOCOL.md](docs/PROTOCOL.md).

---

## For players

### 1. Build and program your controller

Install the **DFPongController** library (Arduino IDE → *Sketch → Include Library → Manage Libraries…* →
search "DFPongController"). It works on **ESP32** boards (ESP32, S3, C3, Arduino Nano ESP32; also install
*NimBLE-Arduino*) and on the **Arduino Nano 33 IoT**, Nano 33 BLE and UNO R4 WiFi.

```cpp
#include <DFPongController.h>

DFPongController controller;

void setup() {
  pinMode(2, INPUT_PULLUP);  // UP button
  pinMode(3, INPUT_PULLUP);  // DOWN button

  controller.setControllerNumber(1);   // ← your number (1–242)
  controller.setStatusLED(LED_BUILTIN);
  controller.begin();
}

void loop() {
  controller.update();                 // required every loop

  if (!digitalRead(2))      controller.sendControl(UP);
  else if (!digitalRead(3)) controller.sendControl(DOWN);
  else                      controller.sendControl(NEUTRAL);
}
```

More examples (click control, gravity, chorded buttons, live settings, knob steering…) come with the library, under
*File → Examples → DFPongController*. Library repo: [df-pong-controller](https://github.com/DigitalFuturesOCADU/df-pong-controller).

### 2. Make it yours (optional)

Open the **[Settings Builder](https://digitalfuturesocadu.github.io/df-pong/game/cc26/builder/)**, choose a color,
sounds and paddle, and paste the code it gives you into `setup()` before `controller.begin()`:

```cpp
controller.setPlayerColor("#5fa36b");
controller.setHitSound("pluck");                    // a built-in sound…
controller.setScoreSound("https://raw.githubusercontent.com/you/repo/main/yay.mp3");  // …or your own
controller.setPaddleSize(120);                      // percent
controller.requestPointsToWin(7);                   // a request: your opponent may want something else
```

| Setting | What it does |
|---|---|
| `setPlayerName("…")` | Your controller's name in the game (up to 20 characters). A controller name in the class list comes first |
| `setPlayerColor(r, g, b)` or `("#rrggbb")` | Your paddle and highlight color |
| `setMoveSpeed(1–100)` | How fast your paddle moves (10 is normal) |
| `setPaddleSize(50–200)` | Paddle height in percent |
| `setHitSound(…)`, `setScoreSound(…)`, `setWinSound(…)` | A built-in sound name or an `https://` address |
| `setMusic(…)` | Background music: a track name (e.g. `nightbus`, `gymnopedie`) or an `https://` address (library 2.1) |
| `requestPointsToWin(1–21)` | Ask for a match length |
| `requestPuckSpeed(1–20)` | Ask for a starting puck speed |
| `requestSpeedIncrement(0–1)` | Ask for how much faster the puck gets per hit |

Settings can change while you play: the game picks up changes live (try mapping a sensor to your color).

**Actions** *(experimental, library 2.3)* are things you do during play rather than settings:
`controller.sendPosition(analogRead(A0), 0, 1023)` steers your paddle with a knob, slider or distance sensor
(it moves to that height at normal paddle speed), and `controller.sendTaunt(2)` pops a word up beside your
paddle (one every 2 seconds; the host can turn taunts off). Try the library's `08_PositionControl` example.

**Built-in sounds:** recordings from public archives (e.g. `pingpong`, `bell`, `bikebell`;
[credits](game/cc26/assets/sounds/CREDITS.md)), synthesized sounds (e.g. `pluck`, `laser`, `coin`) and the
2024 originals (`classic`, `wall`, `ding`). Every name is listed in [docs/API.md](docs/API.md#built-in-sounds).

**Your own sound:** put a short mp3/wav/ogg (under 2 MB) in a public GitHub repo and use its
`raw.githubusercontent.com` or GitHub Pages address. The Settings Builder's **Test** button tells you if it will work.
Anything that fails to load falls back to the default sound, and the game says why.

**Music:** the lobby's ♪ Music tile (and the settings panel) lists every choice with its source. By default
it's *Players' choice*: if one player brought music it plays, and if both did, their picks **alternate each point**.
Anyone at the computer can instead choose just one player's pick, a specific track, or Off. Some tracks are
generated live by the game and pick up energy as a rally builds (e.g. `drift`, `nightbus`); others are
recordings from public archives (e.g. `gymnopedie`; [credits](game/cc26/assets/music/CREDITS.md)). Every name
is listed in [docs/API.md](docs/API.md#music).

**When players ask for different rules**, the game settles it as the match starts and shows a *Match rules*
card: by default it meets in the middle (5 and 11 → 8). The host can switch to a coin flip, lower, higher, or
lock a rule.

### 3. Connect and play

1. Open your class's game page (or the [controller test](https://digitalfuturesocadu.github.io/df-pong/game/cc26/?test=1)).
2. Pick your number (e.g. "12 · Kate — Thunderpaddle"), press **Connect**, choose your controller in the browser's list.
3. Move your controller: your paddle moves right there in the lobby, so you can check it works.
4. Press **Start match** (or Space).

| | Keyboard | Touch |
|---|---|---|
| Player 1 | `W`/`A` up, `S`/`Z` down | drag on the left half (or the left pad on phones) |
| Player 2 | `↑`/`P` up, `↓`/`L` down | drag on the right half (or the right pad) |
| Start / pause | `Space` | ⏸ button |
| Rematch | `Space` or `Enter` | |
| Settings · controller details · mute · full screen | `C` · `D` · `M` · `F` | top-right buttons |

A player without a controller can use the keyboard or touch, or hand their side to the **computer**, with a
difficulty slider from 1 (Easy) to 10 (Expert).

Every match starts with **NAME vs NAME**, using each controller's name from the class list (Space skips it).

Controllers can change their settings while connected. The host decides what happens during a match
(Settings → *When a controller changes its settings during a match*): **Right away**, **Between points**
(the default: looks and sounds change at once, paddle speed and size at the next serve), or **Next match**.

Running more than one game at once? Give each a **table name** (Settings → Admin panel) and one admin
panel can run them all; see [server/README.md](server/README.md).

The game checks every connected controller every couple of seconds. If one drops out mid-match (a loose
wire, a flat battery, a reset), the game pauses, says which controller disconnected, and reconnects to it
automatically. No need to pick it again. If it can't come back, the pause screen offers **Reconnect** or
**Finish on the keyboard**.

### LED on the controller

| Pattern | Meaning |
|---|---|
| Slow blink | Waiting for the game |
| Fast blink | Connected, saying hello |
| Solid | Ready to play |

---

## For hosts

- **In the lobby**: the three rule tiles (points to win, puck speed, speed-up per hit) have − / + buttons.
  Click, or press and hold. If a controller's request is overriding a tile, it still shows your value ("house 10").
  The ♪ Music tile steps through the music choices.
- **Settings panel** (the **Settings** button, the sliders icon, or `C`): match rules with locks, how
  disagreements are settled, paddle speed for each side, which customizations controllers may use, when their
  changes apply during a match, music and its volume, volume, room sound, reduced motion, and this game's table
  name. On phones it opens full screen.
- **Admin panel**: house rules with locks, how disagreements are settled, music, permissions and when live
  changes apply, plus Start / Pause / Resume / Restart / Back to lobby, from another window or device, with a
  live view of who's connected and what settings they loaded. With several games in one room, send to all of
  them or to one table, and name each table.
  - Same computer: open the admin panel in another tab or window; it connects by itself.
  - Another device (phone, tablet, a Wi-Fi microcontroller…): run the small relay server; see
    [server/README.md](server/README.md).
- **Locked rules** ignore what players ask for. **Permissions** turn off custom names, colors, sounds, music,
  speed, paddle size, rule requests or taunts for everyone.

---

## How it works

### Finding the right controller in a room full of them

With 25+ controllers advertising at once, Bluetooth device names are unreliable (browsers cache them, and
many look identical). Instead, each controller advertises a **service UUID that ends with its own number**, and
the game asks the browser to show only that one:

```
19b10010-e8f2-537e-4f6c-d104768a12 + hex(13 + number)

controller 1   → …120e    (13 + 1  = 14 = 0x0e)
controller 2   → …120f    (13 + 2  = 15 = 0x0f)
controller 25  → …1226    (13 + 25 = 38 = 0x26)
controller 242 → …12ff    (13 + 242 = 255 = 0xff)
```

```javascript
navigator.bluetooth.requestDevice({ filters: [{ services: [uuid] }] });
```

The browser's chooser then lists just that controller. 2024 controllers all share suffix `14`, which is why
they're picked by name.

### Talking

| Characteristic | Direction | Content |
|---|---|---|
| Movement `19b10011-…` | both ways | 1 byte: 0 stop, 1 up, 2 down, 3 hello. The game also reads it every 1.5 s to check the controller is still there |
| Config `19b10012-…` (2026) | controller → game | JSON with the player's settings, read on connect and re-read when it changes |
| Actions `19b10013-…` (2026, experimental) | controller → game | Small packets for things that happen during play: steer to a position, taunt |

A short handshake (both sides send `3`) confirms a game is listening before the controller sends movement.
Every setting, name and packet is listed in [docs/API.md](docs/API.md).

---

## Repository

```
game/
├── cc26/               Creation & Computation 2026: the whole 2026 game (see game/README.md)
│   ├── index.html      page settings (title, instance id, admin relay…)
│   ├── players-config.json   class list: each person and their controller's name
│   ├── js/             api (generated), settings, ble, audio, music, arena, effects, render, postfx, player, game, ui, sketch
│   ├── css/
│   ├── assets/         recorded sounds and music, with manifest.json and CREDITS.md
│   ├── builder/        Settings Builder
│   ├── admin/          admin panel
│   └── tests/          engine tests with simulated controllers (open in a browser)
├── physComp26-501/, physComp26-502/, cc25/   earlier versions, each self-contained
├── test/, _template/   the 2025 controller test page and template
└── builder/, admin/    forward old links to cc26/builder/ and cc26/admin/
server/relay.js         optional relay for the admin panel (no dependencies)
api/                    the DFPONG API spec and build.mjs, which generates the files below from it
docs/API.md             the API reference (generated)
docs/PROTOCOL.md        controllers ↔ game ↔ admin, step by step
controller/examples/    raw BLE examples and sensor strategies
ble/BLE-BASICS.md       Bluetooth Low Energy primer
```

### Run it locally

```bash
node server/relay.js
```

Then open http://localhost:5501/game/cc26/. This serves the whole repo and also runs the admin relay.
Any static server works too (`python3 -m http.server`, VS Code Live Server), but without the relay.
Web Bluetooth only works on `https://` pages and `localhost`.

- **Tests**: open http://localhost:5501/game/cc26/tests/ (simulated controllers, no hardware needed).
- **After editing the API spec** (`api/dfpong-api.json`): run `node api/build.mjs`; see [api/README.md](api/README.md).

### Built with

- [p5.js 2.x](https://beta.p5js.org/): drawing, the frame loop, and the WebGL post-processing pass
- Web Bluetooth, Web Audio, BroadcastChannel and WebSocket browser APIs
- Based on Daniel Shiffman's [Coding Train Pong challenge](https://thecodingtrain.com/challenges/67-pong)

## License

MIT
