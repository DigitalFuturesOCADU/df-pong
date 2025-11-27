# BLE Basics: Arduino & p5.js Communication Guide

This guide explains the fundamental concepts and patterns for Bluetooth Low Energy (BLE) communication between Arduino and p5.js.

---

## Table of Contents

1. [Required Libraries](#required-libraries)
2. [Differences & Similarities with WebSerial](#differences--similarities-with-webserial)
3. [Central vs Peripheral](#central-vs-peripheral)
4. [Services and Characteristics](#services-and-characteristics)
5. [Characteristic Types](#characteristic-types)
6. [Read, Write, and Notify Modes](#read-write-and-notify-modes)
7. [Communication Patterns](#communication-patterns)
   - [Pattern 1: p5.js → Arduino (Browser Controls Arduino)](#pattern-1-p5js--arduino-browser-controls-arduino)
   - [Pattern 2: Arduino → p5.js (Arduino Sends Sensor Data)](#pattern-2-arduino--p5js-arduino-sends-sensor-data)
   - [Pattern 3: Arduino → p5.js with Notifications (Real-time Streaming)](#pattern-3-arduino--p5js-with-notifications-real-time-streaming)
   - [Pattern 4: Bidirectional (Both Ways)](#pattern-4-bidirectional-both-ways)
   - [Pattern 5: p5.js → p5.js (Browser to Browser)](#pattern-5-p5js--p5js-browser-to-browser)
8. [Essential Commands Reference](#essential-commands-reference)
9. [Common Mistakes to Avoid](#common-mistakes-to-avoid)
10. [Next Steps](#next-steps)

---

## Required Libraries

Before you begin working with BLE communication, you'll need to install and understand these two essential libraries:

### p5.ble.js - Web Bluetooth for p5.js

**What it does:** Enables p5.js sketches to communicate with Bluetooth devices through the Web Bluetooth API.

- **Official Documentation:** [https://itpnyu.github.io/p5ble-website/](https://itpnyu.github.io/p5ble-website/)
- **GitHub Repository:** [https://github.com/ITPNYU/p5.ble.js](https://github.com/ITPNYU/p5.ble.js)
- **Installation:** Include via CDN in your HTML file:
  ```html
  <script src="https://unpkg.com/p5ble@0.0.7/dist/p5.ble.js"></script>
  ```

### ArduinoBLE - Bluetooth Low Energy for Arduino

**What it does:** Provides BLE functionality for compatible Arduino boards, allowing them to act as peripherals or centrals.

- **Official Documentation:** [https://docs.arduino.cc/libraries/arduinoble/](https://docs.arduino.cc/libraries/arduinoble/)
- **GitHub Repository:** [https://github.com/arduino-libraries/ArduinoBLE](https://github.com/arduino-libraries/ArduinoBLE)

- **Compatible Boards:**
  - Arduino Nano 33 IoT
  - Arduino Nano 33 BLE / BLE Sense
  - Arduino Nano RP2040 Connect
  - Arduino MKR WiFi 1010
  - Arduino UNO WiFi Rev2
  - Arduino UNO R4 WiFi
  - Arduino Portenta H7
  - Arduino Giga R1

---

## Differences & Similarities with WebSerial

Before diving into BLE, it's helpful to understand how it compares to WebSerial - another common method for Arduino-to-p5.js communication.

### WebSerial

**WebSerial** is a browser API that allows web pages to communicate with Arduino via USB cable. It uses the traditional Serial protocol that Arduino programmers are already familiar with.

### Key Differences

| Aspect | BLE (Bluetooth) | WebSerial (USB) |
|--------|----------------|-----------------|
| **Connection** | Wireless | Wired (USB cable) |
| **Range** | ~10-30 meters | Cable length only |
| **Setup Complexity** | More complex (services, characteristics, UUIDs) | Simpler (just Serial.print/read) |
| **Data Format** | Structured (characteristics have types) | Text-based (usually CSV or JSON strings) |
| **Power** | Low power, battery friendly | Requires USB power |
| **Speed** | Slower (~1 Mbps) | Faster (up to 12 Mbps) |
| **Mobile Use** | ✅ Works on mobile browsers | ❌ Mobile devices don't have USB host |
| **Multiple Connections** | Multiple devices can connect | One-to-one only |
| **Library (p5.js)** | p5.ble.js | p5.webserial.js |
| **Library (Arduino)** | ArduinoBLE | Built-in Serial |

### Similarities

Both WebSerial and BLE share these common traits:

1. **Browser-based communication** - Both use modern browser APIs
2. **Require user interaction** - Both need a button click to connect (security requirement)
3. **Real-time data streaming** - Both can send/receive data continuously
4. **p5.js compatible** - Both work well with p5.js sketches
5. **Bidirectional** - Both can send data in both directions

### Code Comparison

#### WebSerial Example (CSV Protocol)

**Arduino Side:**
```cpp
void loop() {
  // Read incoming CSV data: "value1,value2\n"
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    int commaIndex = input.indexOf(',');
    if (commaIndex != -1) {
      int value1 = input.substring(0, commaIndex).toInt();
      int value2 = input.substring(commaIndex + 1).toInt();
      // Use values...
    }
  }
}
```

**p5.js Side:**
```javascript
function sendData() {
  let dataString = value1 + "," + value2 + "\n";
  port.write(dataString);  // Send CSV string
}
```

#### BLE Example (Structured Characteristics)

**Arduino Side:**
```cpp
void loop() {
  BLEDevice central = BLE.central();
  if (central && central.connected()) {
    // Check specific characteristics
    if (value1Char.written()) {
      int value1 = value1Char.value();
    }
    if (value2Char.written()) {
      int value2 = value2Char.value();
    }
  }
}
```

**p5.js Side:**
```javascript
function sendData() {
  myBLE.write(value1Characteristic, value1);  // Send to specific characteristic
  myBLE.write(value2Characteristic, value2);  // Each value has its own channel
}
```

### When to Use BLE vs WebSerial

**Use BLE when:**
- ✅ You need wireless communication
- ✅ Working with mobile browsers or tablets
- ✅ Battery-powered or portable projects
- ✅ Multiple devices need to connect
- ✅ You want structured data with types
- ✅ Range and mobility are important

**Use WebSerial when:**
- ✅ You have a USB cable available
- ✅ Working on desktop/laptop only
- ✅ You need faster data transfer
- ✅ You're already familiar with Serial
- ✅ Simpler setup is preferred
- ✅ You're debugging (Serial Monitor works)

### Data Protocol Comparison

**WebSerial typically uses:**
- CSV (Comma-Separated Values): `"255,128,64\n"`
- JSON strings: `{"led": 255, "servo": 90}`
- Custom delimiters: `"255:128:64\n"`
- You parse the string yourself

**BLE uses:**
- Typed characteristics (byte, int, float, etc.)
- Each value has its own UUID "channel"
- No parsing needed - data arrives with correct type
- More overhead to set up, but cleaner to use

### Migration Tips: WebSerial → BLE

If you're familiar with WebSerial and want to switch to BLE:

1. **Replace CSV strings with characteristics**
   - Instead of: `"value1,value2\n"` 
   - Create: Two separate characteristics

2. **Replace Serial.write() with characteristic.writeValue()**
   - Instead of: `Serial.print(value)`
   - Use: `myChar.writeValue(value)`

3. **Replace port.write() with myBLE.write()**
   - Instead of: `port.write(dataString)`
   - Use: `myBLE.write(characteristic, value)`

4. **Think in services/characteristics instead of text streams**
   - Group related data into a service
   - Each value becomes a characteristic

5. **Use notifications instead of continuous polling**
   - Instead of constantly reading Serial
   - Set up BLE notifications for automatic updates

### Example: Converting a WebSerial Project to BLE

**Original WebSerial approach:**
```
p5.js sends: "100,200\n"
   ↓
Arduino parses CSV
   ↓
Uses value1=100, value2=200
```

**BLE equivalent:**
```
p5.js writes to ledChar: 100
p5.js writes to servoChar: 200
   ↓
Arduino reads from characteristics
   ↓
Uses ledValue=100, servoValue=200
```

The data flow is similar, but BLE is more structured and wireless!

---

## Central vs Peripheral

### What Are They?

In BLE communication, devices play one of two roles:

- **Peripheral** (Server): The device that advertises and provides data
- **Central** (Client): The device that scans, connects, and requests data

### Possible Scenarios

BLE communication can be set up in different ways depending on your project needs. Here are the common scenarios covered in this guide:

#### Scenario 1: Browser Controls Arduino (Pattern 1)
```
┌─────────────────┐         ┌─────────────────┐
│     Arduino     │         │  Browser/p5.js  │
│   (Peripheral)  │ ◄────── │    (Central)    │
│     Server      │  Write  │     Client      │
│                 │         │  Sends Commands │
└─────────────────┘         └─────────────────┘
     Controls LEDs           User Interface
     Motors, Servos
```

#### Scenario 2: Arduino Sends Data to Browser (Pattern 2 & 3)
```
┌─────────────────┐         ┌─────────────────┐
│     Arduino     │         │  Browser/p5.js  │
│   (Peripheral)  │ ──────► │    (Central)    │
│     Server      │ Read or │     Client      │
│  Reads Sensors  │ Notify  │  Displays Data  │
└─────────────────┘         └─────────────────┘
```

#### Scenario 3: Two-Way Communication (Pattern 4)
```
┌─────────────────┐         ┌─────────────────┐
│     Arduino     │         │  Browser/p5.js  │
│   (Peripheral)  │ ◄─────► │    (Central)    │
│     Server      │  Write  │     Client      │
│                 │  Notify │                 │
│  Sends Status   │         │ Sends Commands  │
│  Receives Cmds  │         │ Receives Status │
└─────────────────┘         └─────────────────┘
```

#### Scenario 4: Browser to Browser via Arduino Bridge (Pattern 5)
```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Browser 1  │    │   Arduino    │    │  Browser 2  │
│   (p5.js)   │    │  (Peripheral)│    │   (p5.js)   │
│  Central    │◄──►│    Bridge    │◄──►│  Central    │
│             │    │              │    │             │
│ Writes to   │    │ Relays data  │    │ Writes to   │
│ Char 1      │    │  between     │    │ Char 2      │
│ Reads from  │    │   browsers   │    │ Reads from  │
│ Char 2      │    │              │    │ Char 1      │
└─────────────┘    └──────────────┘    └─────────────┘
```

**Key Points:**
- **Arduino** = Always the Peripheral (advertises and waits for connections)
- **Browser/p5.js** = Always the Central (initiates the connection)
- Multiple browsers can connect to the same Arduino for shared experiences

### Why This Matters

- The **peripheral** must be running and advertising before the **central** can connect
- Only the **central** can initiate a connection
- The **peripheral** defines what services and characteristics are available
- The **central** chooses which peripheral to connect to

### Important Limitation: Browsers Can Only Be Centrals

**Critical to understand:**
- **Web browsers** (Chrome, Safari) using Web Bluetooth API can **ONLY** act as **centrals** (clients)
- **Arduino** can act as **either** a **peripheral** (server) **OR** a **central** (client)
- This means:
  - ✅ Browser → Arduino (browser is central, Arduino is peripheral) 
  - ✅ Arduino → Browser (Arduino is peripheral, browser is central)
  - ❌ Browser → Browser directly via BLE (both would need to be peripheral AND central)
  - ✅ Browser → Arduino → Browser (Arduino acts as bridge/relay)

This is why most examples show Arduino as the peripheral and p5.js/browser as the central.

---

## Services and Characteristics

### What is a Service?

A **Service** is a collection of related data and functions. Think of it as a category or feature group.

**Examples of services:**
- Heart Rate Service
- Battery Service
- LED Control Service (custom)
- Sensor Data Service (custom)

### What is a Characteristic?

A **Characteristic** is a specific value within a service. Think of it as a variable that can be read from or written to.

**Examples of characteristics:**
- LED on/off state (0 or 1)
- LED brightness (0-255)
- Temperature reading (float)
- Button state (boolean)

### UUIDs: Unique Identifiers

Every service and characteristic needs a **UUID** (Universal Unique Identifier).

**Standard Services** (defined by Bluetooth SIG):
```
Battery Service:     0x180F
Heart Rate Service:  0x180D
```

**Custom Services** (you create these):
```
My LED Service:      19B10010-E8F2-537E-4F6C-D104768A1214
My Sensor Service:   A1B2C3D4-E5F6-7890-1234-567890ABCDEF
```

💡 **Generate UUIDs at:** [https://www.uuidgenerator.net/](https://www.uuidgenerator.net/)

### Service Structure Example

```
Service: LED Control (UUID: 19B10010-...)
  ├── Characteristic: LED State     (UUID: 19B10011-...)
  ├── Characteristic: LED Brightness (UUID: 19B10012-...)
  └── Characteristic: LED Color      (UUID: 19B10013-...)
```

---

## Characteristic Types

Characteristics can hold different types of data. Choose the right type for your data.

### Arduino BLE Characteristic Types

| Type | Description | Value Range | Example Use |
|------|-------------|-------------|-------------|
| `BLEBoolCharacteristic` | Boolean (true/false) | 0 or 1 | Button pressed, LED on/off |
| `BLEByteCharacteristic` | Single byte | 0-255 | LED brightness, small numbers |
| `BLECharCharacteristic` | Single character | 'A'-'Z', etc. | Single letter commands |
| `BLEUnsignedCharCharacteristic` | Unsigned char | 0-255 | Same as byte, unsigned |
| `BLEShortCharacteristic` | Short integer | -32,768 to 32,767 | Temperature in Celsius |
| `BLEUnsignedShortCharacteristic` | Unsigned short | 0-65,535 | Larger positive numbers |
| `BLEIntCharacteristic` | Integer | -2,147,483,648 to 2,147,483,647 | Large numbers |
| `BLEUnsignedIntCharacteristic` | Unsigned int | 0-4,294,967,295 | Very large positive numbers |
| `BLEFloatCharacteristic` | Floating point | Decimals | Temperature: 23.5°C |
| `BLEDoubleCharacteristic` | Double precision | High precision decimals | GPS coordinates |

### p5.js Data Type Options

When reading/writing in p5.ble.js, specify the data type:

```javascript
// Available data types:
'uint8'    // Default, 0-255 (same as byte)
'uint16'   // 0-65,535
'uint32'   // 0-4,294,967,295
'int8'     // -128 to 127
'int16'    // -32,768 to 32,767
'int32'    // -2,147,483,648 to 2,147,483,647
'float32'  // Floating point
'float64'  // Double precision
'string'   // Text data
'custom'   // Handle parsing yourself
```

### Choosing the Right Type

```
LED on/off?           → BLEByteCharacteristic (0 or 1)
LED brightness?       → BLEByteCharacteristic (0-255)
Temperature?          → BLEFloatCharacteristic (23.5)
Sensor reading 0-100? → BLEByteCharacteristic
Large counter?        → BLEIntCharacteristic
Button state?         → BLEBoolCharacteristic
```

---

## Read, Write, and Notify Modes

Characteristics can have different **properties** that determine how they can be accessed.

### Property Types

| Property | Symbol | Direction | Description |
|----------|--------|-----------|-------------|
| **Read** | `BLERead` | Arduino → p5.js | p5.js can REQUEST current value |
| **Write** | `BLEWrite` | p5.js → Arduino | p5.js can SEND new values |
| **Notify** | `BLENotify` | Arduino → p5.js | Arduino PUSHES updates automatically |
| **Combined** | `BLERead \| BLEWrite` | Both ways | Can both read and write |

### Arduino Examples

```cpp
// WRITE ONLY - p5.js sends data TO Arduino
BLEByteCharacteristic ledChar("UUID", BLEWrite);

// READ ONLY - Arduino sends data TO p5.js (p5.js must request it)
BLEIntCharacteristic sensorChar("UUID", BLERead);

// NOTIFY - Arduino automatically sends updates to p5.js
BLEFloatCharacteristic tempChar("UUID", BLENotify);

// READ + WRITE - Data can flow both ways
BLEByteCharacteristic controlChar("UUID", BLERead | BLEWrite);

// READ + NOTIFY - p5.js can request OR receive automatic updates
BLEIntCharacteristic buttonChar("UUID", BLERead | BLENotify);
```

### When to Use Each Mode

**Use BLEWrite when:**
- p5.js controls Arduino (LED brightness, motor speed)
- Phone sends commands to Arduino
- User input from phone → Arduino action

**Use BLERead when:**
- p5.js needs Arduino data on demand
- You want to minimize battery usage
- Updates are infrequent

**Use BLENotify when:**
- Arduino sensor data changes frequently
- p5.js needs real-time updates
- You want automatic data streaming
- Example: streaming accelerometer data

**Use BLERead | BLEWrite when:**
- You need bidirectional control
- Example: A setting that both devices can change

---

## Communication Patterns

### Pattern 1: p5.js → Arduino (Browser Controls Arduino)

**Use Case:** Control Arduino LEDs, motors, or servos from browser

#### Arduino Code (Peripheral)

```cpp
#include <ArduinoBLE.h>

// Define service and characteristic
BLEService controlService("19B10010-E8F2-537E-4F6C-D104768A1214");
BLEByteCharacteristic ledChar("19B10011-E8F2-537E-4F6C-D104768A1214", BLEWrite);

const int LED_PIN = 6;

void setup() {
  Serial.begin(9600);
  pinMode(LED_PIN, OUTPUT);
  
  // Initialize BLE
  BLE.begin();
  BLE.setLocalName("ArduinoControl");
  BLE.setAdvertisedService(controlService);
  
  // Add characteristic to service
  controlService.addCharacteristic(ledChar);
  BLE.addService(controlService);
  
  // Set initial value
  ledChar.writeValue(0);
  
  // Start advertising
  BLE.advertise();
  Serial.println("Waiting for connection...");
}

void loop() {
  BLEDevice central = BLE.central();
  
  if (central) {
    Serial.println("Connected!");
    
    while (central.connected()) {
      // Check if p5.js wrote a new value
      if (ledChar.written()) {
        int value = ledChar.value();
        analogWrite(LED_PIN, value);
        Serial.print("LED set to: ");
        Serial.println(value);
      }
    }
    Serial.println("Disconnected");
  }
}
```

#### p5.js Code (Central)

```javascript
let myBLE;
let ledCharacteristic;
const serviceUuid = "19B10010-E8F2-537E-4F6C-D104768A1214";
const ledCharUuid = "19B10011-E8F2-537E-4F6C-D104768A1214";

function setup() {
  createCanvas(400, 400);
  myBLE = new p5ble();
  
  let connectButton = createButton('Connect');
  connectButton.mousePressed(connectToBLE);
}

function connectToBLE() {
  myBLE.connect(serviceUuid, gotCharacteristics);
}

function gotCharacteristics(error, characteristics) {
  if (error) {
    console.log('Error:', error);
    return;
  }
  
  // Find the LED characteristic
  for (let i = 0; i < characteristics.length; i++) {
    if (characteristics[i].uuid === ledCharUuid) {
      ledCharacteristic = characteristics[i];
    }
  }
}

function draw() {
  background(220);
  
  // Send brightness value based on mouseX
  if (ledCharacteristic && myBLE.isConnected()) {
    let brightness = int(map(mouseX, 0, width, 0, 255));
    myBLE.write(ledCharacteristic, brightness);
  }
}
```

**Key Commands:**
- Arduino: `if (ledChar.written())` → Check if p5.js sent data
- Arduino: `ledChar.value()` → Get the value p5.js sent
- p5.js: `myBLE.write(ledCharacteristic, value)` → Send data to Arduino

---

### Pattern 2: Arduino → p5.js (Arduino Sends Sensor Data)

**Use Case:** Display Arduino sensor readings in browser

#### Arduino Code (Peripheral)

```cpp
#include <ArduinoBLE.h>

BLEService sensorService("19B10020-E8F2-537E-4F6C-D104768A1214");
BLEIntCharacteristic sensorChar("19B10021-E8F2-537E-4F6C-D104768A1214", BLERead);

const int SENSOR_PIN = A0;

void setup() {
  Serial.begin(9600);
  pinMode(SENSOR_PIN, INPUT);
  
  BLE.begin();
  BLE.setLocalName("ArduinoSensor");
  BLE.setAdvertisedService(sensorService);
  
  sensorService.addCharacteristic(sensorChar);
  BLE.addService(sensorService);
  
  sensorChar.writeValue(0);
  BLE.advertise();
}

void loop() {
  BLEDevice central = BLE.central();
  
  if (central) {
    while (central.connected()) {
      // Read sensor and update characteristic
      int sensorValue = analogRead(SENSOR_PIN);
      sensorChar.writeValue(sensorValue);
      
      delay(100); // Update every 100ms
    }
  }
}
```

#### p5.js Code (Central)

```javascript
let myBLE;
let sensorCharacteristic;
let sensorValue = 0;
const serviceUuid = "19B10020-E8F2-537E-4F6C-D104768A1214";
const sensorCharUuid = "19B10021-E8F2-537E-4F6C-D104768A1214";

function setup() {
  createCanvas(400, 400);
  myBLE = new p5ble();
  
  let connectButton = createButton('Connect');
  connectButton.mousePressed(connectToBLE);
}

function connectToBLE() {
  myBLE.connect(serviceUuid, gotCharacteristics);
}

function gotCharacteristics(error, characteristics) {
  if (error) return;
  
  for (let i = 0; i < characteristics.length; i++) {
    if (characteristics[i].uuid === sensorCharUuid) {
      sensorCharacteristic = characteristics[i];
      // Read once initially
      myBLE.read(sensorCharacteristic, 'uint16', gotData);
    }
  }
}

function gotData(error, value) {
  if (!error) {
    sensorValue = value;
  }
}

function draw() {
  background(220);
  
  // Continuously read sensor value
  if (sensorCharacteristic && myBLE.isConnected()) {
    myBLE.read(sensorCharacteristic, 'uint16', gotData);
  }
  
  // Display the value
  fill(0);
  textSize(32);
  text('Sensor: ' + sensorValue, 50, 200);
}
```

**Key Commands:**
- Arduino: `sensorChar.writeValue(value)` → Update the characteristic value
- p5.js: `myBLE.read(characteristic, dataType, callback)` → Request current value
- p5.js callback receives the value

---

### Pattern 3: Arduino → p5.js with Notifications (Real-time Streaming)

**Use Case:** Stream live sensor data without p5.js constantly requesting it

#### Arduino Code (Peripheral)

```cpp
#include <ArduinoBLE.h>

BLEService streamService("19B10030-E8F2-537E-4F6C-D104768A1214");
// Use BLENotify to allow streaming
BLEFloatCharacteristic tempChar("19B10031-E8F2-537E-4F6C-D104768A1214", BLENotify);

void setup() {
  Serial.begin(9600);
  
  BLE.begin();
  BLE.setLocalName("ArduinoStream");
  BLE.setAdvertisedService(streamService);
  
  streamService.addCharacteristic(tempChar);
  BLE.addService(streamService);
  
  tempChar.writeValue(0.0);
  BLE.advertise();
}

void loop() {
  BLEDevice central = BLE.central();
  
  if (central) {
    while (central.connected()) {
      // Read temperature sensor
      float temperature = readTemperature(); // Your sensor reading function
      
      // Update characteristic - this automatically notifies p5.js!
      tempChar.writeValue(temperature);
      
      delay(500); // Send updates every 500ms
    }
  }
}

float readTemperature() {
  // Simulated temperature reading
  return random(200, 250) / 10.0; // Returns 20.0-25.0
}
```

#### p5.js Code (Central)

```javascript
let myBLE;
let tempCharacteristic;
let temperature = 0;
const serviceUuid = "19B10030-E8F2-537E-4F6C-D104768A1214";
const tempCharUuid = "19B10031-E8F2-537E-4F6C-D104768A1214";

function setup() {
  createCanvas(400, 400);
  myBLE = new p5ble();
  
  let connectButton = createButton('Connect');
  connectButton.mousePressed(connectToBLE);
}

function connectToBLE() {
  myBLE.connect(serviceUuid, gotCharacteristics);
}

function gotCharacteristics(error, characteristics) {
  if (error) return;
  
  for (let i = 0; i < characteristics.length; i++) {
    if (characteristics[i].uuid === tempCharUuid) {
      tempCharacteristic = characteristics[i];
      // Start notifications - handleNotifications is called automatically!
      myBLE.startNotifications(tempCharacteristic, handleNotifications, 'float32');
    }
  }
}

function handleNotifications(value) {
  // This function is called automatically whenever Arduino sends new data
  temperature = value;
  console.log('Temperature:', temperature);
}

function draw() {
  background(220);
  
  // Display the temperature (updated automatically by notifications)
  fill(0);
  textSize(32);
  text('Temp: ' + temperature.toFixed(1) + '°C', 50, 200);
}
```

**Key Commands:**
- Arduino: `tempChar.writeValue(value)` → Automatically sends to p5.js if notifications enabled
- p5.js: `myBLE.startNotifications(characteristic, callback, dataType)` → Start receiving updates
- p5.js: `myBLE.stopNotifications(characteristic)` → Stop receiving updates
- The callback function is called automatically whenever new data arrives!

---

### Pattern 4: Bidirectional (Both Ways)

**Use Case:** Two-way communication - p5.js sends commands, Arduino sends status

#### Arduino Code (Peripheral)

```cpp
#include <ArduinoBLE.h>

BLEService controlService("19B10040-E8F2-537E-4F6C-D104768A1214");
// Write: receive commands from p5.js
BLEByteCharacteristic commandChar("19B10041-E8F2-537E-4F6C-D104768A1214", BLEWrite);
// Notify: send status updates to p5.js
BLEByteCharacteristic statusChar("19B10042-E8F2-537E-4F6C-D104768A1214", BLENotify);

const int LED_PIN = 6;
int currentBrightness = 0;

void setup() {
  Serial.begin(9600);
  pinMode(LED_PIN, OUTPUT);
  
  BLE.begin();
  BLE.setLocalName("ArduinoBidirectional");
  BLE.setAdvertisedService(controlService);
  
  controlService.addCharacteristic(commandChar);
  controlService.addCharacteristic(statusChar);
  BLE.addService(controlService);
  
  commandChar.writeValue(0);
  statusChar.writeValue(0);
  BLE.advertise();
}

void loop() {
  BLEDevice central = BLE.central();
  
  if (central) {
    while (central.connected()) {
      // RECEIVE: Check for commands from p5.js
      if (commandChar.written()) {
        currentBrightness = commandChar.value();
        analogWrite(LED_PIN, currentBrightness);
        Serial.print("Command received: ");
        Serial.println(currentBrightness);
      }
      
      // SEND: Update status to p5.js
      // This could be based on a sensor or the current state
      statusChar.writeValue(currentBrightness);
      
      delay(100);
    }
  }
}
```

#### p5.js Code (Central)

```javascript
let myBLE;
let commandCharacteristic;
let statusCharacteristic;
let currentStatus = 0;

const serviceUuid = "19B10040-E8F2-537E-4F6C-D104768A1214";
const commandCharUuid = "19B10041-E8F2-537E-4F6C-D104768A1214";
const statusCharUuid = "19B10042-E8F2-537E-4F6C-D104768A1214";

function setup() {
  createCanvas(400, 400);
  myBLE = new p5ble();
  
  let connectButton = createButton('Connect');
  connectButton.mousePressed(connectToBLE);
}

function connectToBLE() {
  myBLE.connect(serviceUuid, gotCharacteristics);
}

function gotCharacteristics(error, characteristics) {
  if (error) return;
  
  for (let i = 0; i < characteristics.length; i++) {
    if (characteristics[i].uuid === commandCharUuid) {
      commandCharacteristic = characteristics[i];
    }
    if (characteristics[i].uuid === statusCharUuid) {
      statusCharacteristic = characteristics[i];
      // Start receiving status updates
      myBLE.startNotifications(statusCharacteristic, handleStatus, 'uint8');
    }
  }
}

function handleStatus(value) {
  // Receive status from Arduino
  currentStatus = value;
  console.log('Status from Arduino:', currentStatus);
}

function draw() {
  background(220);
  
  // SEND: Send command based on mouse position
  if (commandCharacteristic && myBLE.isConnected()) {
    let brightness = int(map(mouseX, 0, width, 0, 255));
    myBLE.write(commandCharacteristic, brightness);
  }
  
  // RECEIVE: Display status from Arduino
  fill(0);
  textSize(20);
  text('Sent: ' + int(map(mouseX, 0, width, 0, 255)), 50, 100);
  text('Arduino Status: ' + currentStatus, 50, 150);
}
```

**Key Commands:**
- Arduino sends AND receives using different characteristics
- p5.js uses `write()` for sending and `startNotifications()` for receiving
- Bidirectional = Two separate one-way channels

---

## Essential Commands Reference

### Arduino (ArduinoBLE Library)

#### Setup & Initialization

```cpp
#include <ArduinoBLE.h>

// Initialize BLE
BLE.begin();

// Set device name (what appears in Bluetooth list)
BLE.setLocalName("DeviceName");

// Advertise the main service
BLE.setAdvertisedService(myService);

// Add characteristic to service
myService.addCharacteristic(myCharacteristic);

// Add service to BLE
BLE.addService(myService);

// Start advertising (make device visible)
BLE.advertise();
```

#### Connection Management

```cpp
// Check if a central device connected
BLEDevice central = BLE.central();

// Check if still connected
if (central.connected()) { }

// Get central device address
central.address();
```

#### Reading/Writing Characteristics

```cpp
// Check if characteristic was written to by central
if (myCharacteristic.written()) { }

// Read the current value
int value = myCharacteristic.value();

// Write a new value (updates the characteristic)
myCharacteristic.writeValue(newValue);
```

#### Characteristic Declaration

```cpp
// Syntax: Type characteristicName("UUID", properties);
BLEByteCharacteristic ledChar("19B10011-...", BLEWrite);
BLEIntCharacteristic sensorChar("19B10021-...", BLERead);
BLEFloatCharacteristic tempChar("19B10031-...", BLENotify);
BLEByteCharacteristic controlChar("19B10041-...", BLERead | BLEWrite);
```

---

### p5.js (p5.ble.js Library)

#### Setup & Connection

```javascript
// Create BLE object
let myBLE = new p5ble();

// Connect to device by service UUID
myBLE.connect(serviceUuid, callback);

// Example callback
function gotCharacteristics(error, characteristics) {
  if (error) {
    console.log('Error:', error);
    return;
  }
  // characteristics is an array of all available characteristics
}

// Check if connected
myBLE.isConnected(); // returns true/false
```

#### Writing to Arduino

```javascript
// Write a value to a characteristic
myBLE.write(characteristic, value);

// Examples:
myBLE.write(ledCharacteristic, 255);      // Send number
myBLE.write(controlCharacteristic, 0);    // Send 0
myBLE.write(commandCharacteristic, "A");  // Send string
```

#### Reading from Arduino

```javascript
// Read current value (one time)
myBLE.read(characteristic, dataType, callback);

// Example:
myBLE.read(sensorCharacteristic, 'uint16', gotData);

function gotData(error, value) {
  if (!error) {
    console.log('Value:', value);
  }
}
```

#### Notifications (Real-time Updates)

```javascript
// Start receiving automatic updates
myBLE.startNotifications(characteristic, callback, dataType);

// Example:
myBLE.startNotifications(tempCharacteristic, handleTemp, 'float32');

function handleTemp(value) {
  // Called automatically when Arduino sends new data
  console.log('Temperature:', value);
}

// Stop receiving updates
myBLE.stopNotifications(characteristic);
```

#### Disconnection

```javascript
// Disconnect from device
myBLE.disconnect();

// Handle disconnection event
myBLE.onDisconnected(handleDisconnected);

function handleDisconnected(device) {
  console.log('Device ' + device.name + ' disconnected');
}
```

---

## Quick Reference Table

| Task | Arduino Code | p5.js Code |
|------|-------------|------------|
| **Initialize** | `BLE.begin()` | `myBLE = new p5ble()` |
| **Start advertising** | `BLE.advertise()` | N/A (p5.js is central) |
| **Connect** | `BLEDevice central = BLE.central()` | `myBLE.connect(uuid, callback)` |
| **Send data** | `char.writeValue(value)` | `myBLE.write(char, value)` |
| **Receive data (Write)** | `if (char.written()) { char.value() }` | `myBLE.write(char, value)` |
| **Receive data (Read)** | `char.writeValue(value)` | `myBLE.read(char, type, callback)` |
| **Receive data (Notify)** | `char.writeValue(value)` | `myBLE.startNotifications(char, callback, type)` |
| **Check connection** | `central.connected()` | `myBLE.isConnected()` |
| **Disconnect** | Automatic when central disconnects | `myBLE.disconnect()` |

---

## Common Mistakes to Avoid

### ❌ UUIDs Don't Match
```cpp
// Arduino
BLEService myService("19B10010-E8F2-537E-4F6C-D104768A1214");

// p5.js - WRONG! Different UUID
const serviceUuid = "A1B2C3D4-E5F6-7890-1234-567890ABCDEF";
```
✅ **Solution:** Copy/paste UUIDs to ensure they match exactly

### ❌ Wrong Data Type
```cpp
// Arduino sends float
BLEFloatCharacteristic tempChar("UUID", BLERead);
tempChar.writeValue(23.5);

// p5.js reads as uint8 - WRONG!
myBLE.read(tempChar, 'uint8', callback);
```
✅ **Solution:** Use matching types - `'float32'` for floats

### ❌ Writing to Read-Only Characteristic
```cpp
// Arduino - Read only
BLEIntCharacteristic sensorChar("UUID", BLERead);

// p5.js - Can't write to this!
myBLE.write(sensorChar, 100); // Won't work!
```
✅ **Solution:** Use `BLEWrite` or `BLERead | BLEWrite` if you need to write

### ❌ Not Checking Connection Status
```javascript
// p5.js - WRONG! Might not be connected yet
myBLE.write(ledChar, 255);
```
✅ **Solution:** Always check connection first
```javascript
if (myBLE.isConnected()) {
  myBLE.write(ledChar, 255);
}
```

---

---

### Pattern 5: p5.js → p5.js (Browser to Browser)

**Use Case:** Two browsers communicate directly (desktop to desktop, mobile to desktop, or mobile to mobile). One device acts as peripheral (server), the other as central (client).

**Important:** Web Bluetooth API can only act as a **central** (client), not as a peripheral (server). However, you can use the **Web Bluetooth Peripheral API** (experimental) or have one device be an Arduino acting as peripheral for p5.js-to-p5.js communication.

#### Alternative Setup: Arduino as Bridge

The most reliable way for p5.js ↔ p5.js communication is using Arduino as a bridge:

```
Browser 1 (p5.js)  →  Arduino (bridge)  →  Browser 2 (p5.js)
    Central               Peripheral            Central
```

#### Arduino Bridge Code

```cpp
#include <ArduinoBLE.h>

// Service for p5.js to p5.js communication bridge
BLEService bridgeService("19B10050-E8F2-537E-4F6C-D104768A1214");

// Browser 1 writes here, Browser 2 reads/notifies
BLEIntCharacteristic phone1Data("19B10051-E8F2-537E-4F6C-D104768A1214", 
                                 BLEWrite | BLERead | BLENotify);

// Browser 2 writes here, Browser 1 reads/notifies
BLEIntCharacteristic phone2Data("19B10052-E8F2-537E-4F6C-D104768A1214", 
                                 BLEWrite | BLERead | BLENotify);

void setup() {
  Serial.begin(9600);
  
  BLE.begin();
  BLE.setLocalName("P5Bridge");
  BLE.setAdvertisedService(bridgeService);
  
  bridgeService.addCharacteristic(phone1Data);
  bridgeService.addCharacteristic(phone2Data);
  BLE.addService(bridgeService);
  
  phone1Data.writeValue(0);
  phone2Data.writeValue(0);
  
  BLE.advertise();
  Serial.println("Bridge ready - waiting for browsers...");
}

void loop() {
  BLEDevice central = BLE.central();
  
  if (central) {
    Serial.print("Browser connected: ");
    Serial.println(central.address());
    
    while (central.connected()) {
      // When Browser 1 writes, notify Browser 2
      if (phone1Data.written()) {
        int value = phone1Data.value();
        Serial.print("Browser 1 → Browser 2: ");
        Serial.println(value);
        // Value is automatically available to Browser 2 via notifications
      }
      
      // When Browser 2 writes, notify Browser 1
      if (phone2Data.written()) {
        int value = phone2Data.value();
        Serial.print("Browser 2 → Browser 1: ");
        Serial.println(value);
        // Value is automatically available to Browser 1 via notifications
      }
    }
    
    Serial.println("Browser disconnected");
  }
}
```

#### p5.js Code - Browser 1 (Sender)

```javascript
let myBLE;
let phone1Characteristic;  // I write to this
let phone2Characteristic;  // I read from this
let myValue = 0;
let receivedValue = 0;

const serviceUuid = "19B10050-E8F2-537E-4F6C-D104768A1214";
const phone1Uuid = "19B10051-E8F2-537E-4F6C-D104768A1214";
const phone2Uuid = "19B10052-E8F2-537E-4F6C-D104768A1214";

function setup() {
  createCanvas(400, 400);
  myBLE = new p5ble();
  
  let connectButton = createButton('Connect as Browser 1');
  connectButton.position(20, 20);
  connectButton.mousePressed(connectToBLE);
  
  textAlign(CENTER, CENTER);
}

function connectToBLE() {
  myBLE.connect(serviceUuid, gotCharacteristics);
}

function gotCharacteristics(error, characteristics) {
  if (error) {
    console.log('Error:', error);
    return;
  }
  
  console.log('Connected as Browser 1!');
  
  for (let i = 0; i < characteristics.length; i++) {
    // This is where I SEND data (Browser 1 writes here)
    if (characteristics[i].uuid === phone1Uuid) {
      phone1Characteristic = characteristics[i];
      console.log('Found Browser 1 characteristic (my output)');
    }
    
    // This is where I RECEIVE data (Browser 2 writes here)
    if (characteristics[i].uuid === phone2Uuid) {
      phone2Characteristic = characteristics[i];
      // Start listening for updates from Browser 2
      myBLE.startNotifications(phone2Characteristic, handlePhone2Data, 'uint32');
      console.log('Listening for Browser 2 data...');
    }
  }
}

function handlePhone2Data(value) {
  receivedValue = value;
  console.log('Received from Browser 2:', value);
}

function draw() {
  background(220);
  
  // Send my data based on mouse position
  if (phone1Characteristic && myBLE.isConnected()) {
    myValue = int(map(mouseX, 0, width, 0, 1000));
    myBLE.write(phone1Characteristic, myValue);
  }
  
  // Display
  fill(0);
  textSize(16);
  text('I am Browser 1', width/2, 80);
  
  fill(0, 100, 200);
  textSize(20);
  text('Sending: ' + myValue, width/2, 150);
  text('(Move mouse left/right)', width/2, 180);
  
  fill(200, 100, 0);
  textSize(20);
  text('Receiving from Browser 2:', width/2, 250);
  text(receivedValue, width/2, 280);
  
  // Visual feedback
  fill(0, 100, 200);
  circle(width/2, 320, map(myValue, 0, 1000, 20, 150));
}
```

#### p5.js Code - Browser 2 (Receiver/Sender)

```javascript
let myBLE;
let phone1Characteristic;  // I read from this
let phone2Characteristic;  // I write to this
let myValue = 0;
let receivedValue = 0;

const serviceUuid = "19B10050-E8F2-537E-4F6C-D104768A1214";
const phone1Uuid = "19B10051-E8F2-537E-4F6C-D104768A1214";
const phone2Uuid = "19B10052-E8F2-537E-4F6C-D104768A1214";

function setup() {
  createCanvas(400, 400);
  myBLE = new p5ble();
  
  let connectButton = createButton('Connect as Browser 2');
  connectButton.position(20, 20);
  connectButton.mousePressed(connectToBLE);
  
  textAlign(CENTER, CENTER);
}

function connectToBLE() {
  myBLE.connect(serviceUuid, gotCharacteristics);
}

function gotCharacteristics(error, characteristics) {
  if (error) {
    console.log('Error:', error);
    return;
  }
  
  console.log('Connected as Browser 2!');
  
  for (let i = 0; i < characteristics.length; i++) {
    // This is where I RECEIVE data (Browser 1 writes here)
    if (characteristics[i].uuid === phone1Uuid) {
      phone1Characteristic = characteristics[i];
      // Start listening for updates from Browser 1
      myBLE.startNotifications(phone1Characteristic, handlePhone1Data, 'uint32');
      console.log('Listening for Browser 1 data...');
    }
    
    // This is where I SEND data (Browser 2 writes here)
    if (characteristics[i].uuid === phone2Uuid) {
      phone2Characteristic = characteristics[i];
      console.log('Found Browser 2 characteristic (my output)');
    }
  }
}

function handlePhone1Data(value) {
  receivedValue = value;
  console.log('Received from Browser 1:', value);
}

function draw() {
  background(220);
  
  // Send my data based on mouse position
  if (phone2Characteristic && myBLE.isConnected()) {
    myValue = int(map(mouseY, 0, height, 0, 1000));
    myBLE.write(phone2Characteristic, myValue);
  }
  
  // Display
  fill(0);
  textSize(16);
  text('I am Browser 2', width/2, 80);
  
  fill(200, 100, 0);
  textSize(20);
  text('Sending: ' + myValue, width/2, 150);
  text('(Move mouse up/down)', width/2, 180);
  
  fill(0, 100, 200);
  textSize(20);
  text('Receiving from Browser 1:', width/2, 250);
  text(receivedValue, width/2, 280);
  
  // Visual feedback
  fill(200, 100, 0);
  circle(width/2, 320, map(myValue, 0, 1000, 20, 150));
}
```

**Key Points for p5.js to p5.js:**
- Arduino acts as a bridge/relay between two p5.js clients
- Both browsers connect to the same Arduino
- Each browser has its own characteristic for sending
- Each browser listens to the other's characteristic via notifications
- Data flows: Browser 1 → Arduino → Browser 2 and vice versa
- **Browser 1** uses `mouseX` (horizontal movement)
- **Browser 2** uses `mouseY` (vertical movement)

**Alternative Without Arduino:**
While the Web Bluetooth API doesn't natively support peripheral mode in most browsers, you could use:
1. **WebRTC** for direct peer-to-peer communication
2. **WebSockets** through a server
3. **Experimental Peripheral API** (limited browser support)

For most beginner use cases, the Arduino bridge method shown above is the most reliable approach.

---

## Summary: The Communication Patterns

### 1. **Browser Controls Arduino** (BLEWrite)
- p5.js writes → Arduino receives
- Use: Control LEDs, motors, servos
- Arduino: `BLEWrite`, check with `.written()`
- p5.js: `myBLE.write()`

### 2. **Arduino Sends to Browser** (BLERead or BLENotify)
- Arduino writes → p5.js reads
- Use: Display sensor data
- Arduino: `BLERead` or `BLENotify`, update with `.writeValue()`
- p5.js: `myBLE.read()` or `myBLE.startNotifications()`

### 3. **Two-Way Communication** (Both)
- Use two characteristics: one for each direction
- Arduino: One `BLEWrite` (receive), one `BLENotify` (send)
- p5.js: `write()` to send, `startNotifications()` to receive

### 4. **p5.js to p5.js** (Arduino Bridge)
- Two p5.js instances communicate via Arduino relay
- Each browser writes to its own characteristic
- Each browser listens to the other's characteristic
- Arduino passes data between them automatically

---


