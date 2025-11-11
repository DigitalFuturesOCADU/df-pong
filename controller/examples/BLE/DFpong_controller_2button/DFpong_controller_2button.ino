/*********************************************************************
 * DF Pong Controller
 * 
 * This program implements a Bluetooth Low Energy controller for Pong.
 * It sends movement data to a central device running in the browser and
 * provides audio feedback through a buzzer.
 *
 * Game Link : https://digitalfuturesocadu.github.io/df-pong/
 * 
 * Movement Values:
 * 0 = No movement / Neutral position
 * 1 = UP movement (paddle moves up)
 * 2 = DOWN movement (paddle moves down)
 * 3 = Handshake signal (used for initial connection verification)
 * 
 * Key Functions:
 * - handleInput(): Process the inputs to generate the states
 * - sendMovement(): Sends movement data over BLE (0-3)
 * - updateBLE(): Handles BLE connection management and updates
 * - updateBuzzer(): Provides different buzzer patterns for different movements
 * 
 * Key Variables:
 * - currentMovement: Stores current movement state (0-2)
 * - deviceName : GIVE YOUR DEVICE AN APPROPRIATE NAME
 * - LED_PIN : It is important to see the status of the arduino through the LED. 
      if you can see the built-in add an external one and update the pin it is connected to
 * 

 *********************************************************************/



#include <ArduinoBLE.h>
#include "ble_functions.h"
#include "buzzer_functions.h"
//Since code is split over multiple files, we have to include them here


//Name your controller!
const char* deviceName = "YOUR CONTROLLER NAME";

// Pin definitions buzzer/LED
const int BUZZER_PIN = 11;       // Pin for haptic feedback buzzer
const int LED_PIN = LED_BUILTIN; // Status LED pin

// Movement state tracking
int currentMovement = 0;         // Current movement value (0=none, 1=up, 2=down, 3=handshake)


// Pin definitions for Button input
const int BUTTON_UP_PIN = 6;     // Pin for UP movement button
const int BUTTON_DOWN_PIN = 2;   // Pin for DOWN movement button




void setup() 
{
  
  Serial.begin(9600);
  
  // Configure button pins with internal pullup resistors
  // Buttons will read LOW when pressed, HIGH when released
  pinMode(BUTTON_UP_PIN, INPUT_PULLUP);    // UP button configuration
  pinMode(BUTTON_DOWN_PIN, INPUT_PULLUP);  // DOWN button configuration
  
  // Configure LED for connection status indication
  pinMode(LED_PIN, OUTPUT);
  
  // Initialize Bluetooth Low Energy with device name and status LED
  setupBLE(deviceName, LED_PIN);
  
  // Initialize buzzer for feedback
  setupBuzzer(BUZZER_PIN);
}

void loop() 
{
  // Update BLE connection status and handle incoming data
  updateBLE();
  
  //read the inputs te determine the current state
  //results in changing the value of currentMovement
  handleInput();

  //send the movement state to P5  
  sendMovement(currentMovement);

  //make the correct noise
  updateBuzzer(currentMovement);
  
  
}

void handleInput() 
{
//flipped read method because of INPUT_PULLUP 
  bool upPressed = !digitalRead(BUTTON_UP_PIN);
  bool downPressed = !digitalRead(BUTTON_DOWN_PIN);
  
  if (upPressed && !downPressed) 
  {
    currentMovement = 1;         // UP movement
  } 
  else if (downPressed && !upPressed) 
  {
    currentMovement = 2;         // DOWN movement
  } 
  else 
  {
    currentMovement = 0;         // No movement
  }
}