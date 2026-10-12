# DF Pong Controller Examples

Arduino examples for building Bluetooth controllers for DF Pong.

## Using the DFPongController library (recommended)

The easiest way to make a controller is the [DFPongController Arduino library](https://github.com/DigitalFuturesOCADU/df-pong-controller).
Version 2.x adds **custom settings**: your paddle color, your sounds, paddle size and speed, and the rules
you'd like to play by.

### Installation

1. Open Arduino IDE
2. Go to **Sketch > Include Library > Manage Libraries...**
3. Search for "**DFPongController**"
4. Click **Install** (on ESP32 boards, also install **NimBLE-Arduino**)

### Examples

The library comes with its own examples: **File > Examples > DFPongController**. Highlights:

| Example | What it shows |
|---------|---------------|
| 00_StartTemplate | Empty template to add your own sensor logic |
| 01_SimpleDigital | Two buttons, hold to move |
| 02_ClickDetection | Tap to move a step |
| 04_GravityClick | Tap to rise, gravity pulls you down |
| 06_CustomSettings | Color, name, sounds, paddle size, rule requests |
| 07_LiveSettings | Change your paddle color while you play |

The two copies in this folder ([DFpong_Library_TwoButton](DFpong_Library_TwoButton/) and
[DFpong_Library_StartTemplate](DFpong_Library_StartTemplate/)) are the basic ones, for quick reference.

### Custom settings

Use the **[Settings Builder](https://digitalfuturesocadu.github.io/df-pong/game/cc26/builder/)** to choose your
settings, test a sound address, and copy the code. For example:

```cpp
controller.setPlayerColor("#5fa36b");
controller.setHitSound("pluck");
controller.setPaddleSize(120);
controller.requestPointsToWin(7);
controller.begin();
```

### Supported boards

- ESP32 / ESP32-S3 / ESP32-C3 / Arduino Nano ESP32 (requires NimBLE-Arduino)
- Arduino Nano 33 IoT
- Arduino Nano 33 BLE / BLE Sense
- Arduino UNO R4 WiFi

---

## Raw BLE examples (advanced)

These don't use the library, so you can see every Bluetooth detail. They're the 2025 design: they work
in every game version, but without custom settings.

| Example | Description |
|---------|-------------|
| [DFpong_controller_2button](DFpong_controller_2button/) | Full implementation with buzzer and custom BLE code |
| [DFpong_controller_startTemplate](DFpong_controller_startTemplate/) | Template with all BLE code exposed |

To add custom settings to a raw sketch, add a second characteristic as described in
[docs/PROTOCOL.md](../../../docs/PROTOCOL.md) (section 4).

---

## Testing your controller

1. Upload an example to your board
2. Open the test page: https://digitalfuturesocadu.github.io/df-pong/game/test/
3. Choose your controller number and press **Connect**
4. Move your controller: your paddle moves in the lobby. **Controller details** (the bug icon, or `D`)
   shows every value it sends and any problems with its settings.

## LED status patterns

| Pattern | Meaning |
|---------|---------|
| Slow blink (500ms) | Disconnected, advertising |
| Fast blink (100ms) | Connected, handshaking |
| Solid ON | Ready to play |

## Links

- [DFPongController library](https://github.com/DigitalFuturesOCADU/df-pong-controller)
- [DF Pong](https://digitalfuturesocadu.github.io/df-pong/)
- [Controller test](https://digitalfuturesocadu.github.io/df-pong/game/test/)
- [Settings Builder](https://digitalfuturesocadu.github.io/df-pong/game/cc26/builder/)
