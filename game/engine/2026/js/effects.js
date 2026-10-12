/*
 * effects.js — the "juice": sparks, rings, shake, flashes and confetti.
 *
 * Effects never change the game; they only react to it. Everything is in
 * world units (1200 × 800) and drawn into the same buffer as the game.
 * When "reduced motion" is on, shake and distortion are switched off and
 * particle counts drop.
 */

const WHITE = { r: 255, g: 255, b: 255 };
const INK = { r: 236, g: 232, b: 223 };

class Effects {
  constructor() {
    this.particles = [];
    this.rings = [];
    this.waves = []; // shockwaves for the WebGL pass: {x, y (0–1), t0, strength}
    this.trail = [];
    this.time = 0;
    this.trauma = 0; // 0–1, drives screen shake
    this.impact = 0; // 0–1, drives color fringing
    this.flash = { color: INK, a: 0 };
    this.wash = [0, 0]; // per-side color wash after a goal
    this.scorePop = [0, 0];
    this.confetti = null;
    this.scheduled = []; // effects timed on this clock, so they follow slow motion
    this.reduced = false;
  }

  after(seconds, fn) {
    this.scheduled.push({ at: this.time + seconds, fn });
  }

  setReduced(reduced) {
    this.reduced = reduced;
    if (reduced) {
      this.trauma = 0;
      this.waves = [];
    }
  }

  get maxParticles() {
    return this.reduced ? 220 : 900;
  }

