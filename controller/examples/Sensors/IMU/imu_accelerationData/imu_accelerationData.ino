/*
 * Accelerometer_Movement.h
 * 
 * Uses LSM6DS3 IMU on Arduino Nano 33 IoT to measure movement in all directions
 * and calculate total movement magnitude. Includes calibration on startup.
 * 
 * Outputs:
 * - X axis acceleration (left/right)
 * - Y axis acceleration (up/down) 
 * - Z axis acceleration (forward/back)
 * - Total movement magnitude
 * 
 * Units: G-force
 * Sample rate: 10Hz (adjustable via interval)
 * 
 */

#include <Arduino_LSM6DS3.h>

unsigned long previousMillis = 0;
unsigned long interval = 100;

// Calibration offsets
float xOffset = 0;
float yOffset = 0;
float zOffset = 0;

void setup() {
  Serial.begin(9600);
  if (!IMU.begin()) {
    Serial.println("Failed to initialize IMU!");
    while (1);
  }
  
  // Calibration
  Serial.println("Calibrating... keep device still");
  float xSum = 0, ySum = 0, zSum = 0;
  int samples = 100;
  
  for(int i = 0; i < samples; i++) {
    float x, y, z;
    if (IMU.accelerationAvailable()) {
      IMU.readAcceleration(x, y, z);
      xSum += x;
      ySum += y;
      zSum += z;
      delay(10);
    }
  }
  
  xOffset = xSum / samples;
  yOffset = ySum / samples;
  zOffset = zSum / samples;
  Serial.println("Calibration complete!");
}

void loop() {
  unsigned long currentMillis = millis();
  
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;
    
    float x, y, z;
    if (IMU.accelerationAvailable()) {
      IMU.readAcceleration(x, y, z);
      
      // Apply calibration
      x -= xOffset;
      y -= yOffset;
      z -= zOffset;
      
      // Calculate total movement
      float totalMovement = sqrt(x*x + y*y + z*z);
      
      Serial.print("X: ");
      Serial.print(x);
      Serial.print(" | Y: ");
      Serial.print(y);
      Serial.print(" | Z: ");
      Serial.print(z);
      Serial.print(" | Total: ");
      Serial.println(totalMovement);
    }
  }
}