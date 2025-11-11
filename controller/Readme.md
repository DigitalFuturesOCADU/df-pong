![Game Start](images/gameStart.png)

# Overview

This repository contains code for creating a wireless controller for the [DF Pong game](https://digitalfuturesocadu.github.io/df-pong/). The controller uses Bluetooth Low Energy (BLE) to send movement data to a central device and provides audio feedback through a buzzer.

## ⚠️ Important Setup Instructions

### Device Naming Convention (Required for Crowded Environments)

**CRITICAL:** To ensure reliable connections in classrooms with multiple devices (up to 25), you **MUST** follow this naming convention:

1. **Open your controller sketch** (e.g., `DFpong_controller_2button.ino`)
2. **Find this line near the top:**
   ```cpp
   const char* deviceName = "DFPONG-001";
   ```
3. **Change the number** to make your controller unique:
   - Student 1: `"DFPONG-001"`
   - Student 2: `"DFPONG-002"`
   - Student 3: `"DFPONG-003"`
   - And so on...

### Why This Matters

- The `DFPONG-` prefix allows the web game to filter and show only DF Pong controllers
- Unique numbers help you identify YOUR specific controller among many devices
- This significantly improves connection reliability in crowded BLE environments

## Connection Improvements (Strategy 1)

The following improvements have been implemented for better stability:

- ✅ **Name filtering**: Game only shows devices with `DFPONG-` prefix
- ✅ **Recent device memory**: Game remembers recently connected devices
- ✅ **Optimized radio parameters**: Reduced advertising collisions
- ✅ **Manufacturer data**: Devices advertise as DF Pong controllers

### Technical Changes
- Advertising interval: 100ms (reduced from 50ms to minimize collisions)
- Connection interval: 15-30ms (optimized for responsive gameplay)
- Device identification via manufacturer data

## Two Button Example

The [Two Button Example](examples/BLE/DFpong_controller_2button/DFpong_controller_2button.ino) demonstrates how to create a simple wireless controller using two buttons and a piezo buzzer. This example is designed for the Nano33 IOT but can be adapted for any Arduino that supports the ArduinoBLE library.

### How it works:
- Two buttons are used to control the movement in the DF Pong game.
- A piezo buzzer provides audio feedback.
- The controller sends BLE signals to the central device to indicate button presses.

### Interaction:
- Press the left button to move up.
- Press the right button to move down.
- The buzzer will sound when a button is pressed.

## Start Template Example

The [Start Template Example](examples/BLE/DFpong_controller_startTemplate/DFpong_controller_startTemplate.ino) provides a basic template to start building your own custom controller.

### How it works:
- Basic BLE setup to connect with the DF Pong game.
- Placeholder functions for button presses and buzzer feedback.

### Interaction:
- Customize the template by adding your own buttons and buzzer logic.
- Use the provided functions to handle BLE communication and audio feedback.

## Arduino Files

- [DFpong_controller_2button.ino](examples/BLE/DFpong_controller_2button/DFpong_controller_2button.ino)
- [DFpong_controller_startTemplate.ino](examples/BLE/DFpong_controller_startTemplate/DFpong_controller_startTemplate.ino)

For more information about the DF Pong game, visit the [DF Pong GitHub repository](https://github.com/DigitalFuturesOCADU/df-pong).