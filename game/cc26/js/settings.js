/*
 * settings.js — what can be customized, and who gets to decide.
 *
 * Three layers of settings:
 *   1. HOUSE RULES  – the room's defaults. Edited in the settings drawer or
 *                     the admin panel, saved in this browser.
 *   2. PLAYER       – a controller's own look and feel (color, sounds, speed…).
 *                     Only affects that player, so there is never a conflict.
 *   3. REQUESTS     – a controller asking for a game rule (e.g. "play to 7").
 *                     Both players can ask, so requests are resolved when the
 *                     match starts (see resolveMatchRules).
 *
 * What can be set, with ranges, defaults and names, comes from the DFPONG API
 * (js/api.js, generated from api/dfpong-api.json; reference in docs/API.md).
 * The step-by-step protocol is in docs/PROTOCOL.md.
 */

// Instance configuration comes from window.DFPONG in the instance's index.html.
const DFP = Object.assign(
  {
    instance: 'dfpong',
    title: 'DF Pong',
    engine: './',
    roster: 'players-config.json',
    relay: null,
    github: null,
    defaults: {},
    testMode: false,
  },
  window.DFPONG || {}
);

// URL parameters override the instance config: ?relay=wss://…&room=…&debug=1
(() => {
  const params = new URLSearchParams(location.search);
  if (params.has('relay')) DFP.relay = params.get('relay') || null;
  DFP.room = params.get('room') || DFP.room || DFP.instance;
  if (params.has('debug')) DFP.debug = params.get('debug') !== '0';
  if (params.has('test')) DFP.testMode = params.get('test') !== '0';
})();

// Table name ("Table A"): tells games apart when several run at once in the same room.
// Remembered by this tab (so two windows can differ) and on this computer (for new tabs);
// ?table=… in the address overrides both.
const TABLE_KEY = `dfpong:2026:${DFP.instance}:table`;

function cleanTableName(value) {
  return typeof value === 'string' ? Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, 24).join('') : '';
}

DFP.table = (() => {
  const fromUrl = new URLSearchParams(location.search).get('table');
  if (fromUrl !== null) return cleanTableName(fromUrl);
  try {
    const thisTab = sessionStorage.getItem(TABLE_KEY);
    return cleanTableName(thisTab !== null ? thisTab : localStorage.getItem(TABLE_KEY) || '');
  } catch (e) {
    return '';
  }
})();

function setTableName(value) {
  DFP.table = cleanTableName(value);
  try {
    sessionStorage.setItem(TABLE_KEY, DFP.table);
    if (DFP.table) localStorage.setItem(TABLE_KEY, DFP.table);
    else localStorage.removeItem(TABLE_KEY);
  } catch (e) {
    /* storage blocked: the name lasts until the page reloads */
  }
  return DFP.table;
}

// Black, white and grey. Color only appears when a controller brings its own.
const PALETTE = {
  background: '#121211',
  ink: '#ece8df',
  dim: '#8a867d',
  line: 'rgba(236, 232, 223, 0.12)',
  p1: '#ece8df', // default paddle colors: off-white, like the original
  p2: '#ece8df',
};

// ---------------------------------------------------------------------------
// Schema: the tables below are built from the DFPONG API (js/api.js)
// ---------------------------------------------------------------------------

/** The API's entries without its "$comment" notes */
const apiEntries = (obj) => Object.entries(obj).filter(([key]) => !key.startsWith('$'));
const apiFields = (obj, fields) => Object.fromEntries(fields.filter((f) => obj[f] !== undefined).map((f) => [f, obj[f]]));
const apiDefault = (obj) => apiEntries(obj).find(([, o]) => o.default)[0];

// Rule requests: shared, settled when the match starts
const GAME_SETTINGS = Object.fromEntries(
  apiEntries(DFPONG_API.settings)
    .filter(([, s]) => s.kind === 'request')
    .map(([key, s]) => [key, apiFields(s, ['label', 'min', 'max', 'step', 'default'])])
);

// Player settings: only change that player's side
const PLAYER_SETTINGS = Object.fromEntries(
  apiEntries(DFPONG_API.settings)
    .filter(([, s]) => s.kind === 'player')
    .map(([key, s]) => [key, apiFields(s, ['type', 'label', 'maxLength', 'min', 'max', 'step', 'default', 'permission'])])
);

const PERMISSIONS = Object.fromEntries(apiEntries(DFPONG_API.permissions).filter(([, p]) => !p.hidden).map(([key, p]) => [key, p.label])); // hidden ones have no switch and stay off
const POLICIES = Object.fromEntries(apiEntries(DFPONG_API.policies).map(([key, p]) => [key, p.label]));

