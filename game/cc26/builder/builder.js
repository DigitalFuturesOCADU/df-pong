/*
 * Settings Builder — design a controller's custom settings, test sound
 * addresses exactly the way the game loads them, and generate the code.
 */

const sound = new SoundEngine(DFP.engine);
const music = new MusicPlayer(sound);
const form = document.querySelector('.builder-form');
const f = form.elements;

const SOUND_ROWS = [
  { key: 'hitSound', label: 'Paddle hit', method: 'setHitSound', limit: SOUND_LIMITS.hit },
  { key: 'scoreSound', label: 'When you score', method: 'setScoreSound', limit: SOUND_LIMITS.score },
  { key: 'winSound', label: 'When you win', method: 'setWinSound', limit: SOUND_LIMITS.win },
];

// Library function for each rule request, from the DFPONG API (e.g. pointsToWin → requestPointsToWin)
const REQUEST_METHODS = Object.fromEntries(Object.keys(GAME_SETTINGS).map((key) => [key, DFPONG_API.settings[key].library]));

const tested = {}; // sound key → {ok, sound, via, …} for the current address

// ---------------------------------------------------------------------------
// Build the form
// ---------------------------------------------------------------------------

document.querySelector('.sounds').insertAdjacentHTML(
  'beforeend',
  SOUND_ROWS.map(
    (row) => `
    <div class="sound-row" data-key="${row.key}">
      <label for="${row.key}-mode">${row.label}</label>
      <div class="sound-controls">
        <select id="${row.key}-mode" name="${row.key}-mode"><option value="">Game default</option></select>
        <button class="btn" type="button" data-play="${row.key}">Play</button>
      </div>
      <div class="url-row" hidden>
        <input name="${row.key}-url" type="url" inputmode="url" placeholder="https://…/sound.mp3" spellcheck="false" />
        <button class="btn" type="button" data-test="${row.key}">Test</button>
      </div>
      <p class="sound-status" aria-live="polite"></p>
    </div>`
  ).join('')
);

// Limits come from the DFPONG API, so the Builder never offers a value the game would change
f.name.maxLength = PLAYER_SETTINGS.name.maxLength;
for (const key of ['moveSpeed', 'paddleSize']) {
  const spec = PLAYER_SETTINGS[key];
  Object.assign(f[key], { min: spec.min, max: spec.max, step: spec.step, value: spec.default });
}

document.querySelector('.requests').innerHTML = Object.entries(GAME_SETTINGS)
  .map(
    ([key, s]) => `
    <div class="field slider">
      <label><input name="ask-${key}" type="checkbox" /> ${s.label}</label>
      <output data-for="${key}"></output>
      <input name="${key}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.default}" />
    </div>`
  )
  .join('');

sound.ready.then(() => {
  const listed = Object.keys(SOUND_LIBRARY).filter((n) => SOUND_LIBRARY[n].list !== false);
  const names = [...new Set([...listed, ...BUILTIN_SOUNDS])];
  const options = `<optgroup label="Built-in sounds">${names.map((n) => `<option value="${n}">${n}</option>`).join('')}</optgroup>
    <optgroup label="Your own"><option value="url">Web address…</option></optgroup>`;
  SOUND_ROWS.forEach((row) => form.querySelector(`[name="${row.key}-mode"]`).insertAdjacentHTML('beforeend', options));
  music.ready.then(() => {
    const tracks = Object.entries(MUSIC_LIBRARY)
      .map(([name, t]) => `<option value="${name}">${t.title}${t.mood ? ' · ' + t.mood : ''}</option>`)
      .join('');
    f['music-mode'].insertAdjacentHTML('beforeend', `<optgroup label="The game's music">${tracks}</optgroup>
      <optgroup label="Your own"><option value="url">Web address…</option></optgroup>`);
    restore();
    update();
  });
});

// ---------------------------------------------------------------------------
// Collect → JSON + code
// ---------------------------------------------------------------------------

