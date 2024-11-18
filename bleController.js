class BLEController {
  constructor() {
    this.player1Connected = false;
    this.player2Connected = false;
    this.player1Movement = 0;
    this.player2Movement = 0;
    this.player1Name = "A=UP, Z=DOWN";
    this.player2Name = "P=UP, L=DOWN";
    this._debug = false;

    this.serviceUuid = "19b10010-e8f2-537e-4f6c-d104768a1214";
    this.characteristicUuid = "19b10011-e8f2-537e-4f6c-d104768a1214";
    
    this.myBLE1 = new p5ble();
    this.myBLE2 = new p5ble();

    this.player1MoveMultiplier = parseInt(localStorage.getItem('player1Multiplier')) || 10;
    this.player2MoveMultiplier = parseInt(localStorage.getItem('player2Multiplier')) || 10;
    this.pointsToWin = parseInt(localStorage.getItem('pointsToWin')) || 10;
  }

  setup() {
    this.createButtons();
    this.createSliders();
    this.setupButtonStyles();
    
    window.addEventListener('resize', () => {
      this.updateButtonPositions();
      this.updateSliderPositions();
    });
  }

  createButtons() {
    requestAnimationFrame(() => {
      this.p1Button = createButton('Connect Player 1');
      this.p2Button = createButton('Connect Player 2');
      
      this.p1Button.mousePressed(() => this.handleButtonClick(1));
      this.p2Button.mousePressed(() => this.handleButtonClick(2));
      
      this.p1Button.class('p1-button');
      this.p2Button.class('p2-button');
      
      this.updateButtonPositions();
    });
  }

  createSliders() {
    requestAnimationFrame(() => {
      this.p1Slider = createSlider(-100, 100, this.player1MoveMultiplier);
      this.p2Slider = createSlider(-100, 100, this.player2MoveMultiplier);
      this.pointsSlider = createSlider(1, 21, this.pointsToWin);
      
      this.p1Label = createElement('div', 'P1 Speed: ' + this.player1MoveMultiplier);
      this.p2Label = createElement('div', 'P2 Speed: ' + this.player2MoveMultiplier);
      this.pointsLabel = createElement('div', 'Points to Win: ' + this.pointsToWin);
      
      this.p1Slider.class('debug-slider');
      this.p2Slider.class('debug-slider');
      this.pointsSlider.class('debug-slider');
      this.p1Label.class('slider-label');
      this.p2Label.class('slider-label');
      this.pointsLabel.class('slider-label');
      
      this.p1Slider.input(() => {
        this.player1MoveMultiplier = this.p1Slider.value();
        localStorage.setItem('player1Multiplier', this.player1MoveMultiplier);
        this.p1Label.html('P1 Speed: ' + this.player1MoveMultiplier);
      });
      
      this.p2Slider.input(() => {
        this.player2MoveMultiplier = this.p2Slider.value();
        localStorage.setItem('player2Multiplier', this.player2MoveMultiplier);
        this.p2Label.html('P2 Speed: ' + this.player2MoveMultiplier);
      });

      this.pointsSlider.input(() => {
        this.pointsToWin = this.pointsSlider.value();
        localStorage.setItem('pointsToWin', this.pointsToWin);
        this.pointsLabel.html('Points to Win: ' + this.pointsToWin);
      });
      
      this.updateSliderPositions();
      this.updateSliderVisibility();
    });
  }

  updateButtonPositions() {
    const canvasRect = document.querySelector('canvas').getBoundingClientRect();
    const buttonPadding = 20;
    const bottomY = canvasRect.bottom + buttonPadding;
    
    this.p1Button.position(
      canvasRect.left + (canvasRect.width * 0.25) - (this.p1Button.width / 2),
      bottomY
    );
    
    this.p2Button.position(
      canvasRect.left + (canvasRect.width * 0.75) - (this.p2Button.width / 2),
      bottomY
    );
  }

  updateSliderPositions() {
    if (!this.p1Slider || !this.p2Slider || !this.pointsSlider) return;
    
    const canvasRect = document.querySelector('canvas').getBoundingClientRect();
    const buttonPadding = 20;
    const sliderPadding = 60;
    const bottomY = canvasRect.bottom + buttonPadding + sliderPadding;
    
    this.p1Slider.position(
      canvasRect.left + (canvasRect.width * 0.25) - (this.p1Slider.width / 2),
      bottomY
    );
    this.p1Label.position(
      canvasRect.left + (canvasRect.width * 0.25) - (this.p1Slider.width / 2),
      bottomY - 20
    );
    
    this.pointsSlider.position(
      canvasRect.left + (canvasRect.width * 0.5) - (this.pointsSlider.width / 2),
      bottomY
    );
    this.pointsLabel.position(
      canvasRect.left + (canvasRect.width * 0.5) - (this.pointsSlider.width / 2),
      bottomY - 20
    );
    
    this.p2Slider.position(
      canvasRect.left + (canvasRect.width * 0.75) - (this.p2Slider.width / 2),
      bottomY
    );
    this.p2Label.position(
      canvasRect.left + (canvasRect.width * 0.75) - (this.p2Slider.width / 2),
      bottomY - 20
    );
  }

  updateSliderVisibility() {
    if (!this.p1Slider || !this.p2Slider || !this.pointsSlider) return;
    
    const display = this._debug ? 'block' : 'none';
    this.p1Slider.style('display', display);
    this.p2Slider.style('display', display);
    this.pointsSlider.style('display', display);
    this.p1Label.style('display', display);
    this.p2Label.style('display', display);
    this.pointsLabel.style('display', display);
  }

  setupButtonStyles() {
    let style = document.createElement('style');
    style.textContent = `
      button {
        padding: 10px;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        position: fixed;
        transition: all 0.3s ease;
      }
      .p1-button, .p2-button {
        background-color: #ea08f1 ;
        color: white;
      }
      .connected {
        background-color: #838383 !important;
      }
      .debug-slider {
        position: fixed;
      }
      .slider-label {
        position: fixed;
        color: black; /* Set text color to black */
      }
    `;
    document.head.appendChild(style);
  }

  handleButtonClick(player) {
    const isConnected = player === 1 ? this.player1Connected : this.player2Connected;
    
    if (!isConnected) {
      this.connectToBle(player);
    } else {
      this.disconnectBle(player);
    }
  }

  connectToBle(player) {
    const ble = player === 1 ? this.myBLE1 : this.myBLE2;
    ble.connect(this.serviceUuid, (error, characteristics) => {
      if (error) {
        console.log('Error:', error);
        return;
      }
      
      const characteristic = characteristics[0];
      
      if (player === 1) {
        this.player1Connected = true;
        this.player1Name = ble.device.name || "Player 1";
        this.p1Button.addClass('connected');
        this.p1Button.html('Disconnect Player 1');
        ble.startNotifications(characteristic, (data) => {
          this.handleMovementData(1, data);
        });
      } else {
        this.player2Connected = true;
        this.player2Name = ble.device.name || "Player 2";
        this.p2Button.addClass('connected');
        this.p2Button.html('Disconnect Player 2');
        ble.startNotifications(characteristic, (data) => {
          this.handleMovementData(2, data);
        });
      }
    });
  }

  disconnectBle(player) {
    const ble = player === 1 ? this.myBLE1 : this.myBLE2;
    ble.disconnect();
    this.handleDisconnect(player);
  }

  handleMovementData(player, data) {
    if (this.debug) console.log(`Player ${player} data:`, data);
    
    let rawValue = Number(data);
    let value;
    if (rawValue === 1) {
      value = 1;  // UP
    } else if (rawValue === 2) {
      value = -1; // DOWN
    } else {
      value = 0;  // STOP
    }
    
    if (this.debug) console.log(`Player ${player} movement:`, value);
    
    if (player === 1) {
      this.player1Movement = value;
    } else {
      this.player2Movement = value;
    }
  }

  handleDisconnect(player) {
    if (player === 1) {
      this.player1Connected = false;
      this.player1Movement = 0;
      this.p1Button.removeClass('connected');
      this.p1Button.html('Connect Player 1');
    } else {
      this.player2Connected = false;
      this.player2Movement = 0;
      this.p2Button.removeClass('connected');
      this.p2Button.html('Connect Player 2');
    }
  }

  drawDebug() {
    if (!this.debug) return;
    
    text(`Player 1: ${this.player1Connected ? 'Connected' : 'Disconnected'}`, width/4, 30);
    text(`Player 2: ${this.player2Connected ? 'Connected' : 'Disconnected'}`, 3*width/4, 30);
    text(`Device: ${this.player1Name}`, width/4, 60);
    text(`Device: ${this.player2Name}`, 3*width/4, 60);
    
    this.drawPlayerDebug(this.player1Movement, width/4, 90);
    this.drawPlayerDebug(this.player2Movement, 3*width/4, 90);
    
    text(`Points to Win: ${this.pointsToWin}`, width/2, 30);
  }

  drawPlayerDebug(movement, x, baseY) {
    const multiplier = movement === this.player1Movement ? this.player1MoveMultiplier : this.player2MoveMultiplier;
    const multipliedMovement = movement === 0 ? 0 : movement * multiplier;

    text(`Raw Movement: ${movement}`, x, baseY);
    text(`Multiplier: ${multiplier}`, x, baseY + 30);
    text(`Final Movement: ${multipliedMovement}`, x, baseY + 60);
    
    push();
    translate(x, baseY + 90);
    if (movement === 0) {
      fill(128);
      circle(0, 0, 20);
    } else {
      fill(0, 255, 0);
      circle(0, movement * -20, 20);
    }
    pop();
  }

  getPlayer1Movement() {
    return this.player1Movement === 0 ? 0 : this.player1Movement * this.player1MoveMultiplier;
  }

  getPlayer2Movement() {
    return this.player2Movement === 0 ? 0 : this.player2Movement * this.player2MoveMultiplier;
  }

  getPointsToWin() {
    return this.pointsToWin;
  }

  set debug(value) {
    this._debug = value;
    this.updateSliderVisibility();
  }

  get debug() {
    return this._debug;
  }

  isPlayer1Connected() {
    return this.player1Connected;
  }

  isPlayer2Connected() {
    return this.player2Connected;
  }
}