![Game Start](./game/images/gameStart.png)

# DF Pong

**A Bluetooth Low Energy multiplayer Pong game designed for custom Arduino controllers.**

[Play the Game](https://digitalfuturesocadu.github.io/df-pong/game)

## Overview

DF Pong is a browser-based Pong game that allows players to create and connect custom Bluetooth Low Energy (BLE) controllers using Arduino Nano 33 IoT boards. The game supports 0, 1, or 2 BLE controllers, with keyboard fallback for any unconnected players. Designed for classroom environments with up to 25 active devices, it uses a unique UUID-based filtering system to ensure reliable connections even in crowded Bluetooth environments.

**Key Features:**
- Connect custom Arduino BLE controllers to play Pong in the browser
- Supports 0-2 controllers (keyboard controls available for unconnected players)
- Unique device identification system for classroom use (1-25 players)
- Configurable player names and device assignments
- Mobile and desktop support
- Real-time debug controls for game tuning

---

## Playing the Game

### Controller Modes

**With 0 Controllers (Keyboard Only):**
- Player 1: `A` (up) / `Z` (down)
- Player 2: `P` (up) / `L` (down)
- Press `SPACE` to start/pause
- Press `ENTER` to reset

**With 1 Controller:**
- One player uses their custom BLE controller
- Other player uses keyboard controls (see above)

**With 2 Controllers:**
- Both players use custom BLE controllers
- No keyboard controls needed

### Game Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Start/Pause Game | `SPACE` or click canvas | Tap canvas |
| Reset Game | `ENTER` | (Desktop only) |
| Toggle BLE Debug | `d` | Tap with 2 fingers |
| Toggle Game Settings | `c` | Long press canvas (1 sec) |

### Debug & Configuration

**BLE Debug (`d` key):**
- Shows connection status
- Displays real-time data from controllers
- Useful for troubleshooting connectivity

**Game Settings (`c` key):**
- **Player 1/2 Move Speed**: Adjust paddle responsiveness (1-100)
- **Puck Speed**: Set base speed of the ball (1-20)
- **Winning Score**: Set points needed to win (default: 10)

All settings persist in browser's local storage.

---

## Setup

### For Students

#### 1. Configure Your Arduino Device Number

Each player must set a unique device number (1-25) in their Arduino controller:

1. Open `controller/examples/BLE/DFpong_controller_2button/DFpong_controller_2button.ino`
2. Find this line at the top:
   ```cpp
   const int DEVICE_NUMBER = 1;  // ← CHANGE THIS!
   ```
3. Change the number to your assigned device (1-25)
4. Upload the sketch to your Arduino Nano 33 IoT

**Important:** Remember your device number - you'll use it throughout the semester!

#### 2. Connect to the Game

1. Go to [https://digitalfuturesocadu.github.io/df-pong/](https://digitalfuturesocadu.github.io/df-pong/)
2. Select your device number from the dropdown (e.g., "1: Your Name")
3. Click "Connect"
4. Select your Arduino from the browser's Bluetooth picker
5. The button will turn black and say "Disconnect" when connected



### For Instructors

#### Update Player Names

Edit `game/players-config.json` to assign names to device numbers:

```json
{
  "players": [
    { "deviceNumber": 1, "name": "Alice Smith" },
    { "deviceNumber": 2, "name": "Bob Jones" },
    { "deviceNumber": 3, "name": "Carol White" }
  ]
}
```

**Configuration Options:**
- **Dropdown display**: Shows `"1: Alice Smith"`, `"2: Bob Jones"`, etc.
- **In-game display**: Shows only the name: `"Alice Smith"` vs `"Bob Jones"`
- **Number of players**: Determined by array length (add/remove entries as needed)
- Changes take effect on page refresh

---

## How It Works

### The Challenge: Identifying Devices in Crowded Environments

In a classroom with 25 Arduino devices broadcasting Bluetooth simultaneously, traditional device name filtering fails:

1. **Browser Caching**: Web browsers cache paired device names
2. **Generic Names**: Previously paired devices may show as "Arduino-Paired" instead of their custom names
3. **Name Collisions**: Multiple devices can appear identical in the connection dialog
4. **Trial and Error**: Players can't reliably identify which physical device is theirs

### The Solution: Unique UUID Per Device

Instead of relying on device names, each Arduino generates a **unique Bluetooth Service UUID** based on its device number:

#### UUID Generation Formula

```
Base UUID: 19b10010-e8f2-537e-4f6c-d104768a12
Suffix Calculation: hex(13 + deviceNumber)

Device 1:  19b10010-e8f2-537e-4f6c-d104768a120e  (13 + 1 = 14 = 0x0E)
Device 2:  19b10010-e8f2-537e-4f6c-d104768a120f  (13 + 2 = 15 = 0x0F)
Device 25: 19b10010-e8f2-537e-4f6c-d104768a1227  (13 + 25 = 38 = 0x27)
```

#### How Web Bluetooth Filters By UUID

When a person selects their device number from the dropdown:

1. **JavaScript generates the matching UUID**:
   ```javascript
   const deviceNumber = 1;
   const suffix = (13 + deviceNumber).toString(16); // "0e"
   const uuid = "19b10010-e8f2-537e-4f6c-d104768a12" + suffix;
   ```

2. **Web Bluetooth API requests only that specific UUID**:
   ```javascript
   navigator.bluetooth.requestDevice({
     filters: [{ services: [uuid] }]
   })
   ```

3. **Browser shows only matching devices**: Typically just one 

#### Why This Works

- **Unique Hardware Identifier**: Each device broadcasts a different UUID at the hardware level
- **Browser-Agnostic**: Works regardless of name caching or pairing history
- **No Ambiguity**: Only one device will match the requested UUID
- **Reliable**: Players always connect to their assigned device, first time, every time

### Technical Architecture

**Arduino Side** (`ble_functions.h`):
```cpp
void generateUUIDs(int deviceNumber) {
  int suffix = 13 + deviceNumber;
  String hexSuffix = String(suffix, HEX);
  serviceUuidStr = "19b10010-e8f2-537e-4f6c-d104768a12" + hexSuffix;
  // Advertise this unique service UUID
}
```

**JavaScript Side** (`bleController.js`):
```javascript
generateServiceUUID(deviceNumber) {
  const suffix = (13 + deviceNumber).toString(16).padStart(2, '0');
  return "19b10010-e8f2-537e-4f6c-d104768a12" + suffix;
}
```



---

## Technical Details

### Game Components

- **Puck**: Ball that bounces off paddles and edges, speeds up with each hit
- **Paddles**: Player-controlled vertical bars, scale responsively to canvas size
- **GameController**: Manages game states (waiting, playing, paused, won)
- **BLEController**: Handles UUID generation, device filtering, and connection management

### File Structure

```
game/
├── index.html              # Main entry point
├── sketch.js               # p5.js game loop and canvas management
├── gameController.js       # Game state and scoring logic
├── bleController.js        # BLE connection and UUID filtering
├── paddle.js               # Paddle physics and rendering
├── puck.js                 # Ball physics and collision detection
├── players-config.json     # Device-to-name mapping
└── style.css              # Responsive layout (desktop/mobile)

controller/examples/BLE/
├── DFpong_controller_2button/       # Complete 2-button example
│   ├── DFpong_controller_2button.ino
│   ├── ble_functions.h             # UUID generation and BLE setup
│   └── buzzer_functions.h          # Audio feedback
└── DFpong_controller_startTemplate/ # Starter template for custom controllers
    ├── DFpong_controller_startTemplate.ino
    ├── ble_functions.h
    └── buzzer_functions.h
```

### Dependencies

- **p5.js** 
- **p5.sound.js**: Audio support
- **p5.ble.js** (v0.0.7): Web Bluetooth API wrapper
- **p5-phone** (v1.5.0): Mobile debugging with on-screen console
- **ArduinoBLE** (Arduino): Bluetooth Low Energy library for Arduino Nano 33 IoT

---

## Creating Custom Controllers

Use the template in `controller/examples/BLE/DFpong_controller_startTemplate/` to build your own controller:

1. Set your `DEVICE_NUMBER`
2. Implement `handleInput()` to read your sensors
3. Set `currentMovement` to:
   - `0` = Stop/neutral
   - `1` = Move paddle UP
   - `2` = Move paddle DOWN
4. Upload and connect!

**Example sensors:**
- Buttons, joysticks, accelerometers
- Light sensors, distance sensors, potentiometers
- Capacitive touch, flex sensors, pressure sensors
- Anything that can produce distinct UP/DOWN/NEUTRAL states!

---

## Troubleshooting

**Controller won't connect:**
- Verify `DEVICE_NUMBER` is set (1-25)
- Check Arduino is powered and LED is blinking
- Try refreshing the browser page
- Check browser console for errors (press `d` for debug info)

**Wrong controller connects:**
- Verify you selected the correct device number from dropdown
- Each controller must have a unique `DEVICE_NUMBER`
- Check Serial Monitor to confirm UUID is correct

**Game is too fast/slow:**
- Press `c` to open game settings
- Adjust paddle speed and puck speed to your preference
- Settings are saved automatically

---

## Controller Framework

For detailed controller setup and examples:  
[https://github.com/DigitalFuturesOCADU/Pong-Controller](https://github.com/DigitalFuturesOCADU/Pong-Controller)

---

## License

MIT License - See LICENSE file for details