  update(dt, puck, trackPuck) {
    this.time += dt;
    const due = this.scheduled.filter((s) => s.at <= this.time);
    this.scheduled = this.scheduled.filter((s) => s.at > this.time);
    due.forEach((s) => s.fn());
    for (const p of this.particles) {
      const drag = Math.pow(p.drag, dt * 60);
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt / p.ttl;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const r of this.rings) {
      r.life -= dt / r.ttl;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    this.waves = this.waves.filter((w) => this.time - w.t0 < 1.4);

    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    this.impact = Math.max(0, this.impact - dt * 2.5);
    this.flash.a = Math.max(0, this.flash.a - dt * 2.4);
    this.wash = this.wash.map((w) => Math.max(0, w - dt * 0.9));
    this.scorePop = this.scorePop.map((s) => Math.max(0, s - dt * 1.4));

    if (trackPuck) {
      this.trail.push({ x: puck.x, y: puck.y });
      if (this.trail.length > 18) this.trail.shift();
    } else if (this.trail.length) {
      this.trail.shift();
    }

    if (this.confetti) this.updateConfetti(dt);
  }

  // -------------------------------------------------------------------------
  // Building blocks
  // -------------------------------------------------------------------------

  burst(x, y, o) {
    const count = Math.round(o.count * (this.reduced ? 0.4 : 1));
    const room = this.maxParticles - this.particles.length;
    for (let i = 0; i < Math.min(count, room); i++) {
      const angle = (o.angle ?? 0) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2);
      const speed = lerpRange(o.speed);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: lerpRange(o.size),
        ttl: lerpRange(o.ttl),
        life: 1,
        drag: o.drag ?? 0.94,
        gravity: o.gravity ?? 0,
        color: Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : o.color,
        shape: o.shape || 'dot',
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * (o.spin ?? 0),
      });
    }
  }

  ring(x, y, color, maxR, ttl = 0.5, weight = 3) {
    this.rings.push({ x, y, color, maxR, ttl, life: 1, weight });
  }

  wave(x, y, strength) {
    if (this.reduced) return;
    this.waves.push({ x: x / WORLD.w, y: y / WORLD.h, t0: this.time, strength });
    if (this.waves.length > 6) this.waves.shift();
  }

  shake(amount) {
    if (this.reduced) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  shakeOffset() {
    if (this.reduced || this.trauma <= 0) return { x: 0, y: 0 };
    const s = this.trauma * this.trauma * 16;
    const t = this.time * 38;
    return { x: Math.sin(t * 1.3) * s * Math.cos(t * 0.7), y: Math.cos(t * 1.7) * s * Math.sin(t * 0.9) };
  }

  // -------------------------------------------------------------------------
  // Game moments
  // -------------------------------------------------------------------------

  paddleHit(event, color, intensity) {
    const away = event.side === 'left' ? 0 : Math.PI;
    const spark = mixColor(color, WHITE, 0.35);
    this.burst(event.x, event.y, {
      count: 10 + intensity * 26,
      color: [color, spark, spark],
      angle: away,
      spread: Math.PI * 0.9,
      speed: [180, 520 + intensity * 700],
      size: [2, 5],
      ttl: [0.25, 0.6],
      drag: 0.9,
      shape: 'spark',
    });
    this.ring(event.x, event.y, color, 40 + intensity * 70, 0.4, 3);
    this.wave(event.x, event.y, 0.35 + intensity * 0.65);
    this.shake(0.12 + intensity * 0.3);
    this.impact = Math.min(1, this.impact + 0.15 + intensity * 0.5);
  }

  wallHit(event, intensity) {
    const dir = event.y <= 0 ? Math.PI / 2 : -Math.PI / 2;
    this.burst(event.x, event.y, {
      count: 4 + intensity * 8,
      color: INK,
      angle: dir,
      spread: Math.PI * 0.8,
      speed: [60, 220 + intensity * 260],
      size: [1.5, 3],
      ttl: [0.2, 0.45],
      drag: 0.9,
    });
    this.ring(event.x, event.y, INK, 18 + intensity * 30, 0.3, 2);
    if (intensity > 0.5) this.shake(0.05);
  }

  goal(event, scorerIndex, color) {
    const inward = event.scorer === 'left' ? Math.PI : 0;
    this.burst(event.x, event.y, {
      count: 90,
      color: [color, mixColor(color, WHITE, 0.4), INK],
      angle: inward,
      spread: Math.PI * 1.2,
      speed: [200, 1100],
      size: [2, 6],
      ttl: [0.5, 1.3],
      drag: 0.93,
      gravity: 120,
    });
    this.ring(event.x, event.y, color, 420, 0.9, 6);
    this.wave(event.x, event.y, 1.1);
    this.flash = { color, a: 0.55 };
    this.wash[scorerIndex] = 1;
    this.scorePop[scorerIndex] = 1;
    this.shake(0.65);
    this.impact = 1;
  }

  connect(paddle, color) {
    this.burst(paddle.x, paddle.y, {
      count: 70,
      color: [color, mixColor(color, WHITE, 0.5)],
      speed: [80, 600],
      size: [2, 6],
      ttl: [0.4, 1.1],
      drag: 0.92,
    });
    this.ring(paddle.x, paddle.y, color, 160, 0.7, 4);
    this.wave(paddle.x, paddle.y, 0.8);
  }

  serve(x, y) {
    this.ring(x, y, INK, 60, 0.6, 2);
  }

  // Confetti rains for a few seconds, with bursts timed to the fanfare.
  win(color, side) {
    this.confetti = { until: this.time + 4.5, colors: [color, mixColor(color, WHITE, 0.45), INK, mixColor(color, INK, 0.5)] };
    const x = side === 'left' ? WORLD.w * 0.25 : WORLD.w * 0.75;
    const colors = this.confetti.colors;
    [0, 0.13, 0.26, 0.39].forEach((delay, i) => {
      this.after(0.25 + delay, () => this.firework(x + (i - 1.5) * 140, WORLD.h * (0.35 + 0.1 * (i % 2)), colors));
    });
    this.flash = { color, a: 0.45 };
    this.wave(x, WORLD.h / 2, 1.2);
    this.shake(0.5);
    this.impact = 1;
  }

  firework(x, y, colors) {
    this.burst(x, y, {
      count: 80,
      color: colors,
      speed: [150, 750],
      size: [5, 11],
      ttl: [1.2, 2.4],
      drag: 0.95,
      gravity: 260,
      shape: 'paper',
      spin: 14,
    });
    this.ring(x, y, colors[0], 200, 0.7, 3);
    this.wave(x, y, 0.9);
  }

  updateConfetti(dt) {
    if (this.time > this.confetti.until) {
      this.confetti = null;
      return;
    }
    const perSecond = this.reduced ? 25 : 90;
    const count = Math.random() < perSecond * dt ? Math.ceil(perSecond * dt) : 0;
    for (let i = 0; i < count; i++) {
      this.burst(Math.random() * WORLD.w, -20, {
        count: 1,
        color: this.confetti.colors,
        angle: Math.PI / 2,
        spread: 0.8,
        speed: [40, 180],
        size: [6, 12],
        ttl: [2.5, 4],
        drag: 0.985,
        gravity: 160,
        shape: 'paper',
        spin: 10,
      });
    }
  }

  stopCelebration() {
    this.confetti = null;
    this.scheduled = [];
  }

  // -------------------------------------------------------------------------
  // Drawing (world transform already applied)
  // -------------------------------------------------------------------------

  draw(g) {
    g.noFill();
    for (const r of this.rings) {
      const t = 1 - r.life;
      const radius = r.maxR * easeOutCubic(t);
      g.stroke(r.color.r, r.color.g, r.color.b, 255 * r.life * 0.7);
      g.strokeWeight(r.weight * r.life + 0.5);
      g.circle(r.x, r.y, radius * 2);
    }
    g.noStroke();
    for (const p of this.particles) {
      const a = 255 * Math.min(1, p.life * 1.5);
      g.fill(p.color.r, p.color.g, p.color.b, a);
      if (p.shape === 'paper') {
        g.push();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.rect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6 * Math.abs(Math.cos(p.rot * 1.7)) + 1);
        g.pop();
      } else if (p.shape === 'spark') {
        const len = Math.min(26, Math.hypot(p.vx, p.vy) * 0.03) + p.size;
        const angle = Math.atan2(p.vy, p.vx);
        g.push();
        g.translate(p.x, p.y);
        g.rotate(angle);
        g.rect(-len, -p.size * 0.35, len, p.size * 0.7);
        g.pop();
      } else {
        g.circle(p.x, p.y, p.size * (0.4 + 0.6 * p.life));
      }
    }
  }
}

function lerpRange(range) {
  return Array.isArray(range) ? range[0] + Math.random() * (range[1] - range[0]) : range;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
