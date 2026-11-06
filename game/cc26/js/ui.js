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
  bluetooth: '<path d="M7 7.5l10 9-5 4.5V3l5 4.5-10 9"/>',
  keyboard: '<path d="M3 6h18v12H3z"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  robot: '<path d="M5 8h14v11H5z"/><path d="M12 8V5M12 3.5v.01M9.5 12v1.5M14.5 12v1.5M9 16.5h6M3 12v3M21 12v3"/>',
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

const POLICY_LABELS = Object.fromEntries(apiEntries(DFPONG_API.policies).map(([key, p]) => [key, p.short]));

const PERMISSION_LABELS = Object.fromEntries(Object.keys(PERMISSIONS).map((key) => [key, DFPONG_API.permissions[key].short]));

class UI {
  constructor(game, { house, sound, classList, publisher }) {
    this.game = game;
    this.house = house;
    this.classList = classList;
    this.publisher = publisher;
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
            <span class="brand-table" hidden></span>
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
            <div class="overlay versus-intro" data-overlay="versus">
              <div class="vs-stack">
                <div class="vs-side" data-slot="1"><span class="vs-name"></span><span class="vs-owner"></span></div>
                <span class="vs-mark">vs</span>
                <div class="vs-side" data-slot="2"><span class="vs-name"></span><span class="vs-owner"></span></div>
              </div>
              <p class="hint">Space to skip</p>
            </div>
            <div class="overlay match-point" aria-live="assertive">
              <div class="mp-band">
                <p class="mp-title">Match point</p>
                <p class="mp-who"></p>
              </div>
            </div>
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
              <h2 class="pause-title"></h2>
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
              <p class="winner-owner"></p>
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
                <h1 class="wordmark"><span class="w1 lit">DF</span><span class="w2">PONG</span></h1>
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
        <div class="input-choice" role="radiogroup" aria-label="Player ${slot} plays with">
          <button type="button" role="radio" data-mode="controller">${icon('bluetooth')}<span>Controller</span></button>
          <button type="button" role="radio" data-mode="keyboard">${icon('keyboard')}<span>${matchMedia('(pointer: coarse)').matches ? 'Touch' : 'Keyboard'}</span></button>
          <button type="button" role="radio" data-mode="cpu">${icon('robot')}<span>Computer</span></button>
        </div>
        <div class="card-identity">
          <div class="card-id-text">
            <div class="card-name"></div>
            <div class="card-sub"></div>
          </div>
        </div>
        <div class="card-connect">
          <select class="device-select" aria-label="Player ${slot} controller"></select>
          <input class="device-number" type="number" min="${CONTROLLER_NUMBERS.min}" max="${CONTROLLER_NUMBERS.max}" inputmode="numeric" placeholder="#" aria-label="Controller number" hidden>
          <button class="btn connect">Connect</button>
          <button class="btn ghost forget" data-action="keyboard-${slot}" hidden>Use keyboard instead</button>
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
        <label class="switch"${DFPONG_API.permissions[key].description ? ` title="${esc(DFPONG_API.permissions[key].description)}"` : ''}><input type="checkbox" role="switch" data-permission="${key}"><span class="switch-track" aria-hidden="true"></span><span>${label}</span></label>`
      )
      .join('');
    return `
      <div class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" hidden>
        <div class="settings-sheet">
          <header class="settings-head">
            <h2 id="settings-title">Settings</h2>
            <div class="segmented settings-tabs" role="group" aria-label="Settings pages">
              <button type="button" data-settings-tab="game" aria-pressed="true">Game</button>
              <button type="button" data-settings-tab="players" aria-pressed="false">Players</button>
            </div>
            <button class="tool" data-action="settings" title="Close (Esc)">${icon('close')}</button>
          </header>

          ${this.playersTabHTML()}

          <div class="settings-tab" data-tab="game">
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
            <h3>When a controller changes its settings during a match</h3>
            <div class="segmented live-changes" role="group" aria-label="When a controller changes its settings during a match">${Object.entries(LIVE_CHANGES)
              .map(([key, o]) => `<button type="button" data-live="${key}" aria-pressed="false">${o.label}</button>`)
              .join('')}</div>
            <p class="set-note live-help"></p>
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
            <label class="set-row table-row">
              <span class="set-label">Table name</span>
              <input type="text" maxlength="24" placeholder="e.g. Table A" data-table autocomplete="off" spellcheck="false">
            </label>
            <p class="set-note">Running more than one game at once? Name each one so the admin panel can tell them apart. Saved on this computer.</p>
            <p class="set-note admin-status"></p>
            <a class="btn" target="_blank" rel="noopener" data-admin-link>Open admin panel</a>
          </section>
          </div>

          <footer class="settings-foot">
            <span class="set-link">Credits: <a href="https://github.com/DigitalFuturesOCADU/df-pong/blob/main/game/cc26/assets/sounds/CREDITS.md" target="_blank" rel="noopener">sounds</a> · <a href="https://github.com/DigitalFuturesOCADU/df-pong/blob/main/game/cc26/assets/music/CREDITS.md" target="_blank" rel="noopener">music</a></span>
            <button type="button" class="btn ghost" data-action="reset-settings">Reset to defaults</button>
            <button type="button" class="btn primary" data-action="settings">Done</button>
          </footer>
        </div>
      </div>`;
  }

  playersTabHTML() {
    const { deviceNumber, name, controllerName } = DFPONG_API.classList.fields;
    return `
      <div class="settings-tab players-tab" data-tab="players" hidden>
        <section class="set-group wide">
          <h3>Add a player</h3>
          <form class="player-row player-add">
            <input type="number" min="${deviceNumber.min}" max="${deviceNumber.max}" inputmode="numeric" data-add="deviceNumber" aria-label="Controller number">
            <input type="text" maxlength="${name.maxLength}" placeholder="First name" data-add="name" aria-label="First name" autocomplete="off" spellcheck="false">
            <input type="text" maxlength="${controllerName.maxLength}" placeholder="Controller name (optional)" data-add="controllerName" aria-label="Controller name" autocomplete="off" spellcheck="false">
            <button type="submit" class="btn primary">Add</button>
          </form>
          <p class="set-note players-status" role="status"></p>
        </section>
        <section class="set-group wide">
          <h3>Class list <span class="players-count"></span></h3>
          <div class="player-row player-labels" aria-hidden="true"><span>#</span><span>Name</span><span>Controller name</span></div>
          <ul class="player-list"></ul>
        </section>
        <section class="set-group wide">
          <h3>Keeping your changes</h3>
          <p class="set-note players-note"></p>
          <div class="players-actions">
            ${this.publisher.available ? '<button type="button" class="btn primary" data-action="save-players">Save to GitHub</button>' : ''}
            <button type="button" class="btn" data-action="download-players">Download players-config.json</button>
            <button type="button" class="btn ghost" data-action="revert-players">Undo my changes</button>
          </div>
          <p class="set-note players-status players-save-status" role="status"></p>
          ${this.publisher.available ? this.githubTokenHTML() : ''}
        </section>
      </div>`;
  }

  githubTokenHTML() {
    return `
      <form class="github-token" hidden>
        <p class="set-note">To save, paste in a GitHub access token. Under Repository access, choose only <b>${esc(this.publisher.config.repo)}</b>. The link fills in the rest. The token stays in this browser.</p>
        <p class="set-note"><a href="${esc(this.publisher.tokenLink)}" target="_blank" rel="noopener">Create a token on GitHub</a></p>
        <div class="github-token-row">
          <input type="password" data-github-token aria-label="GitHub access token" placeholder="github_pat_…" autocomplete="off" spellcheck="false">
          <button type="submit" class="btn primary">Save to GitHub</button>
          <button type="button" class="btn ghost" data-action="cancel-token">Cancel</button>
        </div>
        <label class="github-token-keep"><input type="checkbox" data-github-remember> Remember on this computer (not on a shared one)</label>
      </form>
      <p class="set-note github-token-held" hidden><span></span> <button type="button" class="btn ghost" data-action="forget-token">Forget the token</button></p>`;
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
        'download-players': () => this.downloadPlayers(),
        'revert-players': () => this.revertPlayers(),
        'save-players': () => this.savePlayers(),
        'cancel-token': () => this.showTokenForm(false),
        'forget-token': () => this.forgetToken(),
      };
      if (actions[action]) {
        if (action !== 'mute') this.sound.ui();
        actions[action]();
      } else if (action.startsWith('keyboard-')) {
        const p = g.players[Number(action.slice(9)) - 1];
        p.disconnect();
        p.setMode('keyboard');
        this.renderState();
      } else if (action.startsWith('reconnect-')) {
        g.players[Number(action.slice(10)) - 1].link.retry();
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
          player.selectController(n, this.rosterEntry(n));
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
        if (n >= CONTROLLER_NUMBERS.min && n <= CONTROLLER_NUMBERS.max) player.selectController(n, this.rosterEntry(n));
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

      // Controller / Keyboard / Computer: choosing another way to play hangs up a controller
      card.querySelectorAll('[data-mode]').forEach((b) =>
        b.addEventListener('click', () => {
          const mode = b.dataset.mode;
          if (mode !== 'controller' && player.linkStatus !== 'idle' && player.linkStatus !== 'error') player.disconnect();
          player.setMode(mode);
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
      const live = e.target.closest('[data-live]');
      if (live) this.house.merge({ liveChanges: live.dataset.live });
      const tab = e.target.closest('[data-settings-tab]');
      if (tab) this.showSettingsTab(tab.dataset.settingsTab);
    });
    this.bindPlayers(panel);
    panel.querySelectorAll('[data-permission]').forEach((box) =>
      box.addEventListener('change', () => this.house.merge({ permissions: { [box.dataset.permission]: box.checked } }))
    );
    panel.querySelector('[data-volume]').addEventListener('input', (e) => this.house.merge({ volume: parseFloat(e.target.value), muted: false }));
    panel.querySelector('[data-music-volume]').addEventListener('input', (e) => this.house.merge({ musicVolume: parseFloat(e.target.value), muted: false }));
    panel.querySelector('.music-list').addEventListener('click', (e) => {
      const option = e.target.closest('[data-music]');
      if (option) this.chooseMusic(option.dataset.music);
    });
    const tableInput = panel.querySelector('[data-table]');
    tableInput.value = DFP.table;
    tableInput.addEventListener('input', () => this.setTable(tableInput.value, { typing: true }));
    tableInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tableInput.blur();
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
    g.on('paddle', (side) => this.lightWordmark(side));
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
        ? `<optgroup label="Class list">${players
            .map((p) => `<option value="${p.deviceNumber}">${p.deviceNumber} · ${esc(p.name)}${p.controllerName ? ` — ${esc(p.controllerName)}` : ''}</option>`)
            .join('')}</optgroup>`
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

  /** The class list changed: update the lobby's lists, and anyone already chosen in them. */
  rosterChanged() {
    this.setRoster(this.classList.players);
    this.cards.forEach((card, i) => {
      const player = this.game.players[i];
      if (!Number.isInteger(player.target)) return;
      const entry = this.rosterEntry(player.target);
      const number = card.querySelector('.device-number');
      card.querySelector('.device-select').value = entry ? String(player.target) : 'number';
      number.hidden = !!entry;
      if (!entry) number.value = player.target;
      player.selectController(player.target, entry);
    });
    this.renderPlayersNote();
  }

  /** The class list entry for controller n ({deviceNumber, name, controllerName}), or null. */
  rosterEntry(n) {
    return this.roster.find((p) => p.deviceNumber === n) || null;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  renderAll() {
    this.renderTable();
    this.renderState();
    this.renderPlayers();
    this.renderScore();
    this.renderRulesPreview();
    this.renderSettings();
  }

  renderState() {
    const g = this.game;
    this.app.dataset.state = g.state;
    const matchPoint = g.state === 'serve' && g.matchPoint;
    this.app.querySelectorAll('[data-overlay]').forEach((o) => {
      const go = o.dataset.overlay === 'countdown' && g.state === 'serve' && g.serveAfterCountdown && !matchPoint; // keep "GO" up
      o.classList.toggle('show', o.dataset.overlay === g.state || go);
    });
    this.renderMatchPoint(matchPoint);
    const pause = this.app.querySelector('[data-action="pause"]');
    pause.innerHTML = icon(g.state === 'paused' ? 'play' : 'pause');
    pause.disabled = !['playing', 'serve', 'countdown', 'paused'].includes(g.state);

    if (g.state === 'versus') this.renderVersus();
    if (g.state === 'rules') this.renderRulesCard();
    if (g.state === 'paused') {
      this.app.querySelector('.pause-title').textContent = g.pauseTitle || '';
      this.app.querySelector('.pause-reason').textContent = g.pauseReason || '';
      this.app.querySelector('.fallbacks').innerHTML = g.players
        .filter((p) => p.linkStatus === 'reconnecting' || p.linkStatus === 'lost')
        .map(
          (p) =>
            (p.linkStatus === 'lost' ? `<button class="btn" data-action="reconnect-${p.slot}">Reconnect ${esc(p.name)}</button>` : '') +
            `<button class="btn ghost" data-action="keyboard-${p.slot}">Finish with ${esc(p.name)} on the keyboard</button>`
        )
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
    // The three-way choice shows the controller while one is connected, else what was picked
    const mode = kind === 'controller' ? 'controller' : player.mode;
    const touch = matchMedia('(pointer: coarse)').matches;
    card.dataset.kind = kind;
    card.dataset.mode = mode;
    card.dataset.status = status;

    const statusText = {
      idle: { controller: 'Not connected', keyboard: touch ? 'Touch' : 'Keyboard', cpu: 'Computer' }[mode],
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
    const id = player.target && player.target !== LEGACY_2024 ? `#${player.target}` : '';
    if (kind === 'controller') {
      const gen = player.link.generation;
      sub = [id, player.owner, gen ? `${gen} controller` : 'controller'].filter(Boolean).join(' · ');
    } else if (mode === 'cpu') {
      sub = 'Plays by itself';
    } else if (mode === 'controller') {
      sub = player.target ? [id, player.owner, 'not connected'].filter(Boolean).join(' · ') : 'Pick your number, then press Connect';
    } else {
      sub = touch ? 'Drag on your side of the table' : KEY_HINTS[player.index];
    }
    card.querySelector('.card-sub').textContent = sub;

    const select = card.querySelector('.device-select');
    const busy = ['choosing', 'connecting'].includes(status);
    select.disabled = busy; // choosing someone else while connected hangs up the current controller
    card.querySelector('.device-number').disabled = select.disabled;

    const connect = card.querySelector('.connect');
    connect.textContent = { connected: 'Disconnect', reconnecting: 'Disconnect', lost: 'Reconnect', choosing: 'Waiting…', connecting: 'Connecting…' }[status] || 'Connect';
    connect.disabled = busy || (!player.target && kind !== 'controller');
    connect.classList.toggle('primary', !!player.target && kind !== 'controller' && !busy);

    card.querySelector('.card-connect').hidden = mode !== 'controller';
    card.querySelector('.forget').hidden = status !== 'lost';
    const difficulty = card.querySelector('.cpu-difficulty');
    difficulty.hidden = mode !== 'cpu';
    const level = this.house.data.cpuLevel[player.index];
    difficulty.querySelector('input').value = level;
    difficulty.querySelector('output').textContent = `${level} · ${CPU_LEVELS.label(level)}`;
    card.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));

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
    const chip = (text, allowed, extra = '', title = '') =>
      chips.push(`<li class="${allowed ? '' : 'blocked'} ${extra}" ${allowed ? (title ? `title="${esc(title)}"` : '') : 'title="Turned off by the host"'}>${text}</li>`);
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
      const plan = this.game.state === 'lobby' ? this.game.resolveMusic() : this.game.musicPlan;
      const unused = plan.unused.includes(player.index);
      chip(
        `♪ music · ${esc(player.music ? player.music.label : wants.music.label)}${unused ? ' · not used' : ''}`,
        allow.music,
        `sound-${state}${unused ? ' unused' : ''}`,
        unused ? `The room's music choice (${plan.label}) is used instead. Pick "Players' choice" under Music to hear it.` : ''
      );
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
    this.app.querySelector('.first-to').textContent = g.inMatch || ['versus', 'rules'].includes(g.state) ? `first to ${g.rules.pointsToWin}` : '';
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
    let title = detail;
    // The room's choice wins over what the players brought: say whose music isn't playing
    if (plan.unused.length) {
      detail = `instead of ${this.unusedPicks(plan)}`;
      title = `The room's choice (${plan.label}) is used instead of ${this.unusedPicks(plan)}. Pick "Players' choice" to hear it.`;
    }
    tile.querySelector('.music-value').textContent = plan.label;
    tile.querySelector('.music-detail').textContent = detail;
    tile.title = title;
    tile.classList.toggle('request', plan.fromPlayers);
    tile.classList.toggle('overrides', plan.unused.length > 0);
  }

  /** "Kate's pick" or "both players' picks": the music a plan leaves out. */
  unusedPicks(plan) {
    const names = plan.unused.map((i) => this.game.players[i].name);
    return names.length > 1 ? "both players' picks" : `${names[0]}'s pick`;
  }

  /** The background game's puck hit a paddle: light up DF (left) or PONG (right). */
  lightWordmark(side) {
    if (this.game.state !== 'lobby') return;
    const words = this.app.querySelectorAll('.wordmark span');
    words.forEach((word, i) => {
      word.classList.toggle('lit', i === side);
      word.classList.toggle('flash', i === side);
    });
    // Drop the glow on the next frame so it fades out through the transition
    requestAnimationFrame(() => requestAnimationFrame(() => words[side].classList.remove('flash')));
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
    const musicRow = m.fromPlayers || m.unused.length
      ? `
          <div class="rule-row music-row" style="--delay:${0.25 + g.ruleNotes.length * 0.35}s">
            <span class="rule-label">Music</span>
            <span class="asks">${g.players
              .map((p) => (p.music && this.house.permissions.music ? `<span class="ask" style="--player:${p.color}">${esc(p.music.label)}</span>` : `<span class="ask empty">—</span>`))
              .join('')}</span>
            <span class="rule-result">${esc(m.label)}</span>
            <span class="rule-source">${esc(
              m.unused.length
                ? `the room's choice, instead of ${this.unusedPicks(m)}`
                : m.mode === 'alternate'
                  ? m.detail
                  : `${m.tracks[0].label} · ${trackSource(m.tracks[0])}`
            )}</span>
          </div>`
      : '';
    this.app.querySelector('.rule-rows').innerHTML = rows + musicRow;
  }

  /** MATCH POINT, across the table while the serve waits. */
  renderMatchPoint(winners) {
    const overlay = this.app.querySelector('.overlay.match-point');
    if (winners) {
      const who = overlay.querySelector('.mp-who');
      if (winners.length === 1) {
        const player = this.game.players[winners[0]];
        who.textContent = player.name;
        overlay.style.setProperty('--player', player.color);
      } else {
        who.textContent = 'Next point wins';
        overlay.style.setProperty('--player', 'var(--ink)');
      }
    }
    overlay.classList.toggle('show', !!winners);
  }

  /** NAME vs NAME, before the countdown. */
  renderVersus() {
    const overlay = this.app.querySelector('.overlay.versus-intro');
    this.game.players.forEach((player, i) => {
      const side = overlay.querySelector(`.vs-side[data-slot="${i + 1}"]`);
      side.style.setProperty('--player', player.color);
      side.querySelector('.vs-name').textContent = player.name;
      side.querySelector('.vs-owner').textContent = player.owner || '';
    });
    // Restart the entrance animations
    overlay.classList.remove('play');
    void overlay.offsetWidth;
    overlay.classList.add('play');
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
    card.querySelector('.winner-owner').textContent = winner.owner || '';
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
    panel.querySelectorAll('[data-live]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.live === data.liveChanges)));
    panel.querySelector('.live-help').textContent = `${LIVE_CHANGES[data.liveChanges].help} Rule requests and music always wait for the next match.`;
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

  // -------------------------------------------------------------------------
  // Settings → Players
  // -------------------------------------------------------------------------

  bindPlayers(panel) {
    const list = panel.querySelector('.player-list');
    const form = panel.querySelector('.player-add');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = (field) => form.querySelector(`[data-add="${field}"]`);
      const number = parseInt(value('deviceNumber').value, 10);
      if (!value('name').value.trim()) {
        this.playersStatus('Add a first name so people can find themselves in the list', 'warn');
        value('name').focus();
        return;
      }
      const problem = this.classList.add(number, { name: value('name').value, controllerName: value('controllerName').value });
      if (problem) {
        this.playersStatus(problem, 'warn');
        value('deviceNumber').focus();
        return;
      }
      this.playersStatus(`Added ${number} · ${this.classList.get(number).name}`);
      this.sound.ui();
      this.rosterChanged();
      this.renderPlayerList();
      value('name').value = '';
      value('controllerName').value = '';
      value('name').focus(); // ready for the next one
    });

    // A change applies when you leave the field, so the list isn't redrawn under your cursor
    list.addEventListener('change', (e) => {
      const row = e.target.closest('[data-number]');
      const field = e.target.dataset.field;
      if (!row || !field) return;
      const number = Number(row.dataset.number);
      if (field === 'deviceNumber') {
        const next = parseInt(e.target.value, 10);
        const problem = this.classList.renumber(number, next);
        if (problem) {
          this.playersStatus(problem, 'warn');
          e.target.value = number;
          return;
        }
        // Whoever picked this number in the lobby follows it, unless that board is connected: it keeps its number
        this.game.players.forEach((p) => {
          if (p.target === number && p.kind !== 'controller') p.selectController(next, null);
        });
        row.dataset.number = next;
        row.querySelector('[data-remove-player]').setAttribute('aria-label', `Remove ${next}`);
      } else {
        const entry = this.classList.update(number, { [field]: e.target.value });
        e.target.value = entry[field] || '';
      }
      this.playersStatus('');
      this.rosterChanged();
    });

    list.addEventListener('click', (e) => {
      const button = e.target.closest('[data-remove-player]');
      if (!button) return;
      const number = Number(button.closest('[data-number]').dataset.number);
      this.playersStatus(`Removed ${number} · ${this.classList.get(number).name}`);
      this.classList.remove(number);
      this.sound.ui();
      this.rosterChanged();
      this.renderPlayerList();
    });

    panel.querySelector('.github-token')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.querySelector('[data-github-token]');
      const remember = e.target.querySelector('[data-github-remember]').checked;
      if (!this.publisher.setToken(input.value, remember)) {
        this.saveStatus('That doesn\'t look like a GitHub token. Copy the whole thing, and only that.', 'warn');
        input.focus();
        return;
      }
      input.value = '';
      this.showTokenForm(false);
      this.savePlayers();
    });
  }

  showSettingsTab(name) {
    const panel = this.app.querySelector('.settings-panel');
    panel.querySelectorAll('[data-tab]').forEach((tab) => (tab.hidden = tab.dataset.tab !== name));
    panel.querySelectorAll('[data-settings-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.settingsTab === name)));
    panel.querySelector('[data-action="reset-settings"]').hidden = name !== 'game'; // it resets the game's settings, not the players
    panel.querySelector('.settings-sheet').scrollTop = 0;
    if (name === 'players') this.renderPlayerList();
  }

  /** A message beside the Add form. */
  playersStatus(text, tone = '', where = '.players-status') {
    const status = this.app.querySelector(where);
    status.textContent = text;
    status.dataset.tone = tone;
  }

  /** A message beside the save buttons, further down the tab. */
  saveStatus(text, tone = '') {
    this.playersStatus(text, tone, '.players-save-status');
  }

  renderPlayerList() {
    const panel = this.app.querySelector('.settings-panel');
    const { name, controllerName, deviceNumber } = DFPONG_API.classList.fields;
    const players = this.classList.players;
    panel.querySelector('.players-count').textContent = `· ${players.length}`;
    panel.querySelector('[data-add="deviceNumber"]').value = this.classList.nextNumber();
    panel.querySelector('.player-list').innerHTML = players
      .map(
        (p) => `
        <li class="player-row" data-number="${p.deviceNumber}">
          <input type="number" min="${deviceNumber.min}" max="${deviceNumber.max}" inputmode="numeric" value="${p.deviceNumber}" data-field="deviceNumber" aria-label="Controller number">
          <input type="text" maxlength="${name.maxLength}" value="${esc(p.name)}" data-field="name" aria-label="Name" autocomplete="off" spellcheck="false">
          <input type="text" maxlength="${controllerName.maxLength}" value="${esc(p.controllerName || '')}" placeholder="Uses their name" data-field="controllerName" aria-label="Controller name" autocomplete="off" spellcheck="false">
          <button type="button" class="tool" data-remove-player aria-label="Remove ${p.deviceNumber}" title="Remove">${icon('close')}</button>
        </li>`
      )
      .join('');
    this.renderPlayersNote();
  }

  renderPlayersNote() {
    const changes = this.classList.changeCount;
    const changesAre = `${changes} ${changes === 1 ? 'change is' : 'changes are'}`;
    let note;
    if (this.publisher.available) {
      note = changes
        ? `${changesAre} in this browser only. Save to GitHub to give them to every computer. The repo is public and keeps old versions, so use first names only.`
        : 'This is the class list every computer gets. Changes you make stay in this browser until you save them to GitHub.';
      if (this.classList.waitingForSite) note = `Your last save is on GitHub, and the site is still updating. ${note}`;
    } else {
      note = changes
        ? `${changesAre} saved in this browser only. To use them on other computers, download the file and replace ${DFP.roster} in this game's folder.`
        : `This is the class list file, ${DFP.roster}. Changes you make are saved in this browser until you download a new file.`;
    }
    this.app.querySelector('.players-note').textContent = note;
    this.app.querySelector('[data-action="revert-players"]').disabled = !changes;
    this.renderTokenHeld();
    this.watchSite();
  }

  renderTokenHeld() {
    const held = this.app.querySelector('.github-token-held');
    if (!held) return;
    held.hidden = !this.publisher.token;
    held.querySelector('span').textContent = this.publisher.tokenRemembered
      ? 'Your GitHub token is remembered on this computer.'
      : 'Your GitHub token is kept until this tab closes.';
  }

  showTokenForm(show) {
    const form = this.app.querySelector('.github-token');
    form.hidden = !show;
    if (show) form.querySelector('[data-github-token]').focus();
  }

  forgetToken() {
    this.publisher.forgetToken();
    this.saveStatus('Forgotten. This browser no longer has your token, but it still works until you delete it on GitHub.');
    this.renderTokenHeld();
  }

  async savePlayers() {
    if (this.savingPlayers) return;
    if (!this.classList.changeCount) {
      this.saveStatus('No changes to save.');
      return;
    }
    if (!this.publisher.token) {
      this.saveStatus('');
      this.showTokenForm(true);
      return;
    }
    const doubtful = this.classList.doubtfulNames();
    if (doubtful.length && !confirm(`${doubtful.join(', ')}: this looks like more than a first name. The repo is public and keeps old versions, so a name can't be fully taken back. Save anyway?`)) return;

    const repo = this.publisher.config.repo;
    const button = this.app.querySelector('[data-action="save-players"]');
    this.savingPlayers = true;
    button.disabled = true;
    this.saveStatus('Saving to GitHub…');
    const { outcome, detail } = await this.publisher.save();
    this.savingPlayers = false;
    button.disabled = false;

    const left = this.classList.changeCount;
    const messages = {
      saved: ['Saved to GitHub. Every computer gets the new list when the site updates, in about 2 minutes.'],
      nothing: ['GitHub already has this list, so there was nothing to save.'],
      changed: [left ? 'Someone else changed the list on GitHub. This is now their list with your changes on top. Check it, then save again.' : 'Someone else changed the list on GitHub. This is now their list, and your changes were already in it.', 'warn'],
      conflict: ['The file on GitHub keeps changing. Your changes are still here. Try again in a moment.', 'warn'],
      token: ['GitHub didn\'t accept that token. It may have expired. Paste in a new one. Your changes are still here.', 'warn'],
      denied: [`This token can't change ${repo}. It needs access to that repo with Contents set to Read and write, and the organization may need to approve it. Your changes are still here.`, 'warn'],
      missing: [`GitHub can't find the class list, or this token can't see ${repo}. Your changes are still here.`, 'warn'],
      unreadable: ['The class list file on GitHub isn\'t valid, so saving would overwrite it. Fix the file first. Your changes are still here.', 'warn'],
      offline: ['Couldn\'t reach GitHub. Your changes are still here.', 'warn'],
      error: [`GitHub said: ${detail}. Your changes are still here.`, 'warn'],
    };
    this.saveStatus(...messages[outcome]);
    if (outcome === 'token') this.showTokenForm(true);
    this.rosterChanged();
    this.renderPlayerList();
  }

  /** After a save: check the site every so often, to say when it has the new list. */
  watchSite() {
    if (this.siteTimer || !this.classList.waitingForSite) return;
    this.siteTimer = setTimeout(async () => {
      this.siteTimer = null;
      const gaveUp = Date.now() - this.classList.savedAt > CLASS_LIST_SAVED_MS;
      await readRoster().catch(() => {}); // out of date for now is fine: this tries again
      if (this.classList.waitingForSite) {
        this.watchSite();
        return;
      }
      this.saveStatus(gaveUp ? 'The list is on GitHub, but the site still hasn\'t updated. Look at the Actions tab of the repo on GitHub.' : 'The site has the new list now. Other computers get it when they reload.', gaveUp ? 'warn' : '');
      this.renderPlayersNote();
    }, 15000);
  }

  downloadPlayers() {
    const url = URL.createObjectURL(new Blob([this.classList.toFile()], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'players-config.json';
    link.click();
    URL.revokeObjectURL(url);
    this.saveStatus(`Downloaded. Replace ${DFP.roster} in this game's folder with it.`);
  }

  revertPlayers() {
    if (!confirm('Undo every change to the class list and go back to the file?')) return;
    this.classList.revert();
    this.saveStatus('');
    this.rosterChanged();
    this.renderPlayerList();
  }

  /** Name this game ("Table A"), from the settings panel or the admin panel. */
  setTable(name, { typing = false } = {}) {
    setTableName(name);
    this.renderTable(typing);
    this.game.emit('table');
  }

  renderTable(typing = false) {
    const chip = this.app.querySelector('.brand-table');
    chip.textContent = DFP.table;
    chip.hidden = !DFP.table;
    const input = this.app.querySelector('[data-table]');
    if (!typing && document.activeElement !== input) input.value = DFP.table;
    document.title = ['DF Pong', DFP.table, DFP.title].filter(Boolean).join(' · ');
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
            <h3><i class="chip"></i> Player ${p.slot} · ${esc(p.name)}${p.owner ? ` <span class="dim">(${esc(p.owner)})</span>` : ''}</h3>
            <dl>
              <dt>Mode</dt><dd>${p.kind}</dd>
              <dt>Status</dt><dd>${l.status}${p.linkDetail ? ' — ' + esc(p.linkDetail) : ''}</dd>
              <dt>Controller</dt><dd>${p.target === LEGACY_2024 ? '2024 (shared UUID)' : p.target ?? '—'}${l.deviceName ? ' · ' + esc(l.deviceName) : ''}</dd>
              <dt>Generation</dt><dd>${l.generation || '—'}</dd>
              <dt>Handshake</dt><dd>${l.status === 'connected' ? (l.handshakeAcked ? 'complete' : 'waiting for first value') : '—'}</dd>
              <dt>Last value</dt><dd>${valueName}</dd>
              <dt>Messages</dt><dd>${l.stats.messages} · ${l.stats.rate.toFixed(1)}/s</dd>
              <dt>Steering</dt><dd>${p.position !== null ? `by position · ${Math.round(p.position * 100)}%` : 'up / down'}</dd>
              <dt>Events sent</dt><dd>${l.eventsChar ? `${l.stats.eventsSent}${l.stats.lastEvent ? ` · last: ${esc(l.stats.lastEvent)}` : ''}${l.stats.eventsDropped ? ` · ${l.stats.eventsDropped} dropped (busy)` : ''}` : l.status === 'connected' ? 'not on this controller' : '—'}</dd>
              <dt>Actions</dt><dd>${l.actionsChar ? `${l.stats.actions} received${l.stats.lastAction ? ` · last: ${esc(l.stats.lastAction)}` : ''}` : l.status === 'connected' ? 'not on this controller' : '—'}</dd>
              <dt>Still there?</dt><dd>${l.status === 'connected' ? (l.stats.lastCheckMs === null ? 'checking…' : `answered in ${l.stats.lastCheckMs} ms (${l.stats.checks} checks)${l.missedChecks ? ` · ${l.missedChecks} missed` : ''}`) : '—'}</dd>
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
