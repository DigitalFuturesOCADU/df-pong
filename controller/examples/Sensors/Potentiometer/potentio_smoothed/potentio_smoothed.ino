/*
 * Potentiometer Reading and Smoothing Module
 * 
 * Control Variables:
 * - potenioPin (A6): Analog input pin for potentiometer readings
 * - averageWindow (12): Number of samples used in rolling average calculation
 * - potReadInterval (20ms): Time between consecutive potentiometer readings
 * 
 * Operating Parameters:
 * - Raw readings stored in 'potValue' (0-1023)
 * - Smoothed output available in 'smoothedValue'
 * - Rolling average buffer: readings[averageWindow]
 * - Timing control: lastPotReadTime tracks last read timestamp
 * 
 * Functions:
 * - initializeRollingAverage(): Sets up averaging buffer
 * - updateRollingAverage(): Updates smoothed value
 * - readPotentiometer(): Main reading function with timing control
 * - printPotValue(): Debug output of smoothed values
 */

int potenioPin = A6;
const int averageWindow =12;  // Number of samples to average

// Global variables
int potValue = 0;          // Raw value
int smoothedValue = 0;     // Filtered value
unsigned long lastPotReadTime = 0;
unsigned int potReadInterval = 20;  // Time between reads in milliseconds

// Rolling average variables
int readings[averageWindow];
int readIndex = 0;
long totalValue = 0;

// Function to initialize the rolling average array
void initializeRollingAverage() {
  // Initialize all readings to 0
  for (int i = 0; i < averageWindow; i++) {
    readings[i] = 0;
  }
  totalValue = 0;
  readIndex = 0;
}

// Function to update rolling average with new value
void updateRollingAverage(int newValue) {
  // Subtract the oldest reading from the total
  totalValue = totalValue - readings[readIndex];
  // Add the new reading to the array
  readings[readIndex] = newValue;
  // Add the new reading to the total
  totalValue = totalValue + newValue;
  // Advance to the next position in the array
  readIndex = (readIndex + 1) % averageWindow;
  // Calculate the average
  smoothedValue = totalValue / averageWindow;
}

// Function to read potentiometer and update the global value
void readPotentiometer() {
  unsigned long currentTime = millis();
  if (currentTime - lastPotReadTime >= potReadInterval) {
    // Read the analog value
    potValue = analogRead(potenioPin);
    
    // Update the rolling average
    updateRollingAverage(potValue);
    
    // Print the values
    printPotValue();
    
    // Update the last read time
    lastPotReadTime = currentTime;
  }
}

// Function to print potentiometer values
void printPotValue() {

  Serial.print("\tPot Smoothed: ");
  Serial.println(smoothedValue);
}

void setup() {
  Serial.begin(9600);
  Serial.println("Potentiometer test!");
  
  // Set pin mode
  pinMode(potenioPin, INPUT);
  
  // Initialize the rolling average
  initializeRollingAverage();
}

void loop() {
  // Read the potentiometer (function handles timing internally)
  readPotentiometer();
}