/*
 * DF Pong 2026 — sketch.js
 *
 * The p5.js entry point. setup() builds the game, draw() runs every frame:
 *   1. game.update()   — inputs, physics, scoring
 *   2. drawWorld()     — draw the arena into a 2D buffer (render.js)
 *   3. postfx.apply()  — optional WebGL pass on top (postfx.js)
 *
 * Based on Coding Train Challenge #67 Pong by Daniel Shiffman
 * (https://thecodingtrain.com/challenges/67-pong), ported to p5.js by madacoo,
 * then rebuilt for Bluetooth controllers by Digital Futures, OCAD University.
 *
 * Written for p5.js 2.x.
 */

let house, sound, music, effects, game, ui, admin;
let world; // 2D p5.Graphics the game is drawn into
let postfx = null; // WebGL post-processing, when available
let useWebGL = false;

async function setup() {
  house = new HouseRules(DFP.instance, DFP.defaults);
  sound = new SoundEngine(DFP.engine);
  music = new MusicPlayer(sound);
  effects = new Effects();
  game = new Game({ house, sound, effects, music });
  ui = new UI(game, { house, sound });

  // The canvas lives inside the arena element and follows its size.
  const { w, h } = arenaSize();
  useWebGL = webglAvailable();
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = createCanvas(w, h, useWebGL ? WEBGL : P2D);
  canvas.parent(ui.arena);
  world = createGraphics(w, h);
  if (useWebGL) {
    try {
      postfx = new PostFX();
    } catch (e) {
      console.warn('Post-processing unavailable:', e);
    }
  }
  window.__dfpongRenderer = useWebGL ? (postfx ? 'WebGL + post-processing' : 'WebGL') : '2D canvas';
  new ResizeObserver(() => resizeToArena()).observe(ui.arena);

  applyHouseSettings();
  house.onChange(applyHouseSettings);
  setupKeyboard();
  setupAdmin();
  if (DFP.testMode) {
    game.players[1].setMode('cpu');
  }
  if (DFP.debug || DFP.testMode) ui.toggleDrawer('debug', true);

  // Wait for the display font so the first frames don't flash a fallback.
  document.fonts?.load(`700 100px "${DISPLAY_FONT}"`).catch(() => {});
  music.ready.then(() => ui.renderRulesPreview()); // recorded tracks join the music choices
  ui.setRoster(await loadRoster());
}

function draw() {
  const dt = Math.min(deltaTime / 1000, 0.1);
  // If anything ever throws, log it and keep the game running:
  // p5 stops the draw loop for good when draw() throws.
  try {
    game.update(dt);
    drawWorld(world, game, effects, { scale: width / WORLD.w, density: pixelDensity() });
  } catch (e) {
    reportFrameError(e);
  }

  if (useWebGL) {
    clear();
    image(world, -width / 2, -height / 2, width, height);
    if (postfx && house.data.effects === 'full') postfx.apply(effects);
  } else {
    image(world, 0, 0, width, height);
  }
  try {
    ui.frame(dt, frameRate());
  } catch (e) {
    reportFrameError(e);
  }
}

let lastFrameError = 0;
function reportFrameError(e) {
  if (performance.now() - lastFrameError > 2000) console.error('DF Pong frame error (the game keeps running):', e);
  lastFrameError = performance.now();
}

function arenaSize() {
  const r = ui.arena.getBoundingClientRect();
  return { w: Math.max(150, Math.round(r.width)), h: Math.max(100, Math.round(r.height)) };
}

function resizeToArena() {
  const { w, h } = arenaSize();
  if (w === width && h === height) return;
  resizeCanvas(w, h);
  world.resizeCanvas(w, h);
}

function applyHouseSettings() {
  sound.setVolume(house.data.volume, house.data.muted);
  music.setVolume(house.data.musicVolume, house.data.muted);
  effects.setReduced(house.data.effects === 'reduced');
  if (!house.data.ambience) sound.stopAmbience();
}

// ---------------------------------------------------------------------------
// Players list
// ---------------------------------------------------------------------------

