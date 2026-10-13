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

const PERMISSIONS = Object.fromEntries(apiEntries(DFPONG_API.permissions).map(([key, p]) => [key, p.label]));
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
 * @returns {mode: 'off'|'single'|'alternate', tracks, label, detail, fromPlayers}
 */
function resolveMusic(house, players, defaultTrack) {
  const allowed = house.permissions.music;
  const picks = players.map((p) => (allowed && p && p.music ? p.music : null));
  const names = players.map((p, i) => (p ? p.name : `Player ${i + 1}`));
  const choice = house.data.music;
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
