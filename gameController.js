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
}