function collect() {
  const s = {};
  const name = f.name.value.trim();
  if (name) s.name = name.slice(0, 20);
  if (f.useColor.checked) s.color = f.color.value;
  if (f.useMoveSpeed.checked) s.moveSpeed = Number(f.moveSpeed.value);
  if (f.usePaddleSize.checked) s.paddleSize = Number(f.paddleSize.value);
  for (const row of SOUND_ROWS) {
    const mode = f[`${row.key}-mode`].value;
    if (mode === 'url') {
      const url = f[`${row.key}-url`].value.trim();
      if (url) s[row.key] = url;
    } else if (mode) {
      s[row.key] = mode;
    }
  }
  const musicMode = f['music-mode'].value;
  if (musicMode === 'url') {
    const url = f['music-url'].value.trim();
    if (url) s.music = url;
  } else if (musicMode) {
    s.music = musicMode;
  }
  for (const key of Object.keys(GAME_SETTINGS)) {
    if (f[`ask-${key}`].checked) s[key] = Number(f[key].value);
  }
  return s;
}

function cString(text) {
  return '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function codeFor(s) {
  const lines = ['  // DF Pong custom settings (made with the Settings Builder)'];
  if (s.name) lines.push(`  controller.setControllerName(${cString(s.name)});   // library 2.4+ (older: setPlayerName)`);
  if (s.color) lines.push(`  controller.setPlayerColor(${cString(s.color)});`);
  if (s.moveSpeed !== undefined) lines.push(`  controller.setMoveSpeed(${s.moveSpeed});`);
  if (s.paddleSize !== undefined) lines.push(`  controller.setPaddleSize(${s.paddleSize});`);
  for (const row of SOUND_ROWS) if (s[row.key]) lines.push(`  controller.${row.method}(${cString(s[row.key])});`);
  if (s.music) lines.push(`  controller.setMusic(${cString(s.music)});`);
  for (const [key, method] of Object.entries(REQUEST_METHODS)) {
    if (s[key] === undefined) continue;
    const value = key === 'speedIncrement' ? s[key].toFixed(2) : key === 'puckSpeed' ? String(s[key]) : s[key];
    lines.push(`  controller.${method}(${value});`);
  }
  if (lines.length === 1) lines.push('  // (nothing custom yet: the game uses its defaults)');
  return lines.join('\n');
}

function update() {
  // Outputs next to sliders
  form.querySelectorAll('output[data-for]').forEach((o) => {
    const key = o.dataset.for;
    o.textContent = formatSetting(key, Number(f[key].value));
  });
  document.querySelector('.color-out').textContent = f.useColor.checked ? f.color.value : 'game default';
  SOUND_ROWS.forEach((row) => {
    form.querySelector(`[data-key="${row.key}"] .url-row`).hidden = f[`${row.key}-mode`].value !== 'url';
  });
  form.querySelector('[data-key="music"] .url-row').hidden = f['music-mode'].value !== 'url';

  const settings = collect();
  const json = JSON.stringify({ v: 1, ...settings });
  const bytes = new TextEncoder().encode(json).length;
  document.querySelector('.code code').textContent = codeFor(settings);
  const size = document.querySelector('.json-size');
  size.textContent = `Settings size: ${bytes} of ${MAX_CONFIG_BYTES} bytes${bytes > MAX_CONFIG_BYTES ? ' — too long! Use shorter sound addresses.' : ''}`;
  size.classList.toggle('too-big', bytes > MAX_CONFIG_BYTES);

  // Validate the same way the game will, and show what the game would do.
  preview.config = parseControllerConfig(json);
  save();
}

form.addEventListener('input', (e) => {
  if (e.target.name === 'color') f.useColor.checked = true;
  if (e.target.name === 'moveSpeed') f.useMoveSpeed.checked = true;
  if (e.target.name === 'paddleSize') f.usePaddleSize.checked = true;
  if (GAME_SETTINGS[e.target.name]) f[`ask-${e.target.name}`].checked = true;
  if (e.target.name?.endsWith('-url')) {
    const key = e.target.name.replace('-url', '');
    delete tested[key];
    setStatus(key, '');
  }
  update();
});
form.addEventListener('change', update);

// ---------------------------------------------------------------------------
// Sounds: play built-ins, test addresses
// ---------------------------------------------------------------------------

function setStatus(key, html, tone = '') {
  const el = form.querySelector(`[data-key="${key}"] .sound-status`);
  el.innerHTML = html;
  el.className = `sound-status ${tone}`;
}

