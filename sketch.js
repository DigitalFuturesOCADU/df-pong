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

function preload() {
  //song = loadSound("pa5a.wav");
  //song2 = loadSound("pongblipa4.wav");
}

function setup() {
    createCanvas(600, 400);
    ding = loadSound("ding.mp3");
    puck = new Puck();
    left = new Paddle(true);
    right = new Paddle(false);
}

function draw() {
    background(0);
    
    puck.checkPaddleRight(right);
    puck.checkPaddleLeft(left);

    left.show();
    right.show();
    left.update();
    right.update();
    
    puck.update();
    puck.edges();
    puck.show();
    
    fill(255);
    textSize(32);
    text(leftscore, 32, 40);
    text(rightscore, width-64, 40);
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
}
