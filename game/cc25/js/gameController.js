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
                // Blinking effect for DF PONG text - words alternate
                const blinkCycle = millis() % 2000; // 2 second total cycle
                const dfColor = blinkCycle < 1000 ? 255 : 0; // White for first second, black for second
                const pongColor = blinkCycle < 1000 ? 0 : 255; // Black for first second, white for second
                
                textSize(bigText);
                
                // Measure text widths for proper centering
                const dfWidth = textWidth("DF ");
                const pongWidth = textWidth("PONG");
                const totalWidth = dfWidth + pongWidth;
                const startX = width/2 - totalWidth/2;
                
                // Draw DF
                textAlign(LEFT, CENTER);
                fill(dfColor);
                text("DF", startX, height/2 - bigText);
                
                // Draw PONG
                fill(pongColor);
                text("PONG", startX + dfWidth, height/2 - bigText);
                
                textAlign(CENTER, CENTER);
                textSize(medText);
                fill(255); // VS stays white
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
                textSize(bigText);
                text(this.winner, width/2, height/2 - bigText/2);
                textSize(medText);
                text("WINS!", width/2, height/2 + medText);
                break;
        }
        pop();
    }

    get isPlaying() {
        return this.currentState === this.STATE.PLAYING;
    }

    get isCountdown() {
        return this.currentState === this.STATE.COUNTDOWN;
    }

    get isWaiting() {
        return this.currentState === this.STATE.WAITING;
    }

    get isWon() {
        return this.currentState === this.STATE.WON;
    }

    get isPaused() {
        return this.currentState === this.STATE.PAUSED;
    }

    createMobileSettingsButton() {
        this.mobileSettingsButton = createButton('Settings');
        this.mobileSettingsButton.class('mobile-settings-btn');
        this.mobileSettingsButton.mousePressed(() => this.toggleSettings());
        this.mobileSettingsButton.style('display', 'none');
    }

    createDebugGUI() {
        this.settingsOverlay = createDiv('');
        this.settingsOverlay.class('settings-overlay');
        this.settingsOverlay.style('display', 'none');
        
        const closeBtn = createButton('✕');
        closeBtn.parent(this.settingsOverlay);
        closeBtn.style('position', 'absolute');
        closeBtn.style('top', '20px');
        closeBtn.style('right', '20px');
        closeBtn.style('font-size', '24px');
        closeBtn.style('background', 'none');
        closeBtn.style('border', 'none');
        closeBtn.style('color', '#fff');
        closeBtn.style('cursor', 'pointer');
        closeBtn.mousePressed(() => this.toggleSettings());
    }

    toggleSettings() {
        this.debugGUIVisible = !this.debugGUIVisible;
        this.settingsOverlay.style('display', this.debugGUIVisible ? 'block' : 'none');
    }

    createKeyboardControls() {
        // Player 1 controls
        this.keyboardControls.p1Up = createButton('▲');
        this.keyboardControls.p1Up.class('control-btn player-btn');
        
        this.keyboardControls.p1Down = createButton('▼');
        this.keyboardControls.p1Down.class('control-btn player-btn');
        
        // Player 2 controls
        this.keyboardControls.p2Up = createButton('▲');
        this.keyboardControls.p2Up.class('control-btn player-btn');
        
        this.keyboardControls.p2Down = createButton('▼');
        this.keyboardControls.p2Down.class('control-btn player-btn');
        
        // Game control buttons
        this.keyboardControls.gameButton = createButton('Start');
        this.keyboardControls.gameButton.class('control-btn game-control-btn');
        
        this.keyboardControls.resetButton = createButton('Reset');
        this.keyboardControls.resetButton.class('control-btn game-control-btn');
        
        // Event handlers for paddle movement
        this.setupPaddleControls();
        
        // Game button handlers
        this.keyboardControls.gameButton.mousePressed(() => this.handleGameButton());
        this.keyboardControls.resetButton.mousePressed(() => this.resetGame());
        
        this.updateKeyboardControlPositions();
    }

    setupPaddleControls() {
        // Touch/mouse handlers for continuous movement
        const setupControl = (button, paddle, direction) => {
            let interval = null;
            
            const startMove = (e) => {
                if (e) e.preventDefault();
                paddle.move(direction * 8);
                interval = setInterval(() => paddle.move(direction * 8), 16);
            };
            
            const stopMove = (e) => {
                if (e) e.preventDefault();
                paddle.move(0);
                if (interval) {
                    clearInterval(interval);
                    interval = null;
                }
            };
            
            button.elt.addEventListener('mousedown', startMove);
            button.elt.addEventListener('mouseup', stopMove);
            button.elt.addEventListener('mouseleave', stopMove);
            button.elt.addEventListener('touchstart', startMove, { passive: false });
            button.elt.addEventListener('touchend', stopMove, { passive: false });
        };
        
        // Delay setup until paddles exist
        setTimeout(() => {
            if (typeof left !== 'undefined' && typeof right !== 'undefined') {
                setupControl(this.keyboardControls.p1Up, left, -1);
                setupControl(this.keyboardControls.p1Down, left, 1);
                setupControl(this.keyboardControls.p2Up, right, -1);
                setupControl(this.keyboardControls.p2Down, right, 1);
            }
        }, 100);
    }

    handleGameButton() {
        switch(this.currentState) {
            case this.STATE.WAITING:
                this.startCountdown();
                break;
            case this.STATE.PLAYING:
                this.pauseGame();
                break;
            case this.STATE.PAUSED:
                this.resumeGame();
                break;
            case this.STATE.WON:
                this.resetGame();
                break;
        }
    }

    updateGameButtonLabel() {
        if (!this.keyboardControls.gameButton) return;
        
        switch(this.currentState) {
            case this.STATE.WAITING:
                this.keyboardControls.gameButton.html('Start');
                break;
            case this.STATE.COUNTDOWN:
                this.keyboardControls.gameButton.html('...');
                break;
            case this.STATE.PLAYING:
                this.keyboardControls.gameButton.html('Pause');
                break;
            case this.STATE.PAUSED:
                this.keyboardControls.gameButton.html('Resume');
                break;
            case this.STATE.WON:
                this.keyboardControls.gameButton.html('New Game');
                break;
        }
    }

    updateKeyboardControlPositions() {
        const canvasRect = document.querySelector('canvas')?.getBoundingClientRect();
        if (!canvasRect) return;
        
        const isMobile = window.innerWidth <= 768;
        const btnSize = 50;
        const padding = 10;
        
        if (isMobile) {
            // Mobile: Controls at top of screen
            const topY = canvasRect.top - btnSize - padding;
            
            // P1 controls on left
            this.keyboardControls.p1Up.position(padding, topY - btnSize - 5);
            this.keyboardControls.p1Down.position(padding, topY);
            
            // P2 controls on right
            const rightX = window.innerWidth - btnSize - padding;
            this.keyboardControls.p2Up.position(rightX, topY - btnSize - 5);
            this.keyboardControls.p2Down.position(rightX, topY);
            
            // Game controls in center
            const centerX = window.innerWidth / 2;
            this.keyboardControls.gameButton.position(centerX - 125, topY);
            this.keyboardControls.resetButton.position(centerX + 5, topY);
        } else {
            // Desktop: Controls beside the canvas
            const midY = canvasRect.top + canvasRect.height / 2;
            
            // P1 controls on left of canvas
            const p1X = canvasRect.left - btnSize - padding;
            this.keyboardControls.p1Up.position(p1X, midY - btnSize - 5);
            this.keyboardControls.p1Down.position(p1X, midY + 5);
            
            // P2 controls on right of canvas
            const p2X = canvasRect.right + padding;
            this.keyboardControls.p2Up.position(p2X, midY - btnSize - 5);
            this.keyboardControls.p2Down.position(p2X, midY + 5);
            
            // Game controls below canvas center
            const bottomY = canvasRect.bottom + 60;
            this.keyboardControls.gameButton.position(canvasRect.left + canvasRect.width/2 - 125, bottomY);
            this.keyboardControls.resetButton.position(canvasRect.left + canvasRect.width/2 + 5, bottomY);
        }
        
        // Settings button position
        if (this.mobileSettingsButton) {
            this.mobileSettingsButton.position(canvasRect.right - 130, canvasRect.top + 10);
        }
    }

    updateKeyboardControlVisibility(bleController) {
        const isMobile = window.innerWidth <= 768;
        
        // Show paddle controls only if BLE not connected
        const showP1Controls = !bleController.player1Connected;
        const showP2Controls = !bleController.player2Connected;
        
        this.keyboardControls.p1Up.style('display', showP1Controls ? 'flex' : 'none');
        this.keyboardControls.p1Down.style('display', showP1Controls ? 'flex' : 'none');
        this.keyboardControls.p2Up.style('display', showP2Controls ? 'flex' : 'none');
        this.keyboardControls.p2Down.style('display', showP2Controls ? 'flex' : 'none');
        
        // Always show game controls
        this.keyboardControls.gameButton.style('display', 'flex');
        this.keyboardControls.resetButton.style('display', 'flex');
        
        // Show settings on mobile
        if (this.mobileSettingsButton) {
            this.mobileSettingsButton.style('display', isMobile ? 'block' : 'none');
        }
    }
}
