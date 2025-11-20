/*******************************************************************************
 * Dual Light Sensor Comparison System
 * 
 * HARDWARE CONFIGURATION:
 * - Primary light sensor connected to pin A7
 * - Secondary light sensor connected to pin A6
 * 
 * CONTROL VARIABLES:
 * Pin Configuration:
 * - lightPin1 (A7)      : Analog input pin for first light sensor
 * - lightPin2 (A6)      : Analog input pin for second light sensor
 * 
 * Timing Controls:
 * - lightReadInterval   : Milliseconds between sensor readings (50ms)
 * - lastLightReadTime   : Timestamp of last sensor reading
 * 
 * Rolling Average Configuration:
 * - lightAverageWindow  : Number of samples in rolling average (10)
 * - lightReadings1[]    : Array storing historical readings for sensor 1
 * - lightReadings2[]    : Array storing historical readings for sensor 2
 * - lightReadIndex      : Current position in rolling average array
 * - lightTotalValue1    : Running sum of all readings for sensor 1
 * - lightTotalValue2    : Running sum of all readings for sensor 2
 * 
 * Sensor Values:
 * - lightValue1         : Raw analog reading from sensor 1 (0-1023)
 * - lightValue2         : Raw analog reading from sensor 2 (0-1023)
 * - smoothedLight1      : Filtered value from rolling average for sensor 1
 * - smoothedLight2      : Filtered value from rolling average for sensor 2
 * 
 * FUNCTIONALITY:
 * - Performs analog readings from both sensors at specified intervals
 * - Implements rolling average for noise reduction on both sensors
 * - Compares readings to determine darker sensor
 * - Outputs raw values, smoothed values, and comparison via Serial
 * 
 */
 
// Pin and threshold definitions
int lightPin1 = A7;
int lightPin2 = A6;
const int lightAverageWindow = 10;
const int equalityThreshold = 50;  // Adjust this value for sensitivity

// Global variables
int lightValue1 = 0;         
int lightValue2 = 0;         
int smoothedLight1 = 0;      
int smoothedLight2 = 0;      
unsigned long lastLightReadTime = 0;
unsigned int lightReadInterval = 50;  

// Rolling average variables
int lightReadings1[lightAverageWindow];
int lightReadings2[lightAverageWindow];
int lightReadIndex = 0;
long lightTotalValue1 = 0;
long lightTotalValue2 = 0;

void initializeLightAverage() {
  for (int i = 0; i < lightAverageWindow; i++) {
    lightReadings1[i] = 0;
    lightReadings2[i] = 0;
  }
  lightTotalValue1 = 0;
  lightTotalValue2 = 0;
  lightReadIndex = 0;
}

void updateLightAverage(int newValue1, int newValue2) {
  lightTotalValue1 = lightTotalValue1 - lightReadings1[lightReadIndex];
  lightReadings1[lightReadIndex] = newValue1;
  lightTotalValue1 = lightTotalValue1 + newValue1;
  
  lightTotalValue2 = lightTotalValue2 - lightReadings2[lightReadIndex];
  lightReadings2[lightReadIndex] = newValue2;
  lightTotalValue2 = lightTotalValue2 + newValue2;
  
  lightReadIndex = (lightReadIndex + 1) % lightAverageWindow;
  
  smoothedLight1 = lightTotalValue1 / lightAverageWindow;
  smoothedLight2 = lightTotalValue2 / lightAverageWindow;
}

void readLightSensors() {
  unsigned long currentTime = millis();
  if (currentTime - lastLightReadTime >= lightReadInterval) {
    lightValue1 = analogRead(lightPin1);
    lightValue2 = analogRead(lightPin2);
    
    updateLightAverage(lightValue1, lightValue2);
    printLightValues();
    
    lastLightReadTime = currentTime;
  }
}

void printLightValues() {
  Serial.print("Sensor 1 Raw: ");
  Serial.print(lightValue1);
  Serial.print("\tSmoothed: ");
  Serial.print(smoothedLight1);
  Serial.print("\tSensor 2 Raw: ");
  Serial.print(lightValue2);
  Serial.print("\tSmoothed: ");
  Serial.print(smoothedLight2);
  Serial.print("\tDarker sensor: ");
  
  int difference = abs(smoothedLight1 - smoothedLight2);
  
  if (difference <= equalityThreshold) {
    Serial.println("Equal (within threshold)");
  } else if (smoothedLight1 < smoothedLight2) {
    Serial.println("Sensor 1");
  } else {
    Serial.println("Sensor 2");
  }
}

void setup() {
  Serial.begin(9600);
  Serial.println("Dual Light Sensor Comparison");
  initializeLightAverage();
}

void loop() {
  readLightSensors();
}