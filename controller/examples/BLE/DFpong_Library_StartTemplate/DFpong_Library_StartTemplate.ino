/*********************************************************************
 * DF Pong Controller - Library Start Template
 * 
 * A minimal template using the DFPongController library.
 * Add your own sensor/input code to control the paddle!
 * 
 * Library Installation:
 * 1. Open Arduino IDE
 * 2. Go to Sketch > Include Library > Manage Libraries...
 * 3. Search for "DFPongController"
 * 4. Click Install
 * 
 * Or install from: https://github.com/DigitalFuturesOCADU/df-pong-controller
 * 
 * LED Status Patterns:
 * - Slow blink (500ms): Disconnected, advertising
 * - Fast blink (100ms): Connected, handshaking
 * - Solid ON: Ready to play
 * 
 * Movement Values:
 * - UP (1): Paddle moves up
 * - DOWN (2): Paddle moves down  
 * - NEUTRAL (0): No movement
 * 
 *********************************************************************/

#include <DFPongController.h>

DFPongController controller;

// ============================================
// IMPORTANT: SET YOUR CONTROLLER NUMBER (1-242)
// ============================================
const int CONTROLLER_NUMBER = 1;  // ← CHANGE THIS!
// ============================================

void setup() {
  Serial.begin(9600);
  delay(1000);
  
  // ========================================
  // ADD YOUR SENSOR/INPUT SETUP HERE
  // ========================================
  // Example:
  // pinMode(SENSOR_PIN, INPUT);
  
  
  // Configure and start the controller
  controller.setControllerNumber(CONTROLLER_NUMBER);
  controller.setStatusLED(LED_BUILTIN);
  controller.begin();
  
  Serial.println("Controller ready!");
}

void loop() {
  // Required: Update BLE every loop
  controller.update();
  
  // ========================================
  // ADD YOUR INPUT LOGIC HERE
  // ========================================
  // Read your sensor and decide movement:
  // - controller.sendControl(UP);      // Paddle up
  // - controller.sendControl(DOWN);    // Paddle down
  // - controller.sendControl(NEUTRAL); // No movement
  
  // Example placeholder - replace with your logic:
  int movement = getMovementFromSensor();
  controller.sendControl(movement);
}

// ========================================
// REPLACE THIS WITH YOUR SENSOR LOGIC
// ========================================
int getMovementFromSensor() {
  // Example: Read analog sensor and map to movement
  // int sensorValue = analogRead(A0);
  // if (sensorValue > 600) return UP;
  // if (sensorValue < 400) return DOWN;
  // return NEUTRAL;
  
  return NEUTRAL;  // Default: no movement
}
