/*
 * ble.js — connecting to one Bluetooth controller with Web Bluetooth.
 *
 * How a controller is found (see docs/PROTOCOL.md):
 *   Every controller advertises a service UUID that ends in its own number,
 *   so the browser's device chooser only shows the one controller we asked for.
 *
 *   controller n  →  19b10010-e8f2-537e-4f6c-d104768a12 + hex(13 + n)
 *
 * Three generations are supported:
 *   2024  one shared UUID (suffix 14); the player name is the BLE device name
 *   2025  per-number UUIDs; movement only
 *   2026  per-number UUIDs + a config characteristic with custom settings (JSON),
 *         and (DFPONG API 1.1, library 2.3+) an actions characteristic: position, taunts
 *
 * This file talks to the Web Bluetooth API directly (no p5.ble) so it can
 * queue GATT operations, reconnect automatically and read the config.
 */

const BLE_UUID = {
  service: DFPONG_API.bluetooth.uuidBase.service, // 19b10010-e8f2-537e-4f6c-d104768a12
  movement: DFPONG_API.bluetooth.uuidBase.movement, // 19b10011-…
  config: DFPONG_API.bluetooth.uuidBase.config, // 19b10012-…
  actions: DFPONG_API.bluetooth.uuidBase.actions, // 19b10013-… (experimental)
  events: DFPONG_API.bluetooth.uuidBase.events, // 19b10014-… (experimental, game → controller)
};

// Event name → code (hit, scored, won…), from the DFPONG API
const EVENT_CODES = Object.fromEntries(apiEntries(DFPONG_API.events.codes).map(([name, e]) => [name, e.code]));

// Action code → name (position, positionOff, taunt…), from the DFPONG API. Planned codes aren't listed.
const ACTION_NAMES = Object.fromEntries(
  apiEntries(DFPONG_API.actions.codes)
    .filter(([, a]) => a.status !== 'planned')
    .map(([name, a]) => [a.code, name])
);

const LEGACY_2024 = 'legacy2024';
const MOVEMENT = { NEUTRAL: 0, UP: 1, DOWN: 2, HANDSHAKE: 3 };

function uuidSuffix(target) {
  // 2024 controllers all used suffix 14 (the same as controller #7).
  const n = target === LEGACY_2024 ? 7 : target;
  return (13 + n).toString(16).padStart(2, '0');
}

function controllerUUIDs(target) {
  const s = uuidSuffix(target);
  return { service: BLE_UUID.service + s, movement: BLE_UUID.movement + s, config: BLE_UUID.config + s, actions: BLE_UUID.actions + s, events: BLE_UUID.events + s };
}

const bluetoothAvailable = () => !!(navigator.bluetooth && navigator.bluetooth.requestDevice);

