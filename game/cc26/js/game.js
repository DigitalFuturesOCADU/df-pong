/*
 * game.js — the match: states, scoring, and what happens on every hit.
 *
 * States
 *   lobby      choosing players; the arena plays itself in the background
 *   versus     NAME vs NAME
 *   rules      showing how the players' setting requests were resolved
 *   countdown  3, 2, 1
 *   serve      the puck waits in the middle, pointing at the receiver
 *   playing    the rally
 *   paused
 *   won
 */

const VERSUS_SECONDS = 2.6;
const RULES_CARD_SECONDS = 3.2;
const SERVE_SECONDS = 0.9;
const MATCH_POINT_SECONDS = 2.2; // the serve waits longer while MATCH POINT is announced
const CONNECTION_CHECK_MS = DFPONG_API.bluetooth.timing.aliveCheckMs.value; // how often every connected controller is asked if it's still there

const KEYS = {
  up: [['KeyA', 'KeyW'], ['KeyP', 'ArrowUp']],
  down: [['KeyZ', 'KeyS'], ['KeyL', 'ArrowDown']],
};

class Game {
  constructor({ house, sound, effects, music }) {
    this.house = house;
    this.sound = sound;
    this.music = music;
    this.musicPlan = { mode: 'off', tracks: [], label: 'Off', detail: '', unused: [] };
    this.musicIndex = 0;
    this.fx = effects;
    this.listeners = {};

    this.players = [1, 2].map((slot) => new Player(slot, { house, sound, music, onChange: (p, what, info) => this.onPlayerChange(p, what, info) }));
    this.paddles = [new Paddle('left'), new Paddle('right')];
    this.cpus = this.paddles.map((p) => new CpuBrain(p, 0.85, 0.12));
    this.puck = new Puck();
    this.keys = new Set();

    this.state = 'lobby';
    this.stateTime = 0;
    this.pausedFrom = null;
    this.score = [0, 0];
    this.rules = { ...house.rules };
    this.ruleNotes = [];
    this.serveDirection = Math.random() < 0.5 ? -1 : 1;
    this.winner = null;
    this.rally = 0;
    this.stats = this.freshStats();
    this.timeScale = 1;
    this.slowUntil = 0;
    this.accumulator = 0;
    this.countdownValue = 3;

    this.liveMode = house.data.liveChanges;
    house.onChange(() => {
      // The host switched when changes apply, mid-match: start over with the new choice
      if (house.data.liveChanges !== this.liveMode) {
        this.liveMode = house.data.liveChanges;
        if (this.matchUnderway) this.holdChanges('start');
      }
      this.players.forEach((p) => p.apply());
      this.emit('players');
      this.emit('rules');
    });
    this.serveAttract();

    // A timer rather than the frame loop, so a stalled frame never stalls the check
    setInterval(() => this.checkControllers(), CONNECTION_CHECK_MS);
  }

  /** Make sure every connected controller still answers. One that doesn't is dropped and reconnected (see ble.js). */
  checkControllers() {
    this.players.forEach((p) => {
      if (p.linkStatus === 'connected') p.link.checkAlive();
    });
  }

