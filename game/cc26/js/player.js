/*
 * player.js — one side of the table.
 *
 * A Player knows:
 *   - who they are: the person (from the class list) and their controller's name,
 *     which is the name the game uses everywhere
 *   - how they play (Bluetooth controller, keyboard/touch, or the computer)
 *   - their effective settings (color, speed, paddle size, sounds), which
 *     combine the controller's wishes with what the host allows.
 */

const SOUND_KEYS = { hit: 'hitSound', score: 'scoreSound', win: 'winSound' };

// A controller's settings, in the two groups the host can hold back during a match
// (see Game.holdChanges): how you look and sound, and how your paddle handles.
const CHANGE_GROUPS = {
  looks: { name: 'name', color: 'color', hitSound: 'sounds', scoreSound: 'sounds', winSound: 'sounds' }, // key → permission
  handling: { moveSpeed: 'moveSpeed', paddleSize: 'paddleSize' },
};

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
    this.person = null; // who it belongs to, from the class list (players-config.json "name")
    this.controllerName = null; // its name from the class list ("controllerName")
    this.mode = 'keyboard'; // what happens without a controller: 'keyboard' | 'cpu'

    this.link = new ControllerLink({
      onStatus: (status, detail) => this.handleStatus(status, detail),
      onMove: (dir) => {
        this.controllerDir = dir;
        if (dir !== 0) {
          this.lastInputAt = performance.now();
          this.position = null; // UP or DOWN: back to buttons (NEUTRAL doesn't count)
        }
      },
      onAction: (action) => this.handleAction(action),
      onConfig: (text, error) => this.handleConfig(text, error),
      onReady: () => this.changed('ready'),
    });
    this.linkStatus = 'idle';
    this.linkDetail = '';
    this.wasConnected = false;

    this.config = null; // parsed controller settings (2026 controllers)
    this.held = { looks: null, handling: null }; // settings in use while that group is held back
    this.pending = []; // groups with a change waiting
    this.controllerDir = 0;
    this.position = null; // 0 (top) – 1 (bottom) while the controller steers by position (actions channel)
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

  /**
   * The name the game shows: the name the controller gives itself (setControllerName on the
   * board), else its controllerName from the class list, else the person's name.
   */
  get name() {
    const connected = this.kind === 'controller';
    if (!connected && this.mode === 'cpu') return 'Computer';
    if (this.target === LEGACY_2024) return (connected && this.customName) || this.link.deviceName || '2024 controller';
    if (connected && this.customName) return this.customName;
    if (this.target && this.controllerName) return this.controllerName;
    if (this.person) return this.person;
    if (this.target) return `Controller ${this.target}`;
    return `Player ${this.slot}`;
  }

  /** The person's name, when it adds something to the controller's name. */
  get owner() {
    return this.person && this.person !== this.name && this.mode !== 'cpu' ? this.person : null;
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

  /** @param entry the class list entry for this controller ({name, controllerName}), if any */
  selectController(target, entry) {
    if (this.kind === 'controller') return;
    this.target = target;
    this.person = entry?.name || null;
    this.controllerName = entry?.controllerName || null;
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
      this.position = null;
      this.changed('dropped');
    } else if (status === 'lost' && previous === 'reconnecting') {
      this.changed('lost'); // automatic reconnecting gave up
    } else if (status === 'idle' || status === 'error') {
      this.position = null;
      if (this.wasConnected) this.changed('disconnected');
      this.wasConnected = false;
      this.config = null;
      this.apply();
    }
    this.changed('status');
  }

  /** Something the controller did (actions channel): steer by position, or taunt. */
  handleAction(action) {
    if (this.kind !== 'controller') return;
    if (action.type === 'position') {
      this.position = Math.min(1, Math.max(0, action.position));
      this.lastInputAt = performance.now();
    } else if (action.type === 'positionOff') {
      this.position = null;
    } else if (action.type === 'taunt') {
      this.changed('taunt', { emote: action.emote }); // the game checks permission and cooldown
    }
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

  /** What the controller is asking for right now. */
  get wants() {
    return (this.kind === 'controller' && this.config?.player) || {};
  }

  /** Keep using the current settings of these groups until release() (changes wait). */
  hold(groups) {
    groups.forEach((g) => {
      if (!this.held[g]) this.held[g] = this.wants;
    });
  }

  /** Let these groups follow the controller again; anything that was waiting applies now. */
  release(groups) {
    if (!groups.some((g) => this.held[g])) return;
    groups.forEach((g) => (this.held[g] = null));
    this.apply();
  }

  /** Combine the controller's settings with the host's permissions. Call again whenever either changes. */
  apply() {
    const allow = this.house.permissions;
    const live = this.wants;
    // While a group is held, its values come from when the hold started. Permissions still apply at once.
    const looks = this.held.looks || live;
    const handling = this.held.handling || live;

    this.customName = allow.name ? looks.name : undefined;
    this.color = allow.color && looks.color ? looks.color : this.defaultColor;
    this.rgb = parseColor(this.color);
    this.moveSpeed = allow.moveSpeed && handling.moveSpeed !== undefined ? handling.moveSpeed : this.house.data.paddleSpeed[this.index];
    this.paddleSize = allow.paddleSize && handling.paddleSize !== undefined ? handling.paddleSize : 100;
    this.requests = (this.kind === 'controller' && this.config?.requests) || {}; // used when the next match starts

    for (const [key, settingKey] of Object.entries(SOUND_KEYS)) {
      this.loadSound(key, allow.sounds ? looks[settingKey] : undefined);
    }
    this.loadMusic(allow.music ? live.music : undefined); // used when the next match starts

    // Which held groups have a change waiting? Tell the game about new ones.
    const differs = (a, b, key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]);
    const pending = Object.keys(CHANGE_GROUPS).filter(
      (g) => this.held[g] && Object.entries(CHANGE_GROUPS[g]).some(([key, permission]) => allow[permission] && differs(this.held[g], live, key))
    );
    const added = pending.filter((g) => !this.pending.includes(g));
    this.pending = pending;
    if (added.length) this.changed('held', { groups: added });
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
      person: this.owner,
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