// When a controller's own changes take effect during a match (house.data.liveChanges).
// Rule requests and music always wait for the next match: both players share them.
const LIVE_CHANGES = Object.fromEntries(apiEntries(DFPONG_API.liveChanges).map(([key, o]) => [key, { label: o.label, help: o.help }]));

// Built-in sounds. Every name here always works (they ship with the game).
const BUILTIN_SOUNDS = apiEntries(DFPONG_API.sounds).map(([name]) => name);

// Computer opponent difficulty
const CPU_LEVELS = {
  min: 1,
  max: 10,
  /** reaction speed: 0.4 (slow) … 1 (fastest) */
  skill: (level) => 0.4 + (0.6 * (level - 1)) / 9,
  /** chance of misplaying a return: 45% at level 1, falling evenly to 0% at level 10 */
  miss: (level) => (0.45 * (10 - level)) / 9,
  label: (level) => (level <= 3 ? 'Easy' : level <= 6 ? 'Medium' : level <= 8 ? 'Hard' : 'Expert'),
};

const MAX_CONFIG_BYTES = DFPONG_API.bluetooth.characteristics.config.maxBytes;
const CONTROLLER_NUMBERS = DFPONG_API.bluetooth.controllerNumber; // {min: 1, max: 242}

// Only an object's own keys count ("constructor" or "__proto__" must never look like a setting or a sound).
const hasOwn = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);
const MAX_SOUND_URL = 300;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clampToStep(value, spec) {
  const clamped = Math.min(spec.max, Math.max(spec.min, value));
  const stepped = Math.round(clamped / spec.step) * spec.step;
  // Avoid floating point noise like 0.15000000000000002
  return Number(stepped.toFixed(4));
}

function formatSetting(key, value) {
  if (value === undefined || value === null) return '—';
  if (key === 'speedIncrement') return '+' + Number(value).toFixed(2);
  if (key === 'puckSpeed') return Number.isInteger(value) ? String(value) : Number(value).toFixed(1);
  if (key === 'paddleSize') return value + '%';
  return String(value);
}

