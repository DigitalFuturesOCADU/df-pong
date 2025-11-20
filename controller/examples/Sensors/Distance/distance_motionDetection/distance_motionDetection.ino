/*******************************************************************************
 * Distance Sensor Motion Detection System
 * 
 * Real-time distance and motion tracking system using rolling average smoothing.
 * Calculates instantaneous motion and accumulates total movement distance.
 * 
 * Key Control Variables:
 * readInterval    = 30ms   - Main processing/output interval
 * AVERAGE_WINDOW  = 5      - Number of samples in rolling average
 * MOTION_THRESHOLD = 0.3cm - Minimum change to register as movement
 * 
 * Output Format:
 * Raw Distance (cm) | Smoothed Distance (cm) | Current Motion (cm) | 
 * Motion State (TOWARD/AWAY/STILL) | Total Motion (cm)
 * 
 * Hardware Setup:
 * TRIGGER_PIN = 2
 * ECHO_PIN = 3
 *******************************************************************************/

#include <HCSR04.h>

#define TRIGGER_PIN 2
#define ECHO_PIN 3

UltraSonicDistanceSensor distanceSensor(TRIGGER_PIN, ECHO_PIN);

// Variables
float distance = 0.0f;
float smoothedDistance = 0.0f;
float lastSmoothedDistance = 0.0f;
float totalMotion = 0.0f;
unsigned long lastReadTime = 0;
const unsigned int readInterval = 30;
const float MOTION_THRESHOLD = 0.3;

// Rolling average
const int AVERAGE_WINDOW = 5;
float readings[AVERAGE_WINDOW];
int readIndex = 0;
float totalValue = 0;

void setup() {
  Serial.begin(9600);
  for(int i = 0; i < AVERAGE_WINDOW; i++) readings[i] = 0;
  Serial.println("Distance Motion Detection Started");
  Serial.println("--------------------------------");
}

void processDistance() {
  unsigned long currentTime = millis();
  if (currentTime - lastReadTime >= readInterval) {
    float newDistance = distanceSensor.measureDistanceCm();
    
    if (newDistance > 0) {
      distance = newDistance;
      
      // Update rolling average
      totalValue = totalValue - readings[readIndex];
      readings[readIndex] = distance;
      totalValue = totalValue + distance;
      readIndex = (readIndex + 1) % AVERAGE_WINDOW;
      lastSmoothedDistance = smoothedDistance;
      smoothedDistance = totalValue / AVERAGE_WINDOW;
      
      // Calculate motion
      float change = smoothedDistance - lastSmoothedDistance;
      totalMotion += abs(change);
      
      // Print verbose status
      Serial.print("Raw Distance: ");
      Serial.print(distance);
      Serial.print(" cm | ");
      
      Serial.print("Smoothed: ");
      Serial.print(smoothedDistance);
      Serial.print(" cm | ");
      
      Serial.print("Current Motion: ");
      Serial.print(abs(change));
      Serial.print(" cm | ");
      
      Serial.print("State: ");
      if(abs(change) < MOTION_THRESHOLD) {
        Serial.print("STILL");
      } else if(change > 0) {
        Serial.print("AWAY ");
      } else {
        Serial.print("TOWARD");
      }
      Serial.print(" | ");
      
      Serial.print("Total Motion: ");
      Serial.print(totalMotion);
      Serial.println(" cm");
    }
    lastReadTime = currentTime;
  }
}

void loop() {
  processDistance();
}