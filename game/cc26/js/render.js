/*
 * render.js — draws the arena into a 2D p5.Graphics buffer.
 *
 * This is ordinary p5 2D drawing. The buffer is then shown on screen,
 * optionally through the WebGL post-processing pass in postfx.js.
 */

const AMBER = { r: 224, g: 164, b: 88 };
const EMBER = { r: 214, g: 104, b: 76 };
const DISPLAY_FONT = 'Space Grotesk';

function drawWorld(g, game, fx, view) {
  const ctx = g.drawingContext;
  g.push();
  g.background(18, 18, 17);
  g.scale(view.scale);
  const shake = fx.shakeOffset();
  g.translate(shake.x, shake.y);

  drawCourt(g, game, fx);
  if (game.inMatch) drawScoreWatermarks(g, game, fx);
  drawTrail(g, game, fx);
  if (game.state === 'serve') drawServe(g, game, fx);
  game.paddles.forEach((p, i) => drawPaddle(g, ctx, p, game.players[i], fx, view, game.intensity));
  if (game.showPuck) drawPuck(g, ctx, game.puck, fx, view, game.state === 'serve');
  fx.draw(g);

  if (fx.flash.a > 0) {
    const c = fx.flash.color;
    g.noStroke();
    g.fill(c.r, c.g, c.b, 26 * fx.flash.a);
    g.rect(-40, -40, WORLD.w + 80, WORLD.h + 80);
  }
  g.pop();
}

function drawCourt(g, game, fx) {
  const intensity = game.intensity;
  g.noStroke();

  // Each half carries a whisper of its player's color, which swells after a goal.
  game.players.forEach((player, i) => {
    const c = player.rgb;
    const alpha = 255 * (0.035 + fx.wash[i] * 0.16);
    g.fill(c.r, c.g, c.b, alpha);
    g.rect(i === 0 ? 0 : WORLD.w / 2, 0, WORLD.w / 2, WORLD.h);
  });

  // Center line: dashes start to flow as a rally builds.
  const dash = 18;
  const gap = 16;
  const offset = (fx.time * (20 + intensity * 160)) % (dash + gap);
  g.fill(236, 232, 223, 255 * (0.12 + intensity * 0.22));
  for (let y = -dash + offset; y < WORLD.h; y += dash + gap) {
    g.rect(WORLD.w / 2 - 1.5, y, 3, dash);
  }

  // Top and bottom edges brighten as the rally builds
  g.fill(236, 232, 223, 255 * (0.1 + intensity * 0.3));
  g.rect(0, 0, WORLD.w, 2);
  g.rect(0, WORLD.h - 2, WORLD.w, 2);
}

function drawScoreWatermarks(g, game, fx) {
  g.textFont(DISPLAY_FONT);
  g.textStyle(BOLD);
  g.textAlign(CENTER, CENTER);
  game.players.forEach((player, i) => {
    const pop = fx.scorePop[i];
    const c = mixColor(player.rgb, INK, 0.2);
    const matchPoint = game.matchPointFor === i;
    const pulse = matchPoint ? 0.03 * (1 + Math.sin(fx.time * 5)) : 0;
    const fade = game.state === 'won' ? 0.35 : 1; // step back for the winner's name
    g.fill(c.r, c.g, c.b, 255 * (0.07 + pop * 0.35 + pulse) * fade);
    g.textSize(300 * (1 + pop * 0.18));
    g.text(game.score[i], WORLD.w * (i === 0 ? 0.25 : 0.75), WORLD.h * 0.47);
  });
}

function drawTrail(g, game, fx) {
  const trail = fx.trail;
  if (trail.length < 2 || !game.showPuck) return;
  const puck = game.puck;
  const heat = puckColor(puck.intensity);
  g.noStroke();
  for (let i = 0; i < trail.length; i++) {
    const t = i / trail.length;
    g.fill(heat.r, heat.g, heat.b, 255 * t * t * (0.18 + puck.intensity * 0.35));
    g.circle(trail[i].x, trail[i].y, puck.r * 2 * (0.3 + 0.7 * t));
  }
}

function drawServe(g, game, fx) {
  const puck = game.puck;
  const t = fx.time;
  const dir = game.serveDirection;
  g.noFill();
  g.stroke(236, 232, 223, 90 + 60 * Math.sin(t * 8));
  g.strokeWeight(2);
  g.circle(puck.x, puck.y, puck.r * 2 + 26 + 8 * Math.sin(t * 8));
  // Chevrons point at the player who is about to receive.
  g.noStroke();
  for (let i = 0; i < 3; i++) {
    const phase = (t * 2 + i / 3) % 1;
    g.fill(236, 232, 223, 140 * (1 - phase));
    const x = puck.x + dir * (40 + i * 22 + phase * 10);
    g.triangle(x, puck.y - 9, x, puck.y + 9, x + dir * 10, puck.y);
  }
}

function drawPaddle(g, ctx, paddle, player, fx, view, intensity) {
  const since = fx.time - paddle.hitAt;
  const squash = since < 0.2 ? 1 - since / 0.2 : 0;
  const away = paddle.side === 'left' ? 1 : -1;
  const w = paddle.w * (1 + 0.7 * squash);
  const h = paddle.h * (1 - 0.1 * squash);
  const x = paddle.x - away * 6 * squash;
  let color = mixColor(player.rgb, WHITE, squash * 0.75);
  let alpha = 255;

  if (player.linkStatus === 'reconnecting' || player.linkStatus === 'connecting') {
    alpha = 255 * (0.35 + 0.25 * Math.sin(fx.time * 6)); // waiting for its controller
  } else if (player.linkStatus === 'lost') {
    alpha = 90;
  }

  ctx.shadowBlur = (6 + 14 * intensity + 26 * squash) * view.scale * view.density;
  ctx.shadowColor = rgba(player.rgb, 0.55);
  g.noStroke();
  g.fill(color.r, color.g, color.b, alpha);
  g.rect(x - w / 2, paddle.y - h / 2, w, h, 5);
  ctx.shadowBlur = 0;
}

function puckColor(intensity) {
  return intensity < 0.6 ? mixColor(INK, AMBER, intensity / 0.6) : mixColor(AMBER, EMBER, (intensity - 0.6) / 0.4);
}

function drawPuck(g, ctx, puck, fx, view, serving) {
  const intensity = puck.intensity;
  const c = puckColor(intensity);
  const pulse = serving ? 1 + 0.12 * Math.sin(fx.time * 10) : 1;
  ctx.shadowBlur = (8 + 30 * intensity) * view.scale * view.density;
  ctx.shadowColor = rgba(c, 0.8);
  g.noStroke();
  g.fill(c.r, c.g, c.b);
  g.circle(puck.x, puck.y, puck.r * 2 * pulse);
  ctx.shadowBlur = 0;
}