// Parse any CSS color into {r, g, b}. Returns null if the browser can't read it.
const _colorProbe = document.createElement('canvas').getContext('2d');
function parseColor(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  const value = input.trim();
  if (window.CSS && CSS.supports && !CSS.supports('color', value)) return null;
  _colorProbe.fillStyle = '#000000';
  _colorProbe.fillStyle = value;
  const normalized = _colorProbe.fillStyle; // "#rrggbb" or "rgba(…)"
  if (normalized.startsWith('#')) {
    const n = parseInt(normalized.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const m = normalized.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b] = m[1].split(',').map((s) => parseFloat(s));
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

function toHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function luminance({ r, g, b }) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Lighten a color until it stands out against the dark field.
function ensureVisible(rgb, minLuminance = 0.09) {
  let c = { ...rgb };
  let steps = 0;
  while (luminance(c) < minLuminance && steps < 40) {
    c = { r: c.r + (255 - c.r) * 0.08, g: c.g + (255 - c.g) * 0.08, b: c.b + (255 - c.b) * 0.08 };
    steps++;
  }
  return { color: { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }, adjusted: steps > 0 };
}

function mixColor(a, b, t) {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

function rgba({ r, g, b }, alpha = 1) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

// A sound setting is either a built-in name or a web address.
function parseSoundSetting(value) {
  if (typeof value !== 'string' || !value.trim()) return { error: 'should be a sound name or web address' };
  const text = value.trim();
  const lower = text.toLowerCase();
  if (BUILTIN_SOUNDS.includes(lower) || hasOwn(window.SOUND_LIBRARY, lower)) {
    return { kind: 'builtin', name: lower, label: lower };
  }
  if (text.length > MAX_SOUND_URL) return { error: 'web address is too long' };
  let url;
  try {
    url = new URL(text, location.href);
  } catch (e) {
    return { error: `"${text}" is not a built-in sound or a web address` };
  }
  if (url.protocol === 'http:') url.protocol = 'https:'; // http is blocked on https pages
  if (url.protocol !== 'https:' && url.origin !== location.origin) {
    return { error: 'web address must start with https://' };
  }
  // A bare word that isn't a known sound resolves to a relative URL — that's a typo, not a file.
  if (!/[/.]/.test(text)) return { error: `"${text}" is not a built-in sound name` };
  const file = url.pathname.split('/').pop() || url.hostname;
  let label = file;
  try {
    label = decodeURIComponent(file);
  } catch (e) {
    /* a stray % in the name: show it as typed */
  }
  return { kind: 'url', url: url.href, label };
}

// Music is a track name from the game's music library, or a web address.
function parseMusicSetting(value) {
  if (typeof value !== 'string' || !value.trim()) return { error: 'should be a music name or web address' };
  const lower = value.trim().toLowerCase();
  if (hasOwn(window.MUSIC_LIBRARY, lower) || (typeof GENERATED_TRACKS !== 'undefined' && hasOwn(GENERATED_TRACKS, lower))) {
    return { kind: 'builtin', name: lower, label: lower };
  }
  if (BUILTIN_SOUNDS.includes(lower) || hasOwn(window.SOUND_LIBRARY, lower)) return { error: `"${value.trim()}" is a sound, not a music track` };
  if (!/[/.]/.test(value)) return { error: `"${value.trim()}" isn't one of the game's music tracks` };
  return parseSoundSetting(value);
}

// ---------------------------------------------------------------------------
// Controller config (the JSON a 2026 controller publishes over Bluetooth)
// ---------------------------------------------------------------------------

/**
 * Validate the JSON text read from a controller.
 * Never throws: anything wrong becomes an "issue" and falls back to defaults.
 */
function parseControllerConfig(text) {
  const result = { version: null, player: {}, requests: {}, issues: [], notes: [], unknown: [], raw: text || '' };
  const clean = (text || '').replace(/\0/g, '').trim();
  if (!clean) return result;
  if (clean.length > MAX_CONFIG_BYTES * 2) {
    result.issues.push('settings are too long — using defaults');
    return result;
  }

  let data;
  try {
    data = JSON.parse(clean);
  } catch (e) {
    result.issues.push('settings could not be read (invalid JSON) — using defaults');
    return result;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    result.issues.push('settings must be a JSON object — using defaults');
    return result;
  }

  for (const [key, value] of Object.entries(data)) {
    try {
      validateSetting(key, value, result);
    } catch (e) {
      result.issues.push(`${key}: could not be read — using default`);
    }
  }
  return result;
}

/** A short, safe description of any value for messages. */
function show(value) {
  try {
    return JSON.stringify(value).slice(0, 40);
  } catch (e) {
    return 'that value';
  }
}

function validateSetting(key, value, result) {
  if (key === 'v') {
    result.version = Number(value) || null;
    return;
  }
  const spec = hasOwn(PLAYER_SETTINGS, key) ? PLAYER_SETTINGS[key] : hasOwn(GAME_SETTINGS, key) ? GAME_SETTINGS[key] : null;
  if (!spec) {
    result.unknown.push(String(key).slice(0, 30));
    return;
  }
  const target = hasOwn(PLAYER_SETTINGS, key) ? result.player : result.requests;
  const type = spec.type || 'number';

  if (type === 'number') {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : NaN;
    if (!Number.isFinite(n)) {
      result.issues.push(`${key}: "${value}" is not a number — using default`);
      return;
    }
    const fixed = clampToStep(n, spec);
    if (fixed !== n) result.notes.push(`${key} ${n} → ${fixed} (allowed ${spec.min}–${spec.max})`);
    target[key] = fixed;
  } else if (type === 'text') {
    if (typeof value !== 'string') {
      result.issues.push(`${key}: should be text — ignored`);
      return;
    }
    // Count characters, not UTF-16 units, so an emoji is never cut in half
    const t = Array.from(value.replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, spec.maxLength).join('');
    if (t) target[key] = t;
  } else if (type === 'color') {
    const rgb = parseColor(value);
    if (!rgb) {
      result.issues.push(`color: "${value}" is not a color — using default`);
      return;
    }
    const visible = ensureVisible(rgb);
    if (visible.adjusted) result.notes.push(`color ${value} lightened so it shows on the dark field`);
    target[key] = toHex(visible.color);
  } else if (type === 'music') {
    const music = parseMusicSetting(value);
    if (music.error) {
      result.issues.push(`${key}: ${music.error} — using the room's music`);
      return;
    }
    target[key] = music;
  } else if (type === 'sound') {
    const sound = parseSoundSetting(value);
    if (sound.error) {
      result.issues.push(`${key}: ${sound.error} — using default`);
      return;
    }
    target[key] = sound;
  }
}

// ---------------------------------------------------------------------------
// House rules (persisted per instance in localStorage)
// ---------------------------------------------------------------------------

class HouseRules {
  constructor(instance, instanceDefaults = {}) {
    this.storageKey = `dfpong:2026:${instance}`;
    this.listeners = [];
    const rules = {};
    for (const [key, spec] of Object.entries(GAME_SETTINGS)) {
      const d = instanceDefaults[key];
      rules[key] = Number.isFinite(d) ? clampToStep(d, spec) : spec.default;
    }
    this.defaults = {
      rules,
      locks: { pointsToWin: false, puckSpeed: false, speedIncrement: false },
      policy: apiDefault(DFPONG_API.policies),
      permissions: Object.fromEntries(Object.keys(PERMISSIONS).map((key) => [key, true])),
      liveChanges: apiDefault(DFPONG_API.liveChanges), // see LIVE_CHANGES
      music: 'auto', // 'auto' (players' choice) | 'off' | 'p1' | 'p2' | a track name
      musicVolume: 0.5,
      paddleSpeed: [10, 10], // used by keyboard players, and by controllers that don't set moveSpeed
      cpuLevel: [6, 6], // computer difficulty for each side, 1 (easy) to 10 (expert)
      volume: 0.8,
      muted: false,
      ambience: true,
      effects: window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full',
    };
    this.data = structuredClone(this.defaults);
    this.load();
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
      if (saved) this.merge(saved, { save: false, notify: false });
    } catch (e) {
      /* storage blocked or corrupt — keep defaults */
    }
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    } catch (e) {
      /* private mode — settings just won't persist */
    }
  }

  reset() {
    this.data = structuredClone(this.defaults);
    this.save();
    this.emit();
  }

  /** Merge a partial update (from the settings drawer or the admin panel). Every value is validated. */
  merge(update, { save = true, notify = true } = {}) {
    if (!update || typeof update !== 'object') return;
    const d = this.data;
    if (update.rules && typeof update.rules === 'object') {
      for (const [key, spec] of Object.entries(GAME_SETTINGS)) {
        const n = Number(update.rules[key]);
        if (update.rules[key] !== undefined && Number.isFinite(n)) d.rules[key] = clampToStep(n, spec);
      }
    }
    if (update.locks && typeof update.locks === 'object') {
      for (const key of Object.keys(GAME_SETTINGS)) {
        if (typeof update.locks[key] === 'boolean') d.locks[key] = update.locks[key];
      }
    }
    if (typeof update.policy === 'string' && hasOwn(POLICIES, update.policy)) d.policy = update.policy;
    if (typeof update.liveChanges === 'string' && hasOwn(LIVE_CHANGES, update.liveChanges)) d.liveChanges = update.liveChanges;
    if (update.permissions && typeof update.permissions === 'object') {
      for (const key of Object.keys(PERMISSIONS)) {
        if (typeof update.permissions[key] === 'boolean') d.permissions[key] = update.permissions[key];
      }
    }
    if (Array.isArray(update.cpuLevel)) {
      update.cpuLevel.slice(0, 2).forEach((v, i) => {
        const n = Math.round(Number(v));
        if (Number.isFinite(n)) d.cpuLevel[i] = Math.min(CPU_LEVELS.max, Math.max(CPU_LEVELS.min, n));
      });
    }
    if (Array.isArray(update.paddleSpeed)) {
      update.paddleSpeed.slice(0, 2).forEach((v, i) => {
        const n = Number(v);
        if (Number.isFinite(n)) d.paddleSpeed[i] = clampToStep(n, PLAYER_SETTINGS.moveSpeed);
      });
    }
    if (Number.isFinite(Number(update.volume))) d.volume = Math.min(1, Math.max(0, Number(update.volume)));
    if (Number.isFinite(Number(update.musicVolume))) d.musicVolume = Math.min(1, Math.max(0, Number(update.musicVolume)));
    if (typeof update.music === 'string' && /^[a-z0-9_-]{1,32}$/.test(update.music)) d.music = update.music;
    if (typeof update.muted === 'boolean') d.muted = update.muted;
    if (typeof update.ambience === 'boolean') d.ambience = update.ambience;
    if (update.effects === 'full' || update.effects === 'reduced') d.effects = update.effects;
    if (save) this.save();
    if (notify) this.emit();
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this.data));
  }

  get rules() { return this.data.rules; }
  get locks() { return this.data.locks; }
  get policy() { return this.data.policy; }
  get permissions() { return this.data.permissions; }
}

