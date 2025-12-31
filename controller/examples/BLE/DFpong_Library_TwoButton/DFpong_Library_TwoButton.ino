/*********************************************************************
 * DF Pong Controller - Using DFPongController Library
 * 
 * This example shows how to create a simple two-button controller
 * using the DFPongController Arduino library.
 * 
 * Library Installation:
 * 1. Open Arduino IDE
 * 2. Go to Sketch > Include Library > Manage Libraries...
 * 3. Search for "DFPongController"
 * 4. Click Install
 * 
 * Or install from: https://github.com/DigitalFuturesOCADU/df-pong-controller
 * 
 * Supported Boards:
 * - Arduino UNO R4 WiFi
 * - Arduino Nano 33 IoT
 * - Arduino Nano 33 BLE / BLE Sense
 * - ESP32 / ESP32-S3 / ESP32-C3 (requires NimBLE-Arduino library)
 * 
 * Test Your Controller:
 * https://digitalfuturesocadu.github.io/df-pong/game/test/
 * 
 *********************************************************************/

#include <DFPongController.h>

// Create controller instance
DFPongController controller;

// ============================================
// IMPORTANT: SET YOUR CONTROLLER NUMBER (1-242)
// ============================================
const int CONTROLLER_NUMBER = 1;  // ← CHANGE THIS TO YOUR ASSIGNED NUMBER!
// ============================================

// Pin definitions
const int BUTTON_UP_PIN = 6;      // Pin for UP movement button
const int BUTTON_DOWN_PIN = 2;    // Pin for DOWN movement button

void setup() {
  Serial.begin(9600);
  delay(1000);
  
  Serial.println("=== DF Pong Controller (Library Version) ===");
  
  // Configure button pins with internal pullup resistors
  // Buttons will read LOW when pressed, HIGH when released
  pinMode(BUTTON_UP_PIN, INPUT_PULLUP);
  pinMode(BUTTON_DOWN_PIN, INPUT_PULLUP);
  
  // Configure the controller
  controller.setControllerNumber(CONTROLLER_NUMBER);  // Required!
  controller.setStatusLED(LED_BUILTIN);               // LED for connection status
  controller.setDebug(true);                          // Enable debug messages
  
  // Initialize BLE
  controller.begin();
  
  Serial.print("Controller #");
  Serial.print(CONTROLLER_NUMBER);
  Serial.println(" ready!");
}

void loop() {
  // Required: Update BLE connection status
  controller.update();
  
  // Read button states and send movement
  if (digitalRead(BUTTON_UP_PIN) == LOW) {
    controller.sendControl(UP);
  } else if (digitalRead(BUTTON_DOWN_PIN) == LOW) {
    controller.sendControl(DOWN);
  } else {
    controller.sendControl(NEUTRAL);
  }
  
  // Optional: Print connection status periodically
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint > 2000) {
    lastPrint = millis();
    
    if (controller.isConnected()) {
      Serial.print("Connected! Signal: ");
      Serial.print(controller.getRSSI());
      Serial.print(" dBm");
      
      if (controller.isReady()) {
        Serial.println(" [READY]");
      } else {
        Serial.println(" [Handshaking...]");
      }
    } else {
      Serial.println("Waiting for connection...");
    }
  }
}
