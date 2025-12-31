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

// Sound variables
let song, song2, ding;

// Orientation check
let isLandscape = true;

// Assets path (can be overridden by instances)
let assetsPath = '../shared/assets/';

function preload() {
  song = loadSound(assetsPath + "paddle.wav");
  song2 = loadSound(assetsPath + "wall.wav");
  ding = loadSound(assetsPath + "ding.mp3");
}

function setup() {
  const isMobile = windowWidth <= 768;
  
  // Create canvas based on device type and orientation
  
  if (isMobile) {
    // Mobile: Use full viewport (visualViewport for better accuracy)
    const vw = window.visualViewport ? window.visualViewport.width : windowWidth;
    const vh = window.visualViewport ? window.visualViewport.height : windowHeight;
    
    if (vh > vw) {
      // Portrait: fit canvas to width, maintain 1.5:1 ratio (width:height)
      isLandscape = true; // Keep game logic as landscape
      const canvasWidth = vw;
      const canvasHeight = canvasWidth / 1.5;
      createCanvas(canvasWidth, canvasHeight);
    } else {
      // Landscape: show orientation warning
      isLandscape = false;
      createCanvas(vw, vh);
    }
  } else {
    // Desktop: Use constrained size to leave room for buttons below
    isLandscape = true;
    let canvasWidth = min(windowWidth, 1200);
    let canvasHeight = min(windowHeight - 150, 800);
    
    // Maintain aspect ratio
    if (canvasWidth / canvasHeight > 1.5) {
      canvasWidth = canvasHeight * 1.5;
    } else {
      canvasHeight = canvasWidth / 1.5;
    }
    
    createCanvas(canvasWidth, canvasHeight);
  }
  
  puck = new Puck(assetsPath);
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
  
  // Listen for visualViewport changes (mobile browser UI showing/hiding)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      windowResized();
    });
  }
}

function draw() {
  background(0);
  
  // Check if device is in portrait mode
  if (!isLandscape) {
    drawOrientationWarning();
    return;
  }
  
  // Update countdown if active
  gameController.updateCountdown();
  
  // Always update BLE data
  player1Name = bleController.player1Name;
  player2Name = bleController.player2Name;
  player1Movement = bleController.getPlayer1Movement();
  player2Movement = bleController.getPlayer2Movement();

  // Draw player names ALWAYS (behind everything) - scale to canvas size
  textSize(height * 0.05); // 5% of canvas height
  fill(255); // White, not transparent
  textAlign(CENTER, CENTER);
  text(player1Name, width/4, height/2);
  text(player2Name, (3 * width)/4, height/2);

  // Show "VS" in center during gameplay
  if (gameController.isPlaying) {
    textSize(height * 0.08); // 8% of canvas height
    fill(255); // White, not transparent
    textAlign(CENTER, CENTER);
    text("VS", width/2, height/2);
  }

  // Update keyboard control visibility based on BLE connections
  gameController.updateKeyboardControlVisibility(bleController);
  gameController.updateGameButtonLabel();
  gameController.updateKeyboardControlPositions();
  
  if (gameController.isPlaying) {
    // Active gameplay
    puck.checkPaddleLeft(left);
    puck.checkPaddleRight(right);
    puck.update();
    puck.edges(bleController);
    
    // Update paddles based on BLE input
    if (bleController.player1Connected) {
      left.move(player1Movement);
    }
    if (bleController.player2Connected) {
      right.move(player2Movement);
    }
    
    left.update();
    right.update();
    
    // Check win condition
    gameController.checkWinCondition(player1Name, player2Name);
  }
  
  // Always draw game elements
  puck.show();
  left.show();
  right.show();
  
  // Draw scores - scale to canvas size
  textSize(height * 0.1); // 10% of canvas height
  fill(255);
  textAlign(CENTER, TOP);
  const scorePadding = height * 0.02;
  text(leftscore, width/4, scorePadding);
  text(rightscore, (3 * width)/4, scorePadding);
  
  // Draw center line
  stroke(255);
  strokeWeight(2);
  for (let y = 0; y < height; y += 20) {
    line(width/2, y, width/2, y + 10);
  }
  noStroke();
  
  // Draw game state overlay
  gameController.drawGameState();
  
  // Draw BLE particles
  bleController.updateParticles();
  bleController.drawParticles();
  
  // Draw debug info if enabled
  if (drawBleDebug) {
    bleController.drawDebug();
  }
}

function drawOrientationWarning() {
  background(0);
  fill(255);
  textSize(24);
  textAlign(CENTER, CENTER);
  text("Please rotate your device\nto portrait mode", width/2, height/2);
}

function windowResized() {
  const isMobile = windowWidth <= 768;
  
  if (isMobile) {
    const vw = window.visualViewport ? window.visualViewport.width : windowWidth;
    const vh = window.visualViewport ? window.visualViewport.height : windowHeight;
    
    if (vh > vw) {
      isLandscape = true;
      const canvasWidth = vw;
      const canvasHeight = canvasWidth / 1.5;
      resizeCanvas(canvasWidth, canvasHeight);
    } else {
      isLandscape = false;
      resizeCanvas(vw, vh);
    }
  } else {
    isLandscape = true;
    let canvasWidth = min(windowWidth, 1200);
    let canvasHeight = min(windowHeight - 150, 800);
    
    if (canvasWidth / canvasHeight > 1.5) {
      canvasWidth = canvasHeight * 1.5;
    } else {
      canvasHeight = canvasWidth / 1.5;
    }
    
    resizeCanvas(canvasWidth, canvasHeight);
  }
  
  // Resize game elements
  if (typeof puck !== 'undefined') puck.resize();
  if (typeof left !== 'undefined') left.resize();
  if (typeof right !== 'undefined') right.resize();
  
  // Update UI positions
  if (typeof bleController !== 'undefined') {
    bleController.updateButtonPositions();
  }
  if (typeof gameController !== 'undefined') {
    gameController.updateKeyboardControlPositions();
  }
}

function keyPressed() {
  // Keyboard controls for paddles
  if (key === leftUpKey || key === leftUpKey.toUpperCase()) {
    left.move(-8);
  } else if (key === leftDownKey || key === leftDownKey.toUpperCase()) {
    left.move(8);
  }
  
  if (key === rightUpKey || key === rightUpKey.toUpperCase()) {
    right.move(-8);
  } else if (key === rightDownKey || key === rightDownKey.toUpperCase()) {
    right.move(8);
  }
  
  // Toggle debug with spacebar
  if (key === ' ') {
    drawBleDebug = !drawBleDebug;
    bleController.debug = drawBleDebug;
    if (typeof puck !== 'undefined') {
      puck.setDebug(drawBleDebug);
    }
  }
}

function keyReleased() {
  // Stop paddle movement when key released
  if (key === leftUpKey || key === leftUpKey.toUpperCase() ||
      key === leftDownKey || key === leftDownKey.toUpperCase()) {
    left.move(0);
  }
  
  if (key === rightUpKey || key === rightUpKey.toUpperCase() ||
      key === rightDownKey || key === rightDownKey.toUpperCase()) {
    right.move(0);
  }
}