// How long a save to GitHub is remembered while the site catches up. A deploy
// usually takes about 2 minutes, but one that fails can take 10 to say so.
const CLASS_LIST_SAVED_MS = 15 * 60 * 1000;

/**
 * The class list: players-config.json, plus changes made in Settings → Players.
 * The changes stay in this browser until they're saved to GitHub (see
 * ClassListPublisher) or put in a downloaded file. Only the changes are kept, so
 * a newer file still shows up.
 *
 * Three layers, each on top of the one before:
 *   file     what the site served
 *   saved    sent to GitHub, but the site hasn't caught up yet
 *   changes  not sent anywhere yet
 */
class ClassList {
  constructor(instance) {
    this.storageKey = `dfpong:2026:${instance}:players`;
    this.savedKey = `${this.storageKey}:saved`;
    this.file = new Map();
    this.changes = new Map(); // number → { deviceNumber, name, controllerName }, or null when removed
    this.saved = new Map(); // the same, for what's on GitHub but not on the site yet
    this.savedAt = 0;
    try {
      this.readEntries(JSON.parse(localStorage.getItem(this.storageKey) || 'null'), this.changes);
      const saved = JSON.parse(localStorage.getItem(this.savedKey) || 'null');
      if (saved && Number.isFinite(saved.at)) {
        this.savedAt = saved.at;
        this.readEntries(saved.entries, this.saved);
      }
    } catch (e) {
      /* storage blocked or corrupt: just the file, then */
    }
  }

