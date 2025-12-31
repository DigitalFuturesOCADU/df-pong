# DF Pong Controller Examples

This folder contains Arduino examples for creating Bluetooth controllers for DF Pong.

## Using the DFPongController Library (Recommended)

The easiest way to create a controller is using the [DFPongController Arduino Library](https://github.com/DigitalFuturesOCADU/df-pong-controller).

### Installation

1. Open Arduino IDE
2. Go to **Sketch > Include Library > Manage Libraries...**
3. Search for "**DFPongController**"
4. Click **Install**

### Library Examples

| Example | Description |
|---------|-------------|
| [DFpong_Library_TwoButton](DFpong_Library_TwoButton/) | Complete working example with two buttons |
| [DFpong_Library_StartTemplate](DFpong_Library_StartTemplate/) | Minimal template to add your own sensor logic |

### Supported Boards

- Arduino UNO R4 WiFi
- Arduino Nano 33 IoT
- Arduino Nano 33 BLE / BLE Sense
- ESP32 / ESP32-S3 / ESP32-C3 (requires NimBLE-Arduino library)

---

## Raw BLE Examples (Advanced)

These examples don't use the library and give you more control over the BLE implementation.

| Example | Description |
|---------|-------------|
| [DFpong_controller_2button](DFpong_controller_2button/) | Full implementation with buzzer and custom BLE code |
| [DFpong_controller_startTemplate](DFpong_controller_startTemplate/) | Template with all BLE code exposed |

---

## Testing Your Controller

1. Upload an example to your Arduino
2. Open the test page: https://digitalfuturesocadu.github.io/df-pong/game/test/
3. Select your controller number from the dropdown
4. Click Connect
5. Your controller should connect and show movement

## LED Status Patterns

| Pattern | Meaning |
|---------|---------|
| Slow blink (500ms) | Disconnected, advertising |
| Fast blink (100ms) | Connected, handshaking |
| Solid ON | Ready to play |

## Links

- [DFPongController Library](https://github.com/DigitalFuturesOCADU/df-pong-controller)
- [DF Pong Game](https://digitalfuturesocadu.github.io/df-pong/)
- [Test Your Controller](https://digitalfuturesocadu.github.io/df-pong/game/test/)