  // -------------------------------------------------------------------------
  // Events (the UI and admin link listen to these)
  // -------------------------------------------------------------------------

  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach((fn) => fn(data));
  }

  toast(message, tone = 'info') {
    this.emit('toast', { message, tone });
  }

  setState(state) {
    this.state = state;
    this.stateTime = 0;
    this.emit('state', state);
  }

  // -------------------------------------------------------------------------
  // Handy views of the game
  // -------------------------------------------------------------------------

  /** From NAME vs NAME until someone wins. */
  get matchUnderway() {
    return ['versus', 'rules', 'countdown', 'serve', 'playing', 'paused'].includes(this.state);
  }

  /**
   * Hold back what controllers change during a match, as the host chose (house.data.liveChanges):
   *   instant  nothing is held
   *   point    paddle speed and size wait for the next serve; looks and sounds change at once
   *   match    everything waits until the match is over
   * moment: 'start' (a match starts), 'serve' (every serve), 'end' (won, or back to the lobby)
   */
  holdChanges(moment) {
    const mode = this.house.data.liveChanges;
    const all = Object.keys(CHANGE_GROUPS);
    this.players.forEach((p) => {
      if (moment === 'end' || mode === 'instant') {
        p.release(all);
      } else if (moment === 'start') {
        p.release(all);
        p.hold(mode === 'match' ? all : ['handling']);
      } else if (moment === 'serve' && mode === 'point') {
        p.release(['handling']);
        p.hold(['handling']);
      }
    });
  }

  get inMatch() {
    return ['countdown', 'serve', 'playing', 'paused', 'won'].includes(this.state);
  }

  get showPuck() {
    return !['won', 'rules', 'versus'].includes(this.state) && !(this.state === 'paused' && this.pausedFrom === 'countdown');
  }

  /** 0–1: how tense the rally is. Drives the center line, ambience and effects. */
  get intensity() {
    if (this.state === 'lobby') return this.puck.intensity * 0.3;
    if (this.state !== 'playing') return 0;
    return Math.max(this.puck.intensity, Math.min(1, this.rally / 18));
  }

  /** Index of the player one point from winning, or -1. */
  get matchPointFor() {
    if (!this.inMatch || this.state === 'won') return -1;
    const target = this.rules.pointsToWin - 1;
    if (this.score[0] >= target && this.score[0] > this.score[1]) return 0;
    if (this.score[1] >= target && this.score[1] > this.score[0]) return 1;
    return -1;
  }

  freshStats() {
    return { hits: 0, longestRally: 0, topSpeed: 1, startedAt: performance.now(), duration: 0 };
  }

  // -------------------------------------------------------------------------
  // Match flow
  // -------------------------------------------------------------------------

  /** Start (or restart) a match with the current players. */
  startMatch() {
    const resolved = resolveMatchRules(
      this.house,
      this.players.map((p) => ({ name: p.name, requests: p.requests }))
    );
    this.rules = resolved.rules;
    this.ruleNotes = resolved.notes;
    this.musicPlan = this.resolveMusic();
    this.musicIndex = Math.random() < 0.5 ? 0 : 1; // when alternating, who goes first is a coin flip
    this.score = [0, 0];
    this.winner = null;
    this.rally = 0;
    this.stats = this.freshStats();
    this.fx.stopCelebration();
    this.paddles.forEach((p) => p.center());
    this.puck.place();
    this.emit('score');
    this.emit('rules');

    this.showRulesCard = resolved.notes.some((n) => n.source !== 'house') || this.musicPlan.fromPlayers || this.musicPlan.unused.length > 0;
    this.setState('versus');
    this.tellControllers('matchStart');
    this.holdChanges('start');
    // Each name lands with its player's paddle sound
    this.players.forEach((player, i) =>
      this.fx.after(0.12 + i * 0.42, () => {
        if (this.state !== 'versus') return;
        this.fx.connect(this.paddles[i], player.rgb);
        this.sound.paddleHit(player, 0.35);
      })
    );
  }

  /** After NAME vs NAME: the rules card if there's something to show, else the countdown. */
  afterVersus() {
    if (this.showRulesCard) this.setState('rules');
    else this.startCountdown();
  }

  /** A player whose controller is dropping out: don't start play until it's back (or they switch to keys). */
  get waitingFor() {
    return this.players.find((p) => p.linkStatus === 'reconnecting' || p.linkStatus === 'lost') || null;
  }

  /** What the pause card says while a controller is gone. */
  describeDrop(player) {
    const what = player.linkStatus === 'lost' ? "couldn't reconnect. Check its power and wiring, then press Reconnect." : 'trying to reconnect…';
    this.pauseTitle = `${player.name} disconnected`;
    this.pauseReason = player.owner ? `${player.owner}'s controller · ${what}` : what[0].toUpperCase() + what.slice(1);
  }

  startCountdown() {
    if (this.waitingFor) {
      this.pausedFrom = 'countdown';
      this.describeDrop(this.waitingFor);
      this.setState('paused');
      return;
    }
    this.countdownValue = 3;
    this.setState('countdown');
    this.sound.countdown(3);
    this.tellControllers('countdown', 3);
    this.startMusic();
  }

  beginServe(direction, afterCountdown = false) {
    this.holdChanges('serve');
    this.serveAfterCountdown = afterCountdown;
    this.serveDirection = direction;
    this.puck.place();
    this.puck.base = this.rules.puckSpeed;
    this.rally = 0;
    // Match point: this point can end the match. The UI announces it while the serve waits.
    const winners = [0, 1].filter((i) => this.score[i] + 1 >= this.rules.pointsToWin);
    this.matchPoint = winners.length ? winners : null; // who wins the match if they score next
    this.serveHold = this.matchPoint ? MATCH_POINT_SECONDS : SERVE_SECONDS;
    this.fx.serve(this.puck.x, this.puck.y);
    if (this.matchPoint) {
      this.sound.matchPoint();
      // 1: you can win with this point, 0: they can, 2: whoever scores wins
      this.players.forEach((p, i) => p.sendEvent('matchPoint', winners.length === 2 ? 2 : winners.includes(i) ? 1 : 0));
      this.music?.duck(true);
    } else {
      this.sound.serve();
    }
    this.setState('serve');
  }

  pause(reason, title = '') {
    if (!['playing', 'serve', 'countdown'].includes(this.state)) return;
    this.pausedFrom = this.state;
    this.pauseTitle = title;
    this.pauseReason = reason || '';
    this.sound.stopAmbience();
    this.music?.duck(true);
    this.setState('paused');
    this.tellControllers('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    if (this.waitingFor) {
      this.describeDrop(this.waitingFor);
      this.emit('state', this.state);
      return;
    }
    this.music?.duck(false);
    if (this.house.data.ambience && this.musicPlan.mode === 'off') this.sound.startAmbience();
    this.tellControllers('resumed');
    if (this.pausedFrom === 'countdown') this.startCountdown();
    else this.setState(this.pausedFrom || 'playing');
  }

  /** Send the same event to both players' controllers (only controllers that have the events channel get it). */
  tellControllers(name, ...values) {
    this.players.forEach((p) => p.sendEvent(name, ...values));
  }

  togglePause() {
    if (this.state === 'paused') this.resume();
    else this.pause();
  }

  /** Space / Start button: does the obvious thing in every state. */
  primaryAction() {
    switch (this.state) {
      case 'lobby':
      case 'won':
        this.startMatch();
        break;
      case 'versus':
        this.afterVersus();
        break;
      case 'rules':
        this.startCountdown();
        break;
      case 'paused':
        this.resume();
        break;
      default:
        this.pause();
    }
  }

  toLobby() {
    this.holdChanges('end');
    this.sound.stopAmbience();
    this.music?.stop({ fade: 1 });
    this.music?.duck(false);
    this.fx.stopCelebration();
    this.score = [0, 0];
    this.emit('score');
    this.setState('lobby');
    this.serveAttract();
  }

  serveAttract() {
    this.puck.serve(Math.random() < 0.5 ? -1 : 1, { puckSpeed: 6, speedIncrement: 0.08 });
  }

  command(name) {
    const actions = {
      start: () => (this.state === 'lobby' || this.state === 'won' ? this.startMatch() : null),
      pause: () => this.pause('Paused by the host'),
      resume: () => this.resume(),
      reset: () => this.startMatch(),
      rematch: () => this.startMatch(),
      lobby: () => this.toLobby(),
    };
    if (hasOwn(actions, name)) actions[name]();
  }

  // -------------------------------------------------------------------------
  // Every frame
  // -------------------------------------------------------------------------

  update(dt) {
    // Slow motion after a miss, easing back to full speed.
    const now = performance.now();
    const target = now < this.slowUntil ? this.slowScale : 1;
    this.timeScale += (target - this.timeScale) * Math.min(1, dt * (target < this.timeScale ? 30 : 4));
    const simDt = dt * this.timeScale;
    this.stateTime += dt;

    switch (this.state) {
      case 'versus':
        if (this.stateTime > VERSUS_SECONDS) this.afterVersus();
        break;
      case 'rules':
        if (this.stateTime > RULES_CARD_SECONDS) this.startCountdown();
        break;
      case 'countdown': {
        const n = 3 - Math.floor(this.stateTime);
        if (n !== this.countdownValue) {
          this.countdownValue = n;
          this.sound.countdown(Math.max(0, n));
          this.tellControllers('countdown', Math.max(0, n));
          this.emit('countdown', n);
          if (n <= 0) this.beginServe(this.serveDirection, true);
        }
        break;
      }
      case 'serve':
        if (this.stateTime > this.serveHold) {
          if (this.matchPoint) this.music?.duck(false);
          this.puck.serve(this.serveDirection, this.rules);
          this.setState('playing');
        }
        break;
    }

    this.applyInputs(simDt);

    // Fixed-step physics
    if (this.state !== 'paused') {
      this.accumulator = Math.min(this.accumulator + simDt, PHYSICS_STEP * 10);
      while (this.accumulator >= PHYSICS_STEP) {
        this.accumulator -= PHYSICS_STEP;
        this.paddles.forEach((p) => p.step(PHYSICS_STEP));
        if (this.state === 'playing' || this.state === 'lobby') {
          for (const event of this.puck.step(PHYSICS_STEP, this.paddles)) this.handleEvent(event);
          this.watchForMiss();
        }
      }
    }

    this.fx.update(simDt, this.puck, this.state === 'playing' || this.state === 'lobby');
    if (this.state === 'playing') {
      this.sound.setIntensity(this.intensity);
      this.music?.setIntensity(this.intensity);
    }
  }

  applyInputs(dt) {
    const now = performance.now();
    this.players.forEach((player, i) => {
      const paddle = this.paddles[i];
      paddle.speed = player.moveSpeed;
      const cpu = this.cpus[i];
      // A side set to Computer plays at its chosen difficulty; the lobby's demo uses a steady 0.85
      const level = this.house.data.cpuLevel[i];
      cpu.skill = player.mode === 'cpu' ? CPU_LEVELS.skill(level) : 0.85;
      cpu.miss = player.mode === 'cpu' ? CPU_LEVELS.miss(level) : 0.12;
      paddle.sizePct = player.paddleSize;

      if (this.state === 'paused') {
        paddle.dir = 0;
        paddle.target = null;
        return;
      }

      const up = KEYS.up[i].some((k) => this.keys.has(k));
      const down = KEYS.down[i].some((k) => this.keys.has(k));
      if (up || down) player.lastInputAt = now;
      const practicing = now - player.lastInputAt < 5000 || player.touchY !== null;

      if (player.kind === 'controller' && player.position !== null) {
        // Steering by position (a knob or sensor): move there at normal paddle speed, like touch
        paddle.dir = 0;
        paddle.target = paddle.h / 2 + player.position * (WORLD.h - paddle.h);
      } else if (player.kind === 'controller') {
        paddle.target = null;
        paddle.dir = player.controllerDir;
      } else if (player.touchY !== null) {
        paddle.dir = 0;
        paddle.target = player.touchY;
      } else if (player.mode === 'cpu' || (this.state === 'lobby' && !practicing)) {
        paddle.dir = 0;
        paddle.speed = player.moveSpeed * (0.7 + 0.3 * cpu.skill); // easier computers are slower too
        this.cpus[i].update(this.puck, dt);
      } else {
        paddle.target = null;
        paddle.dir = up === down ? 0 : up ? -1 : 1;
      }
    });
  }

  /** A player taunts: a word over their paddle, a ring and a sound. The host can turn taunts off. */
  taunt(player, emote) {
    const spec = DFPONG_API.actions.codes.taunt;
    const now = performance.now();
    if (!this.house.permissions.taunts || this.state === 'paused') return;
    if (now - (player.lastTauntAt || -Infinity) < spec.cooldownMs) return; // too soon: ignored, not queued
    player.lastTauntAt = now;
    const word = spec.emotes[Number.isInteger(emote) && emote >= 0 && emote < spec.emotes.length ? emote : 0];
    this.fx.emote(this.paddles[player.index], word, player.rgb);
    this.sound.taunt(player);
    this.emit('taunt', { player, word });
    this.players[1 - player.index].sendEvent('taunted', spec.emotes.indexOf(word));
  }

  /** Once the puck is behind a paddle the point is certain — slow time down to savor it. */
  watchForMiss() {
    if (this.state !== 'playing' || performance.now() < this.slowUntil) return;
    const p = this.puck;
    const behindLeft = p.vx < 0 && p.x < this.paddles[0].x - 4;
    const behindRight = p.vx > 0 && p.x > this.paddles[1].x + 4;
    if (!behindLeft && !behindRight) return;
    const scorer = behindLeft ? 1 : 0;
    const winning = this.score[scorer] + 1 >= this.rules.pointsToWin;
    if (this.house.data.effects === 'reduced') return;
    this.slowScale = winning ? 0.12 : 0.25;
    this.slowUntil = performance.now() + (winning ? 900 : 380);
  }

  handleEvent(event) {
    const inLobby = this.state === 'lobby';
    const intensity = this.puck.intensity;

    if (event.type === 'paddle') {
      const i = event.side === 'left' ? 0 : 1;
      const player = this.players[i];
      this.paddles[i].hitAt = this.fx.time;
      this.fx.paddleHit(event, player.rgb, intensity);
      player.sendEvent('hit', intensity * 255);
      this.emit('paddle', i);
      // In the lobby, only make noise when a person is actually playing.
      if (!inLobby || player.kind === 'controller' || performance.now() - player.lastInputAt < 5000) {
        this.sound.paddleHit(player, intensity);
      }
      if (!inLobby) {
        this.rally++;
        this.stats.hits++;
        this.stats.longestRally = Math.max(this.stats.longestRally, this.rally);
        this.stats.topSpeed = Math.max(this.stats.topSpeed, this.puck.speed / this.rules.puckSpeed);
      }
    } else if (event.type === 'wall') {
      this.fx.wallHit(event, intensity);
      if (!inLobby) this.sound.wallBounce(event.x / WORLD.w, intensity);
    } else if (event.type === 'goal') {
      if (inLobby) {
        this.serveAttract();
        return;
      }
      this.scoreGoal(event);
    }
  }

  scoreGoal(event) {
    const i = event.scorer === 'left' ? 0 : 1;
    const scorer = this.players[i];
    this.score[i]++;
    this.sound.goal(scorer, event.scorer === 'left' ? 'right' : 'left');
    this.fx.goal(event, i, scorer.rgb);
    this.emit('score', { scorer: i });
    scorer.sendEvent('scored', this.score[i], this.score[1 - i]);
    this.players[1 - i].sendEvent('conceded', this.score[i], this.score[1 - i]);

    if (this.score[i] >= this.rules.pointsToWin) {
      this.winMatch(i);
      return;
    }
    this.beginServe(i === 0 ? 1 : -1); // the player who conceded receives
    if (this.musicPlan.mode === 'alternate') {
      this.musicIndex++;
      this.startMusic();
      const owner = this.players[this.musicIndex % 2];
      this.toast(`♪ ${owner.name}'s music`);
    }
  }

  winMatch(i) {
    this.winner = i;
    this.holdChanges('end');
    this.stats.duration = performance.now() - this.stats.startedAt;
    this.sound.stopAmbience();
    this.music?.stop({ fade: 0.8 });
    this.sound.win(this.players[i]);
    this.players[i].sendEvent('won');
    this.players[1 - i].sendEvent('lost');
    this.fx.win(this.players[i].rgb, this.players[i].side);
    [0.25, 0.38, 0.51, 0.64].forEach((t) => this.fx.after(t, () => this.sound.confettiPop()));
    this.setState('won');
  }

  // -------------------------------------------------------------------------
  // Players connecting, dropping, changing settings
  // -------------------------------------------------------------------------

  onPlayerChange(player, what, info) {
    const paddle = this.paddles[player.index];
    switch (what) {
      case 'connected':
        this.fx.connect(paddle, player.rgb);
        this.sound.connected(player);
        break;
      case 'reconnected':
        this.fx.connect(paddle, player.rgb);
        this.sound.connected(player);
        this.toast(`${player.name} is back`, 'good');
        if (this.state === 'paused') {
          if (this.waitingFor) this.describeDrop(this.waitingFor);
          else {
            this.pauseTitle = `${player.name} is back`;
            this.pauseReason = "Resume when you're ready.";
          }
          this.emit('state', this.state);
        }
        break;
      case 'dropped':
        this.sound.disconnected(player);
        if (['playing', 'serve', 'countdown'].includes(this.state)) {
          this.pause();
          this.describeDrop(player);
          this.emit('state', this.state);
        } else if (this.state === 'paused') {
          this.describeDrop(player);
          this.emit('state', this.state);
        }
        this.toast(`${player.name} disconnected — reconnecting…`, 'warn');
        break;
      case 'lost':
        if (this.state === 'paused') {
          this.describeDrop(player);
          this.emit('state', this.state);
        }
        break;
      case 'disconnected':
        this.sound.disconnected(player);
        if (this.state === 'paused') {
          // e.g. "Finish on the keyboard" during a drop
          if (this.waitingFor) this.describeDrop(this.waitingFor);
          else if (this.pauseTitle) {
            this.pauseTitle = `${player.name} is on the keyboard`;
            this.pauseReason = "Resume when you're ready.";
          }
          this.emit('state', this.state); // refresh the pause card
        }
        break;
      case 'config':
        if (info.requestsChanged && this.inMatch && this.state !== 'won') {
          this.toast(`${player.name} changed their rule requests — they apply next match`);
        }
        break;
      case 'taunt':
        this.taunt(player, info.emote);
        break;
      case 'held':
        // A controller changed something the host is holding back (not after a disconnect)
        if (player.kind === 'controller' && this.matchUnderway) {
          const looks = info.groups.includes('looks');
          const handling = info.groups.includes('handling');
          const what = looks && handling ? 'new settings' : handling ? 'new paddle settings' : 'new look and sounds';
          const when = this.house.data.liveChanges === 'point' && !looks ? 'from the next serve' : 'after this match';
          this.toast(`${player.name}'s ${what} apply ${when}`);
        }
        break;
    }
    this.emit('players', { player, what });
  }

  // -------------------------------------------------------------------------
  // Music
  // -------------------------------------------------------------------------

  /** The room's default track when nobody has chosen anything. */
  defaultTrack() {
    return trackFromName('drift');
  }

  resolveMusic() {
    return resolveMusic(this.house, this.players.map((p) => ({ name: p.name, music: p.music })), this.defaultTrack());
  }

  /** Start (or switch to) the track this point should have. Room sound only plays when there's no music. */
  startMusic() {
    const plan = this.musicPlan;
    if (!this.music || plan.mode === 'off') {
      this.music?.stop();
      if (this.house.data.ambience) this.sound.startAmbience();
      return;
    }
    this.sound.stopAmbience();
    this.music.duck(false);
    this.music.play(plan.tracks[this.musicIndex % plan.tracks.length], { fade: plan.mode === 'alternate' ? 1.2 : 2 });
  }

  /** In the lobby: play a few seconds of what the current choice would play. */
  previewMusic() {
    if (this.state !== 'lobby' || !this.music) return;
    const plan = this.resolveMusic();
    if (plan.mode === 'off') this.music.stop({ fade: 0.6 });
    else this.music.preview(plan.tracks[0], 10);
  }

  /** Everything the admin panel needs to know. */
  snapshot() {
    return {
      state: this.state,
      score: this.score,
      rules: this.rules,
      players: this.players.map((p) => p.snapshot()),
      house: this.house.rules,
      locks: this.house.locks,
      policy: this.house.policy,
      liveChanges: this.house.data.liveChanges,
      permissions: this.house.permissions,
      musicChoice: this.house.data.music,
      music: this.resolveMusic().label,
    };
  }
}