  readEntries(stored, into) {
    for (const [key, change] of Object.entries(stored || {})) {
      const number = Number(key);
      if (!this.validNumber(number) || typeof change !== 'object') continue;
      into.set(number, change === null ? null : this.clean(number, change));
    }
  }

  validNumber(n) {
    const { min, max } = DFPONG_API.classList.fields.deviceNumber;
    return Number.isInteger(n) && n >= min && n <= max;
  }

  clean(deviceNumber, { name, controllerName } = {}) {
    const fields = DFPONG_API.classList.fields;
    const text = (value, max) => (typeof value === 'string' && value.trim() ? Array.from(value.trim()).slice(0, max).join('') : null);
    // name: the person (helps find them in the list); controllerName: what the game calls them
    return {
      deviceNumber,
      name: text(name, fields.name.maxLength) || `Player ${deviceNumber}`,
      controllerName: text(controllerName, fields.controllerName.maxLength),
    };
  }

  same(a, b) {
    return !!a && !!b && a.name === b.name && a.controllerName === b.controllerName;
  }

  /** Does a change (null: removed) say what the list already says? */
  matches(change, entry) {
    return change ? this.same(change, entry) : !entry;
  }

  parse(players) {
    const parsed = new Map();
    for (const p of Array.isArray(players) ? players : []) {
      if (p && this.validNumber(p.deviceNumber) && !parsed.has(p.deviceNumber)) parsed.set(p.deviceNumber, this.clean(p.deviceNumber, p));
    }
    return parsed;
  }

  sorted(entries) {
    return [...entries.values()].filter(Boolean).sort((a, b) => a.deviceNumber - b.deviceNumber);
  }

  /** The players in the file. Changes the file has caught up with are dropped. */
  setFile(players) {
    this.file = this.parse(players);
    if (Date.now() - this.savedAt > CLASS_LIST_SAVED_MS) this.saved.clear();
    for (const [number, entry] of this.saved) {
      if (this.matches(entry, this.file.get(number))) this.saved.delete(number);
    }
    for (const [number, change] of this.changes) {
      if (this.matches(change, this.published(number))) this.changes.delete(number);
    }
    this.save();
  }

  save() {
    const store = (key, value) => {
      if (value) localStorage.setItem(key, JSON.stringify(value));
      else localStorage.removeItem(key);
    };
    try {
      store(this.storageKey, this.changes.size ? Object.fromEntries(this.changes) : null);
      store(this.savedKey, this.saved.size ? { at: this.savedAt, entries: Object.fromEntries(this.saved) } : null);
    } catch (e) {
      /* private mode: changes last until the page closes */
    }
  }

  get players() {
    return this.sorted(new Map([...this.file, ...this.saved, ...this.changes]));
  }

  get changeCount() {
    return this.changes.size;
  }

  /** Saved to GitHub, and the site hasn't caught up yet. */
  get waitingForSite() {
    return this.saved.size > 0;
  }

  /** This player as the last save left them, without this browser's changes. */
  published(number) {
    return this.saved.has(number) ? this.saved.get(number) : this.file.get(number) || null;
  }

  get(number) {
    return this.changes.has(number) ? this.changes.get(number) : this.published(number);
  }

  /** The lowest free number. */
  nextNumber() {
    let n = DFPONG_API.classList.fields.deviceNumber.min;
    while (this.get(n)) n++;
    return n;
  }

  /** Why this number can't be used, or null if it can. */
  numberProblem(number) {
    const { min, max } = DFPONG_API.classList.fields.deviceNumber;
    if (!this.validNumber(number)) return `Numbers go from ${min} to ${max}`;
    const holder = this.get(number);
    return holder ? `Number ${number} is already ${holder.name}` : null;
  }

