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

    this.player1MoveMultiplier = 10;
    this.player2MoveMultiplier = 10;
    this.pointsToWin = 10;

    this.handshakeComplete1 = false;
    this.handshakeComplete2 = false;
    this.gattOperationInProgress1 = false; // Flag to track ongoing GATT operations for player 1
    this.gattOperationInProgress2 = false; // Flag to track ongoing GATT operations for player 2
  }

  setup() {
    this.createButtons();
    this.setupButtonStyles();
    window.addEventListener('resize', () => this.updateButtonPositions());
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

  setupButtonStyles() {
    let buttonStyle = document.createElement('style');
    buttonStyle.textContent = `
      button {
        padding: 10px;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        position: fixed;
      }
      .p1-button, .p2-button {
        background-color: #4CAF50;
        color: white;
      }
      .connected {
        background-color: #f44336 !important;
      }
    `;
    document.head.appendChild(buttonStyle);
  }

  handleButtonClick(player) {
    const isConnected = player === 1 ? this.player1Connected : this.player2Connected;
    if (!isConnected) {
      this.connectToBle(player);
    } else {
      this.disconnectBle(player);
    }
  }

  async connectToBle(player) {
    const ble = player === 1 ? this.myBLE1 : this.myBLE2;
    const gattOperationInProgress = player === 1 ? this.gattOperationInProgress1 : this.gattOperationInProgress2;

    if (gattOperationInProgress) {
      console.log('GATT operation already in progress for player', player);
      return;
    }

    if (player === 1) {
      this.gattOperationInProgress1 = true;
    } else {
      this.gattOperationInProgress2 = true;
    }

    try {
      const characteristics = await ble.connect(this.serviceUuid);
      const movementCharacteristic = characteristics.find(c => c.uuid === this.characteristicUuid);
      if (!movementCharacteristic) {
        console.log('Required characteristic not found');
        throw new Error('Characteristic not found');
      }

      await ble.startNotifications(movementCharacteristic, this.handleMovementData.bind(this, player));

      if (player === 1) {
        this.player1Connected = true;
        this.player1Name = ble.device.name || "Player 1 Device";
        this.p1Button.addClass('connected');
        this.p1Button.html('Disconnect Player 1');
        this.handshakeComplete1 = false;
        this.gattOperationInProgress1 = false;
      } else {
        this.player2Connected = true;
        this.player2Name = ble.device.name || "Player 2 Device";
        this.p2Button.addClass('connected');
        this.p2Button.html('Disconnect Player 2');
        this.handshakeComplete2 = false;
        this.gattOperationInProgress2 = false;
      }

      ble.onDisconnected(() => {
        this.handleDisconnect(player);
        if (player === 1) {
          this.gattOperationInProgress1 = false;
        } else {
          this.gattOperationInProgress2 = false;
        }
      });
    } catch (error) {
      console.log('Error:', error);
      if (player === 1) {
        this.gattOperationInProgress1 = false;
      } else {
        this.gattOperationInProgress2 = false;
      }
    }
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
    } else if (rawValue === 3) {
      if (this.debug) console.log('Hello handshake received');
      this.sendHelloHandshake(player);
      return;  // HELLO HANDSHAKE
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

  sendHelloHandshake(player) {
    const ble = player === 1 ? this.myBLE1 : this.myBLE2;
    const characteristic = ble.characteristics.find(c => c.uuid === this.characteristicUuid);
    if (characteristic) {
      ble.write(characteristic, new Uint8Array([3]), (error) => {
        if (error) {
          console.log('Handshake write error:', error);
          return;
        }
        if (player === 1) {
          this.handshakeComplete1 = true;
        } else {
          this.handshakeComplete2 = true;
        }
      });
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
  }

  drawPlayerDebug(movement, x, baseY) {
    text(`Movement: ${movement}`, x, baseY);
    
    push();
    translate(x, baseY + 30);
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
    return this.player1Movement * this.player1MoveMultiplier;
  }

  getPlayer2Movement() {
    return this.player2Movement * this.player2MoveMultiplier;
  }

  getPointsToWin() {
    return this.pointsToWin;
  }

  set debug(value) {
    this._debug = value;
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