## Wireless Controller v1
Simple example to create a wireless controller for [df pong](https://digitalfuturesocadu.github.io/df-pong/) the uses 2 buttons and a piezo buzzer to control the paddle and provide local feedback. 
The example is created for the Nano33 IOT, but is applicable for any Arduino that uses the ArduinoBLE library. The base code is designed to easily be integrated with other sensors to control the paddle. 

Steps

1. [Download the Example Code from Github](https://github.com/DigitalFuturesOCADU/CC2024/tree/main/experiment4/Arduino/BLE)
    1. Use [DFpong_controller_2button](/examples/BLE/DFpong_controller_2button)
2. Update line #40 with your name: const char* deviceName = "YOUR CONTROLLER NAME";
3. Wire up your controller and battery based on what you have on hand (If you don't have a battery, it can be usb powered from your laptop for now)
4. [Connect to the game and play](https://digitalfuturesocadu.github.io/df-pong/)

### Wiring Diagrams

* Buttons connected to D3 + D6
* Buzzer connected to D11
* Battery

![Nano 2 Button BeepBoop Wired](/images/nano_2Button_BeepBoop_wired_bb.png)

### Micro USB breakout

![Nano 2 Button BeepBoop MicroUSB](/images/nano_2Button_BeepBoop_microUSB_wPlug.png)

### USBC breakout

![Nano 2 Button BeepBoop USBC](/images/nano_2Button_BeepBoop_USBC_withPlug.png)

![Controller Photo 1](/images/PXL_20241119_220258614.jpg)

![Controller Photo 2](/images/PXL_20241119_223934953.jpg)