async function loadFor(key) {
  const mode = f[`${key}-mode`].value;
  if (!mode) return { ok: true, sound: null };
  if (mode !== 'url') return sound.load({ kind: 'builtin', name: mode });
  const raw = f[`${key}-url`].value.trim();
  if (!raw) return { ok: false, error: 'enter a web address first' };
  const setting = parseSoundSetting(raw);
  if (setting.error) return { ok: false, error: setting.error };
  if (setting.kind === 'builtin') return sound.load(setting);
  setStatus(key, 'Loading…');
  tested[key] = await sound.load(setting);
  return tested[key];
}

function describe(key, result) {
  const row = SOUND_ROWS.find((r) => r.key === key);
  if (!result.ok) return [`Can't use this: it ${result.error}. The game would play its default sound instead.`, 'bad'];
  if (!result.sound) return ['', ''];
  if (result.via === 'basic playback') return [`Plays, but this host blocks Web Audio (CORS), so the game can't pitch or pan it. Hosting it on GitHub fixes that.`, 'warn'];
  const length = result.sound.duration - result.sound.offset;
  const trimmed = length > row.limit ? ` It's ${length.toFixed(1)} s long; the game stops it at ${row.limit} s.` : ` ${length.toFixed(2)} s long.`;
  return [`Ready ✓ — works in the game.${result.via === 'built-in' ? '' : trimmed}`, 'good'];
}

form.addEventListener('click', async (e) => {
  const play = e.target.closest('[data-play]');
  const test = e.target.closest('[data-test]');
  if (!play && !test) return;
  sound.unlock();
  const key = (play || test).dataset.play || (play || test).dataset.test;
  const result = await loadFor(key);
  const [message, tone] = describe(key, result);
  setStatus(key, message, tone);
  if (result.ok && result.sound) sound.play(result.sound, { gain: 0.9, maxDuration: SOUND_ROWS.find((r) => r.key === key).limit });
  else if (result.ok && play) sound.play(key === 'hitSound' ? 'classic' : key === 'scoreSound' ? 'ding' : 'bell', { gain: 0.8 });
});

// Music: play a preview (press again to stop), or test a web address the way the game will
form.addEventListener('click', async (e) => {
  const play = e.target.closest('[data-music-play]');
  const test = e.target.closest('[data-music-test]');
  if (!play && !test) return;
  sound.unlock();
  if (play && music.current) {
    music.stop({ fade: 0.6 });
    play.textContent = 'Play';
    return;
  }
  const mode = f['music-mode'].value;
  let setting = null;
  if (mode === 'url') {
    setting = parseMusicSetting(f['music-url'].value.trim() || ' ');
  } else if (mode) {
    setting = { kind: 'builtin', name: mode, label: mode };
  }
  if (!setting) {
    setStatus('music', 'Choose a track first (with no choice, the room decides).');
    return;
  }
  if (setting.error) {
    setStatus('music', `Can't use this: ${setting.error}.`, 'bad');
    return;
  }
  setStatus('music', 'Checking…');
  const result = await music.probe(setting);
  if (!result.ok) {
    setStatus('music', `Can't use this: it ${result.error}. The game would play the room's music instead.`, 'bad');
    return;
  }
  const track = trackFromSetting(setting);
  setStatus('music', `Ready ✓ — ${track.kind === 'link' ? 'works in the game' : trackSource(track)}.`, 'good');
  if (play || test) {
    await music.preview(track, 20);
    const button = form.querySelector('[data-music-play]');
    button.textContent = 'Stop';
    setTimeout(() => (button.textContent = 'Play'), 20000);
  }
});

document.querySelector('[data-copy]').addEventListener('click', async (e) => {
  try {
    await navigator.clipboard.writeText(document.querySelector('.code code').textContent);
    e.target.textContent = 'Copied ✓';
  } catch (err) {
    e.target.textContent = 'Select and copy';
  }
  setTimeout(() => (e.target.textContent = 'Copy'), 1500);
});

// ---------------------------------------------------------------------------
// Preview: your paddle, with a puck you can bounce off it
// ---------------------------------------------------------------------------

const preview = {
  canvas: document.querySelector('.preview'),
  config: parseControllerConfig(''),
  puck: null,
  hitAt: -10,
  sparks: [],
};

document.querySelector('[data-test="hit"]').addEventListener('click', () => {
  sound.unlock();
  preview.puck = { x: 640, y: 120 + Math.random() * 180, vx: -900, vy: (Math.random() - 0.5) * 300 };
});

