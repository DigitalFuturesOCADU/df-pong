 /* Handshake Process:
 * 1. On connection, controller sends value 3
 * 2. Central device responds with value 3
 * 3. Controller marks handshake as complete
 * 4. Normal movement values (0,1,2) can now be sent
*/


#include <ArduinoBLE.h>

// UUIDs are generated dynamically based on device number
// This ensures each device has a unique service UUID for easy filtering
String serviceUuidStr;
String characteristicUuidStr;
const char* SERVICE_UUID;
const char* CHARACTERISTIC_UUID;

BLEService* pongService = nullptr;
BLEByteCharacteristic* movementCharacteristic = nullptr;

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

// Strategy 1: Manufacturer data for device identification
// This helps the web app identify DFPONG devices more reliably
const uint8_t manufacturerData[] = {0xDF, 0x01}; // DF = DFPong, 01 = version

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
    byte value = movementCharacteristic->value();
    if (value == 3) {
      handshakeComplete = true;
    }
  }
}

// Generate unique UUIDs based on device number (1-25)
void generateUUIDs(int deviceNumber) {
  // Base UUIDs (must match JavaScript exactly, ending with "12")
  const String serviceBase = "19b10010-e8f2-537e-4f6c-d104768a12";
  const String characteristicBase = "19b10011-e8f2-537e-4f6c-d104768a12";
  
  // Calculate unique suffix (base 14 + deviceNumber - 1)
  // Device 1 → 14 (0x0E), Device 2 → 15 (0x0F), etc.
  int suffix = 13 + deviceNumber;
  
  // Convert to hex string (2 digits, lowercase)
  String hexSuffix = String(suffix, HEX);
  if (hexSuffix.length() == 1) {
    hexSuffix = "0" + hexSuffix;
  }
  hexSuffix.toLowerCase();
  
  // Generate full UUIDs (must keep strings in memory)
  serviceUuidStr = serviceBase + hexSuffix;
  characteristicUuidStr = characteristicBase + hexSuffix;
  
  // Store c_str pointers - strings must remain in scope
  SERVICE_UUID = serviceUuidStr.c_str();
  CHARACTERISTIC_UUID = characteristicUuidStr.c_str();
  
  Serial.print("Device #");
  Serial.println(deviceNumber);
  Serial.print("Service UUID: ");
  Serial.println(SERVICE_UUID);
  Serial.print("Characteristic UUID: ");
  Serial.println(CHARACTERISTIC_UUID);
}

void setupBLE(const char* deviceName, int deviceNumber, int ledPin) {
  statusLedPin = ledPin;
  pinMode(statusLedPin, OUTPUT);
  
  // Generate unique UUIDs based on device number
  generateUUIDs(deviceNumber);
  
  // Create BLE service and characteristic with generated UUIDs
  pongService = new BLEService(SERVICE_UUID);
  movementCharacteristic = new BLEByteCharacteristic(CHARACTERISTIC_UUID, BLERead | BLENotify | BLEWrite);
  
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
  movementCharacteristic->setEventHandler(BLEWritten, onCharacteristicWritten);
  
  BLE.setLocalName(deviceName);
  BLE.setAdvertisedServiceUuid(pongService->uuid());
  
  // Strategy 1: Optimized connection parameters for crowded environments
  // Longer intervals reduce radio congestion
  BLE.setConnectionInterval(12, 24);  // 15-30ms (was 8-16, now more conservative)
  BLE.setPairable(false);
  BLE.setAdvertisingInterval(160);    // 100ms (was 80ms, reduces collisions)
  
  // Strategy 1: Add manufacturer data for better device identification
  BLE.setManufacturerData(manufacturerData, sizeof(manufacturerData));
  
  pongService->addCharacteristic(*movementCharacteristic);
  BLE.addService(*pongService);
  
  movementCharacteristic->writeValue(0);
  delay(100);
  
  serviceStarted = true;
  BLE.advertise();
  Serial.println("BLE setup complete - Advertising started");
}

bool isConnected() {
  return serviceStarted && BLE.connected() && movementCharacteristic->subscribed() && handshakeComplete;
}void updateLED() {
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
  if (!BLE.connected() || !movementCharacteristic->subscribed()) {
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
    if (movementCharacteristic->writeValue(movement)) {
      lastSentValue = movement;
      lastNotificationTime = currentTime;
      valueChanged = false;
    }
  }
}