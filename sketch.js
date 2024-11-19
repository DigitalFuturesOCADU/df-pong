/* 
Pong for Creation & Computation 2024

Based on:
Coding Train Challenge #67 Pong by Daniel Shiffman - https://thecodingtrain.com/challenges/67-pong
Ported to p5.js by madacoo - https://editor.p5js.org/codingtrain/sketches/CKCwTIm3S
*/

let leftscore = 0;
let rightscore = 0;

// KH
let leftUpKey = "a";
let leftDownKey = 'z';
let rightUpKey = 'p';
let rightDownKey = 'l';

// Variables holding the values from the controllers
let player1Movement;
let player1Name;
let player2Movement;
let player2Name;

// Controller to handle the game logic
let gameController;
let pointsToWin = 10;

// Toggle debug with spacebar
let drawBleDebug = false;

// Initialize BLEController
let bleController;

function preload() {
   song = loadSound("paddle.wav");
  song2 = loadSound("wall.wav");
}

function setup() {
  createCanvas(1200, 800);
  //ding = loadSound("ding.mp3");
  puck = new Puck();
  left = new Paddle(true);
  right = new Paddle(false);

  textSize(16);
  textAlign(CENTER, CENTER);
  
  // Create and setup BLE controller
  bleController = new BLEController();
  bleController.debug = drawBleDebug;  // Set to false to hide debug info
  bleController.setup();

  // Get already-multiplied movement values
  player1Movement = bleController.getPlayer1Movement();
  player2Movement = bleController.getPlayer2Movement();

  // Setup the game controller
  gameController = new GameController(pointsToWin);
  // Initialize the game 
  gameController.startGame();
}

function draw() {
  background(0);
  
  // Always update BLE data
  player1Name = bleController.player1Name;
  player2Name = bleController.player2Name;
  player1Movement = bleController.getPlayer1Movement();
  player2Movement = bleController.getPlayer2Movement();

 

  if (gameController.isPlaying) {
    // Game logic only runs when playing
    if (bleController.isPlayer1Connected()) {
      left.move(player1Movement);
    }
    if (bleController.isPlayer2Connected()) {
      right.move(player2Movement);
    }
    // Draw the dotted vertical line
  stroke(255, 255, 255, 127);
  strokeWeight(2);
  for (let y = 0; y < height; y += 20) {
    line(width / 2, y, width / 2, y + 10);
  }
  noStroke();


    puck.checkPaddleRight(right);
    puck.checkPaddleLeft(left);

    left.show();
    right.show();
    left.update();
    right.update();
    
    puck.update();
    puck.edges();
    puck.show();
    
    // Score display
    textAlign(LEFT, CENTER);
    fill(255);
    textSize(32);
    text(leftscore, 32, 40);
    textAlign(RIGHT, CENTER);   
    text(rightscore, width-32, 40);
    
    // Check win condition after score update
    gameController.checkWinCondition(player1Name, player2Name);
  }

  // Always show player names
  textSize(40);
  fill(255, 255, 255, 127);
  textAlign(CENTER, CENTER);
  text(player1Name, width/4, height/2);
  text(player2Name, (3 * width)/4, height/2);

  // Always draw game state
  gameController.drawGameState();

  // Debug info
  if (drawBleDebug) {
    textSize(16);
    bleController.drawDebug();
  }
}

function keyReleased() {
  left.move(0);
  right.move(0);
}

function keyPressed() {
    console.log(key);
    if (key == leftUpKey) {
        left.move(-10);
    } else if (key == leftDownKey) {
        left.move(10);
    }

    if (key == rightUpKey) {
        right.move(-10);
    } else if (key == rightDownKey) {
        right.move(10);
    }

    // Toggle debug with 'd' key
    if (key == 'd') {
        drawBleDebug = !drawBleDebug;
        bleController.debug = drawBleDebug;
    }

    // Toggle debug GUI with 'c' key
    if (key == 'c') {
        gameController.debugGUIVisible = !gameController.debugGUIVisible;
        gameController.setDebugGUIVisible(gameController.debugGUIVisible);
    }

    // Handle game states with SPACE and ENTER
    if (key === ' ') {
        // Space handles pause/resume during gameplay
        if (gameController.currentState === gameController.STATE.PLAYING) {
            gameController.pauseGame();
        } else if (gameController.currentState === gameController.STATE.PAUSED || 
                   gameController.currentState === gameController.STATE.WAITING) {
            gameController.resumeGame();
        }
    } else if (keyCode === ENTER) {
        // Enter handles reset after win or during pause
        if (gameController.currentState === gameController.STATE.WON ||
            gameController.currentState === gameController.STATE.PAUSED) {
            gameController.resetGame();
            puck.reset();
        }
    }
}
