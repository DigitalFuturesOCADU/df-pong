/*
 * postfx.js — an optional WebGL pass over the finished frame.
 *
 * The game is drawn in plain 2D first (render.js). This shader then bends
 * and tints that image: shockwaves ripple out from hits and goals, colors
 * fringe on big impacts, the edges darken, and a little film grain keeps
 * the flat colors from feeling digital.
 *
 * If WebGL isn't available, or effects are set to "reduced", the game simply
 * shows the 2D image as it is.
 */

const POSTFX_SHADER = `
precision highp float;

varying vec2 vTexCoord;
uniform sampler2D tex0;      // the 2D game image (provided by p5's filter())

uniform float uTime;
uniform float uAspect;       // width / height
uniform vec4 uWaves[6];      // x, y (0–1), age in seconds, strength
uniform float uAberration;   // 0–1 color fringing
uniform vec3 uFlashColor;
uniform float uFlash;        // 0–1
uniform float uVignette;
uniform float uGrain;

void main() {
  vec2 uv = vTexCoord;

  // Shockwaves: each one is a ring that pushes pixels outward as it expands.
  vec2 push = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    vec4 w = uWaves[i];
    if (w.w <= 0.0) continue;
    vec2 d = uv - w.xy;
    d.x *= uAspect;
    float dist = length(d);
    float radius = w.z * 0.85;
    float band = (dist - radius) / 0.045;
    float ring = exp(-band * band) * w.w * (1.0 - smoothstep(0.0, 1.3, w.z));
    vec2 dir = dist > 0.0001 ? d / dist : vec2(0.0);
    dir.x /= uAspect;
    push += dir * ring * 0.012;
  }
  vec2 suv = uv - push;

  // Color fringing: red and blue drift apart from the center on impacts.
  vec2 fromCenter = uv - 0.5;
  float spread = uAberration * 0.0035 + length(push) * 0.2;
  vec3 color;
  color.r = texture2D(tex0, suv + fromCenter * spread).r;
  color.g = texture2D(tex0, suv).g;
  color.b = texture2D(tex0, suv - fromCenter * spread).b;

  // Brief tint toward the scorer's color.
  color = mix(color, uFlashColor, uFlash * 0.1);

  // Vignette
  vec2 v = fromCenter;
  v.x *= uAspect * 0.75;
  color *= 1.0 - uVignette * smoothstep(0.3, 0.95, length(v));

  // Grain
  float n = fract(sin(dot(uv * 1000.0 + uTime * 37.0, vec2(12.9898, 78.233))) * 43758.5453);
  color += (n - 0.5) * 0.03 * uGrain;

  gl_FragColor = vec4(color, 1.0);
}
`;

class PostFX {
  constructor() {
    this.shader = createFilterShader(POSTFX_SHADER);
    this.waveData = new Array(24).fill(0);
  }

  apply(fx) {
    const s = this.shader;
    for (let i = 0; i < 6; i++) {
      const w = fx.waves[i];
      const o = i * 4;
      if (w) {
        this.waveData[o] = w.x;
        this.waveData[o + 1] = w.y;
        this.waveData[o + 2] = fx.time - w.t0;
        this.waveData[o + 3] = w.strength;
      } else {
        this.waveData[o + 3] = 0;
      }
    }
    s.setUniform('uWaves', this.waveData);
    s.setUniform('uTime', fx.time % 1000);
    s.setUniform('uAspect', width / height);
    s.setUniform('uAberration', fx.impact);
    const c = fx.flash.color;
    s.setUniform('uFlashColor', [c.r / 255, c.g / 255, c.b / 255]);
    s.setUniform('uFlash', fx.flash.a);
    s.setUniform('uVignette', 0.55);
    s.setUniform('uGrain', 1);
    filter(s);
  }
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}