class ControllerLink {
  /**
   * @param {object} handlers
   *   onStatus(status, detail)  'idle' | 'choosing' | 'connecting' | 'connected' | 'reconnecting' | 'lost' | 'error'
   *   onMove(direction)         -1 up, 0 stop, +1 down
   *   onConfig(text)            raw JSON text from a 2026 controller (or null)
   *   onReady()                 first movement value after the handshake
   *   onAction(action)          {type: 'position', position: 0–1} | {type: 'positionOff'} | {type: 'taunt', emote}
   */
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.status = 'idle';
    this.target = null;
    this.uuids = null;
    this.device = null;
    this.movementChar = null;
    this.configChar = null;
    this.actionsChar = null;
    this.eventsChar = null;
    this.generation = null; // '2024' | '2025' | '2026'
    this.deviceName = '';
    this.userDisconnected = false;
    this.handshakeAcked = false;
    this.lastHandshakeReply = 0;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    // Wait this long (ms) before each automatic reconnect attempt; then give up and show "Reconnect".
    this.reconnectDelays = [300, 1000, 2000, 3000, 5000, 8000, 8000, 8000, 8000, 8000];
    this.connectSession = 0;
    // Connection check (see checkAlive): how long the controller has to answer, and how many
    // missed answers in a row mean it's gone.
    this.aliveTimeout = DFPONG_API.bluetooth.timing.aliveTimeoutMs.value;
    this.aliveStrikes = DFPONG_API.bluetooth.timing.aliveStrikes.value;
    this.missedChecks = 0;
    this.checking = false;
    this._queueTail = Promise.resolve();
    this._configTimer = null;
    this.opening = false; // true while openConnection() is running
    this._onDisconnected = () => this.handleDisconnect();
    this._onMovementEvent = (e) => this.handleMovement(e.target.value);
    this._onConfigEvent = () => this.scheduleConfigRead();
    this._onActionEvent = (e) => this.handleAction(e.target.value);
    this.stats = { messages: 0, lastValue: null, lastAt: 0, rate: 0, _windowCount: 0, _windowStart: performance.now(), configReads: 0, checks: 0, lastCheckMs: null, actions: 0, lastAction: null, eventsSent: 0, eventsDropped: 0, lastEvent: null };
  }

  get isConnected() {
    return this.status === 'connected';
  }

  setStatus(status, detail = '') {
    this.status = status;
    this.handlers.onStatus && this.handlers.onStatus(status, detail);
  }

  log(...args) {
    if (DFP.debug) console.log('[ble]', ...args);
  }

  /** Must be called from a click/tap: the browser only opens its chooser after a user gesture. */
  async connect(target) {
    if (!bluetoothAvailable()) {
      this.setStatus('error', 'This browser has no Bluetooth. Use Chrome or Edge on a computer or Android.');
      return false;
    }
    if (this.status === 'choosing' || this.status === 'connecting') return false;

    this.forget();
    this.target = target;
    this.uuids = controllerUUIDs(target);
    this.userDisconnected = false;
    this.setStatus('choosing');

    let device;
    try {
      device = await navigator.bluetooth.requestDevice({ filters: [{ services: [this.uuids.service] }] });
    } catch (err) {
      // The person closed the chooser, or nothing was found.
      const cancelled = err && (err.name === 'NotFoundError' || err.name === 'AbortError');
      this.setStatus(cancelled ? 'idle' : 'error', cancelled ? '' : friendlyBleError(err));
      return false;
    }

    this.device = device;
    this.deviceName = device.name || '';
    device.addEventListener('gattserverdisconnected', this._onDisconnected);
    return this.openConnection();
  }

  /** Connect (or reconnect) to the device we already have permission for. */
  async openConnection() {
    this.opening = true;
    try {
      return await this._openConnection();
    } finally {
      this.opening = false;
    }
  }

  async _openConnection() {
    const session = ++this.connectSession;
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    this.handshakeAcked = false;
    this._queueTail = Promise.resolve();

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const server = await withTimeout(this.device.gatt.connect(), 10000, 'connection timed out');
        if (session !== this.connectSession) {
          if (this.userDisconnected) server.disconnect(); // Disconnect was pressed while we were connecting
          return false;
        }
        await this.setupServices(server, session);
        if (session !== this.connectSession) return false;
        this.reconnectAttempt = 0;
        this.missedChecks = 0;
        this.setStatus('connected');
        this.startHelloRetry();
        return true;
      } catch (err) {
        this.log('connect attempt', attempt, 'failed:', err);
        if (session !== this.connectSession || this.userDisconnected) return false;
        if (attempt === 3) {
          try { this.device.gatt.disconnect(); } catch (e) { /* already gone */ }
          if (this.reconnectAttempt > 0) {
            this.scheduleReconnect();
          } else {
            this.setStatus('error', friendlyBleError(err, this.target));
          }
          return false;
        }
        await sleep(400 * attempt);
      }
    }
    return false;
  }

  async setupServices(server, session) {
    const step = (promise, what) => withTimeout(promise, 6000, `${what} timed out`);
    const service = await step(server.getPrimaryService(this.uuids.service), 'finding the service');

    // 1. Movement: subscribe first so we never miss the controller's handshake.
    this.movementChar = await step(service.getCharacteristic(this.uuids.movement), 'finding the movement characteristic');
    this.movementChar.removeEventListener('characteristicvaluechanged', this._onMovementEvent);
    this.movementChar.addEventListener('characteristicvaluechanged', this._onMovementEvent);
    await step(this.queue(() => this.movementChar.startNotifications()), 'subscribing');

    // 2. Say hello first. Older controllers may have sent their hello before we
    //    were listening; this write completes their handshake anyway.
    await step(this.sayHello(), 'saying hello');

    // 3. 2026 controllers have a config characteristic. Older ones don't — that's fine.
    this.configChar = null;
    if (this.target === LEGACY_2024) {
      this.generation = '2024';
    } else {
      try {
        this.configChar = await step(service.getCharacteristic(this.uuids.config), 'finding the settings');
        this.generation = '2026';
      } catch (e) {
        if (e && e.name !== 'NotFoundError') throw e; // a real failure, not an older controller
        this.generation = '2025';
      }
    }

    if (session !== this.connectSession) return;

    if (this.configChar) {
      await this.readConfig();
      if (this.configChar.properties.notify) {
        this.configChar.removeEventListener('characteristicvaluechanged', this._onConfigEvent);
        this.configChar.addEventListener('characteristicvaluechanged', this._onConfigEvent);
        try {
          await step(this.queue(() => this.configChar.startNotifications()), 'subscribing to settings');
        } catch (e) {
          this.log('config notifications unavailable', e);
        }
      }
    } else {
      this.handlers.onConfig && this.handlers.onConfig(null);
    }

    // 4. Actions (experimental): position, taunts. Optional: older controllers don't have it,
    //    and a controller that has it works without it.
    this.actionsChar = null;
    if (this.generation === '2026') {
      try {
        const ch = await step(service.getCharacteristic(this.uuids.actions), 'finding actions');
        ch.removeEventListener('characteristicvaluechanged', this._onActionEvent);
        ch.addEventListener('characteristicvaluechanged', this._onActionEvent);
        await step(this.queue(() => ch.startNotifications()), 'subscribing to actions');
        this.actionsChar = ch;
      } catch (e) {
        if (e && e.name !== 'NotFoundError') this.log('actions unavailable', e);
      }
    }

    // 5. Events (experimental): the game tells the controller what happened. Optional, like actions.
    this.eventsChar = null;
    if (this.generation === '2026') {
      try {
        const ch = await step(service.getCharacteristic(this.uuids.events), 'finding events');
        if (ch.properties.write || ch.properties.writeWithoutResponse) this.eventsChar = ch;
      } catch (e) {
        if (e && e.name !== 'NotFoundError') this.log('events unavailable', e);
      }
    }

    // If the controller dropped while we were setting up, this attempt failed.
    if (!this.device || !this.device.gatt.connected || !this.movementChar) throw new Error('connection dropped during setup');
  }

  handleMovement(dataView) {
    if (!dataView || dataView.byteLength < 1) return;
    const value = dataView.getUint8(0);
    const s = this.stats;
    s.messages++;
    s.lastValue = value;
    s.lastAt = performance.now();
    s._windowCount++;
    if (s.lastAt - s._windowStart > 1000) {
      s.rate = (s._windowCount * 1000) / (s.lastAt - s._windowStart);
      s._windowCount = 0;
      s._windowStart = s.lastAt;
    }

    if (value === MOVEMENT.HANDSHAKE) {
      // ArduinoBLE controllers echo every value we write back to us, so a 3 is
      // often just the echo of our own hello. Only answer while the handshake
      // is still open, and not right after our own write.
      if (!this.handshakeAcked && performance.now() - this.lastHandshakeReply > 400) this.sayHello();
      return;
    }

    if (!this.handshakeAcked) {
      this.handshakeAcked = true;
      this.handlers.onReady && this.handlers.onReady();
    }
    const direction = value === MOVEMENT.UP ? -1 : value === MOVEMENT.DOWN ? 1 : 0;
    this.handlers.onMove && this.handlers.onMove(direction);
  }

  /**
   * Tell the controller what just happened (events characteristic): sendEvent('scored', 3, 1).
   * Does nothing for controllers without it. An event that can't go out within maxDelayMs
   * (the connection is busy) is dropped: a late sound is worse than none.
   */
  sendEvent(name, ...values) {
    const ch = this.eventsChar;
    if (!ch || this.status !== 'connected' || !hasOwn(EVENT_CODES, name)) return;
    const packet = new Uint8Array([EVENT_CODES[name], ...values.map((v) => Math.max(0, Math.min(255, Math.round(v) || 0)))]);
    const queuedAt = performance.now();
    this.queue(() => {
      if (ch !== this.eventsChar || performance.now() - queuedAt > DFPONG_API.events.maxDelayMs) {
        this.stats.eventsDropped++;
        return;
      }
      const write = ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse ? ch.writeValueWithoutResponse(packet) : ch.writeValueWithResponse ? ch.writeValueWithResponse(packet) : ch.writeValue(packet);
      return withTimeout(write, 1000, 'event write timed out').then(() => {
        this.stats.eventsSent++;
        this.stats.lastEvent = name;
      });
    }).catch((e) => this.log('event not sent', name, e));
  }

  /** One packet from the actions characteristic: byte 0 is the action, then its bytes (see docs/API.md). */
  handleAction(dataView) {
    if (!dataView || dataView.byteLength < 1) return;
    const name = ACTION_NAMES[dataView.getUint8(0)];
    this.stats.actions++;
    this.stats.lastAction = name || `unknown (${dataView.getUint8(0)})`;
    if (!name || !this.handlers.onAction) return; // unknown codes are for newer games
    const byte = (i, fallback) => (dataView.byteLength > i ? dataView.getUint8(i) : fallback);
    if (name === 'position') {
      const value = byte(1, null);
      if (value === null) return; // incomplete packet
      this.handlers.onAction({ type: 'position', position: value / 255 });
    } else if (name === 'positionOff') {
      this.handlers.onAction({ type: 'positionOff' });
    } else if (name === 'taunt') {
      this.handlers.onAction({ type: 'taunt', emote: byte(1, 0) });
    }
  }

  sayHello() {
    this.lastHandshakeReply = performance.now();
    return this.writeMovement(MOVEMENT.HANDSHAKE)
      .then(() => (this.lastHandshakeReply = performance.now()))
      .catch((e) => this.log('hello failed', e));
  }

  /** Until the controller answers with a movement value, say hello again every second. */
  startHelloRetry() {
    clearInterval(this.helloTimer);
    this.helloTimer = setInterval(() => {
      if (this.handshakeAcked || this.status !== 'connected') {
        clearInterval(this.helloTimer);
        return;
      }
      if (performance.now() - this.lastHandshakeReply > 900) this.sayHello();
    }, 1000);
  }

  writeMovement(value) {
    const ch = this.movementChar;
    if (!ch) return Promise.resolve();
    const data = new Uint8Array([value]);
    return this.queue(() => (ch.writeValueWithResponse ? ch.writeValueWithResponse(data) : ch.writeValue(data)));
  }

  scheduleConfigRead() {
    clearTimeout(this._configTimer);
    this._configTimer = setTimeout(() => this.readConfig(), 120);
  }

  async readConfig() {
    if (!this.configChar) return;
    try {
      const view = await this.queue(() => withTimeout(this.configChar.readValue(), 5000, 'config read timed out'));
      const text = new TextDecoder().decode(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
      this.stats.configReads++;
      this.stats.configText = text;
      this.handlers.onConfig && this.handlers.onConfig(text);
    } catch (err) {
      this.log('config read failed', err);
      this.handlers.onConfig && this.handlers.onConfig('', 'could not read settings from the controller');
    }
  }

  /**
   * Is the controller really still there? The game calls this every couple of seconds.
   *
   * When a controller loses power (a loose wire, a flat battery), the browser can take many
   * seconds to notice, and sometimes never does. So we also ask the controller for its
   * movement value: if it misses `aliveStrikes` answers in a row, we drop the link ourselves
   * and the usual automatic reconnect takes over.
   */
  async checkAlive() {
    const device = this.device;
    if (this.status !== 'connected' || this.opening || this.checking || !device) return;
    if (!device.gatt.connected) {
      this.log('alive check: the browser says the link is gone');
      this.linkDead();
      return;
    }
    const ch = this.movementChar;
    if (!ch || !ch.properties || !ch.properties.read) return; // nothing we can ask
    this.checking = true;
    const session = this.connectSession;
    const started = performance.now();
    try {
      await this.queue(() => withTimeout(ch.readValue(), this.aliveTimeout, 'no answer'));
      this.missedChecks = 0;
      this.stats.checks++;
      this.stats.lastCheckMs = Math.round(performance.now() - started);
    } catch (err) {
      if (session !== this.connectSession || this.status !== 'connected') return;
      this.missedChecks++;
      this.log('alive check missed', this.missedChecks, err);
      if (this.missedChecks >= this.aliveStrikes || !device.gatt.connected) this.linkDead();
    } finally {
      this.checking = false;
    }
  }

  /** The controller stopped answering but the browser hasn't noticed: hang up and start reconnecting. */
  linkDead() {
    this.missedChecks = 0;
    try {
      if (this.device && this.device.gatt.connected) this.device.gatt.disconnect(); // usually fires gattserverdisconnected
    } catch (e) {
      /* already gone */
    }
    if (this.status === 'connected') this.handleDisconnect();
  }

  /** Chrome allows only one GATT operation at a time per device, so every read/write goes through here. */
  queue(operation) {
    const run = this._queueTail.then(operation, operation);
    this._queueTail = run.catch(() => {});
    return run;
  }

  handleDisconnect() {
    clearInterval(this.helloTimer);
    this.movementChar = null;
    this.configChar = null;
    this.actionsChar = null;
    this.eventsChar = null;
    this.handlers.onMove && this.handlers.onMove(0);
    if (this.userDisconnected || !this.device) {
      this.setStatus('idle');
      return;
    }
    // A drop during openConnection() is handled by its own retry loop,
    // and after a failed first connection the error message stays up.
    if (this.opening || this.status === 'error') return;
    // Unexpected drop (battery, interference, reset button): try to get it back
    // without asking the player to pick it again.
    this.reconnectAttempt = 0;
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delays = this.reconnectDelays;
    if (this.reconnectAttempt >= delays.length) {
      this.setStatus('lost', 'Controller is out of reach. Check its power, then press Reconnect.');
      return;
    }
    const delay = delays[this.reconnectAttempt++];
    this.setStatus('reconnecting', `attempt ${this.reconnectAttempt}`);
    this.reconnectTimer = setTimeout(() => {
      if (!this.userDisconnected && this.device) this.openConnection();
    }, delay);
  }

  /** Reconnect to the same controller without the chooser (after "lost"). */
  retry() {
    if (!this.device) return;
    this.userDisconnected = false;
    this.reconnectAttempt = 1;
    this.openConnection();
  }

  disconnect() {
    this.userDisconnected = true;
    this.connectSession++;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this._configTimer);
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect(); // fires gattserverdisconnected → handleDisconnect → idle
    } else {
      this.setStatus('idle');
    }
    this.handlers.onMove && this.handlers.onMove(0);
  }

  /** Drop the current device completely (before connecting to a different one). */
  forget() {
    if (this.device) {
      this.userDisconnected = true;
      this.device.removeEventListener('gattserverdisconnected', this._onDisconnected);
      try { if (this.device.gatt.connected) this.device.gatt.disconnect(); } catch (e) { /* ignore */ }
    }
    clearTimeout(this.reconnectTimer);
    clearTimeout(this._configTimer);
    clearInterval(this.helloTimer);
    this.connectSession++;
    this.device = null;
    this.movementChar = null;
    this.configChar = null;
    this.actionsChar = null;
    this.eventsChar = null;
    this.generation = null;
    this.deviceName = '';
    this.reconnectAttempt = 0;
    this.handshakeAcked = false;
    this.missedChecks = 0;
    this.stats.messages = 0;
    this.stats.checks = 0;
    this.stats.lastCheckMs = null;
    this.stats.lastValue = null;
    this.stats.configText = '';
    this.stats.actions = 0;
    this.stats.lastAction = null;
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function friendlyBleError(err, target) {
  const msg = (err && err.message) || String(err);
  if (/globally disabled|not available|adapter/i.test(msg)) return 'Bluetooth is turned off on this computer.';
  if (/user gesture/i.test(msg)) return 'Press the Connect button again.';
  if (/timed out|unknown reason|failed/i.test(msg)) {
    const n = target && target !== LEGACY_2024 ? ` #${target}` : '';
    return `Couldn't reach controller${n}. Is it powered, nearby, and not connected to another tab?`;
  }
  return msg;
}
