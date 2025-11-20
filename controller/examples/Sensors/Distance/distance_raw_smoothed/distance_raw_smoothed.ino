/*******************************************************************************
 * Ultrasonic Distance Sensor Control System
 * 
 * This program implements an ultrasonic distance sensor (HC-SR04) with rolling
 * average smoothing for stable measurements.
 * 
 * Key Control Variables:
 * - TRIGGER_PIN (2): Digital output pin connected to sensor's trigger
 * - ECHO_PIN (3): Digital input pin connected to sensor's echo
 * - distanceReadInterval (100ms): Sampling rate for distance measurements
 * - DISTANCE_AVERAGE_WINDOW (5): Number of samples used in rolling average
 * 
 * Global State:
 * - distance: Raw current distance measurement in centimeters
 * - smoothedDistance: Filtered distance using rolling average
 * - distanceReadings[]: Circular buffer storing recent measurements
 * 
 * Main Functions:
 * - readDistance(): Handles sensor reading at specified interval
 * - updateDistanceAverage(): Implements rolling average calculation
 * - printDistanceValues(): Outputs measurements via Serial
 * 
 * Serial Output Format:
 * "Distance Raw: X.XX cm   Distance Smoothed: Y.YY cm"
 * 
 * Sampling Rate: 10Hz (adjustable via distanceReadInterval)

 *******************************************************************************/

#include <HCSR04.h>

#define TRIGGER_PIN 2
#define ECHO_PIN 3

// Create the distance sensor object
UltraSonicDistanceSensor distanceSensor(TRIGGER_PIN, ECHO_PIN);

// Global variables
float distance = 0.0f;          // Current distance in cm
float smoothedDistance = 0.0f;  // Filtered distance
unsigned long lastDistanceReadTime = 0;
unsigned int distanceReadInterval = 30;  // Time between reads in milliseconds 

// Rolling average variables for distance
const int DISTANCE_AVERAGE_WINDOW = 5;
float distanceReadings[DISTANCE_AVERAGE_WINDOW];
int distanceReadIndex = 0;
float distanceTotalValue = 0;

// Function to initialize the rolling average array
void initializeDistanceAverage() {
  for (int i = 0; i < DISTANCE_AVERAGE_WINDOW; i++) {
    distanceReadings[i] = 0;
  }
  distanceTotalValue = 0;
  distanceReadIndex = 0;
}

// Function to update rolling average with new value
void updateDistanceAverage(float newValue) {
  // Only update if we have a valid reading
  if (newValue > 0) {
    // Subtract the oldest reading from the total
    distanceTotalValue = distanceTotalValue - distanceReadings[distanceReadIndex];
    // Add the new reading to the array
    distanceReadings[distanceReadIndex] = newValue;
    // Add the new reading to the total
    distanceTotalValue = distanceTotalValue + newValue;
    // Advance to the next position in the array
    distanceReadIndex = (distanceReadIndex + 1) % DISTANCE_AVERAGE_WINDOW;
    // Calculate the average
    smoothedDistance = distanceTotalValue / DISTANCE_AVERAGE_WINDOW;
  }
}

// Function to read distance sensor and update the global value
void readDistance() {
  unsigned long currentTime = millis();
  if (currentTime - lastDistanceReadTime >= distanceReadInterval) {
    // Read the distance
    float newDistance = distanceSensor.measureDistanceCm();
    
    // Update values if reading is valid
    if (newDistance > 0) {  // Basic error checking
      distance = newDistance;
      updateDistanceAverage(distance);
    }
    
    // Print the values
    printDistanceValues();
    
    // Update the last read time
    lastDistanceReadTime = currentTime;
  }
}

// Function to print distance values
void printDistanceValues() {
  Serial.print("Distance Raw: ");
  Serial.print(distance);
  Serial.print(" cm\tDistance Smoothed: ");
  Serial.print(smoothedDistance);
  Serial.println(" cm");
}

void setup() {
  Serial.begin(9600);
  Serial.println("Distance Sensor test!");
  
  // Initialize the rolling average
  initializeDistanceAverage();
}

void loop() {
  // Read the distance sensor (function handles timing internally)
  readDistance();
}