 /* Handshake Process:
 * 1. On connection, controller sends value 3
 * 2. Central device responds with value 3
 * 3. Controller marks handshake as complete
 * 4. Normal movement values (0,1,2) can now be sent
*/


#include <ArduinoBLE.h>

const char* SERVICE_UUID = "19b10010-e8f2-537e-4f6c-d104768a1214";
const char* CHARACTERISTIC_UUID = "19b10011-e8f2-537e-4f6c-d104768a1214";

BLEService pongService(SERVICE_UUID);
BLEByteCharacteristic movementCharacteristic(CHARACTERISTIC_UUID, BLERead | BLENotify | BLEWrite);

int statusLedPin;
unsigned long lastConnectionAttempt = 0;
unsigned long lastLedToggle = 0;
unsigned long lastNotificationTime = 0;
const unsigned long CONNECTION_RETRY_INTERVAL = 2000;
const unsigned long LED_BLINK_INTERVAL = 500;
const unsigned long MIN_NOTIFICATION_INTERVAL = 20;
bool ledState = false;
bool serviceStarted = false;
bool handshakeComplete = false;

// Buffer for notification management
int lastSentValue = 0;
bool valueChanged = false;

void onBLEConnected(BLEDevice central) {
  Serial.print("Connected to central: ");
  Serial.println(central.address());
  digitalWrite(statusLedPin, HIGH);
  handshakeComplete = false;  // Reset handshake state on new connection
  lastSentValue = 3;  // Force initial handshake message
  valueChanged = true;
}

void onBLEDisconnected(BLEDevice central) {
  Serial.print("Disconnected from central: ");
  Serial.println(central.address());
  lastSentValue = 0;
  valueChanged = false;
  handshakeComplete = false;
}

void onCharacteristicWritten(BLEDevice central, BLECharacteristic characteristic) {
  if (characteristic.uuid() == CHARACTERISTIC_UUID) {
    byte value = movementCharacteristic.value();
    if (value == 3) {
      handshakeComplete = true;
    }
  }
}

void setupBLE(const char* deviceName, int ledPin) {
  statusLedPin = ledPin;
  pinMode(statusLedPin, OUTPUT);
  
  // Initialize BLE with retry
  for (int i = 0; i < 3; i++) {
    if (BLE.begin()) {
      break;
    }
    delay(500);
    if (i == 2) {
      while (1) {
        digitalWrite(statusLedPin, HIGH);
        delay(100);
        digitalWrite(statusLedPin, LOW);
        delay(100);
      }
    }
  }

  // Reset BLE state
  BLE.disconnect();
  delay(100);
  BLE.stopAdvertise();
  delay(100);

  // Configure BLE parameters
  BLE.setEventHandler(BLEConnected, onBLEConnected);
  BLE.setEventHandler(BLEDisconnected, onBLEDisconnected);
  movementCharacteristic.setEventHandler(BLEWritten, onCharacteristicWritten);
  
  BLE.setLocalName(deviceName);
  BLE.setAdvertisedServiceUuid(pongService.uuid());
  BLE.setConnectionInterval(8, 16);
  BLE.setPairable(false);
  BLE.setAdvertisingInterval(80);
  
  pongService.addCharacteristic(movementCharacteristic);
  BLE.addService(pongService);
  
  movementCharacteristic.writeValue(0);
  delay(100);
  
  serviceStarted = true;
  BLE.advertise();
  Serial.println("BLE setup complete - Advertising started");
}

bool isConnected() {
  return serviceStarted && BLE.connected() && movementCharacteristic.subscribed() && handshakeComplete;
}

void updateLED() {
  if (!isConnected()) {
    unsigned long currentTime = millis();
    if (currentTime - lastLedToggle >= LED_BLINK_INTERVAL) {
      ledState = !ledState;
      digitalWrite(statusLedPin, ledState);
      lastLedToggle = currentTime;
    }
  }
}

void updateBLE() {
  BLE.poll();
  updateLED();
}

void sendMovement(int movement) {
  if (!BLE.connected() || !movementCharacteristic.subscribed()) {
    return;
  }

  // If not handshake complete, keep sending handshake message
  if (!handshakeComplete) {
    movement = 3;
  }

  unsigned long currentTime = millis();
  
  // Check if value has changed
  if (movement != lastSentValue) {
    valueChanged = true;
  }
  
  // Only send if value changed and enough time has passed
  if (valueChanged && (currentTime - lastNotificationTime >= MIN_NOTIFICATION_INTERVAL)) {
    if (movementCharacteristic.writeValue(movement)) {
      lastSentValue = movement;
      lastNotificationTime = currentTime;
      valueChanged = false;
    }
  }
}