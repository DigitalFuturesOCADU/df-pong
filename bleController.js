class BLEController {
  constructor() {
    this.player1Connected = false;
    this.player2Connected = false;
    this.player1Movement = 0;
    this.player2Movement = 0;
    this.player1Name = "";
    this.player2Name = "";
    this._debug = false;

    this.serviceUuid = "19b10010-e8f2-537e-4f6c-d104768a1214";
    this.characteristicUuid = "19b10011-e8f2-537e-4f6c-d104768a1214";
    
    this.myBLE1 = new p5ble();
    this.myBLE2 = new p5ble();

    // Initialize multipliers from localStorage
    this.player1MoveMultiplier = parseInt(localStorage.getItem('player1Multiplier')) || 10;
    this.player2MoveMultiplier = parseInt(localStorage.getItem('player2Multiplier')) || 10;
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
      // Create sliders with stored values
      this.p1Slider = createSlider(1, 100, this.player1MoveMultiplier);
      this.p2Slider = createSlider(1, 100, this.player2MoveMultiplier);
      
      // Add labels
      this.p1Label = createElement('div', 'P1 Speed: ' + this.player1MoveMultiplier);
      this.p2Label = createElement('div', 'P2 Speed: ' + this.player2MoveMultiplier);
      
      // Style the containers
      this.p1Slider.class('debug-slider');
      this.p2Slider.class('debug-slider');
      this.p1Label.class('slider-label');
      this.p2Label.class('slider-label');
      
      // Add event listeners
      this.p1Slider.input(() => {
        this.player1MoveMultiplier = this.p1Slider.value();
        this.p1Label.html('P1 Speed: ' + this.player1MoveMultiplier);
        localStorage.setItem('player1Multiplier', this.player1MoveMultiplier);
      });
      
      this.p2Slider.input(() => {
        this.player2MoveMultiplier = this.p2Slider.value();
        this.p2Label.html('P2 Speed: ' + this.player2MoveMultiplier);
        localStorage.setItem('player2Multiplier', this.player2MoveMultiplier);
      });
      
      this.updateSliderVisibility();
      this.updateSliderPositions();
    });
  }

  updateButtonPositions() {
    const canvasRect = document.querySelector('canvas').getBoundingClientRect();
    const buttonPadding = 20;
    
    // Position buttons below canvas
    const bottomY = canvasRect.bottom + buttonPadding;
    
    // Left button: 25% from left edge of canvas
    this.p1Button.position(
      canvasRect.left + (canvasRect.width * 0.25) - (this.p1Button.width / 2),
      bottomY
    );
    
    // Right button: 75% from left edge of canvas
    this.p2Button.position(
      canvasRect.left + (canvasRect.width * 0.75) - (this.p2Button.width / 2),
      bottomY
    );
  }

  updateSliderPositions() {
    if (!this.p1Slider || !this.p2Slider) return;
    
    const canvasRect = document.querySelector('canvas').getBoundingClientRect();
    const buttonPadding = 20;
    const sliderPadding = 60;
    
    // Position sliders and labels below buttons
    const bottomY = canvasRect.bottom + buttonPadding + sliderPadding;
    
    // Player 1 slider (left side)
    this.p1Slider.position(
      canvasRect.left + (canvasRect.width * 0.25) - (this.p1Slider.width / 2),
      bottomY
    );
    this.p1Label.position(
      canvasRect.left + (canvasRect.width * 0.25) - (this.p1Slider.width / 2),
      bottomY - 20
    );
    
    // Player 2 slider (right side)
    this.p2Slider.position(
      canvasRect.left + (canvasRect.width * 0.75) - (this.p2Slider.width / 2),
      bottomY
    );
    this.p2Label.position(
      canvasRect.left + (canvasRect.width * 0.75) - (this.p2Slider.width / 2),
      bottomY - 20
    );
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
      }
      .p1-button, .p2-button {
        background-color: #ff0000;
        color: white;
      }
      .connected {
        background-color: #00ff00 !important;
      }
      .debug-slider {
        position: fixed;
        width: 150px;
      }
      .slider-label {
        position: fixed;
        font-family: Arial, sans-serif;
        font-size: 14px;
        color: #333;
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

  disconnectBle(player) {
    const ble = player === 1 ? this.myBLE1 : this.myBLE2;
    ble.disconnect();
    this.handleDisconnect(player);
  }

  connectToBle(player) {
    const ble = player === 1 ? this.myBLE1 : this.myBLE2;
    ble.connect(this.serviceUuid, (error, characteristics) => {
      if (error) {
        console.log('Error:', error);
        return;
      }
      
      const movementCharacteristic = characteristics.find(c => c.uuid === this.characteristicUuid);
      if (!movementCharacteristic) {
        console.log('Required characteristic not found');
        return;
      }
      
      ble.startNotifications(movementCharacteristic, this.handleMovementData.bind(this, player));
      
      if (player === 1) {
        this.player1Connected = true;
        this.player1Name = ble.device.name || "Player 1 Device";
        document.querySelector('.p1-button').classList.add('connected');
        document.querySelector('.p1-button').textContent = 'Disconnect Player 1';
      } else {
        this.player2Connected = true;
        this.player2Name = ble.device.name || "Player 2 Device";
        document.querySelector('.p2-button').classList.add('connected');
        document.querySelector('.p2-button').textContent = 'Disconnect Player 2';
      }
      
      ble.onDisconnected(() => this.handleDisconnect(player));
    });
  }

  handleMovementData(player, data) {
    if (this.debug) console.log('Raw data received:', data);
    
    let rawValue = Number(data);
    
    let value;
    if (rawValue === 1) value = -1;      // UP
    else if (rawValue === 2) value = 1;  // DOWN
    else value = 0;                      // STOP
    
    if (this.debug) console.log('Mapped movement value:', value);
    
    if (player === 1) {
      this.player1Movement = value;
    } else {
      this.player2Movement = value;
    }
  }

  handleDisconnect(player) {
    if (player === 1) {
      this.player1Connected = false;
      this.player1Name = "";
      this.player1Movement = 0;
      document.querySelector('.p1-button').classList.remove('connected');
      document.querySelector('.p1-button').textContent = 'Connect Player 1';
    } else {
      this.player2Connected = false;
      this.player2Name = "";
      this.player2Movement = 0;
      document.querySelector('.p2-button').classList.remove('connected');
      document.querySelector('.p2-button').textContent = 'Connect Player 2';
    }
  }

  drawDebug() {
    if (!this.debug) return;
    
    // Connection status and device names
    text(`Player 1: ${this.player1Connected ? 'Connected' : 'Disconnected'}`, width/4, 30);
    text(`Player 2: ${this.player2Connected ? 'Connected' : 'Disconnected'}`, 3*width/4, 30);
    text(`Device: ${this.player1Name}`, width/4, 60);
    text(`Device: ${this.player2Name}`, 3*width/4, 60);
    
    // Enhanced movement display for each player
    this.drawPlayerDebug(this.player1Movement, width/4, 90);
    this.drawPlayerDebug(this.player2Movement, 3*width/4, 90);
  }

  drawPlayerDebug(movement, x, baseY) {
    // Show both raw and multiplied movement values
    const multiplier = movement === this.player1Movement ? this.player1MoveMultiplier : this.player2MoveMultiplier;
    const multipliedMovement = movement === 0 ? 0 : movement * multiplier;

    text(`Raw Movement: ${movement}`, x, baseY);
    text(`Multiplier: ${multiplier}`, x, baseY + 30);
    text(`Final Movement: ${multipliedMovement}`, x, baseY + 60);
    
    // Visual indicator
    push();
    translate(x, baseY + 90);
    if (movement === 0) {
      fill(100);
      circle(0, 0, 10);
    } else {
      fill(255);
      if (movement === -1) {
        triangle(-5, 5, 5, 5, 0, -5);
      } else {
        triangle(-5, -5, 5, -5, 0, 5);
      }
    }
    pop();
  }

  getPlayer1Movement() {
    return this.player1Movement === 0 ? 0 : this.player1Movement * this.player1MoveMultiplier;
  }

  getPlayer2Movement() {
    return this.player2Movement === 0 ? 0 : this.player2Movement * this.player2MoveMultiplier;
  }

  getPlayer1Multiplier() {
    return this.player1MoveMultiplier;
  }

  getPlayer2Multiplier() {
    return this.player2MoveMultiplier;
  }

  updateSliderVisibility() {
    if (!this.p1Slider || !this.p2Slider) return;
    
    const display = this.debug ? 'block' : 'none';
    this.p1Slider.style('display', display);
    this.p2Slider.style('display', display);
    this.p1Label.style('display', display);
    this.p2Label.style('display', display);
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