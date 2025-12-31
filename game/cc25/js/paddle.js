class Paddle {
    constructor(isLeft) {
        this.isLeft = isLeft;
        this.updateDimensions();
        this.ychange = 0;
        this.setPosition();
    }
    
    updateDimensions() {
        // Scale paddle size based on canvas height
        this.w = height * 0.025; // 2.5% of canvas height
        this.h = height * 0.15;  // 15% of canvas height
        this.y = height/2;
    }
    
    setPosition() {
        if (this.isLeft) {
            this.x = this.w;
        } else {
            this.x = width - this.w;
        }
    }
    
    resize() {
        // Called when canvas resizes
        this.updateDimensions();
        this.setPosition();
        this.y = constrain(this.y, this.h/2, height-this.h/2);
    }
    
    update() {
        this.y += this.ychange;
        this.y = constrain(this.y, this.h/2, height-this.h/2);
    }
    
    move(steps) {
        this.ychange = steps;
    }
    
    show() {
        fill(255);
        rectMode(CENTER);
        rect(this.x, this.y, this.w, this.h);
    }
}
