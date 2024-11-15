class BLEController {
  constructor() {
    this.player1Connected = false;
    this.player2Connected = false;
    this.player1Movement = 0;
    this.player2Movement = 0;
    this.player1Name = "";
    this.player2Name = "";
    this.debug = false;

    this.serviceUuid = "19b10010-e8f2-537e-4f6c-d104768a1214";
    this.characteristicUuid = "19b10011-e8f2-537e-4f6c-d104768a1214";
    
    this.myBLE1 = new p5ble();
    this.myBLE2 = new p5ble();
  }

  setup() {
    this.createButtons();
    this.setupButtonStyles();
    
    // Handle window resize for responsive button placement
    window.addEventListener('resize', () => this.updateButtonPositions());
  }

createButtons() {
    // Wait for next frame to ensure canvas exists
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
    
    // Connection status and device names (unchanged)
    text(`Player 1: ${this.player1Connected ? 'Connected' : 'Disconnected'}`, width/4, 30);
    text(`Player 2: ${this.player2Connected ? 'Connected' : 'Disconnected'}`, 3*width/4, 30);
    text(`Device: ${this.player1Name}`, width/4, 60);
    text(`Device: ${this.player2Name}`, 3*width/4, 60);
    
    // Enhanced movement display for each player
    this.drawPlayerDebug(this.player1Movement, width/4, 90);
    this.drawPlayerDebug(this.player2Movement, 3*width/4, 90);
  }

  drawPlayerDebug(movement, x, baseY) {
    // Movement value (-1, 0, 1)
    text(`Movement: ${movement}`, x, baseY);
    
    // Raw received value
    let rawValue = movement === -1 ? 1 : movement === 1 ? 2 : 0;
    text(`Raw value: ${rawValue}`, x, baseY + 30);
    
    // Movement direction text
    let directionText = movement === -1 ? "Up" : movement === 1 ? "Down" : "Stop";
    text(`Direction: ${directionText}`, x, baseY + 60);
    
    // Visual indicator
    push();
    translate(x, baseY + 90);
    if (movement === 0) {
      // Draw dot for stop
      fill(100);
      circle(0, 0, 10);
    } else {
      // Draw arrow for movement
      fill(0);
      if (movement === -1) {
        triangle(-5, 5, 5, 5, 0, -5);  // Up arrow
      } else {
        triangle(-5, -5, 5, -5, 0, 5); // Down arrow
      }
    }
    pop();
  }

  getPlayer1Movement() {
    return this.player1Movement;
  }

  getPlayer2Movement() {
    return this.player2Movement;
  }

  isPlayer1Connected() {
    return this.player1Connected;
  }

  isPlayer2Connected() {
    return this.player2Connected;
  }
}