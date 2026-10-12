/*
 * audio.js — every sound in the game, built on the Web Audio API.
 *
 * - Built-in sounds are synthesized when the page loads, so they always work.
 * - Recorded sounds are listed in assets/sounds/manifest.json.
 * - Players can bring their own sound from any https:// address.
 *
 * Sounds are "played" rather than just triggered: pitch follows the puck's
 * speed, stereo position follows where the hit happened, and long or loud
 * custom sounds are trimmed and leveled so nobody can blow out the speakers.
 */

// Names → recorded files, filled from assets/sounds/manifest.json at startup.
window.SOUND_LIBRARY = {};

const SOUND_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  loadTimeoutMs: 8000,
  hit: 1.2, // seconds — a paddle sound longer than this is cut short
  score: 2.5,
  win: 8,
};

class SoundEngine {
  constructor(basePath) {
    this.basePath = basePath;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.ratio.value = 8;
    this.master.connect(this.limiter).connect(this.ctx.destination);

    this.builtins = {}; // name → sound (recorded sounds replace synthesized ones of the same name)
    this.synths = {}; // name → synthesized sound, kept as a fallback
    this.files = new Map(); // name → Promise of a recorded sound being loaded
    this.roles = { ...ROLE_FALLBACKS }; // which sound the game plays for each moment
    this.urlCache = new Map(); // url → Promise<result>
    this.voices = new Map(); // voice key → {source, gain}
    this.volume = 0.8;
    this.muted = false;
    this.ambience = null;
    this.ready = this.init();

    // Browsers keep audio silent until the first click or key press.
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  unlock() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  async init() {
    const synths = Object.entries(SYNTH_RECIPES).map(async ([name, recipe]) => {
      try {
        const sound = this.makeSound(await recipe(), name);
        this.synths[name] = sound;
        if (!hasOwn(this.builtins, name)) this.builtins[name] = sound;
      } catch (e) {
        console.warn('Could not synthesize', name, e);
      }
    });

    let manifest = { sounds: {}, roles: {} };
    try {
      const res = await fetch(this.basePath + 'assets/sounds/manifest.json', { cache: 'no-cache' });
      if (res.ok) manifest = await res.json();
    } catch (e) {
      console.warn('Sound manifest missing — using synthesized sounds only');
    }
    Object.assign(window.SOUND_LIBRARY, manifest.sounds || {});
    Object.assign(this.roles, manifest.roles || {});

    // The whole library is small (about 600 KB), so decode it all up front.
    const files = Object.keys(SOUND_LIBRARY).map((name) => this.loadLibrarySound(name));
    await Promise.all([...synths, ...files]);
  }

  /** Load a recorded sound by name. If the file can't load, a synthesized sound of the same name is used. */
  loadLibrarySound(name) {
    if (!hasOwn(SOUND_LIBRARY, name)) return Promise.resolve(this.get(name));
    if (!this.files.has(name)) {
      const entry = SOUND_LIBRARY[name];
      const loading = (async () => {
        try {
          const res = await fetch(this.basePath + 'assets/sounds/' + entry.file);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
          const sound = this.makeSound(buffer, name, entry);
          this.builtins[name] = sound;
          return sound;
        } catch (e) {
          console.warn('Could not load library sound', name, e);
          this.files.delete(name); // try again next time
          return hasOwn(this.synths, name) ? this.synths[name] : null;
        }
      })();
      this.files.set(name, loading);
    }
    return this.files.get(name);
  }

  /** The sound for a game moment (see ROLE_FALLBACKS), falling back to a synthesized one. */
  role(name) {
    return this.get(this.roles[name]) || this.get(ROLE_FALLBACKS[name]) || this.synths[ROLE_FALLBACKS[name]] || null;
  }

  /**
   * Wrap an AudioBuffer with the info needed to play it nicely.
   * offset and end are seconds from the start of the buffer; leading silence is skipped
   * and the level is set from the loudest sample, so every sound plays at a similar volume.
   */
  makeSound(buffer, label, options = {}) {
    const data = buffer.getChannelData(0);
    const rate = buffer.sampleRate;
    const first = Math.min(data.length, Math.floor((options.start || 0) * rate));
    const last = Math.min(data.length, Math.ceil((options.end || buffer.duration) * rate));
    let peak = 0;
    for (let i = first; i < last; i++) peak = Math.max(peak, Math.abs(data[i]));
    let begin = first;
    const threshold = Math.max(peak * 0.04, 0.002);
    while (begin < last && Math.abs(data[begin]) < threshold) begin++;
    let tail = last - 1;
    while (tail > begin && Math.abs(data[tail]) < 0.002) tail--;
    return {
      kind: 'buffer',
      buffer,
      label,
      level: peak > 0 ? Math.min(0.9 / peak, 8) * (options.gain || 1) : 1,
      offset: Math.max(first / rate, begin / rate - 0.003),
      duration: last / rate, // where the sound ends (seconds from the start of the buffer)
      loopEnd: (tail + 1) / rate, // end of the audible part, for seamless loops (skips encoder padding)
    };
  }

  get(name) {
    return hasOwn(this.builtins, name) ? this.builtins[name] : null;
  }

  /**
   * Load a sound setting from a controller.
   * @param setting  {kind:'builtin', name} or {kind:'url', url}
   * @returns {ok, sound, via, note, error}
   */
  async load(setting) {
    if (!setting) return { ok: false, error: 'no sound' };
    await this.ready;
    if (setting.kind === 'builtin') {
      const sound = (await this.loadLibrarySound(setting.name)) || this.get(setting.name);
      return sound ? { ok: true, sound, via: 'built-in' } : { ok: false, error: `unknown sound "${setting.name}"` };
    }
    if (!this.urlCache.has(setting.url)) {
      const loading = this.loadUrl(setting.url, setting.label);
      this.urlCache.set(setting.url, loading);
      // Don't remember failures: the Wi-Fi may be better next time.
      loading.then((result) => !result.ok && this.urlCache.delete(setting.url));
    }
    return this.urlCache.get(setting.url);
  }

  async loadUrl(url, label) {
    // 1. Best case: download and decode, so we can pitch, pan and trim it.
    let fetchError;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SOUND_LIMITS.loadTimeoutMs);
      let bytes;
      try {
        const res = await fetch(url, { mode: 'cors', signal: controller.signal });
        if (!res.ok) return { ok: false, error: `wasn't found (the server answered ${res.status})` };
        const length = Number(res.headers.get('content-length'));
        if (length > SOUND_LIMITS.maxBytes) return { ok: false, error: 'is bigger than 2 MB' };
        bytes = await res.arrayBuffer(); // still covered by the timeout
      } finally {
        clearTimeout(timer);
      }
      if (bytes.byteLength > SOUND_LIMITS.maxBytes) return { ok: false, error: 'is bigger than 2 MB' };
      try {
        const buffer = await this.ctx.decodeAudioData(bytes);
        return { ok: true, sound: this.makeSound(buffer, label), via: 'web audio' };
      } catch (e) {
        return { ok: false, error: "isn't audio this browser can play (use mp3, wav or ogg)" };
      }
    } catch (e) {
      fetchError = e; // usually CORS: the host doesn't allow other sites to read the file
    }