function drawPreview(t) {
  const { canvas, config } = preview;
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const now = t / 1000;
  const color = config.player.color || PALETTE.p1;
  const rgb = parseColor(color);
  const size = config.player.paddleSize || 100;

  g.fillStyle = PALETTE.background;
  g.fillRect(0, 0, W, H);
  g.fillStyle = rgba(rgb, 0.05);
  g.fillRect(0, 0, W / 2, H);
  g.fillStyle = 'rgba(236,232,223,0.14)';
  for (let y = 0; y < H; y += 30) g.fillRect(W / 2 - 1.5, y, 3, 16);

  g.font = '600 26px "IBM Plex Mono", monospace';
  g.fillStyle = rgba(mixColor(rgb, INK, 0.3), 0.85);
  g.textAlign = 'center';
  g.fillText(config.player.name || 'Your name', W * 0.27, 52);

  // Puck
  const dt = 1 / 60;
  const paddle = { x: 60, y: H / 2, w: 18, h: H * 0.2 * (size / 100) }; // a little larger than in the game, for visibility
  const p = preview.puck;
  if (p) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y < 10 || p.y > H - 10) p.vy *= -1;
    if (p.vx < 0 && p.x - 10 <= paddle.x + paddle.w / 2) {
      p.vx *= -1;
      preview.hitAt = now;
      for (let i = 0; i < 24; i++) {
        const a = (Math.random() - 0.5) * Math.PI * 0.9;
        const s = 150 + Math.random() * 600;
        preview.sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 });
      }
      playHit();
    }
    if (p.x > W + 20) preview.puck = null;
    g.shadowBlur = 16;
    g.shadowColor = 'rgba(236,232,223,0.6)';
    g.fillStyle = PALETTE.ink;
    g.beginPath();
    g.arc(p.x, p.y, 10, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  }

  // Sparks
  preview.sparks = preview.sparks.filter((s) => (s.life -= dt * 2) > 0);
  for (const s of preview.sparks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 0.92;
    s.vy *= 0.92;
    g.fillStyle = rgba(mixColor(rgb, WHITE_RGB, 0.4), s.life);
    g.fillRect(s.x - 2, s.y - 2, 4, 4);
  }

  // Paddle with squash on hit
  const since = now - preview.hitAt;
  const squash = since < 0.2 ? 1 - since / 0.2 : 0;
  const w = paddle.w * (1 + 0.7 * squash);
  const h = paddle.h * (1 - 0.1 * squash);
  g.shadowBlur = 10 + 26 * squash;
  g.shadowColor = rgba(rgb, 0.6);
  g.fillStyle = rgba(mixColor(rgb, WHITE_RGB, squash * 0.75), 1);
  g.fillRect(paddle.x - w / 2 - 6 * squash, paddle.y - h / 2, w, h);
  g.shadowBlur = 0;

  // What the game would say about these settings
  const issues = [...config.issues, ...config.notes];
  g.font = '15px "IBM Plex Mono", monospace';
  g.textAlign = 'left';
  issues.slice(0, 3).forEach((m, i) => {
    g.fillStyle = config.issues.includes(m) ? '#dba35e' : '#8f8b82';
    g.fillText(m.slice(0, 70), 120, H - 24 - (issues.length - 1 - i) * 22);
  });

  requestAnimationFrame(drawPreview);
}

const WHITE_RGB = { r: 255, g: 255, b: 255 };
const INK = parseColor(PALETTE.ink);


async function playHit() {
  const result = await loadFor('hitSound');
  if (result.ok && result.sound) sound.play(result.sound, { pan: -0.6, gain: 0.9, maxDuration: SOUND_LIMITS.hit });
  else sound.play('classic', { pan: -0.6, gain: 0.85 });
}

requestAnimationFrame(drawPreview);

// ---------------------------------------------------------------------------
// Remember the form between visits
// ---------------------------------------------------------------------------

function save() {
  const data = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  try {
    localStorage.setItem('dfpong:builder', JSON.stringify(data));
  } catch (e) { /* fine */ }
}

function restore() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem('dfpong:builder') || 'null');
  } catch (e) { /* fine */ }
  if (!data) return;
  for (const [name, value] of Object.entries(data)) {
    const el = f[name];
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = value;
    else el.value = value;
  }
}

update();
