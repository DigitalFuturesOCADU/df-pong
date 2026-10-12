/*
 * ui.js — everything outside the canvas: lobby, scoreboard, overlays, drawers.
 *
 * The UI is plain HTML and CSS (see css/style.css). It listens to the game's
 * events and re-renders the parts that changed; it never runs game logic.
 */

const ICONS = {
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  bug: '<path d="M8 10h8v6a4 4 0 01-8 0zM9.5 10V8a2.5 2.5 0 015 0v2M4 14h4M16 14h4M5 9l3 2M19 9l-3 2M5 20l3-2M19 20l-3-2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 017.5-2"/>',
  antenna: '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M5.6 5.6a9 9 0 000 12.8M18.4 5.6a9 9 0 010 12.8"/>',
};

function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const KEY_HINTS = ['W / A up · S / Z down', '↑ / P up · ↓ / L down'];

// How far one press of a stepper moves each setting
const STEPPER_STEPS = { pointsToWin: 1, puckSpeed: 0.5, speedIncrement: 0.05 };

const POLICY_LABELS = { average: 'Meet in the middle', random: 'Coin flip', lower: 'Lower wins', higher: 'Higher wins', house: 'Ignore requests' };

const PERMISSION_LABELS = { name: 'Names', color: 'Colors', sounds: 'Sounds', music: 'Music', moveSpeed: 'Paddle speed', paddleSize: 'Paddle size', requests: 'Rule requests' };

class UI {
  constructor(game, { house, sound }) {
    this.game = game;
    this.house = house;
    this.sound = sound;
    this.roster = [];
    this.adminStatus = null;
    this.adminHeardAt = -Infinity;
    this.debugTimer = 0;
    this.build();
    this.bindGame();
    this.renderAll();
  }

  // -------------------------------------------------------------------------
  // Building the page
  // -------------------------------------------------------------------------

  build() {
    document.title = DFP.title ? `DF Pong · ${DFP.title}` : 'DF Pong';
    const app = h(`
      <div class="app" data-state="lobby">
        <header class="topbar">
          <button class="brand" data-action="lobby" title="Back to player select">
            <span class="brand-mark">DF Pong</span><span class="brand-instance">${esc(DFP.title || DFP.instance)}</span>
          </button>
          <div class="scoreboard" aria-live="polite">
            <div class="plate" data-slot="1"><i class="chip"></i><span class="plate-name"></span><b class="plate-score">0</b></div>
            <div class="scoreboard-mid"><span class="first-to"></span><span class="rally"></span></div>
            <div class="plate" data-slot="2"><b class="plate-score">0</b><span class="plate-name"></span><i class="chip"></i></div>
          </div>
          <nav class="tools">
            <span class="admin-indicator" title="Admin panel connected">${icon('antenna')}</span>
            <button class="tool" data-action="pause" title="Pause (Space)">${icon('pause')}</button>
            <button class="tool" data-action="mute" title="Sound (M)">${icon('volume')}</button>
            <button class="tool" data-action="settings" title="Settings (C)">${icon('sliders')}</button>
            <button class="tool" data-action="debug" title="Controller details (D)">${icon('bug')}</button>
            <button class="tool" data-action="fullscreen" title="Full screen (F)">${icon('expand')}</button>
          </nav>
        </header>

        <main class="stage">
          <div class="arena">
            <div class="overlay countdown" data-overlay="countdown"><span class="count"></span></div>
            <div class="toasts" aria-live="polite"></div>
          </div>

          <div class="overlay rules" data-overlay="rules">
            <div class="panel rules-card">
              <p class="kicker">Match rules</p>
              <div class="rule-rows"></div>
              <p class="hint">Space to skip</p>
            </div>
          </div>
          <div class="overlay pause" data-overlay="paused">
            <div class="panel pause-card">
              <p class="kicker">Paused</p>
              <p class="pause-reason"></p>
              <div class="button-row">
                <button class="btn primary" data-action="resume">Resume <kbd>Space</kbd></button>
                <button class="btn" data-action="restart">Restart match</button>
                <button class="btn ghost" data-action="lobby">Change players</button>
              </div>
              <div class="button-row fallbacks"></div>
            </div>
          </div>
          <div class="overlay win" data-overlay="won">
            <div class="win-card">
              <p class="kicker">Winner</p>
              <h2 class="winner-name"></h2>
              <p class="final-score"></p>
              <dl class="stats"></dl>
              <div class="button-row">
                <button class="btn primary" data-action="rematch">Rematch <kbd>Space</kbd></button>
                <button class="btn ghost" data-action="lobby">Change players</button>
              </div>
            </div>
          </div>

          <div class="overlay lobby" data-overlay="lobby">
            <div class="lobby-inner">
              <div class="lobby-head">
                <h1 class="wordmark"><span class="w1">DF</span><span class="w2">PONG</span></h1>
                <p class="lobby-title">${esc(DFP.title || '')}</p>
              </div>
              <div class="lobby-cards">
                ${this.cardHTML(1)}
                <div class="versus">vs</div>
                ${this.cardHTML(2)}
              </div>
              <div class="lobby-rules">${Object.entries(GAME_SETTINGS)
                .map(
                  ([key, spec]) => `
                <div class="rule-pill" data-rule-pill="${key}">
                  <span class="rule-label">${spec.label}</span>
                  <div class="rule-stepper" data-stepper="rule:${key}">
                    <button type="button" class="step" data-step="-1" aria-label="${spec.label}: less">−</button>
                    <span class="rule-value"></span>
                    <button type="button" class="step" data-step="1" aria-label="${spec.label}: more">+</button>
                  </div>
                  <span class="rule-detail"></span>
                </div>`
                )
                .join('')}
                <div class="rule-pill music-pill">
                  <span class="rule-label">♪ Music</span>
                  <div class="rule-stepper" data-stepper="music:">
                    <button type="button" class="step" data-step="-1" aria-label="Previous music">‹</button>
                    <span class="rule-value music-value"></span>
                    <button type="button" class="step" data-step="1" aria-label="Next music">›</button>
                  </div>
                  <span class="rule-detail music-detail"></span>
                </div></div>
              <div class="lobby-actions">
                <button class="btn ghost big" data-action="settings">${icon('sliders')} Settings</button>
                <button class="btn primary big" data-action="start">Start match <kbd>Space</kbd></button>
              </div>
              <p class="lobby-note ble-missing" hidden>
                This browser can't use Bluetooth. Controllers need Chrome or Edge on a computer or Android phone.
                Keyboard, touch and computer players still work.
              </p>
            </div>
          </div>
        </main>

        <footer class="footer">
          <div class="pads">
            <div class="pad" data-slot="1"><span>P1</span></div>
            <p class="key-hints">
              <span><b>P1</b> ${KEY_HINTS[0]}</span>
              <span><b>Space</b> start / pause</span>
              <span><b>P2</b> ${KEY_HINTS[1]}</span>
            </p>
            <div class="pad" data-slot="2"><span>P2</span></div>
          </div>
        </footer>

        ${this.settingsHTML()}
        ${this.debugHTML()}
      </div>
    `);
    document.body.appendChild(app);
    this.app = app;
    this.arena = app.querySelector('.arena');
    this.cards = [1, 2].map((slot) => app.querySelector(`.card[data-slot="${slot}"]`));
    this.plates = [1, 2].map((slot) => app.querySelector(`.plate[data-slot="${slot}"]`));

    if (!bluetoothAvailable()) app.querySelector('.ble-missing').hidden = false;
    if (matchMedia('(pointer: coarse)').matches) app.classList.add('touch');

    this.bindActions();
    this.bindCards();
    this.bindSettings();
    this.bindTouch();

    new ResizeObserver(() => this.fitWordmark()).observe(app.querySelector('.lobby-cards'));
    document.fonts?.ready.then(() => this.fitWordmark());
  }