  set(number, fields) {
    const entry = this.clean(number, fields);
    if (this.same(entry, this.published(number))) this.changes.delete(number);
    else this.changes.set(number, entry);
    this.save();
    return entry;
  }

  /** @returns why it couldn't be added, or null */
  add(number, fields) {
    const problem = this.numberProblem(number);
    if (!problem) this.set(number, fields);
    return problem;
  }

  update(number, fields) {
    return this.set(number, { ...this.get(number), ...fields });
  }

  /** @returns why the number couldn't change, or null */
  renumber(from, to) {
    if (from === to) return null;
    const problem = this.numberProblem(to);
    if (problem) return problem;
    const entry = this.get(from);
    this.remove(from);
    this.set(to, entry);
    return null;
  }

  remove(number) {
    if (this.published(number)) this.changes.set(number, null);
    else this.changes.delete(number);
    this.save();
  }

  /** Undo this browser's changes. What was already saved to GitHub stays. */
  revert() {
    this.changes.clear();
    this.save();
  }

  fileText(players) {
    const lines = players.map(
      (p) => `    { "deviceNumber": ${p.deviceNumber}, "name": ${JSON.stringify(p.name)}, "controllerName": ${JSON.stringify(p.controllerName || '')} }`
    );
    return `{\n  "players": [\n${lines.join(',\n')}\n  ]\n}\n`;
  }

  /** The list as a players-config.json file. */
  toFile() {
    return this.fileText(this.players);
  }

  /** Is this list (from GitHub) the one this browser's changes were made on? */
  isPublished(players) {
    const published = new Map([...this.file, ...this.saved]);
    return this.fileText(this.sorted(this.parse(players))) === this.fileText(this.sorted(published));
  }

  /** Is this list (from GitHub) the same as what this browser shows? */
  isCurrent(players) {
    return this.fileText(this.sorted(this.parse(players))) === this.toFile();
  }

  /** GitHub has a newer list than the site showed: put this browser's changes on top of it. */
  adopt(players) {
    this.saved.clear();
    this.setFile(players);
  }

  /** These changes are on GitHub now. They count as saved until the site catches up. */
  markSaved(sent) {
    this.savedAt = Date.now();
    for (const [number, entry] of sent) {
      this.saved.set(number, entry);
      // Edited again while the save was on its way: that edit is still a change
      if (JSON.stringify(this.changes.get(number)) === JSON.stringify(entry)) this.changes.delete(number);
    }
    this.save();
  }

  /** Changed names that look like more than a first name. The repo is public. */
  doubtfulNames() {
    return [...this.changes.values()]
      .filter((entry) => entry && /[\s@]/.test(entry.name) && !/^Player \d+$/.test(entry.name))
      .map((entry) => entry.name);
  }
}

/**
 * Saves the class list to players-config.json in the game's GitHub repo, so every
 * computer gets it. A page on GitHub Pages can't write to its own files, but it can
 * ask GitHub's API to commit one, with an access token from someone allowed to.
 * The token is pasted in by the host and kept only in this browser. It never goes
 * anywhere except api.github.com.
 *
 * Set by `github: { repo, path, branch }` in the game's index.html.
 */
class ClassListPublisher {
  // The token isn't per game: one token works for every game in the repo
  constructor(classList, config, tokenKey = 'dfpong:2026:github-token') {
    this.classList = classList;
    this.config = config && config.repo && config.path ? { branch: 'main', ...config } : null;
    this.tokenKey = tokenKey;
    this.heldToken = null;
    try {
      this.heldToken = sessionStorage.getItem(this.tokenKey) || localStorage.getItem(this.tokenKey);
    } catch (e) {
      /* storage blocked: the token lasts until the page closes */
    }
  }

  get available() {
    return !!this.config;
  }

  get token() {
    return this.heldToken;
  }

  /** Is the token kept on this computer, rather than just this tab? */
  get tokenRemembered() {
    try {
      return !!this.heldToken && localStorage.getItem(this.tokenKey) === this.heldToken;
    } catch (e) {
      return false;
    }
  }

  /** Where to create a token, with the form filled in as far as GitHub allows. */
  get tokenLink() {
    const params = new URLSearchParams({
      name: `DF Pong class list ${this.config.repo.split('/')[1]}`.slice(0, 40),
      description: 'Lets the DF Pong game save its class list (Settings > Players).',
      target_name: this.config.repo.split('/')[0],
      expires_in: '90',
      contents: 'write',
    });
    return `https://github.com/settings/personal-access-tokens/new?${params}`;
  }