    // 2. Fallback: an <audio> element can play files from hosts that block CORS.
    //    It can't be panned or leveled, but it still plays.
    const el = new Audio();
    el.preload = 'auto';
    const ok = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), SOUND_LIMITS.loadTimeoutMs);
      el.addEventListener('canplaythrough', () => { clearTimeout(timer); resolve(true); }, { once: true });
      el.addEventListener('error', () => { clearTimeout(timer); resolve(false); }, { once: true });
      el.src = url;
      el.load();
    });
    if (ok) {
      return {
        ok: true,
        sound: { kind: 'element', el, label, level: 1, offset: 0 },
        via: 'basic playback',
        note: "this host doesn't allow Web Audio (CORS), so the sound plays without pitch/pan effects",
      };
    }
    const reason = fetchError && fetchError.name === 'AbortError' ? 'took too long to load' : "couldn't be loaded (is the address public, and does it start with https://?)";
    return { ok: false, error: reason };
  }

  setVolume(volume, muted) {
    this.volume = volume;
    this.muted = muted;
    this.master.gain.setTargetAtTime(muted ? 0 : volume, this.ctx.currentTime, 0.02);
  }

  /**
   * Play a sound.
   * @param sound  a sound object (from get/load) or a built-in name
   * @param opts   rate (pitch/speed), pan (-1 left … 1 right), gain, maxDuration (s), delay (s), voice (key: one at a time)
   */
  play(sound, options = {}) {
    // A sound must never be able to stop the game, so nothing escapes from here.
    try {
      this._play(sound, options);
    } catch (e) {
      console.warn('Sound failed:', e);
    }
  }

  _play(sound, { rate = 1, pan = 0, gain = 1, maxDuration = null, delay = 0, voice = null } = {}) {
    if (typeof sound === 'string') sound = this.get(sound);
    if (!sound || (sound.kind !== 'buffer' && sound.kind !== 'element') || this.muted || this.ctx.state !== 'running') return;
    if (![rate, pan, gain, delay].every(Number.isFinite) || rate <= 0) return;

    if (sound.kind === 'element') return this.playElement(sound, { rate, gain, maxDuration, delay, voice });

    const t = this.ctx.currentTime + delay;
    if (voice) this.stopVoice(voice, t);

    const source = this.ctx.createBufferSource();
    source.buffer = sound.buffer;
    source.playbackRate.value = rate;
    const amp = this.ctx.createGain();
    amp.gain.value = gain * sound.level;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(amp).connect(panner).connect(this.master);

    const length = Math.min(sound.duration - sound.offset, maxDuration || Infinity) / rate;
    if (maxDuration && sound.duration - sound.offset > maxDuration) {
      // Fade out instead of clicking off.
      amp.gain.setValueAtTime(gain * sound.level, t + Math.max(0, length - 0.15));
      amp.gain.linearRampToValueAtTime(0, t + length);
    }
    source.start(t, sound.offset);
    source.stop(t + length + 0.02);
    if (voice) {
      this.voices.set(voice, { source, amp });
      source.onended = () => {
        if (this.voices.get(voice)?.source === source) this.voices.delete(voice);
      };
    }
  }

  stopVoice(voice, at = this.ctx.currentTime) {
    const v = this.voices.get(voice);
    if (!v) return;
    try {
      v.amp.gain.setTargetAtTime(0, at, 0.01);
      v.source.stop(at + 0.05);
    } catch (e) { /* already stopped */ }
    this.voices.delete(voice);
  }

  playElement(sound, { rate, gain, maxDuration, delay, voice }) {
    const start = () => {
      if (voice && this.voices.has(voice)) this.voices.get(voice).el?.pause();
      const el = sound.el.cloneNode();
      el.volume = Math.min(1, gain * this.volume);
      el.preservesPitch = false;
      el.playbackRate = rate;
      el.play().catch(() => {});
      if (maxDuration) setTimeout(() => el.pause(), (maxDuration * 1000) / rate);
      if (voice) this.voices.set(voice, { el });
    };
    delay > 0 ? setTimeout(start, delay * 1000) : start();
  }

  // -------------------------------------------------------------------------
  // Game moments
  // -------------------------------------------------------------------------

  /** intensity 0…1 = how fast the puck is going relative to the cap */
  paddleHit(player, intensity) {
    const pan = player.side === 'left' ? -0.6 : 0.6;
    const custom = player.sounds.hit;
    if (custom) {
      this.play(custom, { rate: 1 + 0.12 * intensity + jitter(0.015), pan, gain: 0.9, maxDuration: SOUND_LIMITS.hit, voice: 'hit' + player.slot });
    } else {
      // The ball's pitch climbs as the rally speeds up
      this.play(this.role('paddle'), { rate: 0.9 + 0.5 * intensity + jitter(0.03), pan, gain: 0.85 });
    }
  }

  wallBounce(xNorm, intensity) {
    this.play(this.role('wall'), { rate: 0.85 + 0.45 * intensity + jitter(0.05), pan: (xNorm * 2 - 1) * 0.8, gain: 0.25 + 0.3 * intensity });
  }

  goal(scorer, exitSide) {
    this.play('whoosh', { pan: exitSide === 'left' ? -0.8 : 0.8, gain: 0.7 });
    const pan = scorer.side === 'left' ? -0.5 : 0.5;
    const custom = scorer.sounds.score;
    if (custom) this.play(custom, { pan, gain: 0.9, delay: 0.12, maxDuration: SOUND_LIMITS.score, voice: 'score' });
    // Each side's bell rings a whole step apart, so you can hear who scored
    else this.play(this.role('score'), { pan, gain: 0.75, delay: 0.12, rate: scorer.side === 'left' ? 1 : 1.122, maxDuration: SOUND_LIMITS.score });
  }

  countdown(n) {
    if (n > 0) this.play(this.role('countdown'), { rate: n === 1 ? 1.12 : 1, gain: 0.6 });
    else this.play(this.role('go'), { gain: 0.7 });
  }

  serve() {
    this.play(this.role('serve'), { gain: 0.22 });
  }

  matchPoint() {
    this.play(this.role('score'), { rate: 0.5, gain: 0.35, maxDuration: 2.5 });
  }

  win(player) {
    const pan = player.side === 'left' ? -0.3 : 0.3;
    if (player.sounds.win) {
      this.play(player.sounds.win, { pan, gain: 0.9, maxDuration: SOUND_LIMITS.win, delay: 0.3, voice: 'win' });
    } else if (this.get(this.roles.win)) {
      this.play(this.role('win'), { pan, gain: 0.8, delay: 0.25 });
    } else {
      // No recording: a little fanfare made from the score sound, up a major arpeggio
      [1, 1.26, 1.5, 2].forEach((rate, i) => this.play(this.role('score'), { rate, gain: 0.55, pan: pan + (i - 1.5) * 0.15, delay: 0.25 + i * 0.13, maxDuration: 1.2 }));
    }
    // The crowd joins in a moment later
    if (this.get(this.roles.cheer)) this.play(this.role('cheer'), { gain: 0.45, delay: 0.9, rate: 1 + jitter(0.03) });
  }

  confettiPop() {
    this.play('click', { rate: 0.6 + Math.random() * 1.4, gain: 0.15, pan: jitter(0.9) });
  }

  connected(player) {
    const pan = player.side === 'left' ? -0.6 : 0.6;
    this.play('chirp', { pan, gain: 0.6 });
    this.play(this.role('score'), { pan, gain: 0.3, rate: 1.5, delay: 0.08, maxDuration: 0.8 });
  }

  disconnected(player) {
    this.play('boop', { pan: player.side === 'left' ? -0.6 : 0.6, gain: 0.6, rate: 0.8 });
  }

  ui() {
    this.play('click', { gain: 0.25, rate: 1.4 });
  }

  // -------------------------------------------------------------------------
  // Ambience: a room murmur (or a low hum) that opens up as the rally builds
  // -------------------------------------------------------------------------

  startAmbience() {
    if (this.ambience || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    const amp = ctx.createGain();
    amp.gain.value = 0;
    filter.connect(amp).connect(this.master);

    const room = this.get(this.roles.ambience);
    let sources;
    if (room && room.kind === 'buffer') {
      // A recorded room, looped seamlessly; the filter opens and it swells with the rally
      const src = ctx.createBufferSource();
      src.buffer = room.buffer;
      src.loop = true;
      src.loopStart = room.offset;
      src.loopEnd = room.loopEnd;
      src.playbackRate.value = 0.94; // a touch lower and slower: more distant
      const level = ctx.createGain();
      level.gain.value = room.level;
      src.connect(level).connect(filter);
      src.start(0, room.offset + Math.random() * (room.loopEnd - room.offset - 1));
      sources = [src];
      this.ambienceLevels = { quiet: 0.1, loud: 0.22, closed: 500, open: 5000 };
    } else {
      // No recording: a low hum
      sources = [55, 82.41, 110.3].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 2 ? 'triangle' : 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = [0.6, 0.35, 0.15][i];
        o.connect(g).connect(filter);
        o.start();
        return o;
      });
      this.ambienceLevels = { quiet: 0.035, loud: 0.08, closed: 160, open: 1260 };
    }
    filter.frequency.value = this.ambienceLevels.closed;
    amp.gain.setTargetAtTime(this.ambienceLevels.quiet, ctx.currentTime, 1.5);
    this.ambience = { filter, amp, sources };
  }

  setIntensity(x) {
    if (!this.ambience) return;
    const t = this.ctx.currentTime;
    const L = this.ambienceLevels;
    this.ambience.filter.frequency.setTargetAtTime(L.closed + x * (L.open - L.closed), t, 0.4);
    this.ambience.amp.gain.setTargetAtTime(L.quiet + x * (L.loud - L.quiet), t, 0.4);
  }

  stopAmbience() {
    if (!this.ambience) return;
    const { amp, sources } = this.ambience;
    const t = this.ctx.currentTime;
    amp.gain.setTargetAtTime(0, t, 0.25);
    sources.forEach((s) => s.stop(t + 1.5));
    this.ambience = null;
  }
}