  cardHTML(slot) {
    return `
      <section class="card" data-slot="${slot}">
        <header class="card-head">
          <span class="card-side">Player ${slot} · ${slot === 1 ? 'left' : 'right'}</span>
          <span class="card-status"><i class="dot"></i><span class="status-text"></span></span>
        </header>
        <div class="card-identity">
          <div class="card-id-text">
            <div class="card-name"></div>
            <div class="card-sub"></div>
          </div>
        </div>
        <div class="card-connect">
          <select class="device-select" aria-label="Player ${slot} controller"></select>
          <input class="device-number" type="number" min="1" max="242" inputmode="numeric" placeholder="#" aria-label="Controller number" hidden>
          <button class="btn connect">Connect</button>
          <button class="btn ghost forget" data-action="keyboard-${slot}" hidden>Use keyboard instead</button>
        </div>
        <div class="card-mode">
          <span>Without a controller</span>
          <div class="segmented" role="group">
            <button data-mode="keyboard">Keyboard</button>
            <button data-mode="cpu">Computer</button>
          </div>
        </div>
        <div class="cpu-difficulty" hidden>
          <label for="cpu-level-${slot}">Difficulty</label>
          <input id="cpu-level-${slot}" type="range" min="${CPU_LEVELS.min}" max="${CPU_LEVELS.max}" step="1">
          <output for="cpu-level-${slot}"></output>
        </div>
        <ul class="chips"></ul>
        <ul class="messages"></ul>
      </section>`;
  }

  /** A − value + control. `target` says what it changes: "rule:<key>" or "speed:<player index>". */
  stepperHTML(target, label) {
    return `
      <div class="stepper" data-stepper="${target}">
        <button type="button" class="step" data-step="-1" aria-label="${label}: less">−</button>
        <output class="step-value" aria-live="polite"></output>
        <button type="button" class="step" data-step="1" aria-label="${label}: more">+</button>
      </div>`;
  }

  settingsHTML() {
    const rules = Object.entries(GAME_SETTINGS)
      .map(
        ([key, spec]) => `
        <div class="set-row" data-rule="${key}">
          <span class="set-label">${spec.label}</span>
          ${this.stepperHTML(`rule:${key}`, spec.label)}
          <button type="button" class="lock" data-lock="${key}" aria-pressed="false" title="Lock: ignore what controllers ask for">${icon('unlock')}</button>
        </div>`
      )
      .join('');
    const policies = Object.entries(POLICY_LABELS)
      .map(([key, label]) => `<button type="button" data-policy="${key}" aria-pressed="false">${label}</button>`)
      .join('');
    const permissions = Object.entries(PERMISSION_LABELS)
      .map(
        ([key, label]) => `
        <label class="switch"><input type="checkbox" role="switch" data-permission="${key}"><span class="switch-track" aria-hidden="true"></span><span>${label}</span></label>`
      )
      .join('');
    return `
      <div class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" hidden>
        <div class="settings-sheet">
          <header class="settings-head">
            <h2 id="settings-title">Settings</h2>
            <button class="tool" data-action="settings" title="Close (Esc)">${icon('close')}</button>
          </header>

          <section class="set-group">
            <h3>Match</h3>
            ${rules}
            <p class="set-note">${icon('lock')} Locked rules ignore what controllers ask for.</p>
          </section>

          <section class="set-group">
            <h3>Paddle speed</h3>
            ${[0, 1]
              .map(
                (i) => `
              <div class="set-row" data-paddle-speed="${i}">
                <span class="set-label">Player ${i + 1}</span>
                ${this.stepperHTML(`speed:${i}`, `Player ${i + 1} paddle speed`)}
              </div>`
              )
              .join('')}
            <p class="set-note">For keyboard and touch players, and controllers that don't choose their own.</p>
          </section>

          <section class="set-group wide">
            <h3>When players ask for different rules</h3>
            <div class="segmented policy" role="group" aria-label="When players ask for different rules">${policies}</div>
          </section>

          <section class="set-group wide">
            <h3>Controllers may set</h3>
            <div class="switches">${permissions}</div>
          </section>

          <section class="set-group wide">
            <h3>Music</h3>
            <div class="music-list" role="group" aria-label="Music"></div>
            <div class="set-row volume-row">
              <span class="set-label">Music volume</span>
              <input type="range" min="0" max="1" step="0.05" data-music-volume aria-label="Music volume">
              <output class="music-volume-out"></output>
            </div>
          </section>

          <section class="set-group">
            <h3>Sound and motion</h3>
            <div class="set-row volume-row">
              <span class="set-label">Volume</span>
              <input type="range" min="0" max="1" step="0.05" data-volume aria-label="Volume">
              <output class="volume-out"></output>
            </div>
            <label class="switch"><input type="checkbox" role="switch" data-house="muted"><span class="switch-track" aria-hidden="true"></span><span>Mute</span></label>
            <label class="switch"><input type="checkbox" role="switch" data-house="ambience"><span class="switch-track" aria-hidden="true"></span><span>Room sound during rallies</span></label>
            <label class="switch"><input type="checkbox" role="switch" data-house="reduced"><span class="switch-track" aria-hidden="true"></span><span>Reduce motion</span></label>
          </section>

          <section class="set-group">
            <h3>Admin panel</h3>
            <p class="set-note admin-status"></p>
            <a class="btn" target="_blank" rel="noopener" data-admin-link>Open admin panel</a>
          </section>

          <footer class="settings-foot">
            <a class="set-link" href="https://github.com/DigitalFuturesOCADU/df-pong/blob/main/game/cc26/assets/sounds/CREDITS.md" target="_blank" rel="noopener">Sound credits</a>
            <button type="button" class="btn ghost" data-action="reset-settings">Reset to defaults</button>
            <button type="button" class="btn primary" data-action="settings">Done</button>
          </footer>
        </div>
      </div>`;
  }

