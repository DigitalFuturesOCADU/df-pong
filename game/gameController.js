class GameController {
    constructor(winningScore) {
        this.STATE = {
            WAITING: 'waiting',
            PLAYING: 'playing',
            PAUSED: 'paused',
            WON: 'won'
        };
        
        this.currentState = this.STATE.WAITING;
        this.winningScore = winningScore;
        this.winner = null;

        // Debug GUI elements
        this.debugGUIVisible = false;
        this.createDebugGUI();
    }

    startGame() {
        this.currentState = this.STATE.WAITING;
        this.winner = null;
        leftscore = 0;
        rightscore = 0;
    }

    pauseGame() {
        if (this.currentState === this.STATE.PLAYING) {
            this.currentState = this.STATE.PAUSED;
        }
    }

    resumeGame() {
        if (this.currentState === this.STATE.PAUSED || this.currentState === this.STATE.WAITING) {
            this.currentState = this.STATE.PLAYING;
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
        let bigText = 220;
        switch(this.currentState) {
            case this.STATE.WAITING:
                textSize(bigText);
                text("DF PONG", width/2, height/2 - (bigText/2));
                textSize(32);
                text("VS", width/2, height/2);
                text("Press SPACE to Start Game", width/2, height/2 + 200);
                break;

            case this.STATE.PAUSED:
                textSize(64);
                text("GAME PAUSED", width/2, height/2);
                textSize(32);
                text("Press SPACE to Resume, ENTER to RESET", width/2, height/2 + 50);
                break;

            case this.STATE.WON:
                background(0);    
                textSize(64);
                text(this.winner + " WINS!", width/2, height/2);
                textSize(32);
                text("Press ENTER to Play Again", width/2, height/2 + 50);
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

    setDebugGUIVisible(visible) {
        const display = visible ? 'block' : 'none';
        this.p1Slider.style('display', display);
        this.p2Slider.style('display', display);
        this.pointsSlider.style('display', display);
        this.speedIncrementSlider.style('display', display);
        this.p1Label.style('display', display);
        this.p2Label.style('display', display);
        this.pointsLabel.style('display', display);
        this.speedIncrementLabel.style('display', display);
    }

    updateDebugGUIPositions() {
        const canvasRect = document.querySelector('canvas').getBoundingClientRect();
        const padding = 20;
        const sliderSpacing = 40;
        const leftX = canvasRect.left - 190; // Move 220 pixels to the left of canvas
        const topY = canvasRect.top + padding; // Start from top of canvas

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