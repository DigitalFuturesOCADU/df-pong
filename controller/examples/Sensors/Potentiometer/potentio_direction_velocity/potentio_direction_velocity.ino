/*
 * Potentiometer Direction and Velocity Tracking Module
 * 
 * Control Variables:
 * - potenioPin (A6): Analog input pin for potentiometer readings
 * - averageWindow (12): Number of samples used in rolling average calculation
 * - potReadInterval (20ms): Time between consecutive potentiometer readings
 * - noiseThreshold (2): Minimum change required to register movement
 * - velocityWindow (5): Number of samples for velocity calculation
 * 
 * State Variables:
 * - direction: -1 (CCW), 0 (still), 1 (CW)
 * - velocity: Rate of change in counts per second
 * - isMoving: Boolean indicating potentiometer movement
 * 
 * Operating Parameters:
 * - Raw readings stored in 'potValue' (0-1023)
 * - Smoothed output in 'smoothedValue'
 * - Rolling average buffer: readings[averageWindow]
 * - Velocity buffer: velocityReadings[velocityWindow]
 */

int potenioPin = A6;
const int averageWindow = 12;     // Number of samples to average
const int velocityWindow = 5;     // Samples for velocity calculation
const int noiseThreshold = 2;     // Minimum change to register movement

// Global variables
int potValue = 0;                 // Raw value
int smoothedValue = 0;            // Filtered value
int previousSmoothedValue = 0;    // Last smoothed value
int direction = 0;                // -1:CCW, 0:still, 1:CW
float velocity = 0.0;             // Change per second
bool isMoving = false;            // Movement state
unsigned long lastPotReadTime = 0;
unsigned int potReadInterval = 20; // Time between reads in milliseconds

// Rolling average variables
int readings[averageWindow];
int readIndex = 0;
long totalValue = 0;

// Velocity calculation variables
int velocityReadings[velocityWindow];
int velocityIndex = 0;
unsigned long lastVelocityUpdate = 0;

void initializeArrays() {
  for (int i = 0; i < averageWindow; i++) {
    readings[i] = 0;
  }
  for (int i = 0; i < velocityWindow; i++) {
    velocityReadings[i] = 0;
  }
  totalValue = 0;
  readIndex = 0;
  velocityIndex = 0;
}

void updateRollingAverage(int newValue) {
  totalValue = totalValue - readings[readIndex];
  readings[readIndex] = newValue;
  totalValue = totalValue + newValue;
  readIndex = (readIndex + 1) % averageWindow;
  smoothedValue = totalValue / averageWindow;
}

void updateMovementState() {
  int difference = smoothedValue - previousSmoothedValue;
  
  // Update direction
  if (abs(difference) > noiseThreshold) {
    direction = (difference > 0) ? 1 : -1;
    isMoving = true;
    
    // Update velocity readings
    velocityReadings[velocityIndex] = difference;
    velocityIndex = (velocityIndex + 1) % velocityWindow;
    
    // Calculate velocity in counts per second
    float totalChange = 0;
    for (int i = 0; i < velocityWindow; i++) {
      totalChange += velocityReadings[i];
    }
    velocity = (totalChange * 1000.0) / (velocityWindow * potReadInterval);
  } else {
    direction = 0;
    isMoving = false;
    velocity = 0;
    
    // Clear velocity readings
    for (int i = 0; i < velocityWindow; i++) {
      velocityReadings[i] = 0;
    }
  }
  
  previousSmoothedValue = smoothedValue;
}

void readPotentiometer() {
  unsigned long currentTime = millis();
  if (currentTime - lastPotReadTime >= potReadInterval) {
    potValue = analogRead(potenioPin);
    updateRollingAverage(potValue);
    updateMovementState();
    printValues();
    lastPotReadTime = currentTime;
  }
}

void printValues() {
  Serial.print("Smoothed: ");
  Serial.print(smoothedValue);
  Serial.print("\tDirection: ");
  Serial.print(direction);
  Serial.print("\tVelocity: ");
  Serial.print(velocity);
  Serial.print("\tMoving: ");
  Serial.println(isMoving);
}

void setup() {
  Serial.begin(9600);
  Serial.println("Potentiometer Direction Tracker");
  pinMode(potenioPin, INPUT);
  initializeArrays();
}

void loop() {
  readPotentiometer();
}