function jitter(amount) {
  return (Math.random() * 2 - 1) * amount;
}

// ---------------------------------------------------------------------------
// Synthesized sounds. Each recipe renders offline into an AudioBuffer.
// ---------------------------------------------------------------------------

// What the game plays for each moment when the manifest doesn't say (all synthesized).
const ROLE_FALLBACKS = { paddle: 'wood', wall: 'click', score: 'bell', countdown: 'tick', go: 'go', serve: 'blip', win: null, cheer: null, ambience: null };

const SAMPLE_RATE = 44100;

function renderOffline(duration, build) {
  const ctx = new OfflineAudioContext(1, Math.ceil(SAMPLE_RATE * duration), SAMPLE_RATE);
  build(ctx, ctx.destination);
  return ctx.startRendering();
}

// An oscillator with a pitch sweep and an exponential fade.
function tone(ctx, out, { type = 'sine', f0, f1 = f0, start = 0, dur, gain = 0.5, attack = 0.002, filter = null }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, start);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, start + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  let node = osc.connect(amp);
  if (filter) node = node.connect(makeFilter(ctx, filter, start, dur));
  node.connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.01);
  return osc;
}

function noiseBurst(ctx, out, { start = 0, dur, gain = 0.5, filter = null }) {
  const length = Math.ceil(SAMPLE_RATE * dur);
  const buffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  let node = src.connect(amp);
  if (filter) node = node.connect(makeFilter(ctx, filter, start, dur));
  node.connect(out);
  src.start(start);
}