  debugHTML() {
    return `
      <aside class="drawer debug-drawer" aria-label="Controller details" hidden>
        <header class="drawer-head"><h2>Controller details</h2><button class="tool" data-action="debug" title="Close">${icon('close')}</button></header>
        <div class="debug-body"></div>
      </aside>`;
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------

  bindActions() {
    this.app.addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button) return;
      const g = this.game;
      const action = button.dataset.action;
      const actions = {
        start: () => g.startMatch(),
        pause: () => g.primaryAction(),
        resume: () => g.resume(),
        restart: () => g.startMatch(),
        rematch: () => g.startMatch(),
        lobby: () => g.toLobby(),
        mute: () => this.house.merge({ muted: !this.house.data.muted }),
        settings: () => this.toggleDrawer('settings'),
        debug: () => this.toggleDrawer('debug'),
        fullscreen: () => toggleFullscreen(),
        'reset-settings': () => this.house.reset(),
      };
      if (actions[action]) {
        if (action !== 'mute') this.sound.ui();
        actions[action]();
      } else if (action.startsWith('keyboard-')) {
        g.players[Number(action.slice(9)) - 1].disconnect();
        this.renderState();
      }
      // Don't leave the button focused: Space is the game's start/pause key.
      button.blur();
    });
  }

  bindCards() {
    this.cards.forEach((card, i) => {
      const player = this.game.players[i];
      const select = card.querySelector('.device-select');
      const number = card.querySelector('.device-number');
      const connect = card.querySelector('.connect');

      select.addEventListener('change', () => {
        const value = select.value;
        number.hidden = value !== 'number';
        if (value === 'number') {
          number.focus();
          player.selectController(null);
        } else if (value === LEGACY_2024) {
          player.selectController(LEGACY_2024);
        } else if (value) {
          const n = parseInt(value, 10);
          player.selectController(n, this.rosterName(n));
        } else {
          player.selectController(null);
        }
        if (value !== 'number') select.blur(); // keep Space for start/pause
      });

      number.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') connect.click();
      });

      number.addEventListener('input', () => {
        const n = parseInt(number.value, 10);
        if (n >= 1 && n <= 242) player.selectController(n, this.rosterName(n));
        else player.selectController(null);
      });

      // Bluetooth needs to start inside the click handler (browser rule), so no awaits before connect().
      connect.addEventListener('click', () => {
        const s = player.linkStatus;
        if (s === 'connected' || s === 'reconnecting') player.disconnect();
        else if (s === 'lost') player.link.retry();
        else {
          const other = this.game.players[1 - i];
          if (player.target && player.target === other.target && other.kind === 'controller') {
            this.showToast(`That controller is already connected as Player ${other.slot}`, 'warn');
          } else {
            player.connect();
          }
        }
        connect.blur();
      });

      const level = card.querySelector('.cpu-difficulty input');
      level.addEventListener('input', () => {
        const levels = [...this.house.data.cpuLevel];
        levels[i] = Number(level.value);
        this.house.merge({ cpuLevel: levels });
      });
      // Arrow keys move the slider; Space should still start the match
      level.addEventListener('change', () => level.blur());

      card.querySelectorAll('[data-mode]').forEach((b) =>
        b.addEventListener('click', () => {
          player.setMode(b.dataset.mode);
          this.sound.ui();
          b.blur();
        })
      );
    });
  }

  bindSettings() {
    const panel = this.app.querySelector('.settings-panel');

    // Steppers (in the panel and in the lobby): click, or press and hold to repeat
    let holdTimer = null;
    const stopHold = () => {
      clearTimeout(holdTimer);
      holdTimer = null;
    };
    const step = (button, repeats = 0) => {
      const stepper = button.closest('[data-stepper]');
      if (!stepper) return;
      this.applyStep(stepper.dataset.stepper, Number(button.dataset.step), repeats);
    };
    this.app.addEventListener('pointerdown', (e) => {
      const button = e.target.closest('[data-stepper] [data-step]');
      if (!button || e.button > 0) return;
      e.preventDefault(); // keep focus and selection where they are
      step(button);
      let repeats = 0;
      const again = () => {
        step(button, ++repeats);
        holdTimer = setTimeout(again, 70);
      };
      holdTimer = setTimeout(again, 380);
    });
    ['pointerup', 'pointercancel', 'blur'].forEach((type) => window.addEventListener(type, stopHold));
    this.app.addEventListener('click', (e) => {
      const button = e.target.closest('[data-stepper] [data-step]');
      if (button && e.detail === 0) step(button); // keyboard (Enter/Space on a focused button)
    });

    panel.addEventListener('click', (e) => {
      if (e.target === panel) this.toggleDrawer('settings', false); // click outside the sheet
      const lock = e.target.closest('[data-lock]');
      if (lock) this.house.merge({ locks: { [lock.dataset.lock]: !this.house.locks[lock.dataset.lock] } });
      const policy = e.target.closest('[data-policy]');
      if (policy) this.house.merge({ policy: policy.dataset.policy });
    });
    panel.querySelectorAll('[data-permission]').forEach((box) =>
      box.addEventListener('change', () => this.house.merge({ permissions: { [box.dataset.permission]: box.checked } }))
    );
    panel.querySelector('[data-volume]').addEventListener('input', (e) => this.house.merge({ volume: parseFloat(e.target.value), muted: false }));
    panel.querySelector('[data-music-volume]').addEventListener('input', (e) => this.house.merge({ musicVolume: parseFloat(e.target.value), muted: false }));
    panel.querySelector('.music-list').addEventListener('click', (e) => {
      const option = e.target.closest('[data-music]');
      if (option) this.chooseMusic(option.dataset.music);
    });
    panel.querySelector('[data-house="muted"]').addEventListener('change', (e) => this.house.merge({ muted: e.target.checked }));
    panel.querySelector('[data-house="ambience"]').addEventListener('change', (e) => this.house.merge({ ambience: e.target.checked }));
    panel.querySelector('[data-house="reduced"]').addEventListener('change', (e) => this.house.merge({ effects: e.target.checked ? 'reduced' : 'full' }));

    const adminUrl = new URL('admin/', new URL(DFP.engine, location.href)); // cc26/admin/
    adminUrl.searchParams.set('room', DFP.room);
    if (DFP.relay) adminUrl.searchParams.set('relay', DFP.relay);
    panel.querySelector('[data-admin-link]').href = adminUrl.href;
  }

  /** One step on a stepper. Holding a button speeds up after a while. */
  applyStep(target, direction, repeats = 0) {
    const [kind, key] = target.split(':');
    const boost = repeats > 12 ? 5 : 1;
    if (kind === 'rule' && hasOwn(GAME_SETTINGS, key)) {
      const spec = GAME_SETTINGS[key];
      const size = (STEPPER_STEPS[key] || spec.step) * boost;
      this.house.merge({ rules: { [key]: clampToStep(this.house.rules[key] + direction * size, spec) } });
    } else if (kind === 'music') {
      const options = this.musicOptions();
      const current = Math.max(0, options.findIndex((o) => o.value === this.currentMusicChoice()));
      const next = options[(current + direction + options.length) % options.length];
      this.chooseMusic(next.value);
    } else if (kind === 'speed') {
      const i = Number(key);
      const speeds = [...this.house.data.paddleSpeed];
      speeds[i] = clampToStep(speeds[i] + direction * boost, PLAYER_SETTINGS.moveSpeed);
      this.house.merge({ paddleSpeed: speeds });
    }
  }

  /** Touch: drag anywhere on your half of the screen, or on the pads below the arena (phones in portrait). */
  bindTouch() {
    const bindSurface = (el, slotFor, yFor) => {
      const active = new Map(); // pointerId → player index
      el.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, select, input, a, .panel, .card, .overlay.show:not(.countdown)')) return;
        const i = slotFor(e);
        const player = this.game.players[i];
        if (player.kind === 'controller' || player.mode === 'cpu') return;
        active.set(e.pointerId, i);
        el.setPointerCapture?.(e.pointerId);
        player.touchY = yFor(e);
        player.lastInputAt = performance.now();
      });
      el.addEventListener('pointermove', (e) => {
        if (!active.has(e.pointerId)) return;
        const player = this.game.players[active.get(e.pointerId)];
        player.touchY = yFor(e);
        player.lastInputAt = performance.now();
      });
      const end = (e) => {
        if (!active.has(e.pointerId)) return;
        this.game.players[active.get(e.pointerId)].touchY = null;
        active.delete(e.pointerId);
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    };

    // Finger height maps to paddle height, measured against the arena.
    const arenaY = (e) => {
      const r = this.arena.getBoundingClientRect();
      return clampNumber((e.clientY - r.top) / r.height, 0, 1) * WORLD.h;
    };
    const stage = this.app.querySelector('.stage');
    bindSurface(stage, (e) => {
      const r = this.arena.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2 ? 0 : 1;
    }, arenaY);

    this.app.querySelectorAll('.pad').forEach((pad) => {
      const i = Number(pad.dataset.slot) - 1;
      bindSurface(
        pad,
        () => i,
        (e) => {
          const r = pad.getBoundingClientRect();
          return clampNumber((e.clientY - r.top) / r.height, 0, 1) * WORLD.h;
        }
      );
    });
  }

  bindGame() {
    const g = this.game;
    g.on('state', () => this.renderState());
    g.on('score', (info) => this.renderScore(info));
    g.on('players', () => {
      this.renderPlayers();
      this.renderRulesPreview();
    });
    g.on('rules', () => {
      this.renderRulesPreview();
      this.renderSettings();
    });
    g.on('countdown', (n) => this.renderCountdown(n));
    g.on('toast', ({ message, tone }) => this.showToast(message, tone));
    this.house.onChange(() => this.renderSettings());
  }

  // -------------------------------------------------------------------------
  // Roster
  // -------------------------------------------------------------------------

  setRoster(players) {
    this.roster = players;
    const options = [
      '<option value="">Choose a controller…</option>',
      players.length
        ? `<optgroup label="Class list">${players.map((p) => `<option value="${p.deviceNumber}">${p.deviceNumber} · ${esc(p.name)}</option>`).join('')}</optgroup>`
        : '',
      `<optgroup label="Other"><option value="number">Another number…</option><option value="${LEGACY_2024}">2024 controller (pick by its name)</option></optgroup>`,
    ].join('');
    this.cards.forEach((card) => {
      const select = card.querySelector('.device-select');
      const previous = select.value;
      select.innerHTML = options;
      select.value = previous;
    });
  }

  rosterName(n) {
    return this.roster.find((p) => p.deviceNumber === n)?.name || null;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  renderAll() {
    this.renderState();
    this.renderPlayers();
    this.renderScore();
    this.renderRulesPreview();
    this.renderSettings();
  }

  renderState() {
    const g = this.game;
    this.app.dataset.state = g.state;
    this.app.querySelectorAll('[data-overlay]').forEach((o) => {
      const go = o.dataset.overlay === 'countdown' && g.state === 'serve' && g.serveAfterCountdown; // keep "GO" up
      o.classList.toggle('show', o.dataset.overlay === g.state || go);
    });
    const pause = this.app.querySelector('[data-action="pause"]');
    pause.innerHTML = icon(g.state === 'paused' ? 'play' : 'pause');
    pause.disabled = !['playing', 'serve', 'countdown', 'paused'].includes(g.state);

    if (g.state === 'rules') this.renderRulesCard();
    if (g.state === 'paused') {
      this.app.querySelector('.pause-reason').textContent = g.pauseReason || '';
      this.app.querySelector('.fallbacks').innerHTML = g.players
        .filter((p) => p.linkStatus === 'reconnecting' || p.linkStatus === 'lost')
        .map((p) => `<button class="btn ghost" data-action="keyboard-${p.slot}">Finish with ${esc(p.name)} on the keyboard</button>`)
        .join('');
    }
    if (g.state === 'won') this.renderWin();
    if (g.state === 'countdown' && g.countdownValue === 3) this.renderCountdown(3);
    this.renderScore();
  }

  renderPlayers() {
    this.game.players.forEach((player, i) => {
      this.renderCard(this.cards[i], player);
      const plate = this.plates[i];
      plate.style.setProperty('--player', player.color);
      plate.querySelector('.plate-name').textContent = player.name;
    });
    this.app.querySelectorAll('.pad').forEach((pad, i) => (pad.hidden = this.game.players[i].kind !== 'keyboard'));
  }

  renderCard(card, player) {
    card.style.setProperty('--player', player.color);
    const status = player.linkStatus;
    const kind = player.kind;
    card.dataset.kind = kind;
    card.dataset.status = status;

    const statusText = {
      idle: kind === 'cpu' ? 'Computer' : 'Keyboard',
      choosing: 'Pick it in the browser list',
      connecting: 'Connecting…',
      connected: player.link.handshakeAcked ? 'Ready' : 'Connected',
      reconnecting: 'Reconnecting…',
      lost: 'Lost connection',
      error: "Couldn't connect",
    }[status];
    card.querySelector('.status-text').textContent = statusText;
    card.querySelector('.card-name').textContent = player.name;

    let sub;
    if (kind === 'controller') {
      const gen = player.link.generation;
      const id = player.target === LEGACY_2024 ? '' : `#${player.target} · `;
      sub = `${id}${gen ? gen + ' controller' : 'controller'}`;
      if (player.customName && player.rosterName && player.customName !== player.rosterName) sub += ` · ${player.rosterName}`;
    } else if (kind === 'cpu') {
      sub = 'Plays by itself';
    } else {
      sub = matchMedia('(pointer: coarse)').matches ? 'Drag on your side of the table' : KEY_HINTS[player.index];
    }
    card.querySelector('.card-sub').textContent = sub;

    const select = card.querySelector('.device-select');
    const busy = ['choosing', 'connecting'].includes(status);
    select.disabled = kind === 'controller' || busy;
    card.querySelector('.device-number').disabled = select.disabled;

    const connect = card.querySelector('.connect');
    connect.textContent = { connected: 'Disconnect', reconnecting: 'Disconnect', lost: 'Reconnect', choosing: 'Waiting…', connecting: 'Connecting…' }[status] || 'Connect';
    connect.disabled = busy || (!player.target && kind !== 'controller');
    connect.classList.toggle('primary', !!player.target && kind !== 'controller' && !busy);

    card.querySelector('.forget').hidden = status !== 'lost';
    const difficulty = card.querySelector('.cpu-difficulty');
    difficulty.hidden = kind !== 'cpu';
    const level = this.house.data.cpuLevel[player.index];
    difficulty.querySelector('input').value = level;
    difficulty.querySelector('output').textContent = `${level} · ${CPU_LEVELS.label(level)}`;
    card.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === player.mode));

    card.querySelector('.chips').innerHTML = kind === 'controller' ? this.chipsHTML(player) : '';
    const messages = [];
    if (player.linkDetail && (status === 'error' || status === 'lost')) messages.push(['warn', player.linkDetail]);
    if (kind === 'controller') {
      player.issues.forEach((m) => messages.push(['warn', m]));
      player.notes.forEach((m) => messages.push(['note', m]));
    }
    card.querySelector('.messages').innerHTML = messages.map(([tone, m]) => `<li class="${tone}">${esc(m)}</li>`).join('');
  }

  chipsHTML(player) {
    const cfg = player.config;
    if (player.link.generation !== '2026') {
      return `<li class="chip-muted">${player.link.generation || ''} controller · no custom settings</li>`;
    }
    const allow = this.house.permissions;
    const wants = cfg?.player || {};
    const chips = [];
    const chip = (text, allowed, extra = '') => chips.push(`<li class="${allowed ? '' : 'blocked'} ${extra}" ${allowed ? '' : 'title="Turned off by the host"'}>${text}</li>`);
    if (wants.color) chip(`<i class="dot-swatch" style="background:${esc(wants.color)}"></i>${esc(wants.color)}`, allow.color);
    if (wants.name) chip(`“${esc(wants.name)}”`, allow.name);
    if (wants.moveSpeed !== undefined) chip(`speed ${wants.moveSpeed}`, allow.moveSpeed);
    if (wants.paddleSize !== undefined) chip(`size ${wants.paddleSize}%`, allow.paddleSize);
    for (const [key, settingKey] of Object.entries(SOUND_KEYS)) {
      if (!wants[settingKey]) continue;
      const st = player.soundStatus[key];
      const state = st ? st.state : 'off';
      chip(`♪ ${key} · ${esc(wants[settingKey].label)}`, allow.sounds, `sound-${state}`);
    }
    if (wants.music) {
      const state = player.musicStatus ? player.musicStatus.state : 'off';
      chip(`♪ music · ${esc(player.music ? player.music.label : wants.music.label)}`, allow.music, `sound-${state}`);
    }
    for (const [key, value] of Object.entries(player.requests)) {
      chip(`asks ${GAME_SETTINGS[key].label.toLowerCase()} ${formatSetting(key, value)}`, allow.requests && this.house.policy !== 'house', 'request');
    }
    if (!chips.length) return '<li class="chip-muted">2026 controller · default settings</li>';
    return chips.join('');
  }

  renderScore(info) {
    const g = this.game;
    this.plates.forEach((plate, i) => {
      const el = plate.querySelector('.plate-score');
      el.textContent = g.score[i];
      plate.classList.toggle('match-point', g.matchPointFor === i);
      if (info && info.scorer === i) {
        plate.classList.remove('scored');
        void plate.offsetWidth; // restart the animation
        plate.classList.add('scored');
      }
    });
    this.app.querySelector('.first-to').textContent = g.inMatch || g.state === 'rules' ? `first to ${g.rules.pointsToWin}` : '';
  }

  renderRulesPreview() {
    const g = this.game;
    const preview = resolveMatchRules(this.house, g.players.map((p) => ({ name: p.name, requests: p.requests })));
    const random = this.house.policy === 'random';
    for (const n of preview.notes) {
      const pill = this.app.querySelector(`[data-rule-pill="${n.key}"]`);
      const house = this.house.rules[n.key];
      let value = formatSetting(n.key, n.value);
      let detail = '';
      if (n.source === 'locked') detail = `${icon('lock')} locked`;
      else if (n.source === 'conflict' && random) {
        value = `${formatSetting(n.key, n.asks[0])} / ${formatSetting(n.key, n.asks[1])}`;
        detail = 'coin flip at start';
      } else if (n.source === 'conflict') detail = esc(n.detail.split(' — ')[1] || 'resolved');
      else if (n.source === 'request') detail = esc(n.detail);
      else if (n.source === 'agreed') detail = 'both asked';
      // The steppers change the house value; say so when a request is overriding it
      if (n.source !== 'house' && n.source !== 'locked') detail += ` · house ${esc(formatSetting(n.key, house))}`;
      pill.className = `rule-pill ${n.source}`;
      pill.querySelector('.rule-value').textContent = value;
      pill.querySelector('.rule-detail').innerHTML = detail || 'house rule';
    }
    this.renderMusicTile();
    this.renderSettings(); // keeps the lobby steppers' limits in sync
  }

  // -------------------------------------------------------------------------
  // Music choice
  // -------------------------------------------------------------------------

  /** Everything you can pick, in the order the ‹ › buttons step through. */
  musicOptions() {
    const players = this.game.players;
    const options = [{ value: 'auto', label: "Players' choice", source: "a player's music if they brought some; otherwise Drift" }];
    players.forEach((p, i) => {
      if (p.music && this.house.permissions.music) {
        options.push({ value: `p${i + 1}`, label: `${p.name}'s pick`, source: `${p.music.label} · ${trackSource(p.music)}` });
      }
    });
    options.push({ value: 'off', label: 'Off', source: 'no music' });
    for (const [name, entry] of Object.entries(window.MUSIC_LIBRARY)) {
      options.push({ value: name, label: entry.title, source: [entry.mood, trackSource(trackFromName(name))].filter(Boolean).join(' · ') });
    }
    return options;
  }

  /** The stored choice, or "Players' choice" if it points at a player's music that's gone. */
  currentMusicChoice() {
    const choice = this.house.data.music;
    return this.musicOptions().some((o) => o.value === choice) ? choice : 'auto';
  }

  chooseMusic(value) {
    this.house.merge({ music: value });
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.game.previewMusic(), 350); // let a few quick clicks settle first
  }

  renderMusicTile() {
    const plan = this.game.resolveMusic();
    const choice = this.currentMusicChoice();
    const tile = this.app.querySelector('.music-pill');
    let detail;
    if (plan.mode === 'off') detail = 'no music';
    else if (plan.mode === 'alternate') detail = plan.detail;
    else if (plan.fromPlayers) detail = `${plan.tracks[0].label} · ${trackSource(plan.tracks[0])}`;
    else detail = trackSource(plan.tracks[0]);
    if (choice === 'auto' && !plan.fromPlayers && plan.mode !== 'off') detail = `players' choice · ${detail}`;
    tile.querySelector('.music-value').textContent = plan.label;
    tile.querySelector('.music-detail').textContent = detail;
    tile.title = detail;
    tile.classList.toggle('request', plan.fromPlayers);
  }

  /** Make DF PONG exactly as wide as the two player cards. */
  fitWordmark() {
    const mark = this.app.querySelector('.wordmark');
    const target = this.app.querySelector('.lobby-cards').getBoundingClientRect().width;
    const first = mark.firstElementChild.getBoundingClientRect();
    const last = mark.lastElementChild.getBoundingClientRect();
    const width = last.right - first.left;
    if (!target || !width) return;
    // Text width scales with font size, so one measurement is enough
    const size = parseFloat(getComputedStyle(mark).fontSize) * (target / width);
    if (Math.abs(target - width) > 0.5) mark.style.fontSize = `${size}px`;
  }

  renderRulesCard() {
    const g = this.game;
    const rows = g.ruleNotes
      .map((n, i) => {
        const ask = (j) =>
          n.asks[j] === undefined
            ? `<span class="ask empty">—</span>`
            : `<span class="ask ${n.winner === j ? 'won' : ''}" style="--player:${g.players[j].color}">${formatSetting(n.key, n.asks[j])}</span>`;
        const source = { locked: 'set by the host', conflict: n.detail.split(' — ')[1], request: n.detail, agreed: 'both agreed', house: 'house rule' }[n.source];
        return `
          <div class="rule-row ${n.source}" style="--delay:${0.25 + i * 0.35}s">
            <span class="rule-label">${n.label}</span>
            <span class="asks">${ask(0)}${ask(1)}</span>
            <span class="rule-result">${formatSetting(n.key, n.value)}</span>
            <span class="rule-source">${n.source === 'locked' ? icon('lock') : ''}${esc(source || '')}</span>
          </div>`;
      })
      .join('');
    const m = g.musicPlan;
    const musicRow = m.fromPlayers
      ? `
          <div class="rule-row music-row" style="--delay:${0.25 + g.ruleNotes.length * 0.35}s">
            <span class="rule-label">Music</span>
            <span class="asks">${g.players
              .map((p) => (p.music && this.house.permissions.music ? `<span class="ask" style="--player:${p.color}">${esc(p.music.label)}</span>` : `<span class="ask empty">—</span>`))
              .join('')}</span>
            <span class="rule-result">${esc(m.label)}</span>
            <span class="rule-source">${esc(m.mode === 'alternate' ? m.detail : `${m.tracks[0].label} · ${trackSource(m.tracks[0])}`)}</span>
          </div>`
      : '';
    this.app.querySelector('.rule-rows').innerHTML = rows + musicRow;
  }

  renderCountdown(n) {
    const el = this.app.querySelector('.count');
    el.textContent = n > 0 ? n : 'GO';
    el.classList.remove('tick');
    void el.offsetWidth;
    el.classList.add('tick');
  }

  renderWin() {
    const g = this.game;
    const winner = g.players[g.winner];
    const card = this.app.querySelector('.win-card');
    this.app.querySelector('.overlay.win').style.setProperty('--player', winner.color);
    card.querySelector('.winner-name').innerHTML = [...winner.name].map((c, i) => `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
    const [a, b] = g.score;
    card.querySelector('.final-score').textContent = `${a} – ${b}`;
    const minutes = Math.floor(g.stats.duration / 60000);
    const seconds = String(Math.floor((g.stats.duration % 60000) / 1000)).padStart(2, '0');
    card.querySelector('.stats').innerHTML = `
      <div><dt>Longest rally</dt><dd>${g.stats.longestRally}</dd></div>
      <div><dt>Top speed</dt><dd>${g.stats.topSpeed.toFixed(1)}×</dd></div>
      <div><dt>Hits</dt><dd>${g.stats.hits}</dd></div>
      <div><dt>Time</dt><dd>${minutes}:${seconds}</dd></div>`;
  }

  renderSettings() {
    const panel = this.app.querySelector('.settings-panel');
    const data = this.house.data;
    const setStepper = (target, text, value, spec) => {
      this.app.querySelectorAll(`[data-stepper="${target}"]`).forEach((stepper) => {
        const out = stepper.querySelector('.step-value');
        if (out) out.textContent = text;
        stepper.querySelector('[data-step="-1"]').disabled = value <= spec.min;
        stepper.querySelector('[data-step="1"]').disabled = value >= spec.max;
      });
    };
    for (const [key, spec] of Object.entries(GAME_SETTINGS)) {
      setStepper(`rule:${key}`, formatSetting(key, data.rules[key]), data.rules[key], spec);
      const lock = panel.querySelector(`[data-lock="${key}"]`);
      lock.innerHTML = icon(data.locks[key] ? 'lock' : 'unlock');
      lock.classList.toggle('on', data.locks[key]);
      lock.setAttribute('aria-pressed', String(data.locks[key]));
    }
    data.paddleSpeed.forEach((v, i) => setStepper(`speed:${i}`, String(v), v, PLAYER_SETTINGS.moveSpeed));
    panel.querySelectorAll('[data-policy]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.policy === data.policy)));
    panel.querySelectorAll('[data-permission]').forEach((box) => (box.checked = data.permissions[box.dataset.permission]));
    panel.querySelector('[data-music-volume]').value = data.musicVolume;
    panel.querySelector('.music-volume-out').textContent = Math.round(data.musicVolume * 100) + '%';
    const choice = this.currentMusicChoice();
    panel.querySelector('.music-list').innerHTML = this.musicOptions()
      .map(
        (o) => `<button type="button" class="music-option" data-music="${esc(o.value)}" aria-pressed="${o.value === choice}">
          <span class="mo-title">${esc(o.label)}</span><span class="mo-source">${esc(o.source)}</span></button>`
      )
      .join('');
    panel.querySelector('[data-volume]').value = data.volume;
    panel.querySelector('.volume-out').textContent = Math.round(data.volume * 100) + '%';
    panel.querySelector('[data-house="muted"]').checked = data.muted;
    panel.querySelector('[data-house="ambience"]').checked = data.ambience;
    panel.querySelector('[data-house="reduced"]').checked = data.effects === 'reduced';
    this.app.querySelector('[data-action="mute"]').innerHTML = icon(data.muted ? 'mute' : 'volume');
  }

  renderAdminStatus(status) {
    this.adminStatus = status;
    const el = this.app.querySelector('.admin-status');
    const parts = [`Room <b>${esc(DFP.room)}</b>.`, 'An admin panel in this browser connects automatically.'];
    if (status.relay) {
      const state = { open: 'connected', connecting: 'connecting…', closed: 'reconnecting…', error: `error: ${esc(status.detail)}` }[status.socket] || status.socket;
      parts.push(`Relay <code>${esc(status.relay)}</code>: ${state}.`);
    } else {
      parts.push('For other devices, add <code>?relay=…</code> to this page’s address (see server/README.md).');
    }
    el.innerHTML = parts.join(' ');
  }

  // -------------------------------------------------------------------------
  // Toasts, drawers, per-frame bits
  // -------------------------------------------------------------------------

  showToast(message, tone = 'info') {
    const box = this.app.querySelector('.toasts');
    const el = h(`<div class="toast ${tone}">${esc(message)}</div>`);
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => el.classList.add('leaving'), 3800);
    setTimeout(() => el.remove(), 4300);
  }

  /** Open or close the settings panel ('settings') or the controller details drawer ('debug'). */
  toggleDrawer(which, force) {
    const el = this.app.querySelector(which === 'settings' ? '.settings-panel' : '.debug-drawer');
    const open = force ?? el.hidden;
    if (open && which === 'settings' && ['playing', 'serve', 'countdown'].includes(this.game.state)) this.game.pause();
    el.hidden = !open;
    if (open && which === 'settings') {
      this.renderSettings();
      el.querySelector('.settings-head .tool').focus({ preventScroll: true });
    }
    if (open && which === 'debug') this.renderDebug();
  }

  /** While the settings panel is open, game keys (Space, arrows…) are left alone. */
  get settingsOpen() {
    return !this.app.querySelector('.settings-panel').hidden;
  }

  closeDrawers() {
    let closed = false;
    this.app.querySelectorAll('.drawer, .settings-panel').forEach((d) => {
      if (!d.hidden) closed = true;
      d.hidden = true;
    });
    return closed;
  }

  frame(dt, fps) {
    const g = this.game;
    const rally = this.app.querySelector('.rally');
    rally.textContent = g.state === 'playing' && g.rally >= 4 ? `rally ${g.rally}` : '';
    this.debugTimer += dt;
    if (this.debugTimer > 0.25) {
      this.debugTimer = 0;
      this.fps = fps;
      if (!this.app.querySelector('.debug-drawer').hidden) this.renderDebug();
      this.app.querySelector('.admin-indicator').classList.toggle('on', performance.now() - this.adminHeardAt < 6000);
    }
  }

  renderDebug() {
    const g = this.game;
    const body = this.app.querySelector('.debug-body');
    const players = g.players
      .map((p) => {
        const l = p.link;
        const uuids = p.target ? controllerUUIDs(p.target) : null;
        const value = l.stats.lastValue;
        const valueName = value === null ? '—' : `${value} (${['NEUTRAL', 'UP', 'DOWN', 'HELLO'][value] || '?'})`;
        const cfg = p.config;
        return `
          <section class="debug-player" style="--player:${p.color}">
            <h3><i class="chip"></i> Player ${p.slot} · ${esc(p.name)}</h3>
            <dl>
              <dt>Mode</dt><dd>${p.kind}</dd>
              <dt>Status</dt><dd>${l.status}${p.linkDetail ? ' — ' + esc(p.linkDetail) : ''}</dd>
              <dt>Controller</dt><dd>${p.target === LEGACY_2024 ? '2024 (shared UUID)' : p.target ?? '—'}${l.deviceName ? ' · ' + esc(l.deviceName) : ''}</dd>
              <dt>Generation</dt><dd>${l.generation || '—'}</dd>
              <dt>Handshake</dt><dd>${l.status === 'connected' ? (l.handshakeAcked ? 'complete' : 'waiting for first value') : '—'}</dd>
              <dt>Last value</dt><dd>${valueName}</dd>
              <dt>Messages</dt><dd>${l.stats.messages} · ${l.stats.rate.toFixed(1)}/s</dd>
              <dt>Paddle</dt><dd>speed ${p.moveSpeed} · size ${p.paddleSize}%</dd>
              ${uuids ? `<dt>Service</dt><dd class="mono">${uuids.service}</dd>` : ''}
            </dl>
            ${
              cfg
                ? `<p class="debug-label">Settings JSON (${l.stats.configReads} reads)</p><pre>${esc(cfg.raw || '(empty)')}</pre>
                   ${p.issues.length ? `<ul class="messages">${p.issues.map((m) => `<li class="warn">${esc(m)}</li>`).join('')}</ul>` : ''}
                   ${p.notes.length ? `<ul class="messages">${p.notes.map((m) => `<li class="note">${esc(m)}</li>`).join('')}</ul>` : ''}`
                : ''
            }
          </section>`;
      })
      .join('');
    const a = this.adminStatus;
    body.innerHTML = `
      ${players}
      <section class="debug-game">
        <h3>Game</h3>
        <dl>
          <dt>State</dt><dd>${g.state}</dd>
          <dt>Frame rate</dt><dd>${Math.round(this.fps || 0)} fps</dd>
          <dt>Puck</dt><dd>${g.puck.speed.toFixed(1)} units/tick · ×${g.puck.multiplier.toFixed(2)}</dd>
          <dt>Rules</dt><dd>${Object.entries(g.rules).map(([k, v]) => `${k} ${v}`).join(' · ')}</dd>
          <dt>Graphics</dt><dd>${window.__dfpongRenderer || ''}</dd>
          <dt>Admin</dt><dd>room ${esc(DFP.room)}${a && a.relay ? ' · relay ' + a.socket : ' · this browser only'}</dd>
        </dl>
      </section>`;
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
