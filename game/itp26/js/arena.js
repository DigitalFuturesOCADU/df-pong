/*
 * arena.js — the physics of Pong: paddles, puck, and a computer player.
 *
 * Everything happens in a fixed 1200 × 800 "world", whatever the screen size.
 * The renderer scales the world to fit the canvas.
 *
 * Speeds are measured in world units per 1/60 of a second, which matches
 * the numbers used by the 2024/2025 versions (puck speed 5, paddle speed 10…).
 * Physics runs at a fixed 120 steps per second, so the game plays at the same
 * speed on a 60 Hz projector and a 120 Hz laptop.
 */

const WORLD = { w: 1200, h: 800 };
const PHYSICS_STEP = 1 / 120; // seconds per physics step
const TICKS_PER_SECOND = 60; // speeds are "per tick"
const MAX_PUCK_SPEED = 42; // units per tick — fast, but still trackable

function clampNumber(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

class Paddle {
  constructor(side) {
    this.side = side; // 'left' | 'right'
    this.w = 20;
    this.baseH = 120;
    this.sizePct = 100;
    this.h = this.baseH;
    this.x = side === 'left' ? 34 : WORLD.w - 34;
    this.y = WORLD.h / 2;
    this.speed = 10; // units per tick
    this.dir = 0; // -1 up, 0 stop, +1 down
    this.target = null; // a y position to move toward (touch or computer player)
    this.vy = 0;
    this.hitAt = -10; // time of the last hit, for the squash animation
  }

  /** The face of the paddle that the puck bounces off. */
  get face() {
    return this.side === 'left' ? this.x + this.w / 2 : this.x - this.w / 2;
  }

  step(dt) {
    const ticks = dt * TICKS_PER_SECOND;
    const maxMove = this.speed * ticks;
    let move;
    if (this.target !== null) {
      move = clampNumber(this.target - this.y, -maxMove, maxMove);
    } else {
      move = this.dir * maxMove;
    }
    // Size changes (custom paddleSize) ease in rather than popping.
    const targetH = (this.baseH * this.sizePct) / 100;
    this.h += (targetH - this.h) * Math.min(1, dt * 8);

    const before = this.y;
    this.y = clampNumber(this.y + move, this.h / 2, WORLD.h - this.h / 2);
    this.vy = (this.y - before) / ticks;
  }

  center() {
    this.y = WORLD.h / 2;
    this.target = null;
    this.dir = 0;
  }
}

class Puck {
  constructor() {
    this.r = 12;
    this.base = 5;
    this.increment = 0.15;
    this.multiplier = 1;
    this.place();
  }

  place() {
    this.x = WORLD.w / 2;
    this.y = WORLD.h / 2;
    this.vx = 0;
    this.vy = 0;
    this.multiplier = 1;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  /** 0 at serve speed … 1 at the speed cap */
  get intensity() {
    return clampNumber((this.speed - this.base) / Math.max(1, MAX_PUCK_SPEED - this.base), 0, 1);
  }

  /** direction: -1 toward the left player, +1 toward the right */
  serve(direction, rules) {
    this.place();
    this.base = rules.puckSpeed;
    this.increment = rules.speedIncrement;
    const angle = (Math.random() * 2 - 1) * (Math.PI / 6);
    this.vx = Math.cos(angle) * this.base * direction;
    this.vy = Math.sin(angle) * this.base;
  }

  /**
   * Move the puck. Big moves are split into small sub-steps so a fast puck
   * can never jump through a paddle. Returns a list of events
   * (paddle hits, wall bounces, goals) for sound and visual effects.
   */
  step(dt, paddles) {
    const events = [];
    const ticks = dt * TICKS_PER_SECOND;
    const distance = this.speed * ticks;
    const steps = Math.max(1, Math.ceil(distance / (this.r * 0.5)));
    const sub = ticks / steps;

    for (let i = 0; i < steps; i++) {
      this.x += this.vx * sub;
      this.y += this.vy * sub;

      // Top and bottom walls
      if (this.y - this.r < 0 && this.vy < 0) {
        this.y = this.r;
        this.vy = -this.vy;
        events.push({ type: 'wall', x: this.x, y: 0 });
      } else if (this.y + this.r > WORLD.h && this.vy > 0) {
        this.y = WORLD.h - this.r;
        this.vy = -this.vy;
        events.push({ type: 'wall', x: this.x, y: WORLD.h });
      }

      // Paddles
      for (const p of paddles) {
        const toward = p.side === 'left' ? this.vx < 0 : this.vx > 0;
        if (!toward) continue;
        const touching = p.side === 'left' ? this.x - this.r <= p.face : this.x + this.r >= p.face;
        const notPast = p.side === 'left' ? this.x > p.x : this.x < p.x;
        const lined = Math.abs(this.y - p.y) <= p.h / 2 + this.r * 0.75;
        if (touching && notPast && lined) {
          // Where on the paddle it hit (-1 top … 1 bottom) sets the bounce angle, up to 45°.
          const rel = clampNumber((this.y - p.y) / (p.h / 2), -1, 1);
          const angle = rel * (Math.PI / 4);
          const speed = Math.min(this.base * this.multiplier, MAX_PUCK_SPEED);
          const away = p.side === 'left' ? 1 : -1;
          this.vx = Math.cos(angle) * speed * away;
          this.vy = Math.sin(angle) * speed;
          this.x = p.face + this.r * away;
          this.multiplier += this.increment;
          events.push({ type: 'paddle', side: p.side, x: this.x, y: this.y, rel, speed });
        }
      }

      // Goals: the puck has completely left the field
      if (this.x + this.r < 0) {
        events.push({ type: 'goal', scorer: 'right', x: 0, y: this.y });
        return events;
      }
      if (this.x - this.r > WORLD.w) {
        events.push({ type: 'goal', scorer: 'left', x: WORLD.w, y: this.y });
        return events;
      }
    }
    return events;
  }
}

/**
 * A simple computer player: predicts where the puck will arrive, with some human-like error.
 *   skill  0–1: how quickly it reacts
 *   miss   0–1: the chance its aim is off by more than the paddle can cover on a return
 */
class CpuBrain {
  constructor(paddle, skill = 0.8, miss = 0.1) {
    this.paddle = paddle;
    this.skill = skill;
    this.miss = miss;
    this.error = 0;
    this.thinkTimer = 0;
    this.lastDirection = 0;
  }

  update(puck, dt) {
    const p = this.paddle;
    const coming = p.side === 'left' ? puck.vx < 0 : puck.vx > 0;
    const direction = Math.sign(puck.vx);
    if (direction !== this.lastDirection) {
      // New rally direction: pick a fresh aiming mistake.
      this.lastDirection = direction;
      // Aim off by up to ±spread: beyond `reach` the paddle misses, which happens with probability `miss`
      const reach = p.h / 2 + puck.r * 0.75;
      const spread = this.miss > 0 ? reach / (1 - Math.min(this.miss, 0.9)) : reach * 0.5;
      this.error = (Math.random() * 2 - 1) * spread;
    }
    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    this.thinkTimer = 0.08 + (1 - this.skill) * 0.2; // reaction time

    if (coming && puck.vx !== 0) {
      p.target = clampNumber(predictY(puck, p.face) + this.error, p.h / 2, WORLD.h - p.h / 2);
    } else {
      p.target = WORLD.h / 2 + (puck.y - WORLD.h / 2) * 0.3; // drift back toward the middle
    }
  }
}

/** Where will the puck be when it reaches x? Follows wall bounces. */
function predictY(puck, x) {
  const t = (x - puck.x) / puck.vx;
  if (t < 0) return puck.y;
  const top = puck.r;
  const span = WORLD.h - 2 * puck.r;
  let y = puck.y + puck.vy * t - top;
  y = ((y % (2 * span)) + 2 * span) % (2 * span); // fold into one up-and-down cycle
  return top + (y > span ? 2 * span - y : y);
}
