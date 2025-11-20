# Sensor Strategies for DF Pong Controller

This guide explains simple techniques for converting different sensor data into the up/down/stop signals needed for the DF Pong game.

## The Goal

The controller needs to send three values:
- `0` = STOP (no movement)
- `1` = UP (move paddle up)
- `2` = DOWN (move paddle down)

---

## Strategy 1: Threshold Detection

**Best for:** Distance sensors, Light sensors, Potentiometers

**How it works:** Define upper and lower threshold values. When the sensor reading goes above or below these thresholds, trigger movement.

### Example with Distance Sensor
```cpp
int distanceValue = sensor.read();

if (distanceValue < 50) {
    // Object is close - move paddle up
    return 1;  // UP
} else if (distanceValue > 150) {
    // Object is far - move paddle down
    return 2;  // DOWN
} else {
    // Object in middle range - no movement
    return 0;  // STOP
}
```

### Example with Light Sensor
```cpp
int lightValue = analogRead(lightPin);

if (lightValue > 800) {
    // Bright light - move up
    return 1;  // UP
} else if (lightValue < 200) {
    // Dark - move down
    return 2;  // DOWN
} else {
    // Medium light - stop
    return 0;  // STOP
}
```

**Tips:**
- Test your sensor to find good threshold values
- Use smoothing to avoid jittery readings (see examples in `distance_raw_smoothed` or `ligh_raw_smoothed`)
- Add a "dead zone" in the middle to prevent unwanted movements

---

## Strategy 2: Direction Detection (Change Over Time)

**Best for:** Distance sensors, Potentiometers

**How it works:** Compare the current reading to the previous reading. If increasing → one direction, if decreasing → other direction.

### Example
```cpp
int previousValue = 0;
int currentValue = sensor.read();

if (currentValue > previousValue + 10) {
    // Value is increasing - move up
    previousValue = currentValue;
    return 1;  // UP
} else if (currentValue < previousValue - 10) {
    // Value is decreasing - move down
    previousValue = currentValue;
    return 2;  // DOWN
} else {
    // Not much change - stop
    return 0;  // STOP
}
```

**Tips:**
- Add a minimum change threshold (like `+10` or `-10`) to ignore small fluctuations
- Store the previous value in a global variable
- Good for detecting motion or rotation

---

## Strategy 3: Tilt/Orientation Detection

**Best for:** IMU (accelerometer/gyroscope)

**How it works:** Use the angle or acceleration in one axis to determine paddle direction.

### Example with IMU Pitch (tilt forward/back)
```cpp
float pitch = IMU.getPitch();  // Get tilt angle

if (pitch > 15) {
    // Tilted forward - move up
    return 1;  // UP
} else if (pitch < -15) {
    // Tilted backward - move down
    return 2;  // DOWN
} else {
    // Level - stop
    return 0;  // STOP
}
```

### Example with IMU Acceleration
```cpp
float accelY = IMU.readAccelY();

if (accelY > 0.3) {
    // Moving upward - paddle up
    return 1;  // UP
} else if (accelY < -0.3) {
    // Moving downward - paddle down
    return 2;  // DOWN
} else {
    // Not moving much - stop
    return 0;  // STOP
}
```

**Tips:**
- See `imu_orientationData` for pitch/roll angles
- See `imu_accelerationData` for acceleration values
- Tilt angles are usually easier for beginners than raw acceleration

---

## Strategy 4: Rate of Change (Velocity)

**Best for:** Any sensor that changes gradually

**How it works:** Measure how fast the sensor value is changing. Fast changes trigger movement.

### Example
```cpp
int previousValue = 0;
unsigned long previousTime = 0;

int currentValue = sensor.read();
unsigned long currentTime = millis();

int change = currentValue - previousValue;
unsigned long timeDelta = currentTime - previousTime;

// Calculate rate of change (velocity)
float velocity = (float)change / timeDelta;

if (velocity > 5) {
    // Changing fast upward
    return 1;  // UP
} else if (velocity < -5) {
    // Changing fast downward
    return 2;  // DOWN
} else {
    // Changing slowly or not at all
    return 0;  // STOP
}

previousValue = currentValue;
previousTime = currentTime;
```

**Tips:**
- See `potentio_direction_velocity` for a complete example
- Good for detecting quick gestures
- Combines well with smoothing

---

## Strategy 5: Two-Sensor Comparison

**Best for:** Light sensors (two sensors)

**How it works:** Use two sensors and compare their readings. Higher left sensor → move up, higher right sensor → move down.

### Example
```cpp
int sensor1 = analogRead(A0);  // Left sensor
int sensor2 = analogRead(A1);  // Right sensor

int difference = sensor1 - sensor2;

if (difference > 100) {
    // Sensor 1 much brighter - move up
    return 1;  // UP
} else if (difference < -100) {
    // Sensor 2 much brighter - move down
    return 2;  // DOWN
} else {
    // Similar brightness - stop
    return 0;  // STOP
}
```

**Tips:**
- See `light_compareSensors` for a complete example
- Great for directional control
- Can be used with any paired sensors

---

## Choosing the Right Strategy

| Sensor Type | Best Strategy | Why |
|-------------|---------------|-----|
| **Distance** | Threshold or Direction | Easy to understand, responsive |
| **Light** | Threshold or Two-Sensor | Clear feedback, works in different environments |
| **Potentiometer** | Threshold or Velocity | Smooth control, predictable |
| **IMU** | Tilt/Orientation | Natural gesture control, intuitive |

---

## General Tips for All Strategies

### 1. Use Smoothing
Sensors can be noisy. Average several readings:
```cpp
int smoothedValue = 0;
for (int i = 0; i < 5; i++) {
    smoothedValue += sensor.read();
    delay(2);
}
smoothedValue = smoothedValue / 5;
```

### 2. Add Deadbands
Create a "neutral zone" to prevent unwanted movements:
```cpp
if (abs(value - centerValue) < 20) {
    return 0;  // STOP - too close to center
}
```

### 3. Test and Adjust
- Start with wide thresholds and narrow them
- Print values to Serial Monitor to see what's happening
- Adjust based on how the game feels

### 4. Combine Strategies
You can mix strategies! For example:
- Use threshold for basic control
- Add velocity check for faster response to quick movements

---

## Getting Started

1. Pick a sensor from the `Sensors` folder examples
2. Run the example to understand the sensor readings
3. Choose a strategy from this guide
4. Modify `DFpong_controller_startTemplate.ino` to implement your strategy
5. Test and adjust thresholds until it feels good!

---

## Example Integration

Here's a complete example integrating a distance sensor with threshold strategy:

```cpp
// In DFpong_controller_startTemplate.ino

#include <VL53L1X.h>
VL53L1X distanceSensor;

void setup() {
    // ... existing BLE setup ...
    
    // Initialize distance sensor
    distanceSensor.setTimeout(500);
    distanceSensor.init();
    distanceSensor.startContinuous(50);
}

int readSensorData() {
    int distance = distanceSensor.read();
    
    // Threshold strategy
    if (distance < 100) {
        return 1;  // UP - object is close
    } else if (distance > 200) {
        return 2;  // DOWN - object is far
    } else {
        return 0;  // STOP - object in middle range
    }
}

void loop() {
    int movementValue = readSensorData();
    
    // Send via BLE
    moveCharacteristic.writeValue(movementValue);
    
    // ... existing code ...
}
```

Happy making! 🎮
