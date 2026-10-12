/*
 * game.js — the match: states, scoring, and what happens on every hit.
 *
 * States
 *   lobby      choosing players; the arena plays itself in the background
 *   rules      showing how the players' setting requests were resolved
 *   countdown  3, 2, 1
 *   serve      the puck waits in the middle, pointing at the receiver
 *   playing    the rally
 *   paused
 *   won
 */

const RULES_CARD_SECONDS = 3.2;
const SERVE_SECONDS = 0.9;

const KEYS = {
  up: [['KeyA', 'KeyW'], ['KeyP', 'ArrowUp']],
  down: [['KeyZ', 'KeyS'], ['KeyL', 'ArrowDown']],
};

class Game {
  constructor({ house, sound, effects }) {
    this.house = house;
    this.sound = sound;
    this.fx = effects;
    this.listeners = {};

    this.players = [1, 2].map((slot) => new Player(slot, { house, sound, onChange: (p, what, info) => this.onPlayerChange(p, what, info) }));
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

    house.onChange(() => {
      this.players.forEach((p) => p.apply());
      this.emit('players');
      this.emit('rules');
    });
    this.serveAttract();
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

  get inMatch() {
    return ['countdown', 'serve', 'playing', 'paused', 'won'].includes(this.state);
  }

  get showPuck() {
    return this.state !== 'won' && this.state !== 'rules' && !(this.state === 'paused' && this.pausedFrom === 'countdown');
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
    this.score = [0, 0];
    this.winner = null;
    this.rally = 0;
    this.stats = this.freshStats();
    this.fx.stopCelebration();
    this.paddles.forEach((p) => p.center());
    this.puck.place();
    this.emit('score');
    this.emit('rules');

    const worthShowing = resolved.notes.some((n) => n.source !== 'house');
    if (worthShowing) this.setState('rules');
    else this.startCountdown();
  }

  /** A player whose controller is dropping out: don't start play until it's back (or they switch to keys). */
  get waitingFor() {
    return this.players.find((p) => p.linkStatus === 'reconnecting' || p.linkStatus === 'lost') || null;
  }

  startCountdown() {
    if (this.waitingFor) {
      this.pausedFrom = 'countdown';
      this.pauseReason = `Waiting for ${this.waitingFor.name}'s controller…`;
      this.setState('paused');
      return;
    }
    this.countdownValue = 3;
    this.setState('countdown');
    this.sound.countdown(3);
    if (this.house.data.ambience) this.sound.startAmbience();
  }

  beginServe(direction, afterCountdown = false) {
    this.serveAfterCountdown = afterCountdown;
    this.serveDirection = direction;
    this.puck.place();
    this.puck.base = this.rules.puckSpeed;
    this.rally = 0;
    this.fx.serve(this.puck.x, this.puck.y);
    this.sound.serve();
    this.setState('serve');
  }

  pause(reason) {
    if (!['playing', 'serve', 'countdown'].includes(this.state)) return;
    this.pausedFrom = this.state;
    this.pauseReason = reason || '';
    this.sound.stopAmbience();
    this.setState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    if (this.waitingFor) {
      this.pauseReason = `Waiting for ${this.waitingFor.name}'s controller…`;
      this.emit('state', this.state);
      return;
    }
    if (this.house.data.ambience) this.sound.startAmbience();
    if (this.pausedFrom === 'countdown') this.startCountdown();
    else this.setState(this.pausedFrom || 'playing');
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
    this.sound.stopAmbience();
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
      case 'rules':
        if (this.stateTime > RULES_CARD_SECONDS) this.startCountdown();
        break;
      case 'countdown': {
        const n = 3 - Math.floor(this.stateTime);
        if (n !== this.countdownValue) {
          this.countdownValue = n;
          this.sound.countdown(Math.max(0, n));
          this.emit('countdown', n);
          if (n <= 0) this.beginServe(this.serveDirection, true);
        }
        break;
      }
      case 'serve':
        if (this.stateTime > SERVE_SECONDS) {
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
    if (this.state === 'playing') this.sound.setIntensity(this.intensity);
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

      if (player.kind === 'controller') {
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

    if (this.score[i] >= this.rules.pointsToWin) {
      this.winMatch(i);
      return;
    }
    this.beginServe(i === 0 ? 1 : -1); // the player who conceded receives
    if (this.matchPointFor !== -1) this.sound.matchPoint();
  }

  winMatch(i) {
    this.winner = i;
    this.stats.duration = performance.now() - this.stats.startedAt;
    this.sound.stopAmbience();
    this.sound.win(this.players[i]);
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
        if (this.state === 'paused' && !this.waitingFor) {
          this.pauseReason = `${player.name} is back. Resume when you're ready.`;
          this.emit('state', this.state);
        }
        break;
      case 'dropped':
        this.sound.disconnected(player);
        if (['playing', 'serve', 'countdown'].includes(this.state)) this.pause(`${player.name}'s controller dropped — trying to reconnect…`);
        else if (this.state === 'paused') this.emit('state', this.state);
        this.toast(`${player.name}'s controller dropped — reconnecting…`, 'warn');
        break;
      case 'disconnected':
        this.sound.disconnected(player);
        if (this.state === 'paused') this.emit('state', this.state); // refresh the pause card
        break;
      case 'config':
        if (info.requestsChanged && this.inMatch && this.state !== 'won') {
          this.toast(`${player.name} changed their rule requests — they apply next match`);
        }
        break;
    }
    this.emit('players', { player, what });
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
      permissions: this.house.permissions,
    };
  }
}