async function loadRoster() {
  try {
    const res = await fetch(`${DFP.roster}?v=${Date.now()}`);
    const data = await res.json();
    // name: the person (helps find them in the list); controllerName: what the game calls them
    const text = (value, max) => (typeof value === 'string' && value.trim() ? Array.from(value.trim()).slice(0, max).join('') : null);
    const fields = DFPONG_API.classList.fields;
    const players = (data.players || [])
      .filter((p) => p && Number.isInteger(p.deviceNumber) && p.deviceNumber >= fields.deviceNumber.min && p.deviceNumber <= fields.deviceNumber.max)
      .map((p) => ({
        deviceNumber: p.deviceNumber,
        name: text(p.name, fields.name.maxLength) || `Player ${p.deviceNumber}`,
        controllerName: text(p.controllerName, fields.controllerName.maxLength),
      }));
    return players;
  } catch (e) {
    console.warn('Could not load the players list:', e);
    game.toast('Could not load players-config.json — use "Another number…"', 'warn');
    return [];
  }
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

function setupKeyboard() {
  const typing = (e) => e.target.closest && e.target.closest('input, select, textarea');

  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    // The settings panel is open: only Esc and C (close) belong to the game
    if (ui.settingsOpen && e.code !== 'Escape' && e.code !== 'KeyC') return;
    game.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;

    switch (e.code) {
      case 'Space':
        game.primaryAction();
        break;
      case 'Enter':
        if (e.target.closest && e.target.closest('button, a')) break; // let the focused button handle it
        if (game.state === 'won' || game.state === 'paused') game.startMatch();
        break;
      case 'Escape':
        if (!ui.closeDrawers()) game.pause();
        break;
      case 'KeyC':
        ui.toggleDrawer('settings');
        break;
      case 'KeyD':
        ui.toggleDrawer('debug');
        break;
      case 'KeyM':
        house.merge({ muted: !house.data.muted });
        break;
      case 'KeyF':
        toggleFullscreen();
        break;
    }
  });
  window.addEventListener('keyup', (e) => game.keys.delete(e.code));
  window.addEventListener('blur', () => game.keys.clear());
}

// ---------------------------------------------------------------------------
// Admin panel
// ---------------------------------------------------------------------------

/** This game's id for the admin panel. It survives reloading the tab, so the admin keeps track of it. */
function gameId() {
  const key = `dfpong:game-id:${DFP.room}`;
  try {
    let id = sessionStorage.getItem(key);
    if (!id) sessionStorage.setItem(key, (id = `g-${Math.random().toString(36).slice(2, 6)}`));
    return id;
  } catch (e) {
    return null; // AdminLink picks a random one
  }
}

function setupAdmin() {
  admin = new AdminLink({
    role: 'game',
    room: DFP.room,
    relay: DFP.relay,
    id: gameId(),
    onStatus: (status) => ui.renderAdminStatus(status),
    onMessage: (msg) => {
      ui.adminHeardAt = performance.now();
      if (msg.type === 'admin:rules') {
        house.merge(msg);
        game.toast(game.inMatch && game.state !== 'won' ? 'The host updated the rules — they apply next match' : 'The host updated the rules');
      } else if (msg.type === 'admin:command') {
        game.command(msg.command);
      } else if (msg.type === 'admin:table' && msg.target === admin.id) {
        // Naming a table only ever goes to one game
        ui.setTable(msg.name);
        game.toast(DFP.table ? `This game is now “${DFP.table}”` : 'This game has no table name now');
      }
      publishState();
    },
  });
  ui.renderAdminStatus(admin.status());

  // Tell admins what's happening: on every change, and every 2 seconds.
  let queued = false;
  const publishSoon = () => {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      publishState();
    }, 150);
  };
  ['state', 'score', 'players', 'rules', 'table'].forEach((event) => game.on(event, publishSoon));
  house.onChange(publishSoon);
  setInterval(publishState, 2000);
  publishState();
}

function publishState() {
  admin.send({ type: 'game:state', id: admin.id, instance: DFP.instance, title: DFP.title, table: DFP.table, ...game.snapshot() });
}