  /** @returns false if it can't be a token */
  setToken(value, remember = false) {
    const token = String(value ?? '').trim();
    if (!/^[\w-]+$/.test(token)) return false;
    this.forgetToken();
    this.heldToken = token;
    try {
      (remember ? localStorage : sessionStorage).setItem(this.tokenKey, token);
    } catch (e) {
      /* storage blocked: the token lasts until the page closes */
    }
    return true;
  }

  forgetToken() {
    this.heldToken = null;
    try {
      sessionStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.tokenKey);
    } catch (e) {
      /* nothing was stored, then */
    }
  }

  async request(method, query = '', body = null) {
    const { repo, path } = this.config;
    const url = `https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}${query}`;
    let res;
    try {
      res = await fetch(url, {
        method,
        cache: 'no-store', // GitHub's answers can be cached for a minute: this has to be the latest
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (e) {
      return { outcome: 'offline' };
    }
    if (res.ok) return { data: await res.json() };
    const outcome = { 401: 'token', 403: 'denied', 404: 'missing', 409: 'conflict' }[res.status] || 'error';
    const detail = await res.json().then((d) => d.message, () => '');
    return { outcome, detail: detail || `HTTP ${res.status}` };
  }

  /** The list on GitHub right now. */
  async read() {
    const { branch } = this.config;
    const answer = await this.request('GET', `?ref=${encodeURIComponent(branch)}`);
    if (!answer.data) return answer;
    try {
      const bytes = Uint8Array.from(atob(answer.data.content.replace(/\s/g, '')), (c) => c.charCodeAt(0));
      const { players } = JSON.parse(new TextDecoder().decode(bytes));
      if (!Array.isArray(players)) throw new Error('no players');
      return { players, sha: answer.data.sha };
    } catch (e) {
      return { outcome: 'unreadable' }; // never write over a file this can't read
    }
  }

  /**
   * @returns {{outcome: string, detail?: string}} outcome is one of:
   *   saved       on GitHub; the site updates next
   *   nothing     GitHub already has this list
   *   changed     someone else saved first; this browser now shows their list with its changes on top
   *   conflict    GitHub kept saying the file had just changed
   *   token       GitHub doesn't accept the token (it's forgotten)
   *   denied      the token can't change this repo
   *   missing     GitHub can't find the file, or the token can't see the repo
   *   unreadable  the file on GitHub isn't a class list
   *   offline     couldn't reach GitHub
   *   error       anything else, in detail
   * Unless the outcome is saved, this browser's changes are all still here.
   */
  async save() {
    const list = this.classList;
    for (let attempt = 0; attempt < 2; attempt++) {
      const latest = await this.read();
      if (!latest.players) return this.failed(latest);
      if (!list.isPublished(latest.players)) {
        list.adopt(latest.players);
        return { outcome: 'changed' };
      }
      if (list.isCurrent(latest.players)) {
        list.adopt(latest.players);
        return { outcome: 'nothing' };
      }
      const sent = new Map(list.changes);
      const content = new TextEncoder().encode(list.toFile());
      const written = await this.request('PUT', '', {
        message: `Class list: ${sent.size} ${sent.size === 1 ? 'change' : 'changes'} from Settings > Players`,
        content: btoa(Array.from(content, (byte) => String.fromCharCode(byte)).join('')),
        sha: latest.sha,
        branch: this.config.branch,
      });
      if (written.data) {
        list.markSaved(sent);
        return { outcome: 'saved' };
      }
      if (written.outcome !== 'conflict') return this.failed(written);
      // The file changed in the moment since it was read. Look again, once.
    }
    return { outcome: 'conflict' };
  }

  failed(answer) {
    if (answer.outcome === 'token') this.forgetToken();
    return answer;
  }
}

// ---------------------------------------------------------------------------
// Resolving the two players' requests into one set of match rules
// ---------------------------------------------------------------------------

/**
 * @param house    HouseRules
 * @param players  [{name, requests}, {name, requests}] — requests may be empty
 * @returns {rules, notes, hasRequests}
 */
function resolveMatchRules(house, players) {
  const rules = {};
  const notes = [];
  let hasRequests = false;
  const allowRequests = house.permissions.requests && house.policy !== 'house';

  for (const [key, spec] of Object.entries(GAME_SETTINGS)) {
    const houseValue = house.rules[key];
    const asks = players.map((p) => (allowRequests && p && p.requests ? p.requests[key] : undefined));
    const names = players.map((p, i) => (p ? p.name : `Player ${i + 1}`));
    const note = { key, label: spec.label, value: houseValue, source: 'house', detail: '', asks, names };

    if (asks.some((a) => a !== undefined)) hasRequests = true;

    if (house.locks[key]) {
      note.source = 'locked';
      note.detail = asks.some((a) => a !== undefined) ? 'locked by the host — requests ignored' : 'locked by the host';
    } else if (asks[0] !== undefined && asks[1] !== undefined) {
      if (asks[0] === asks[1]) {
        note.value = asks[0];
        note.source = 'agreed';
        note.detail = 'both players asked for this';
      } else {
        note.source = 'conflict';
        const [a, b] = asks;
        switch (house.policy) {
          case 'random': {
            const pick = Math.random() < 0.5 ? 0 : 1;
            note.value = asks[pick];
            note.winner = pick;
            note.detail = `${names[0]} asked ${formatSetting(key, a)}, ${names[1]} asked ${formatSetting(key, b)} — coin flip: ${names[pick]}`;
            break;
          }
          case 'lower':
            note.value = Math.min(a, b);
            note.detail = `${names[0]} asked ${formatSetting(key, a)}, ${names[1]} asked ${formatSetting(key, b)} — lower wins`;
            break;
          case 'higher':
            note.value = Math.max(a, b);
            note.detail = `${names[0]} asked ${formatSetting(key, a)}, ${names[1]} asked ${formatSetting(key, b)} — higher wins`;
            break;
          default:
            note.value = clampToStep((a + b) / 2, spec);
            note.detail = `${names[0]} asked ${formatSetting(key, a)}, ${names[1]} asked ${formatSetting(key, b)} — meet in the middle`;
        }
      }
    } else if (asks[0] !== undefined || asks[1] !== undefined) {
      const who = asks[0] !== undefined ? 0 : 1;
      note.value = asks[who];
      note.source = 'request';
      note.detail = `${names[who]}'s request`;
    }
    rules[key] = note.value;
    notes.push(note);
  }
  return { rules, notes, hasRequests };
}

// ---------------------------------------------------------------------------
// Which music plays
// ---------------------------------------------------------------------------

/**
 * The room's music choice (house.data.music) combined with what the players brought.
 *   auto  "Players' choice": one player's music → theirs; both → alternate each point;
 *         nobody → the room's default track
 *   p1/p2 just that player's music (choosing one when both brought some)
 *   off   silence
 *   name  a track from the library, whatever the players brought
 * @param players [{name, music}]: music is a playable track or null
 * @returns {mode: 'off'|'single'|'alternate', tracks, label, detail, fromPlayers, unused}
 *   unused: indexes of players whose music won't play because the room chose something else
 */
function resolveMusic(house, players, defaultTrack) {
  const allowed = house.permissions.music;
  const picks = players.map((p) => (allowed && p && p.music ? p.music : null));
  const names = players.map((p, i) => (p ? p.name : `Player ${i + 1}`));
  const plan = planMusic(house.data.music, picks, names, defaultTrack);
  plan.unused = picks.flatMap((pick, i) => (pick && !plan.tracks.some((t) => trackKey(t) === trackKey(pick)) ? [i] : []));
  return plan;
}

function planMusic(choice, picks, names, defaultTrack) {
  const single = (track, label, detail, fromPlayers = false) =>
    track ? { mode: 'single', tracks: [track], label, detail, fromPlayers } : { mode: 'off', tracks: [], label: 'Off', detail: '', fromPlayers: false };

  if (choice === 'off') return single(null);
  if ((choice === 'p1' || choice === 'p2') && picks[choice === 'p1' ? 0 : 1]) {
    const i = choice === 'p1' ? 0 : 1;
    return single(picks[i], `${names[i]}'s pick`, picks[i].label, true);
  }
  if (choice !== 'auto' && choice !== 'p1' && choice !== 'p2' && hasOwn(window.MUSIC_LIBRARY, choice)) {
    const track = trackFromName(choice);
    return single(track, track.label, trackSource(track));
  }
  // Players' choice
  if (picks[0] && picks[1]) {
    if (trackKey(picks[0]) === trackKey(picks[1])) return single(picks[0], 'Both picked', picks[0].label, true);
    return {
      mode: 'alternate',
      tracks: picks,
      label: 'Alternating',
      detail: `${names[0]}'s and ${names[1]}'s picks swap each point`,
      fromPlayers: true,
    };
  }
  if (picks[0] || picks[1]) {
    const i = picks[0] ? 0 : 1;
    return single(picks[i], `${names[i]}'s pick`, picks[i].label, true);
  }
  return single(defaultTrack, defaultTrack ? defaultTrack.label : 'Off', defaultTrack ? trackSource(defaultTrack) : '');
}
