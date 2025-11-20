/*******************************************************************************
 * Light Sensor Control System with Startup Calibration
 * 
 * HARDWARE CONFIGURATION:
 * - Analog light sensor connected to pin A7
 * 
 * CONTROL VARIABLES:
 * Pin Configuration:
 * - lightPin (A7)       : Analog input pin for light sensor
 * 
 * Timing Controls:
 * - lightReadInterval   : Milliseconds between sensor readings (50ms)
 * - lastLightReadTime   : Timestamp of last sensor reading
 * 
 * Rolling Average Configuration:
 * - lightAverageWindow  : Number of samples in rolling average (10)
 * - lightReadings[]     : Array storing historical readings
 * - lightReadIndex      : Current position in rolling average array
 * - lightTotalValue     : Running sum of all readings
 * 
 * Sensor Values:
 * - lightValue          : Raw analog reading (0-1023)
 * - smoothedLightValue  : Filtered value from rolling average
 * - startupLightValue   : Calibrated baseline at startup
 * - brightnessState     : Comparison to startup (brighter/darker/same)
 * 
 * FUNCTIONALITY:
 * - Performs initial calibration at startup
 * - Performs analog readings at specified intervals
 * - Implements rolling average for noise reduction
 * - Compares current readings to startup baseline
 * - Outputs raw, smoothed, and comparative values via Serial
 * 
 * Serial Output Format:
 * "Light Raw: [value]\tLight Smoothed: [value]\tStartup Value: [value]\tCompared to Startup: [state]"
 * 
 *******************************************************************************/


int lightPin = A7;
const int lightAverageWindow = 10; // Number of samples to average

// Global variables
int lightValue = 0;          // Raw value
int smoothedLightValue = 0;  // Filtered value
int startupLightValue = 0;   // Calibration value from startup
String brightnessState = ""; // Stores comparison to startup
unsigned long lastLightReadTime = 0;
unsigned int lightReadInterval = 50;  // Time between reads in milliseconds

// Rolling average variables
int lightReadings[lightAverageWindow];
int lightReadIndex = 0;
long lightTotalValue = 0;

// Function to initialize the rolling average array
void initializeLightAverage() {
  // Initialize all readings to 0
  for (int i = 0; i < lightAverageWindow; i++) {
    lightReadings[i] = 0;
  }
  lightTotalValue = 0;
  lightReadIndex = 0;
}

// Function to update rolling average with new value
void updateLightAverage(int newValue) {
  lightTotalValue = lightTotalValue - lightReadings[lightReadIndex];
  lightReadings[lightReadIndex] = newValue;
  lightTotalValue = lightTotalValue + newValue;
  lightReadIndex = (lightReadIndex + 1) % lightAverageWindow;
  smoothedLightValue = lightTotalValue / lightAverageWindow;
}

// Function to compare current brightness to startup
void updateBrightnessState() {
  const int threshold = 10; // Tolerance for considering values "same"
  if (abs(smoothedLightValue - startupLightValue) <= threshold) {
    brightnessState = "same";
  } else if (smoothedLightValue > startupLightValue) {
    brightnessState = "brighter";
  } else {
    brightnessState = "darker";
  }
}

// Function to read light sensor and update the global value
void readLightSensor() {
  unsigned long currentTime = millis();
  if (currentTime - lastLightReadTime >= lightReadInterval) {
    // Read the analog value
    lightValue = analogRead(lightPin);
    
    // Update the rolling average
    updateLightAverage(lightValue);
    
    // Compare to startup value
    updateBrightnessState();
    
    // Print the values
    printLightValue();
    
    // Update the last read time
    lastLightReadTime = currentTime;
  }
}

// Function to print light sensor values
void printLightValue() {
  Serial.print("Light Raw: ");
  Serial.print(lightValue);
  Serial.print("\tLight Smoothed: ");
  Serial.print(smoothedLightValue);
  Serial.print("\tStartup Value: ");
  Serial.print(startupLightValue);
  Serial.print("\tCompared to Startup: ");
  Serial.println(brightnessState);
}

void calibrateSensor() {
  Serial.println("Calibrating sensor...");
  // Take multiple readings and average them for startup value
  long total = 0;
  for (int i = 0; i < lightAverageWindow; i++) {
    total += analogRead(lightPin);
    delay(50); // Short delay between readings
  }
  startupLightValue = total / lightAverageWindow;
  Serial.print("Calibration complete. Startup value: ");
  Serial.println(startupLightValue);
}

void setup() {
  Serial.begin(9600);
  Serial.println("Light sensor");
  
  // Initialize the rolling average
  initializeLightAverage();
  
  // Perform startup calibration
  calibrateSensor();
}

void loop() {
  // Read the light sensor (function handles timing internally)
  readLightSensor();
}