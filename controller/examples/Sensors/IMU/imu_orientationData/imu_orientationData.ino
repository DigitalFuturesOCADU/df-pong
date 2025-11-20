/*
 * IMU sensor reading and orientation tracking
 * 
 * Uses the SensorFusion library to transform the raw values into degrees
 * Inputs:
 *   - Accelerometer (x, y, z) in G forces
 *   - Gyroscope (x, y, z) in degrees/second
 * 
 * Outputs:
 *   - Roll (x rotation) in degrees
 *   - Pitch (y rotation) in degrees 
 *   - Yaw (z rotation) in degrees
 * 
 * Sample rate: imuReadInterval
 */

#include <Arduino_LSM6DS3.h>
#include "SensorFusion.h"

SF fusion;

// Global variables for IMU
float gx, gy, gz, ax, ay, az;
float pitch = 0.0f;
float roll = 0.0f;
float yaw = 0.0f;
float deltat = 0.0f;
unsigned long lastImuReadTime = 0;
unsigned int imuReadInterval = 10;  // Time between reads in milliseconds (100Hz)

// Calibration variables
float gyro_bias[3] = {0, 0, 0};  // Gyro bias in x, y, z
const int calibration_samples = 500;

// Function to calibrate the IMU
void calibrateImu() {
  float sum_gx = 0, sum_gy = 0, sum_gz = 0;
  float sum_ax = 0, sum_ay = 0, sum_az = 0;
  int valid_samples = 0;
  
  Serial.println("Keep the IMU still for calibration...");
  delay(2000);  // Give user time to place IMU still
  
  Serial.println("Calibrating...");
  
  // Collect samples
  while (valid_samples < calibration_samples) {
    if (IMU.accelerationAvailable() && IMU.gyroscopeAvailable()) {
      IMU.readAcceleration(ax, ay, az);
      IMU.readGyroscope(gx, gy, gz);
      
      // Accumulate gyro readings
      sum_gx += gx;
      sum_gy += gy;
      sum_gz += gz;
      
      // Accumulate accel readings
      sum_ax += ax;
      sum_ay += ay;
      sum_az += az;
      
      valid_samples++;
      
      // Show progress every 100 samples
      if (valid_samples % 100 == 0) {
        Serial.print("Progress: ");
        Serial.print((valid_samples * 100) / calibration_samples);
        Serial.println("%");
      }
      
      delay(2);  // Small delay between readings
    }
  }
  
  // Calculate average gyro bias
  gyro_bias[0] = sum_gx / calibration_samples;
  gyro_bias[1] = sum_gy / calibration_samples;
  gyro_bias[2] = sum_gz / calibration_samples;
  
  // Calculate initial orientation from average accelerometer readings
  float initial_ax = sum_ax / calibration_samples;
  float initial_ay = sum_ay / calibration_samples;
  float initial_az = sum_az / calibration_samples;
  
  // Update fusion filter with initial values
  deltat = fusion.deltatUpdate();
  fusion.MahonyUpdate(0, 0, 0, initial_ax, initial_ay, initial_az, deltat);
  
  Serial.println("Calibration complete!");
  Serial.println("Gyro bias values:");
  Serial.print("X: "); Serial.print(gyro_bias[0]);
  Serial.print(" Y: "); Serial.print(gyro_bias[1]);
  Serial.print(" Z: "); Serial.println(gyro_bias[2]);
}

// Function to initialize the IMU
bool initializeImu() {
  if (!IMU.begin()) {
    Serial.println("Failed to initialize IMU!");
    return false;
  }
  
  // Perform calibration
  calibrateImu();
  return true;
}

// Function to read IMU and update orientation values
void readImu() {
  unsigned long currentTime = millis();
  if (currentTime - lastImuReadTime >= imuReadInterval) {
    if (IMU.accelerationAvailable() && IMU.gyroscopeAvailable()) {
      // Read acceleration and gyroscope data
      IMU.readAcceleration(ax, ay, az);
      IMU.readGyroscope(gx, gy, gz);
      
      // Remove bias from gyro readings
      gx -= gyro_bias[0];
      gy -= gyro_bias[1];
      gz -= gyro_bias[2];
      
      // Convert gyroscope readings from deg/s to rad/s
      gx *= DEG_TO_RAD;
      gy *= DEG_TO_RAD;
      gz *= DEG_TO_RAD;
      
      // Update the filter
      deltat = fusion.deltatUpdate();
      fusion.MahonyUpdate(gx, gy, gz, ax, ay, az, deltat);
      
      // Get the angles
      pitch = fusion.getPitch();
      roll = fusion.getRoll();
      yaw = fusion.getYaw();
      
      // Print the values
      printImuValues();
    }
    
    lastImuReadTime = currentTime;
  }
}

// Function to print IMU values
void printImuValues() {
  Serial.print("Roll: ");
  Serial.print(roll, 1);
  Serial.print("\tPitch: ");
  Serial.print(pitch, 1);
  Serial.print("\tYaw: ");
  Serial.println(yaw, 1);
}

void setup() {
  Serial.begin(115200);
  while (!Serial);
  Serial.println("IMU Orientation test!");
  
  if (!initializeImu()) {
    Serial.println("IMU initialization failed!");
    while (1);
  }
  Serial.println("IMU initialized and calibrated!");
}

void loop() {
  // Read the IMU (function handles timing internally)
  readImu();
}