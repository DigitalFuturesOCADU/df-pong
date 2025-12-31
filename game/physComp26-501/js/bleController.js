class BLEController {
  constructor() {
    this.player1Connected = false;
    this.player2Connected = false;
    this.player1Movement = 0;
    this.player2Movement = 0;
    this.player1Name = "Player 1";
    this.player2Name = "Player 2";
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
    this.configPath = 'players-config.json'; // Can be overridden by instances
    this.loadPlayersConfig();
  }
  
  setConfigPath(path) {
    this.configPath = path;
    this.loadPlayersConfig();
  }
  
  async loadPlayersConfig() {
    try {
      const response = await fetch(this.configPath);
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
    this.p1DeviceSelect.option('Select Player', 0);
    this.p2DeviceSelect.option('Select Player', 0);
    
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
      // Mobile: Stack connection controls at bottom, leaving space for game controls at top
      const centerX = window.innerWidth / 2;
      const canvasBottom = canvasRect.bottom;
      const buttonSpacing = 55;
      const selectorSpacing = 35;
      const baseY = canvasBottom + 20;
      
      // P1 controls on left side
      this.p1DeviceSelect.position(10, baseY);
      this.p1Button.position(10, baseY + selectorSpacing);
      
      // P2 controls on right side
      const rightX = window.innerWidth - 130;
      this.p2DeviceSelect.position(rightX, baseY);
      this.p2Button.position(rightX, baseY + selectorSpacing);
    } else {
      // Desktop: controls below the canvas
      const canvasBottom = canvasRect.bottom + 20;
      const selectWidth = 150;
      const buttonWidth = 100;
      const padding = 30;
      
      // Player 1 controls - left side
      this.p1DeviceSelect.position(canvasRect.left + padding, canvasBottom);
      this.p1Button.position(canvasRect.left + padding + selectWidth + 10, canvasBottom);
      
      // Player 2 controls - right side
      this.p2DeviceSelect.position(canvasRect.right - padding - selectWidth - buttonWidth - 10, canvasBottom);
      this.p2Button.position(canvasRect.right - padding - buttonWidth, canvasBottom);
    }
  }
  
  setupButtonStyles() {
    // Get p5.js generated style element or create styles
    const style = document.createElement('style');
    style.textContent = `
      .p1-button, .p2-button {
        padding: 10px 20px;
        font-size: 16px;
        font-weight: bold;
        border: 2px solid #fff;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.3s ease;
        background-color: #000;
        color: #fff;
      }
      
      .p1-button:hover, .p2-button:hover {
        background-color: #222;
      }
      
      .p1-button.connected {
        background-color: #2ecc40;
        border-color: #2ecc40;
        color: #000;
      }
      
      .p2-button.connected {
        background-color: #ff4136;
        border-color: #ff4136;
        color: #fff;
      }
      
      .device-select {
        padding: 8px 12px;
        font-size: 14px;
        border: 2px solid #fff;
        border-radius: 5px;
        background-color: #000;
        color: #fff;
        cursor: pointer;
        min-width: 120px;
      }
      
      .device-select:focus {
        outline: none;
        border-color: #0074d9;
      }
    `;
    document.head.appendChild(style);
  }
  
  handleButtonClick(playerNumber) {
    if (playerNumber === 1) {
      if (this.player1Connected) {
        this.disconnect(1);
      } else {
        this.player1DeviceNumber = parseInt(this.p1DeviceSelect.value());
        if (this.player1DeviceNumber > 0) {
          this.connectToBLE(1);
        } else {
          alert('Please select a device number for Player 1');
        }
      }
    } else {
      if (this.player2Connected) {
        this.disconnect(2);
      } else {
        this.player2DeviceNumber = parseInt(this.p2DeviceSelect.value());
        if (this.player2DeviceNumber > 0) {
          this.connectToBLE(2);
        } else {
          alert('Please select a device number for Player 2');
        }
      }
    }
  }
  
  connectToBLE(playerNumber) {
    const deviceNumber = playerNumber === 1 ? this.player1DeviceNumber : this.player2DeviceNumber;
    const serviceUUID = this.generateServiceUUID(deviceNumber);
    const characteristicUUID = this.generateCharacteristicUUID(deviceNumber);
    
    console.log(`Connecting player ${playerNumber} to device ${deviceNumber}`);
    console.log(`Service UUID: ${serviceUUID}`);
    console.log(`Characteristic UUID: ${characteristicUUID}`);
    
    if (playerNumber === 1) {
      this.myBLE1.connect(serviceUUID, (error, characteristics) => {
        if (error) {
          console.error('BLE connection error:', error);
          return;
        }
        this.player1Connected = true;
        this.updateButtonState(1);
        this.createConnectionParticles(1);
        
        // Get player name from config
        if (this.playersConfig) {
          const player = this.playersConfig.players.find(p => p.deviceNumber === deviceNumber);
          if (player) {
            this.player1Name = player.name;
          }
        }
        
        // Start reading characteristic
        this.startReading(1, characteristicUUID);
      });
    } else {
      this.myBLE2.connect(serviceUUID, (error, characteristics) => {
        if (error) {
          console.error('BLE connection error:', error);
          return;
        }
        this.player2Connected = true;
        this.updateButtonState(2);
        this.createConnectionParticles(2);
        
        // Get player name from config
        if (this.playersConfig) {
          const player = this.playersConfig.players.find(p => p.deviceNumber === deviceNumber);
          if (player) {
            this.player2Name = player.name;
          }
        }
        
        // Start reading characteristic
        this.startReading(2, characteristicUUID);
      });
    }
  }
  
  startReading(playerNumber, characteristicUUID) {
    const ble = playerNumber === 1 ? this.myBLE1 : this.myBLE2;
    
    ble.startNotifications(
      ble.device.gatt.getPrimaryService(this.generateServiceUUID(
        playerNumber === 1 ? this.player1DeviceNumber : this.player2DeviceNumber
      )).then(service => service.getCharacteristic(characteristicUUID)),
      (data) => this.handleData(playerNumber, data),
      'string'
    );
    
    // Fallback: poll for data
    setInterval(() => {
      if (playerNumber === 1 && this.player1Connected && !this.gattOperationInProgress1) {
        this.gattOperationInProgress1 = true;
        ble.read(characteristicUUID, 'string', (error, data) => {
          this.gattOperationInProgress1 = false;
          if (!error && data) {
            this.handleData(1, data);
          }
        });
      } else if (playerNumber === 2 && this.player2Connected && !this.gattOperationInProgress2) {
        this.gattOperationInProgress2 = true;
        ble.read(characteristicUUID, 'string', (error, data) => {
          this.gattOperationInProgress2 = false;
          if (!error && data) {
            this.handleData(2, data);
          }
        });
      }
    }, 50);
  }
  
  handleData(playerNumber, data) {
    try {
      const value = parseInt(data);
      if (!isNaN(value)) {
        if (playerNumber === 1) {
          this.player1Movement = value;
        } else {
          this.player2Movement = value;
        }
      }
    } catch (e) {
      console.error('Error parsing BLE data:', e);
    }
  }
  
  disconnect(playerNumber) {
    if (playerNumber === 1) {
      this.myBLE1.disconnect();
      this.player1Connected = false;
      this.player1Movement = 0;
      this.player1Name = "Player 1";
      this.handshakeComplete1 = false;
    } else {
      this.myBLE2.disconnect();
      this.player2Connected = false;
      this.player2Movement = 0;
      this.player2Name = "Player 2";
      this.handshakeComplete2 = false;
    }
    this.updateButtonState(playerNumber);
  }
  
  updateButtonState(playerNumber) {
    if (playerNumber === 1) {
      if (this.player1Connected) {
        this.p1Button.html('Disconnect');
        this.p1Button.addClass('connected');
        this.p1DeviceSelect.attribute('disabled', '');
      } else {
        this.p1Button.html('Connect');
        this.p1Button.removeClass('connected');
        this.p1DeviceSelect.removeAttribute('disabled');
      }
    } else {
      if (this.player2Connected) {
        this.p2Button.html('Disconnect');
        this.p2Button.addClass('connected');
        this.p2DeviceSelect.attribute('disabled', '');
      } else {
        this.p2Button.html('Connect');
        this.p2Button.removeClass('connected');
        this.p2DeviceSelect.removeAttribute('disabled');
      }
    }
  }
  
  getPlayer1Movement() {
    return this.player1Movement * this.player1MoveMultiplier;
  }
  
  getPlayer2Movement() {
    return this.player2Movement * this.player2MoveMultiplier;
  }
  
  set debug(value) {
    this._debug = value;
  }
  
  get debug() {
    return this._debug;
  }
  
  createConnectionParticles(playerNumber) {
    const particles = playerNumber === 1 ? this.player1Particles : this.player2Particles;
    const x = playerNumber === 1 ? width * 0.25 : width * 0.75;
    const y = height / 2;
    
    for (let i = 0; i < 30; i++) {
      particles.push({
        x: x,
        y: y,
        vx: random(-5, 5),
        vy: random(-5, 5),
        life: 60,
        color: playerNumber === 1 ? color(46, 204, 64) : color(255, 65, 54)
      });
    }
  }
  
  updateParticles() {
    this.updateParticleArray(this.player1Particles);
    this.updateParticleArray(this.player2Particles);
  }
  
  updateParticleArray(particles) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }
  
  drawParticles() {
    noStroke();
    this.drawParticleArray(this.player1Particles);
    this.drawParticleArray(this.player2Particles);
  }
  
  drawParticleArray(particles) {
    for (const p of particles) {
      const alpha = map(p.life, 0, 60, 0, 255);
      fill(red(p.color), green(p.color), blue(p.color), alpha);
      ellipse(p.x, p.y, 8);
    }
  }
  
  drawDebug() {
    if (!this._debug) return;
    
    push();
    fill(255);
    textSize(12);
    textAlign(LEFT, TOP);
    
    const y = 60;
    text(`P1 Connected: ${this.player1Connected}`, 10, y);
    text(`P1 Movement: ${this.player1Movement}`, 10, y + 15);
    text(`P1 Name: ${this.player1Name}`, 10, y + 30);
    
    text(`P2 Connected: ${this.player2Connected}`, 10, y + 50);
    text(`P2 Movement: ${this.player2Movement}`, 10, y + 65);
    text(`P2 Name: ${this.player2Name}`, 10, y + 80);
    
    pop();
  }
}