function makeFilter(ctx, { type, f0, f1 = f0, Q = 1 }, start, dur) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = Q;
  f.frequency.setValueAtTime(f0, start);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, start + dur);
  return f;
}

// Karplus–Strong plucked string, computed sample by sample.
function pluckBuffer(freq, dur, damping = 0.996) {
  const length = Math.ceil(SAMPLE_RATE * dur);
  const buffer = new AudioBuffer({ length, sampleRate: SAMPLE_RATE, numberOfChannels: 1 });
  const out = buffer.getChannelData(0);
  const period = Math.round(SAMPLE_RATE / freq);
  const ring = new Float32Array(period).map(() => Math.random() * 2 - 1);
  for (let i = 0; i < length; i++) {
    const j = i % period;
    const next = ring[(j + 1) % period];
    out[i] = ring[j];
    ring[j] = damping * 0.5 * (ring[j] + next);
  }
  return buffer;
}

const SYNTH_RECIPES = {
  blip: () => renderOffline(0.09, (c, o) => tone(c, o, { type: 'square', f0: 880, dur: 0.08, gain: 0.25 })),
  boop: () => renderOffline(0.2, (c, o) => tone(c, o, { f0: 320, f1: 140, dur: 0.18, gain: 0.7 })),
  pluck: async () => pluckBuffer(330, 0.6),
  click: () => renderOffline(0.02, (c, o) => noiseBurst(c, o, { dur: 0.012, gain: 0.8, filter: { type: 'highpass', f0: 3000 } })),
  laser: () => renderOffline(0.26, (c, o) => tone(c, o, { type: 'sawtooth', f0: 1600, f1: 150, dur: 0.25, gain: 0.3, filter: { type: 'lowpass', f0: 3200 } })),
  drum: () =>
    renderOffline(0.36, (c, o) => {
      tone(c, o, { f0: 150, f1: 48, dur: 0.35, gain: 0.9 });
      noiseBurst(c, o, { dur: 0.02, gain: 0.3, filter: { type: 'lowpass', f0: 2000 } });
    }),
  bell: () =>
    renderOffline(1.5, (c, o) => {
      // FM synthesis: a modulator at 3.5× the carrier gives the metallic ring.
      const carrier = c.createOscillator();
      carrier.frequency.value = 660;
      const mod = c.createOscillator();
      mod.frequency.value = 660 * 3.5;
      const depth = c.createGain();
      depth.gain.setValueAtTime(700, 0);
      depth.gain.exponentialRampToValueAtTime(1, 1.2);
      mod.connect(depth).connect(carrier.frequency);
      const amp = c.createGain();
      amp.gain.setValueAtTime(0.0001, 0);
      amp.gain.exponentialRampToValueAtTime(0.5, 0.004);
      amp.gain.exponentialRampToValueAtTime(0.0001, 1.45);
      carrier.connect(amp).connect(o);
      carrier.start(0);
      mod.start(0);
      carrier.stop(1.5);
      mod.stop(1.5);
    }),
  chirp: () => renderOffline(0.1, (c, o) => tone(c, o, { f0: 500, f1: 1900, dur: 0.09, gain: 0.5 })),
  zap: () =>
    renderOffline(0.22, (c, o) => {
      noiseBurst(c, o, { dur: 0.2, gain: 1.4, filter: { type: 'bandpass', f0: 4000, f1: 250, Q: 6 } });
      tone(c, o, { type: 'square', f0: 220, f1: 55, dur: 0.15, gain: 0.08 });
    }),
  thud: () =>
    renderOffline(0.24, (c, o) => {
      tone(c, o, { f0: 95, f1: 48, dur: 0.22, gain: 0.9 });
      noiseBurst(c, o, { dur: 0.08, gain: 0.4, filter: { type: 'lowpass', f0: 400 } });
    }),
  wood: () =>
    renderOffline(0.1, (c, o) => {
      tone(c, o, { f0: 1050, f1: 980, dur: 0.07, gain: 0.5 });
      tone(c, o, { f0: 2400, dur: 0.03, gain: 0.12 });
      noiseBurst(c, o, { dur: 0.03, gain: 0.9, filter: { type: 'bandpass', f0: 1800, Q: 10 } });
    }),
  glass: () =>
    renderOffline(1, (c, o) => {
      [[1760, 0.9, 0.3], [2793, 0.7, 0.18], [4186, 0.45, 0.1], [5274, 0.3, 0.08]].forEach(([f, d, g]) =>
        tone(c, o, { f0: f, dur: d, gain: g })
      );
    }),
  coin: () =>
    renderOffline(0.42, (c, o) => {
      tone(c, o, { type: 'square', f0: 988, dur: 0.07, gain: 0.18, attack: 0.001 });
      tone(c, o, { type: 'square', f0: 1319, start: 0.07, dur: 0.33, gain: 0.18, attack: 0.001 });
    }),
  gong: () =>
    renderOffline(2.6, (c, o) => {
      [110, 110.7, 172, 231, 233, 287, 353, 420].forEach((f, i) => tone(c, o, { f0: f, dur: 2.5 - i * 0.15, gain: 0.14, attack: 0.012 }));
      noiseBurst(c, o, { dur: 0.15, gain: 0.3, filter: { type: 'lowpass', f0: 900 } });
    }),
  // Game-only sounds (not in the player list, but harmless if requested)
  tick: () =>
    renderOffline(0.07, (c, o) => {
      tone(c, o, { f0: 1200, dur: 0.05, gain: 0.4 });
      noiseBurst(c, o, { dur: 0.008, gain: 0.5, filter: { type: 'highpass', f0: 4000 } });
    }),
  go: () =>
    renderOffline(0.5, (c, o) => {
      tone(c, o, { type: 'triangle', f0: 1046.5, dur: 0.45, gain: 0.45 });
      tone(c, o, { type: 'sine', f0: 1568, dur: 0.35, gain: 0.2 });
    }),
  whoosh: () => renderOffline(0.5, (c, o) => noiseBurst(c, o, { dur: 0.48, gain: 0.8, filter: { type: 'bandpass', f0: 300, f1: 2400, Q: 1.5 } })),
};
