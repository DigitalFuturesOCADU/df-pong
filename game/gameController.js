class GameController {
    constructor(winningScore) {
        this.STATE = {
            WAITING: 'waiting',
            COUNTDOWN: 'countdown',
            PLAYING: 'playing',
            PAUSED: 'paused',
            WON: 'won'
        };
        
        this.currentState = this.STATE.WAITING;
        this.winningScore = winningScore;
        this.winner = null;
        
        // Countdown properties
        this.countdownValue = 3;
        this.countdownStartTime = 0;

        // Debug GUI elements
        this.debugGUIVisible = false;
        this.mobileSettingsButton = null;
        this.settingsOverlay = null;
        this.createMobileSettingsButton();
        this.createDebugGUI();
        
        // Keyboard control buttons
        this.keyboardControls = {
            p1Up: null,
            p1Down: null,
            p2Up: null,
            p2Down: null,
            gameButton: null,
            resetButton: null
        };
        this.createKeyboardControls();
    }

    startGame() {
        this.currentState = this.STATE.WAITING;
        this.winner = null;
        leftscore = 0;
        rightscore = 0;
    }

    startCountdown() {
        this.currentState = this.STATE.COUNTDOWN;
        this.countdownValue = 3;
        this.countdownStartTime = millis();
    }

    updateCountdown() {
        if (this.currentState !== this.STATE.COUNTDOWN) return;
        
        const elapsed = millis() - this.countdownStartTime;
        const secondsPassed = floor(elapsed / 1000);
        
        if (secondsPassed >= 3) {
            // Countdown complete, start playing
            this.currentState = this.STATE.PLAYING;
        } else {
            // Update countdown value (3, 2, 1)
            this.countdownValue = 3 - secondsPassed;
        }
    }

    pauseGame() {
        if (this.currentState === this.STATE.PLAYING) {
            this.currentState = this.STATE.PAUSED;
        }
    }

    resumeGame() {
        if (this.currentState === this.STATE.PAUSED) {
            this.currentState = this.STATE.PLAYING;
        } else if (this.currentState === this.STATE.WAITING) {
            this.startCountdown();
        }
    }

    resetGame() {
        this.startGame();
    }

    checkWinCondition(player1Name, player2Name) {
        if (leftscore >= this.winningScore) {
            this.currentState = this.STATE.WON;
            this.winner = player1Name;
            return true;
        }
        if (rightscore >= this.winningScore) {
            this.currentState = this.STATE.WON;
            this.winner = player2Name;
            return true;
        }
        return false;
    }

    drawGameState() {
        push();
        textAlign(CENTER, CENTER);
        fill(255);
        // Scale text sizes based on canvas height
        let bigText = height * 0.28;    // 28% of canvas height
        let medText = height * 0.08;    // 8% of canvas height
        let smallText = height * 0.03;  // 3% of canvas height
        let tinyText = height * 0.02;   // 2% of canvas height
        
        switch(this.currentState) {
            case this.STATE.WAITING:
                textSize(bigText);
                text("DF PONG", width/2, height/2 - bigText);
                textSize(medText);
                text("VS", width/2, height/2);
                break;

            case this.STATE.COUNTDOWN:
                // Show countdown number in center, aligned with player names
                textSize(bigText);
                text(this.countdownValue, width/2, height/2);
                break;

            case this.STATE.PAUSED:
                textSize(medText);
                text("GAME PAUSED", width/2, height/2);
                break;

            case this.STATE.WON:
                background(0);    
                textSize(medText);
                text(this.winner + " WINS!", width/2, height/2);
                break;
        }
        pop();
    }

    get isPlaying() {
        return this.currentState === this.STATE.PLAYING;
    }

    createDebugGUI() {
        // Create sliders and labels
        this.p1Slider = createSlider(1, 100, parseInt(localStorage.getItem('player1MoveMultiplier'), 10) || 10);
        this.p2Slider = createSlider(1, 100, parseInt(localStorage.getItem('player2MoveMultiplier')) || 10);
        this.pointsSlider = createSlider(1, 21, parseInt(localStorage.getItem('pointsToWin')) || 10);
        this.speedIncrementSlider = createSlider(0.01, 1, parseFloat(localStorage.getItem('speedIncrement')) || 0.15, 0.01);

        this.p1Label = createElement('div', 'P1 Speed: ' + this.p1Slider.value());
        this.p2Label = createElement('div', 'P2 Speed: ' + this.p2Slider.value());
        this.pointsLabel = createElement('div', 'Points to Win: ' + this.pointsSlider.value());
        this.speedIncrementLabel = createElement('div', 'Puck Speed Increment: ' + this.speedIncrementSlider.value());

        // Style elements
        this.p1Slider.class('debug-slider');
        this.p2Slider.class('debug-slider');
        this.pointsSlider.class('debug-slider');
        this.speedIncrementSlider.class('debug-slider');
        this.p1Label.class('slider-label');
        this.p2Label.class('slider-label');
        this.pointsLabel.class('slider-label');
        this.speedIncrementLabel.class('slider-label');

        // Add event listeners
        this.p1Slider.input(() => {
            localStorage.setItem('player1MoveMultiplier', this.p1Slider.value());
            this.p1Label.html('P1 Speed: ' + this.p1Slider.value());
            bleController.player1MoveMultiplier = this.p1Slider.value();
        });

        this.p2Slider.input(() => {
            localStorage.setItem('player2MoveMultiplier', this.p2Slider.value());
            this.p2Label.html('P2 Speed: ' + this.p2Slider.value());
            bleController.player2MoveMultiplier = this.p2Slider.value();
        });

        this.pointsSlider.input(() => {
            localStorage.setItem('pointsToWin', this.pointsSlider.value());
            this.pointsLabel.html('Points to Win: ' + this.pointsSlider.value());
            this.winningScore = this.pointsSlider.value();
        });

        this.speedIncrementSlider.input(() => {
            localStorage.setItem('speedIncrement', this.speedIncrementSlider.value());
            this.speedIncrementLabel.html('Puck Speed Increment: ' + this.speedIncrementSlider.value());
            puck.speedIncrement = this.speedIncrementSlider.value();
        });

        // Initially hide controls
        this.setDebugGUIVisible(false);
        this.updateDebugGUIPositions();
    }

    createKeyboardControls() {
        // Player 1 Up button
        this.keyboardControls.p1Up = createButton('▲');
        this.keyboardControls.p1Up.class('control-btn player-btn');
        this.keyboardControls.p1Up.mousePressed(() => left.move(-10));
        this.keyboardControls.p1Up.mouseReleased(() => left.move(0));
        this.keyboardControls.p1Up.touchStarted(() => { left.move(-10); return false; });
        this.keyboardControls.p1Up.touchEnded(() => { left.move(0); return false; });
        
        // Player 1 Down button
        this.keyboardControls.p1Down = createButton('▼');
        this.keyboardControls.p1Down.class('control-btn player-btn');
        this.keyboardControls.p1Down.mousePressed(() => left.move(10));
        this.keyboardControls.p1Down.mouseReleased(() => left.move(0));
        this.keyboardControls.p1Down.touchStarted(() => { left.move(10); return false; });
        this.keyboardControls.p1Down.touchEnded(() => { left.move(0); return false; });
        
        // Player 2 Up button
        this.keyboardControls.p2Up = createButton('▲');
        this.keyboardControls.p2Up.class('control-btn player-btn');
        this.keyboardControls.p2Up.mousePressed(() => right.move(-10));
        this.keyboardControls.p2Up.mouseReleased(() => right.move(0));
        this.keyboardControls.p2Up.touchStarted(() => { right.move(-10); return false; });
        this.keyboardControls.p2Up.touchEnded(() => { right.move(0); return false; });
        
        // Player 2 Down button
        this.keyboardControls.p2Down = createButton('▼');
        this.keyboardControls.p2Down.class('control-btn player-btn');
        this.keyboardControls.p2Down.mousePressed(() => right.move(10));
        this.keyboardControls.p2Down.mouseReleased(() => right.move(0));
        this.keyboardControls.p2Down.touchStarted(() => { right.move(10); return false; });
        this.keyboardControls.p2Down.touchEnded(() => { right.move(0); return false; });
        
        // Game control button (Start/Pause/Reset)
        this.keyboardControls.gameButton = createButton('START');
        this.keyboardControls.gameButton.class('control-btn game-control-btn');
        this.keyboardControls.gameButton.mousePressed(() => this.handleGameButtonClick());
        this.keyboardControls.gameButton.touchStarted(() => { this.handleGameButtonClick(); return false; });
        
        // Reset button (shown only when paused)
        this.keyboardControls.resetButton = createButton('RESET');
        this.keyboardControls.resetButton.class('control-btn game-control-btn');
        this.keyboardControls.resetButton.mousePressed(() => this.resetGame());
        this.keyboardControls.resetButton.touchStarted(() => { this.resetGame(); return false; });
        this.keyboardControls.resetButton.hide(); // Initially hidden
        
        this.updateKeyboardControlPositions();
    }
    
    handleGameButtonClick() {
        if (this.currentState === this.STATE.PLAYING) {
            this.pauseGame();
        } else if (this.currentState === this.STATE.PAUSED || this.currentState === this.STATE.WAITING) {
            this.resumeGame();
        } else if (this.currentState === this.STATE.WON) {
            this.resetGame();
        }
    }
    
    updateGameButtonLabel() {
        if (!this.keyboardControls.gameButton) return;
        
        switch(this.currentState) {
            case this.STATE.WAITING:
            case this.STATE.COUNTDOWN:
                this.keyboardControls.gameButton.html('START');
                this.keyboardControls.resetButton.hide();
                break;
            case this.STATE.PLAYING:
                this.keyboardControls.gameButton.html('PAUSE');
                this.keyboardControls.resetButton.hide();
                break;
            case this.STATE.PAUSED:
                this.keyboardControls.gameButton.html('RESUME');
                this.keyboardControls.resetButton.show();
                break;
            case this.STATE.WON:
                this.keyboardControls.gameButton.html('RESET');
                this.keyboardControls.resetButton.hide();
                break;
        }
    }
    
    updateKeyboardControlPositions() {
        const canvasRect = document.querySelector('canvas').getBoundingClientRect();
        const isMobile = windowWidth <= 768;
        const buttonSize = 50;
        const spacing = 10;
        
        if (isMobile) {
            // Mobile: Player controls at screen edges, game button centered
            const centerX = windowWidth / 2;
            const startY = canvasRect.bottom + 20;
            const edgeMargin = 10; // Small margin from screen edge
            
            // Position buttons based on paused state
            if (this.currentState === this.STATE.PAUSED) {
                // Two buttons side by side, gap centered
                const buttonWidth = 120;
                const gap = 10;
                this.keyboardControls.gameButton.position(
                    centerX - buttonWidth - (gap / 2),
                    startY
                );
                this.keyboardControls.resetButton.position(
                    centerX + (gap / 2),
                    startY
                );
            } else {
                // Single button centered
                this.keyboardControls.gameButton.position(
                    centerX - 60,
                    startY
                );
                this.keyboardControls.resetButton.position(
                    centerX + 5,
                    startY
                );
            }
            
            // Player controls below game button, at screen edges
            const playerY = startY + 60;
            
            // Player 1 controls on left edge
            this.keyboardControls.p1Up.position(
                edgeMargin,
                playerY
            );
            this.keyboardControls.p1Down.position(
                edgeMargin,
                playerY + buttonSize + spacing
            );
            
            // Player 2 controls on right edge
            this.keyboardControls.p2Up.position(
                windowWidth - buttonSize - edgeMargin,
                playerY
            );
            this.keyboardControls.p2Down.position(
                windowWidth - buttonSize - edgeMargin,
                playerY + buttonSize + spacing
            );
        } else {
            // Desktop: Player controls at canvas corners, game button centered below
            
            // Player 1 controls - left side of canvas
            this.keyboardControls.p1Up.position(
                canvasRect.left - buttonSize - spacing,
                canvasRect.top
            );
            this.keyboardControls.p1Down.position(
                canvasRect.left - buttonSize - spacing,
                canvasRect.top + buttonSize + spacing
            );
            
            // Player 2 controls - right side of canvas
            this.keyboardControls.p2Up.position(
                canvasRect.right + spacing,
                canvasRect.top
            );
            this.keyboardControls.p2Down.position(
                canvasRect.right + spacing,
                canvasRect.top + buttonSize + spacing
            );
            
            // Position buttons based on paused state
            if (this.currentState === this.STATE.PAUSED) {
                // Two buttons side by side, gap centered
                const buttonWidth = 120;
                const gap = 10;
                this.keyboardControls.gameButton.position(
                    canvasRect.left + (canvasRect.width / 2) - buttonWidth - (gap / 2),
                    canvasRect.bottom + 20
                );
                this.keyboardControls.resetButton.position(
                    canvasRect.left + (canvasRect.width / 2) + (gap / 2),
                    canvasRect.bottom + 20
                );
            } else {
                // Single button centered
                this.keyboardControls.gameButton.position(
                    canvasRect.left + (canvasRect.width / 2) - 60,
                    canvasRect.bottom + 20
                );
                this.keyboardControls.resetButton.position(
                    canvasRect.left + (canvasRect.width / 2) + 5,
                    canvasRect.bottom + 20
                );
            }
        }
    }
    
    updateKeyboardControlVisibility(bleController) {
        const showP1Controls = !bleController.isPlayer1Connected();
        const showP2Controls = !bleController.isPlayer2Connected();
        
        if (showP1Controls) {
            this.keyboardControls.p1Up.show();
            this.keyboardControls.p1Down.show();
        } else {
            this.keyboardControls.p1Up.hide();
            this.keyboardControls.p1Down.hide();
        }
        
        if (showP2Controls) {
            this.keyboardControls.p2Up.show();
            this.keyboardControls.p2Down.show();
        } else {
            this.keyboardControls.p2Up.hide();
            this.keyboardControls.p2Down.hide();
        }
        
        // Game button always visible
        this.keyboardControls.gameButton.show();
    }

    createMobileSettingsButton() {
        // Create settings toggle button for mobile
        this.mobileSettingsButton = createButton('⚙️ Settings');
        this.mobileSettingsButton.class('mobile-settings-btn');
        this.mobileSettingsButton.mousePressed(() => {
            this.debugGUIVisible = !this.debugGUIVisible;
            this.setDebugGUIVisible(this.debugGUIVisible);
            this.updateSettingsOverlay();
        });
        
        // Create overlay div
        this.settingsOverlay = createElement('div');
        this.settingsOverlay.class('settings-overlay');
        this.settingsOverlay.hide();
        
        this.updateMobileSettingsButton();
    }

    updateMobileSettingsButton() {
        const isMobile = windowWidth <= 768;
        if (isMobile) {
            this.mobileSettingsButton.show();
            const canvasRect = document.querySelector('canvas').getBoundingClientRect();
            const centerX = windowWidth / 2;
            const buttonWidth = 120;
            const verticalSpacing = 20;
            const playerSpacing = 40;
            
            // Calculate position: below canvas + game controls + connection controls
            const gameControlsHeight = 180;
            const connectionStartY = canvasRect.bottom + gameControlsHeight;
            const p2StartY = connectionStartY + 50 + verticalSpacing + 50 + playerSpacing;
            const settingsY = p2StartY + 50 + verticalSpacing + 60;
            
            this.mobileSettingsButton.position(
                centerX - (buttonWidth / 2),
                settingsY
            );
        } else {
            this.mobileSettingsButton.hide();
        }
    }

    updateSettingsOverlay() {
        const isMobile = windowWidth <= 768;
        if (isMobile && this.debugGUIVisible) {
            this.settingsOverlay.show();
        } else {
            this.settingsOverlay.hide();
        }
    }

    setDebugGUIVisible(visible) {
        console.log('Setting debug GUI visible:', visible);
        this.debugGUIVisible = visible;
        const display = visible ? 'block' : 'none';
        this.p1Slider.style('display', display);
        this.p2Slider.style('display', display);
        this.pointsSlider.style('display', display);
        this.speedIncrementSlider.style('display', display);
        this.p1Label.style('display', display);
        this.p2Label.style('display', display);
        this.pointsLabel.style('display', display);
        this.speedIncrementLabel.style('display', display);
        
        // Update positions and overlay when showing
        if (visible) {
            this.updateDebugGUIPositions();
        }
        this.updateSettingsOverlay();
    }

    updateDebugGUIPositions() {
        const padding = 20;
        const sliderSpacing = 50;
        
        // Position from the top-left of the screen
        const leftX = padding;
        const topY = padding;

        this.p1Slider.position(leftX, topY);
        this.p1Label.position(leftX, topY - 20);

        this.p2Slider.position(leftX, topY + sliderSpacing);
        this.p2Label.position(leftX, topY + sliderSpacing - 20);

        this.pointsSlider.position(leftX, topY + sliderSpacing * 2);
        this.pointsLabel.position(leftX, topY + sliderSpacing * 2 - 20);

        this.speedIncrementSlider.position(leftX, topY + sliderSpacing * 3);
        this.speedIncrementLabel.position(leftX, topY + sliderSpacing * 3 - 20);
    }
}