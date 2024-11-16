/* 
Pong for Creation & Computation 2024

Based on:
Coding Train Challenge #67 Pong by Daniel Shiffman - https://thecodingtrain.com/challenges/67-pong
Ported to p5.js by madacoo - https://editor.p5js.org/codingtrain/sketches/CKCwTIm3S
*/



let leftscore = 0;
let rightscore = 0;

//KH
let leftUpKey = "a";
let leftDownKey = 'z';
let rightUpKey = 'p';
let rightDownKey = 'l';

//variables holding the values from the controllers
let player1Movement;
let player1Name;


let player2Movement;
let player2Name;


//toggle debug with spacebar
let drawBleDebug = false;

function preload() {
  //song = loadSound("pa5a.wav");
  //song2 = loadSound("pongblipa4.wav");
}

function setup() {
    createCanvas(1200, 800);
    ding = loadSound("ding.mp3");
    puck = new Puck();
    left = new Paddle(true);
    right = new Paddle(false);

  textSize(16);
  textAlign(CENTER, CENTER);
  
  // Create and setup BLE controller
  bleController = new BLEController();
  bleController.debug = drawBleDebug ;  // Set to false to hide debug info
  bleController.setup();

// Get already-multiplied movement values
   player1Movement = bleController.getPlayer1Movement();
   player2Movement = bleController.getPlayer2Movement();
}

function draw() {
    background(0);

    //get current bleData
    //get current player names
  player1Name = bleController.player1Name;
  player2Name = bleController.player2Name;
  
  
  // Get movement values for game logic
  player1Movement = bleController.getPlayer1Movement();
  console.log("player1Movement: " + player1Movement);
  left.move(player1Movement)

  player2Movement = bleController.getPlayer2Movement();
  right.move(player2Movement);  
    puck.checkPaddleRight(right);
    puck.checkPaddleLeft(left);

    left.show();
    right.show();
    left.update();
    right.update();
    
    puck.update();
    puck.edges();
    puck.show();
    

    textAlign(LEFT, CENTER);
    fill(255);
    textSize(32);
    text(leftscore, 32, 40);
    textAlign(RIGHT, CENTER);   
    text(rightscore, width-32, 40); 
    

    textSize(60);
    fill(255, 255, 255, 127);
    textAlign(CENTER, CENTER);
    text(player1Name, width/4, height/2);

    //should be 3/4 of the way across the screen

    text(player2Name, (3 * width) / 4, height / 2);

// Draw debug information if enabled
textSize(16);
bleController.drawDebug();
 




}


function keyReleased() {
    left.move(0);
    right.move(0);
}

function keyPressed() {
    console.log(key);
    //if (key == 'A') {
  if (key == leftUpKey) {
        left.move(-10);
    //} else if (key == 'Z') {
      } else if (key == leftDownKey) {
        left.move(10);
    }

    if (key == rightUpKey) {
        right.move(-10);
    } else if (key == rightDownKey) {
        right.move(10);
    }
    //toggle debug with spacebar
    if (key == ' ') {
        drawBleDebug = !drawBleDebug;
        bleController.debug = drawBleDebug;
    }
}
