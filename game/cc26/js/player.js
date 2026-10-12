/*
 * player.js — one side of the table.
 *
 * A Player knows:
 *   - who they are (roster name, or a custom name from their controller)
 *   - how they play (Bluetooth controller, keyboard/touch, or the computer)
 *   - their effective settings (color, speed, paddle size, sounds), which
 *     combine the controller's wishes with what the host allows.
 */

const SOUND_KEYS = { hit: 'hitSound', score: 'scoreSound', win: 'winSound' };

class Player {
  constructor(slot, { house, sound, music, onChange }) {
    this.slot = slot;
    this.index = slot - 1;
    this.side = slot === 1 ? 'left' : 'right';
    this.defaultColor = slot === 1 ? PALETTE.p1 : PALETTE.p2;
    this.house = house;
    this.sound = sound;
    this.musicPlayer = music;
    this.music = null; // a playable track from this player's controller, once checked
    this.musicStatus = null; // {state: 'loading'|'ok'|'error', label, error}
    this.musicId = null;
    this.onChange = onChange;

    this.target = null; // chosen controller: a number, LEGACY_2024, or null
    this.rosterName = null;
    this.mode = 'keyboard'; // what happens without a controller: 'keyboard' | 'cpu'

    this.link = new ControllerLink({
      onStatus: (status, detail) => this.handleStatus(status, detail),
      onMove: (dir) => {
        this.controllerDir = dir;
        if (dir !== 0) this.lastInputAt = performance.now();
      },
      onConfig: (text, error) => this.handleConfig(text, error),
      onReady: () => this.changed('ready'),
    });
    this.linkStatus = 'idle';
    this.linkDetail = '';
    this.wasConnected = false;

    this.config = null; // parsed controller settings (2026 controllers)
    this.controllerDir = 0;
    this.touchY = null; // world y while a finger is on this player's side
    this.lastInputAt = 0;

    this.sounds = { hit: null, score: null, win: null };
    this.soundStatus = {}; // key → {state: 'loading'|'ok'|'error', label, via, error, note}
    this.soundIds = {};
    this.apply();
  }

  // -------------------------------------------------------------------------
  // Who and how
  // -------------------------------------------------------------------------

  /** 'controller' while a controller is connected (or reconnecting), else 'keyboard' or 'cpu'. */
  get kind() {
    return ['connected', 'reconnecting', 'lost'].includes(this.linkStatus) ? 'controller' : this.mode;
  }

  get controllerLive() {
    return this.linkStatus === 'connected';
  }

  get name() {
    if (this.kind === 'controller' && this.customName) return this.customName;
    if (this.target === LEGACY_2024) return this.link.deviceName || '2024 controller';
    if (this.rosterName) return this.rosterName;
    if (this.target) return `Controller ${this.target}`;
    return this.mode === 'cpu' ? 'Computer' : `Player ${this.slot}`;
  }

  /** Everything worth telling the player about their settings. */
  get issues() {
    const list = [...(this.config?.issues || [])];
    for (const [key, s] of Object.entries(this.soundStatus)) {
      if (s.state === 'error') list.push(`${SOUND_KEYS[key]} "${s.label}" ${s.error} — using default`);
    }
    if (this.musicStatus?.state === 'error') list.push(`music "${this.musicStatus.label}" ${this.musicStatus.error} — using the room's music`);
    return list;
  }

  get notes() {
    const list = [...(this.config?.notes || [])];
    for (const [key, s] of Object.entries(this.soundStatus)) {
      if (s.note) list.push(`${SOUND_KEYS[key]}: ${s.note}`);
    }
    if (this.config?.unknown?.length) list.push(`ignored unknown settings: ${this.config.unknown.join(', ')}`);
    return list;
  }

  selectController(target, rosterName) {
    if (this.kind === 'controller') return;
    this.target = target;
    this.rosterName = rosterName || null;
    this.changed('identity');
  }

  setMode(mode) {
    this.mode = mode;
    this.changed('identity');
  }

  connect() {
    if (!this.target) return;
    this.link.connect(this.target);
  }

  disconnect() {
    this.link.disconnect();
  }

  // -------------------------------------------------------------------------
  // Controller events
  // -------------------------------------------------------------------------

