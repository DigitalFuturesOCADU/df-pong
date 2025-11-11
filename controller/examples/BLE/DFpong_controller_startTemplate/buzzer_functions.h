#include <Arduino.h>

// Buzzer variables
int buzzerPin;
bool buzzerState = false;
unsigned long previousMillis = 0;

void setupBuzzer(int pin) {
  buzzerPin = pin;
  pinMode(buzzerPin, OUTPUT);
  digitalWrite(buzzerPin, LOW);
}

void updateBuzzer(int state) {
  unsigned long currentMillis = millis();
  int interval;
  
  switch(state) {
    case 1:  // UP movement
      interval = 5;  // 5ms interval
      if (currentMillis - previousMillis >= interval) {
        previousMillis = currentMillis;
        buzzerState = !buzzerState;
        digitalWrite(buzzerPin, buzzerState);
      }
      break;
      
    case 2:  // DOWN movement
      interval = 15;  // 15ms interval
      if (currentMillis - previousMillis >= interval) {
        previousMillis = currentMillis;
        buzzerState = !buzzerState;
        digitalWrite(buzzerPin, buzzerState);
      }
      break;
      
    default:  // No movement (state 0)
      digitalWrite(buzzerPin, LOW);
      buzzerState = false;
      break;
  }
}