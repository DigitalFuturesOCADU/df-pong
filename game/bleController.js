class BLEController {
  constructor() {
    this.player1Connected = false;
    this.player2Connected = false;
    this.player1Movement = 0;
    this.player2Movement = 0;
    this.player1Name = "A=UP, Z=DOWN";
    this.player2Name = "P=UP, L=DOWN";
    this._debug = false;

    // Base UUIDs - will be modified based on device number
    // Note: These are in the short format, but will be used with Web Bluetooth
    this.baseServiceUuid = "19b10010-e8f2-537e-4f6c-d104768a12";
    this.baseCharacteristicUuid = "19b10011-e8f2-537e-4f6c-d104768a12";
    
    this.myBLE1 = new p5ble();
    this.myBLE2 = new p5ble();

    this.player1MoveMultiplier = 10;
    this.player2MoveMultiplier = 10;
    this.pointsToWin = 10;

    this.handshakeComplete1 = false;
    this.handshakeComplete2 = false;
    this.gattOperationInProgress1 = false;
    this.gattOperationInProgress2 = false;
    
    // Device number selection
    this.player1DeviceNumber = null;
    this.player2DeviceNumber = null;
    
    // Particle systems for connection effects
    this.player1Particles = [];
    this.player2Particles = [];
    this.player1RSSI = null;
    this.player2RSSI = null;
    this.player1DeviceId = null;
    this.player2DeviceId = null;
    
    // Players configuration
    this.playersConfig = null;
    this.loadPlayersConfig();
  }
  
  async loadPlayersConfig() {
    try {
      const response = await fetch('players-config.json');
      this.playersConfig = await response.json();
      console.log('Players config loaded:', this.playersConfig);
      // Recreate dropdowns if they already exist
      if (this.p1DeviceSelect && this.p2DeviceSelect) {
        this.createDeviceSelectors();
      }
    } catch (error) {
      console.error('Error loading players config:', error);
      // Fallback to default 25 players
      this.playersConfig = {
        players: Array.from({length: 25}, (_, i) => ({
          deviceNumber: i + 1,
          name: 'Player Name'
        }))
      };
    }
  }
  
  // Generate UUID based on device number (1-25)
  generateServiceUUID(deviceNumber) {
    // Device 1 → ...120e, Device 2 → ...120f, etc.
    const suffix = (13 + deviceNumber).toString(16).padStart(2, '0').toLowerCase();
    const uuid = this.baseServiceUuid + suffix;
    console.log(`Generated Service UUID for device ${deviceNumber}: ${uuid}`);
    return uuid;
  }
  
  generateCharacteristicUUID(deviceNumber) {
    // Device 1 → ...120e, Device 2 → ...120f, etc.
    const suffix = (13 + deviceNumber).toString(16).padStart(2, '0').toLowerCase();
    const uuid = this.baseCharacteristicUuid + suffix;
    console.log(`Generated Characteristic UUID for device ${deviceNumber}: ${uuid}`);
    return uuid;
  }

  setup() {
    this.createButtons();
    this.setupButtonStyles();
    window.addEventListener('resize', () => this.updateButtonPositions());
  }

  createButtons() {
    requestAnimationFrame(() => {
      this.createDeviceSelectors();
      
      // Connect buttons - simpler text
      this.p1Button = createButton('Connect');
      this.p2Button = createButton('Connect');
      
      this.p1Button.mousePressed(() => this.handleButtonClick(1));
      this.p2Button.mousePressed(() => this.handleButtonClick(2));
      
      this.p1Button.class('p1-button');
      this.p2Button.class('p2-button');
      
      this.updateButtonPositions();
    });
  }
  
  createDeviceSelectors() {
    // Remove old selectors if they exist
    if (this.p1DeviceSelect) this.p1DeviceSelect.remove();
    if (this.p2DeviceSelect) this.p2DeviceSelect.remove();
    
    // Create new selectors
    this.p1DeviceSelect = createSelect();
    this.p2DeviceSelect = createSelect();
    
    // Apply CSS classes immediately
    this.p1DeviceSelect.class('device-select');
    this.p2DeviceSelect.class('device-select');
    
    // Populate options from config
    this.p1DeviceSelect.option('Select Player #', 0);
    this.p2DeviceSelect.option('Select Player #', 0);
    
    if (this.playersConfig && this.playersConfig.players) {
      this.playersConfig.players.forEach(player => {
        const label = `${player.deviceNumber}: ${player.name}`;
        this.p1DeviceSelect.option(label, player.deviceNumber);
        this.p2DeviceSelect.option(label, player.deviceNumber);
      });
    } else {
      // Fallback if config not loaded yet
      for (let i = 1; i <= 25; i++) {
        this.p1DeviceSelect.option(`${i}: Player Name`, i);
        this.p2DeviceSelect.option(`${i}: Player Name`, i);
      }
    }
    
    // Reposition after creation (only if buttons exist)
    if (this.p1Button && this.p2Button) {
      this.updateButtonPositions();
    }
  }

  updateButtonPositions() {
    const canvasRect = document.querySelector('canvas').getBoundingClientRect();
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
      // Mobile: Stack all controls vertically below canvas, centered horizontally
      const startY = canvasRect.bottom + 20;
      const centerX = window.innerWidth / 2;
      const dropdownWidth = 200; // Increased for longer names
      const buttonWidth = 100;
      const verticalSpacing = 20; // Increased spacing
      const playerSpacing = 40; // Increased spacing between player sections
      
      // Player 1: Centered, stacked vertically
      this.p1DeviceSelect.position(
        centerX - (dropdownWidth / 2),
        startY
      );
      this.p1Button.position(
        centerX - (buttonWidth / 2),
        startY + 50 + verticalSpacing
      );
      
      // Player 2: Below Player 1, centered, stacked vertically
      const p2StartY = startY + 50 + verticalSpacing + 50 + playerSpacing;
      this.p2DeviceSelect.position(
        centerX - (dropdownWidth / 2),
        p2StartY
      );
      this.p2Button.position(
        centerX - (buttonWidth / 2),
        p2StartY + 50 + verticalSpacing
      );
      
    } else {
      // Desktop: Horizontal layout below canvas
      const bottomY = canvasRect.bottom + 15;
      const dropdownWidth = 200; // Increased for longer names
      const buttonWidth = 100;
      const horizontalSpacing = 20; // Increased spacing
      
      // Player 1: Aligned to left edge of canvas
      this.p1DeviceSelect.position(canvasRect.left, bottomY);
      this.p1Button.position(canvasRect.left + dropdownWidth + horizontalSpacing, bottomY);
      
      // Player 2: Aligned to right edge of canvas
      this.p2Button.position(canvasRect.right - buttonWidth, bottomY);
      this.p2DeviceSelect.position(canvasRect.right - buttonWidth - dropdownWidth - horizontalSpacing, bottomY);
    }
  }

  setupButtonStyles() {
    let buttonStyle = document.createElement('style');
    buttonStyle.textContent = `
      button, select {
      padding: 10px;
      border: 2px solid black;
      border-radius: 5px;
      cursor: pointer;
      position: fixed;
      font-weight: bold;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      }
      .device-select {
      background-color: white;
      color: black;
      font-size: 14px;
      padding: 8px;
      border: 2px solid black;
      min-width: 200px;
      }
      .p1-button, .p2-button {
      background-color: white;
      color: black;
      font-size: 16px;
      border: 2px solid black;
      min-width: 100px;
      }
      .p1-button:hover, .p2-button:hover {
      background-color: #f0f0f0;
      }
      .connected {
      background-color: black !important;
      color: white !important;
      }
      
      /* Mobile responsive styles */
      @media (max-width: 768px) {
        button, select {
          font-size: 14px;
          padding: 12px;
          background-color: rgba(255, 255, 255, 0.95) !important;
          backdrop-filter: blur(5px);
        }
        .device-select {
          font-size: 14px;
          min-width: 200px;
          background-color: rgba(255, 255, 255, 0.95) !important;
        }
        .p1-button, .p2-button {
          font-size: 16px;
          min-width: 100px;
          background-color: rgba(255, 255, 255, 0.95) !important;
        }
        .connected {
          background-color: rgba(0, 0, 0, 0.95) !important;
        }
      }
    `;
    document.head.appendChild(buttonStyle);
  }

  handleButtonClick(player) {
    const isConnected = player === 1 ? this.player1Connected : this.player2Connected;
    if (!isConnected) {
      // Get selected device number
      const deviceSelect = player === 1 ? this.p1DeviceSelect : this.p2DeviceSelect;
      const deviceNumber = parseInt(deviceSelect.value());
      
      if (deviceNumber === 0 || isNaN(deviceNumber)) {
        alert(`Please select a device number (1-25) for Player ${player} first!`);
        return;
      }
      
      this.connectToBle(player, deviceNumber);
    } else {
      this.disconnectBle(player);
    }
  }

  async connectToBle(player, deviceNumber) {
    const ble = player === 1 ? this.myBLE1 : this.myBLE2;
    const gattOperationInProgress = player === 1 ? this.gattOperationInProgress1 : this.gattOperationInProgress2;

    if (gattOperationInProgress) {
      console.log('GATT operation already in progress for player', player);
      return;
    }

    if (player === 1) {
      this.gattOperationInProgress1 = true;
      this.player1DeviceNumber = deviceNumber;
    } else {
      this.gattOperationInProgress2 = true;
      this.player2DeviceNumber = deviceNumber;
    }

    // Generate UUIDs based on device number
    const serviceUuid = this.generateServiceUUID(deviceNumber);
    const characteristicUuid = this.generateCharacteristicUUID(deviceNumber);
    
    console.log(`Connecting to Device #${deviceNumber}`);
    console.log(`Service UUID: ${serviceUuid}`);
    console.log(`Characteristic UUID: ${characteristicUuid}`);

    try {
      // Connect using the unique service UUID - this filters to only devices with this UUID
      const characteristics = await ble.connect(serviceUuid);
      const movementCharacteristic = characteristics.find(c => c.uuid === characteristicUuid);
      if (!movementCharacteristic) {
        console.log('Required characteristic not found');
        throw new Error('Characteristic not found');
      }

      await ble.startNotifications(movementCharacteristic, this.handleMovementData.bind(this, player));

      // Store player number instead of device name
      const deviceId = ble.device.id;
      const playerNumber = deviceNumber;
      
      // Get player name from config
      let playerName = `Player #${playerNumber}`;
      if (this.playersConfig && this.playersConfig.players) {
        const playerData = this.playersConfig.players.find(p => p.deviceNumber === playerNumber);
        if (playerData) {
          playerName = playerData.name;
        }
      }
      
      console.log(`Connected to ${playerName} (Device #${playerNumber}, ID: ${deviceId})`);

      if (player === 1) {
        this.player1Connected = true;
        this.player1Name = playerName;
        this.player1DeviceId = deviceId;
        this.player1DeviceNumber = playerNumber;
        this.p1Button.addClass('connected');
        this.p1Button.html('Disconnect');
        this.handshakeComplete1 = false;
        this.gattOperationInProgress1 = false;
        // Trigger particle effect and sound
        this.createConnectionParticles(1);
        if (typeof ding !== 'undefined' && ding) {
          ding.play();
        }
      } else {
        this.player2Connected = true;
        this.player2Name = playerName;
        this.player2DeviceId = deviceId;
        this.player2DeviceNumber = playerNumber;
        this.p2Button.addClass('connected');
        this.p2Button.html('Disconnect');
        this.handshakeComplete2 = false;
        this.gattOperationInProgress2 = false;
        // Trigger particle effect and sound
        this.createConnectionParticles(2);
        if (typeof ding !== 'undefined' && ding) {
          ding.play();
        }
      }

      ble.onDisconnected(() => {
        this.handleDisconnect(player);
        if (player === 1) {
          this.gattOperationInProgress1 = false;
          this.player1RSSI = null;
        } else {
          this.gattOperationInProgress2 = false;
          this.player2RSSI = null;
        }
      });
    } catch (error) {
      console.log('Error:', error);
      alert(`Failed to connect to Player #${deviceNumber}. Make sure:\n1. Device is powered on\n2. Device number in Arduino is set to ${deviceNumber}\n3. Device is not already connected`);
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
  
  // Send identification signal to flash LED/buzz
  async identifyDevice(player) {
    const ble = player === 1 ? this.myBLE1 : this.myBLE2;
    const isConnected = player === 1 ? this.player1Connected : this.player2Connected;
    const deviceNumber = player === 1 ? this.player1DeviceNumber : this.player2DeviceNumber;
    
    if (!isConnected) {
      console.log('Device not connected');
      return;
    }
    
    // Get the correct characteristic UUID for this device
    const characteristicUuid = this.generateCharacteristicUUID(deviceNumber);
    const characteristic = ble.characteristics.find(c => c.uuid === characteristicUuid);
    
    if (characteristic) {
      // Send a rapid sequence to trigger LED flash/buzz pattern
      // Send value 1, then 2, then 1, then 2 (creates a distinctive pattern)
      try {
        await ble.write(characteristic, new Uint8Array([1]));
        await new Promise(resolve => setTimeout(resolve, 100));
        await ble.write(characteristic, new Uint8Array([2]));
        await new Promise(resolve => setTimeout(resolve, 100));
        await ble.write(characteristic, new Uint8Array([1]));
        await new Promise(resolve => setTimeout(resolve, 100));
        await ble.write(characteristic, new Uint8Array([2]));
        await new Promise(resolve => setTimeout(resolve, 100));
        await ble.write(characteristic, new Uint8Array([0])); // Stop
        console.log(`Identification signal sent to player ${player}`);
      } catch (error) {
        console.log('Error sending identification signal:', error);
      }
    }
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
    const deviceNumber = player === 1 ? this.player1DeviceNumber : this.player2DeviceNumber;
    const characteristicUuid = this.generateCharacteristicUUID(deviceNumber);
    const characteristic = ble.characteristics.find(c => c.uuid === characteristicUuid);
    
    if (!characteristic) {
      console.log('Characteristic not found for handshake');
      return;
    }
    
    // Add a small delay to avoid GATT operation conflicts
    setTimeout(() => {
      try {
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
      } catch (error) {
        console.log('Error in handshake:', error);
      }
    }, 100); // 100ms delay
  }

  handleDisconnect(player) {
    if (player === 1) {
      this.player1Connected = false;
      this.player1Movement = 0;
      this.player1DeviceId = null;
      this.p1Button.removeClass('connected');
      this.p1Button.html('Connect');
    } else {
      this.player2Connected = false;
      this.player2Movement = 0;
      this.player2DeviceId = null;
      this.p2Button.removeClass('connected');
      this.p2Button.html('Connect');
    }
  }

  drawDebug() {
    if (!this.debug) return;
    
    text(`Player 1: ${this.player1Connected ? 'Connected' : 'Disconnected'}`, width/4, 30);
    text(`Player 2: ${this.player2Connected ? 'Connected' : 'Disconnected'}`, 3*width/4, 30);
    text(`Player: ${this.player1Name}`, width/4, 60);
    text(`Player: ${this.player2Name}`, 3*width/4, 60);
    
    // Display device numbers is now redundant since player name shows it
    
    this.drawPlayerDebug(this.player1Movement, width/4, 75);
    this.drawPlayerDebug(this.player2Movement, 3*width/4, 75);
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

  createConnectionParticles(player) {
    const x = player === 1 ? width/4 : 3*width/4;
    const y = height/2;
    const particleCount = 100; // Increased from 30 to 100
    
    for (let i = 0; i < particleCount; i++) {
      const angle = random(TWO_PI);
      const speed = random(4, 12); // Increased from (2, 6) to (4, 12)
      const particle = {
        x: x,
        y: y,
        vx: cos(angle) * speed,
        vy: sin(angle) * speed,
        life: 1.0,
        size: random(4, 12) // Increased from (3, 8) to (4, 12)
      };
      
      if (player === 1) {
        this.player1Particles.push(particle);
      } else {
        this.player2Particles.push(particle);
      }
    }
  }

  updateAndDrawParticles() {
    // Update and draw Player 1 particles
    for (let i = this.player1Particles.length - 1; i >= 0; i--) {
      const p = this.player1Particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      p.vx *= 0.98; // Slight slowdown
      p.vy *= 0.98;
      
      if (p.life <= 0) {
        this.player1Particles.splice(i, 1);
      } else {
        push();
        noStroke();
        fill(255, 255, 255, p.life * 255);
        circle(p.x, p.y, p.size * p.life);
        pop();
      }
    }
    
    // Update and draw Player 2 particles
    for (let i = this.player2Particles.length - 1; i >= 0; i--) {
      const p = this.player2Particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      p.vx *= 0.98;
      p.vy *= 0.98;
      
      if (p.life <= 0) {
        this.player2Particles.splice(i, 1);
      } else {
        push();
        noStroke();
        fill(255, 255, 255, p.life * 255);
        circle(p.x, p.y, p.size * p.life);
        pop();
      }
    }
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