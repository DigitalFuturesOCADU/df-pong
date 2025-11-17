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

function preload() {
   song = loadSound("paddle.wav");
  song2 = loadSound("wall.wav");
  ding = loadSound("ding.mp3");
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
  
  // Draw top and bottom borders
  stroke(255, 255, 255, 127);
  strokeWeight(2);
  line(0, 0, width, 0); // Top border
  line(0, height - 1, width, height - 1); // Bottom border
  noStroke();


    puck.checkPaddleRight(right);
    puck.checkPaddleLeft(left);

    left.show();
    right.show();
    left.update();
    right.update();
    
    puck.update();
    puck.edges(bleController);
    puck.show();
    
    // Score display - scale to canvas size
    textAlign(LEFT, CENTER);
    fill(255);
    textSize(height * 0.04); // 4% of canvas height
    text(leftscore, width * 0.03, height * 0.05);
    textAlign(RIGHT, CENTER);   
    text(rightscore, width - (width * 0.03), height * 0.05);
    
    // Check win condition after score update
    gameController.checkWinCondition(player1Name, player2Name);
  }

  // Draw connection particle effects
  bleController.updateAndDrawParticles();

  // Always draw game state
  gameController.drawGameState();

  // Debug info
  if (drawBleDebug) {
    textSize(height * 0.02); // 2% of canvas height
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

    // ENTER key still resets game
    if (keyCode === ENTER) {
        handleGameReset();
    }
}

// Handle touch/click on canvas for mobile support
function mousePressed() {
  // Check if click is on a UI element
  if (event && event.target) {
    const target = event.target;
    // Allow default behavior for UI elements
    if (target.tagName === 'INPUT' || 
        target.tagName === 'BUTTON' || 
        target.tagName === 'SELECT' ||
        target.tagName === 'OPTION' ||
        target.classList.contains('debug-slider') ||
        target.classList.contains('mobile-settings-btn') ||
        target.classList.contains('control-btn') ||
        target.classList.contains('device-select') ||
        target.classList.contains('p1-button') ||
        target.classList.contains('p2-button')) {
      return true; // Allow default behavior for UI elements
    }
  }
  // Canvas clicks no longer toggle game state - use the game control button instead
  return false;
}

function touchStarted() {
  // Check if touch is on a slider or other UI element
  if (event && event.target) {
    const target = event.target;
    // Allow default behavior for UI elements
    if (target.tagName === 'INPUT' || 
        target.tagName === 'BUTTON' || 
        target.tagName === 'SELECT' ||
        target.classList.contains('debug-slider') ||
        target.classList.contains('mobile-settings-btn') ||
        target.classList.contains('control-btn')) {
      return true; // Allow default behavior for UI elements
    }
  }
  // Canvas touches no longer toggle game state
  return false;
}

function handleGameToggle() {
  // Space/Click handles pause/resume during gameplay
  if (gameController.currentState === gameController.STATE.PLAYING) {
    gameController.pauseGame();
  } else if (gameController.currentState === gameController.STATE.PAUSED || 
             gameController.currentState === gameController.STATE.WAITING) {
    gameController.resumeGame();
  } else if (gameController.currentState === gameController.STATE.WON) {
    // On mobile, tap to restart when game is over
    handleGameReset();
  }
}

function handleGameReset() {
  // Enter/Double-click handles reset after win or during pause
  if (gameController.currentState === gameController.STATE.WON ||
      gameController.currentState === gameController.STATE.PAUSED) {
    gameController.resetGame();
    puck.reset();
  }
}

function windowResized() {
  const isMobile = windowWidth <= 768;
  
  if (isMobile) {
    // Mobile: Use full viewport
    const vw = window.visualViewport ? window.visualViewport.width : windowWidth;
    const vh = window.visualViewport ? window.visualViewport.height : windowHeight;
    
    if (vh > vw) {
      // Portrait: fit canvas to width, maintain 1.5:1 ratio (width:height)
      isLandscape = true; // Keep game logic as landscape
      const canvasWidth = vw;
      const canvasHeight = canvasWidth / 1.5;
      
      resizeCanvas(canvasWidth, canvasHeight);
    } else {
      // Landscape: show orientation warning
      isLandscape = false;
      resizeCanvas(vw, vh);
    }
  } else {
    // Desktop: Use constrained size
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
  
  // Update button positions
  if (bleController) {
    bleController.updateButtonPositions();
  }
  
  // Update debug GUI positions
  if (gameController) {
    gameController.updateDebugGUIPositions();
    gameController.updateMobileSettingsButton();
  }
  
  // Resize game objects
  if (puck) {
    puck.resize();
  }
  if (left) {
    left.resize();
  }
  if (right) {
    right.resize();
  }
}

function drawOrientationWarning() {
  background(0);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(32);
  text("Please rotate your device", width/2, height/2 - 40);
  textSize(64);
  text("↻", width/2, height/2 + 20);
  textSize(24);
  text("Portrait mode required", width/2, height/2 + 80);
}

function deviceTurned() {
  // p5.js function called when device orientation changes
  windowResized();
}
