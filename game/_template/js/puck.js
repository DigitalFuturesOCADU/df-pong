class Puck {
    constructor(assetsPath) {
        this.assetsPath = assetsPath || '../shared/assets/';
        this.x = width / 2;
        this.y = height / 2;
        this.xspeed = 0;
        this.yspeed = 0;
        this.updateRadius();
        this.speedMultiplier = 1.0;
        this.speedIncrement = 0.15;

        // Read baseSpeed from local storage, default to 5 if not set
        this.baseSpeed = parseInt(localStorage.getItem('puckBaseSpeed')) || 5;

        // Create speed control elements
        this.speedSlider = createSlider(1, 20, this.baseSpeed);
        this.speedLabel = createElement('div', 'Puck Speed: ' + this.baseSpeed);

        // Style elements
        this.speedSlider.class('debug-slider');
        this.speedLabel.class('slider-label');
        this.speedLabel.style('color', '#ffffff');

        // Add event listener
        this.speedSlider.input(() => {
            this.baseSpeed = this.speedSlider.value();
            localStorage.setItem('puckBaseSpeed', this.baseSpeed); // Save to local storage
            this.speedLabel.html('Puck Speed: ' + this.baseSpeed);
        });

        // Initially hide controls
        this.setDebug(false);
        this.updatePosition();

        this.reset();
    }
    
    updateRadius() {
        // Scale puck radius based on canvas height
        this.r = height * 0.015; // 1.5% of canvas height
    }
    
    resize() {
        // Called when canvas resizes
        this.updateRadius();
        this.x = constrain(this.x, this.r, width - this.r);
        this.y = constrain(this.y, this.r, height - this.r);
        this.updatePosition();
    }
    
    setDebug(show) {
        const display = show ? 'block' : 'none';
        this.speedSlider.style('display', display);
        this.speedLabel.style('display', display);
    }
    
    updatePosition() {
        const canvasRect = document.querySelector('canvas').getBoundingClientRect();
        const padding = 20;
        
        this.speedSlider.position(
            canvasRect.left + padding,
            canvasRect.top + padding
        );
        this.speedLabel.position(
            canvasRect.left + padding,
            canvasRect.top + padding - 20
        );
    }
    
    checkPaddleLeft(p) {
        if (this.y - this.r < p.y + p.h/2 &&
            this.y + this.r > p.y - p.h/2 &&
            this.x - this.r < p.x + p.w/2) {
                
            if (this.x > p.x) {
                let diff = this.y - (p.y - p.h/2);
                let rad = radians(45);
                let angle = map(diff, 0, p.h, -rad, rad);
                this.xspeed = this.baseSpeed * this.speedMultiplier * cos(angle);
                this.yspeed = this.baseSpeed * this.speedMultiplier * sin(angle);
                this.x = p.x + p.w/2 + this.r;
                this.speedMultiplier += this.speedIncrement;
                if (typeof song !== 'undefined') song.play(); // Play paddle sound
            }
            
        }
    }
    checkPaddleRight(p) {
        if (this.y - this.r < p.y + p.h/2 &&
            this.y + this.r > p.y - p.h/2 &&
            this.x + this.r > p.x - p.w/2) {
                
            if (this.x < p.x) {
                let diff = this.y - (p.y - p.h/2);
                let angle = map(diff, 0, p.h, radians(225), radians(135));
                this.xspeed = this.baseSpeed * this.speedMultiplier * cos(angle);
                this.yspeed = this.baseSpeed * this.speedMultiplier * sin(angle);
                this.x = p.x - p.w/2 - this.r;
                this.speedMultiplier += this.speedIncrement;
                if (typeof song !== 'undefined') song.play(); // Play paddle sound
            }
        }
    }
    
    update() {
        this.x += this.xspeed;
        this.y += this.yspeed;
    }
    
    reset() {
        this.x = width/2;
        this.y = height/2;
        this.speedMultiplier = 1.0;
        let angle = random(-PI/4, PI/4);
        this.xspeed = this.baseSpeed * cos(angle);
        this.yspeed = this.baseSpeed * sin(angle);
        
        if (random(1) < 0.5) {
            this.xspeed *= -1;
        }
    }
    
    edges(bleController) {
        if (this.y < 0 || this.y > height) {
            this.yspeed *= -1;
            if (typeof song2 !== 'undefined') song2.play(); // Play wall sound
        }
        
        if (this.x - this.r > width) {
            if (typeof ding !== 'undefined') ding.play(); // Play score sound
            leftscore++;
            if (bleController) {
                bleController.createConnectionParticles(1); // Particle effect for player 1
            }
            this.reset();
        }
        
        if (this.x + this.r < 0) {
            if (typeof ding !== 'undefined') ding.play(); // Play score sound
            rightscore++;
            if (bleController) {
                bleController.createConnectionParticles(2); // Particle effect for player 2
            }
            this.reset();
        }
    }
    
    show() {
        fill(255);
        ellipse(this.x, this.y, this.r*2);
    }
}