  handleStatus(status, detail) {
    const previous = this.linkStatus;
    this.linkStatus = status;
    this.linkDetail = detail;

    if (status === 'connected' && previous !== 'connected') {
      this.apply(); // the config is read during connecting, before kind becomes 'controller'
      this.changed(this.wasConnected ? 'reconnected' : 'connected');
      this.wasConnected = true;
    } else if ((status === 'reconnecting' || status === 'lost') && previous === 'connected') {
      this.controllerDir = 0;
      this.changed('dropped');
    } else if (status === 'idle' || status === 'error') {
      if (this.wasConnected) this.changed('disconnected');
      this.wasConnected = false;
      this.config = null;
      this.apply();
    }
    this.changed('status');
  }

  handleConfig(text, error) {
    if (error && this.config && this.config.raw) {
      // A re-read failed: keep the settings we already have rather than wiping them.
      if (!this.config.issues.includes(error)) this.config.issues.push(error);
      this.changed('config', { requestsChanged: false });
      return;
    }
    const before = JSON.stringify(this.config?.requests || {});
    this.config = text === null ? null : parseControllerConfig(text);
    if (error && this.config) this.config.issues.push(error);
    this.apply();
    const requestsChanged = JSON.stringify(this.config?.requests || {}) !== before;
    this.changed('config', { requestsChanged });
  }

  // -------------------------------------------------------------------------
  // Effective settings
  // -------------------------------------------------------------------------

  /** Combine the controller's settings with the host's permissions. Call again whenever either changes. */
  apply() {
    const allow = this.house.permissions;
    const wants = (this.kind === 'controller' && this.config?.player) || {};

    this.customName = allow.name ? wants.name : undefined;
    this.color = allow.color && wants.color ? wants.color : this.defaultColor;
    this.rgb = parseColor(this.color);
    this.moveSpeed = allow.moveSpeed && wants.moveSpeed !== undefined ? wants.moveSpeed : this.house.data.paddleSpeed[this.index];
    this.paddleSize = allow.paddleSize && wants.paddleSize !== undefined ? wants.paddleSize : 100;
    this.requests = (this.kind === 'controller' && this.config?.requests) || {};

    for (const [key, settingKey] of Object.entries(SOUND_KEYS)) {
      this.loadSound(key, allow.sounds ? wants[settingKey] : undefined);
    }
    this.loadMusic(allow.music ? wants.music : undefined);
  }

  async loadMusic(setting) {
    const id = setting ? setting.url || setting.name : null;
    if (this.musicId === id) return;
    this.musicId = id;
    if (!setting || !this.musicPlayer) {
      this.music = null;
      this.musicStatus = null;
      this.changed('music');
      return;
    }
    this.musicStatus = { state: 'loading', label: setting.label };
    this.changed('music');
    const result = await this.musicPlayer.probe(setting);
    if (this.musicId !== id) return;
    this.music = result.ok ? trackFromSetting(setting) : null;
    this.musicStatus = result.ok ? { state: 'ok', label: setting.label } : { state: 'error', label: setting.label, error: result.error };
    this.changed('music');
  }

  async loadSound(key, setting) {
    const id = setting ? setting.url || setting.name : null;
    if (this.soundIds[key] === id) return;
    this.soundIds[key] = id;
    if (!setting) {
      this.sounds[key] = null;
      delete this.soundStatus[key];
      return;
    }
    this.soundStatus[key] = { state: 'loading', label: setting.label };
    this.changed('sound');
    const result = await this.sound.load(setting);
    if (this.soundIds[key] !== id) return; // it changed while loading
    if (result.ok) {
      this.sounds[key] = result.sound;
      this.soundStatus[key] = { state: 'ok', label: setting.label, via: result.via, note: result.note };
    } else {
      this.sounds[key] = null;
      this.soundStatus[key] = { state: 'error', label: setting.label, error: result.error };
    }
    this.changed('sound');
  }

  /** A short summary for the admin panel. */
  snapshot() {
    return {
      slot: this.slot,
      name: this.name,
      device: this.target,
      kind: this.kind,
      status: this.linkStatus,
      gen: this.link.generation,
      color: this.color,
      moveSpeed: this.moveSpeed,
      paddleSize: this.paddleSize,
      requests: this.requests,
      sounds: Object.fromEntries(Object.entries(this.soundStatus).map(([k, s]) => [k, s.state === 'ok' ? s.label : `${s.label} (${s.state})`])),
      music: this.musicStatus ? this.musicStatus.label : null,
      issues: this.issues,
    };
  }

  changed(what, info = {}) {
    this.onChange && this.onChange(this, what, info);
  }
}
