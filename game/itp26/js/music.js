/*
 * music.js — background music under a match.
 *
 * Three kinds of track:
 *   generated  composed here, played by a small Web Audio sequencer (always works, no licence needed)
 *   recorded   files listed in assets/music/manifest.json, with their source and licence
 *   link       an https:// address a player set on their controller
 *
 * Generated tracks follow the game: they open up as a rally builds. All music is
 * muffled while paused and fades out for the win fanfare.
 */

// Names → track info. Filled with the generated tracks below plus assets/music/manifest.json.
window.MUSIC_LIBRARY = {};

const GENERATED_SOURCE = 'Generated live by DF Pong';

class MusicPlayer {
  constructor(sound) {
    this.sound = sound;
    const ctx = sound.ctx;
    this.ctx = ctx;
    // music bus: voices → bus (volume) → muffle filter → limiter (shared with sound effects)
    this.bus = ctx.createGain();
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.bus.connect(this.muffle).connect(sound.limiter);
    this.volume = 0.5;
    this.muted = false;
    this.current = null; // {track, voice}
    this.intensity = 0;
    this.previewTimer = null;
    this.noise = makeNoiseBuffer(ctx);
    this.ready = this.init();
  }

  async init() {
    for (const [name, track] of Object.entries(GENERATED_TRACKS)) {
      MUSIC_LIBRARY[name] = { title: track.title, mood: track.mood, source: GENERATED_SOURCE, generated: true };
    }
    try {
      const res = await fetch(this.sound.basePath + 'assets/music/manifest.json', { cache: 'no-cache' });
      if (res.ok) {
        const manifest = await res.json();
        for (const [name, entry] of Object.entries(manifest.tracks || {})) {
          if (!hasOwn(MUSIC_LIBRARY, name)) MUSIC_LIBRARY[name] = { ...entry, file: entry.file };
        }
      }
    } catch (e) {
      /* no recorded music: the generated tracks are enough */
    }
  }

  setVolume(volume, muted) {
    this.volume = volume;
    this.muted = muted;
    this.bus.gain.setTargetAtTime(muted ? 0 : volume, this.ctx.currentTime, 0.05);
    if (this.current?.voice.direct) this.current.voice.setLevel(muted ? 0 : volume);
  }

  /** Muffle (paused) or clear. */
  duck(on) {
    this.muffle.frequency.setTargetAtTime(on ? 700 : 20000, this.ctx.currentTime, 0.2);
    this.bus.gain.setTargetAtTime(this.muted ? 0 : this.volume * (on ? 0.6 : 1), this.ctx.currentTime, 0.2);
  }

  setIntensity(x) {
    this.intensity = x;
    if (this.current?.voice.setIntensity) this.current.voice.setIntensity(x);
  }

  /** Is this the track already playing? */
  isPlaying(track) {
    return !!this.current && trackKey(this.current.track) === trackKey(track);
  }

  /**
   * Play a track, crossfading from whatever is playing.
   * @param track  {kind: 'generated'|'recorded'|'link', name?, url?, label}
   */
  async play(track, { fade = 1.5 } = {}) {
    clearTimeout(this.previewTimer);
    if (!track) return this.stop({ fade });
    if (this.isPlaying(track)) return true;
    if (this.ctx.state !== 'running') return false;
    this.stop({ fade });
    const voice = await this.openVoice(track);
    if (!voice) return false;
    voice.start(fade);
    if (voice.setIntensity) voice.setIntensity(this.intensity);
    this.current = { track, voice };
    return true;
  }

  stop({ fade = 1.5 } = {}) {
    clearTimeout(this.previewTimer);
    if (!this.current) return;
    this.current.voice.stop(fade);
    this.current = null;
  }

  /** Play the first seconds of a track (used while choosing in the lobby). */
  async preview(track, seconds = 10) {
    const ok = await this.play(track, { fade: 0.6 });
    clearTimeout(this.previewTimer);
    if (ok) this.previewTimer = setTimeout(() => this.stop({ fade: 2 }), seconds * 1000);
  }

  async openVoice(track) {
    try {
      if (track.kind === 'generated') {
        const recipe = GENERATED_TRACKS[track.name];
        return recipe ? new GeneratedVoice(this, recipe) : null;
      }
      const url = track.kind === 'recorded' ? this.sound.basePath + 'assets/music/' + MUSIC_LIBRARY[track.name].file : track.url;
      return await openFileVoice(this, url, track.kind === 'link');
    } catch (e) {
      console.warn('Music failed:', e);
      return null;
    }
  }

  /**
   * Check that a player's music setting can be played.
   * @returns {ok, error, note}
   */
  async probe(setting) {
    await this.ready;
    if (setting.kind === 'builtin') {
      return hasOwn(MUSIC_LIBRARY, setting.name) ? { ok: true } : { ok: false, error: `isn't one of the game's music tracks` };
    }
    const result = await probeUrl(setting.url);
    return result;
  }
}

/** A setting from a controller ({kind:'builtin'|'url', ...}) → a playable track. */
function trackFromSetting(setting) {
  if (!setting) return null;
  if (setting.kind === 'url') return { kind: 'link', url: setting.url, label: setting.label };
  const entry = MUSIC_LIBRARY[setting.name];
  if (!entry) return null;
  return { kind: entry.generated ? 'generated' : 'recorded', name: setting.name, label: entry.title };
}

function trackFromName(name) {
  if (!hasOwn(MUSIC_LIBRARY, name)) return null;
  const entry = MUSIC_LIBRARY[name];
  return { kind: entry.generated ? 'generated' : 'recorded', name, label: entry.title };
}

function trackKey(track) {
  return track ? `${track.kind}:${track.name || track.url}` : '';
}

/** Where a track comes from, for the screen: "Musopen · Public domain", "Generated live by DF Pong"… */
function trackSource(track) {
  if (!track) return '';
  if (track.kind === 'link') return track.url.replace(/^https:\/\//, '').slice(0, 60);
  const entry = MUSIC_LIBRARY[track.name] || {};
  return [entry.source, entry.licence].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Recorded music and links: streamed with an <audio> element
// ---------------------------------------------------------------------------

function waitForAudio(el, ms) {
  return new Promise((resolve) => {
    const done = (ok) => {
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), ms);
    el.addEventListener('canplay', () => done(true), { once: true });
    el.addEventListener('error', () => done(false), { once: true });
  });
}

async function probeUrl(url) {
  const el = new Audio();
  el.preload = 'metadata';
  el.src = url;
  const ok = await waitForAudio(el, 10000);
  el.removeAttribute('src');
  el.load();
  return ok ? { ok: true } : { ok: false, error: "couldn't be loaded (is the address public, and does it start with https://?)" };
}

async function openFileVoice(player, url, external) {
  const ctx = player.ctx;
  let el = new Audio();
  el.loop = true;
  el.preload = 'auto';
  if (external) el.crossOrigin = 'anonymous'; // needed to route through Web Audio
  el.src = url;
  let routed = true;
  if (!(await waitForAudio(el, 10000))) {
    if (!external) return null;
    // The host doesn't allow Web Audio (CORS): play the file directly instead
    el = new Audio();
    el.loop = true;
    el.src = url;
    routed = false;
    if (!(await waitForAudio(el, 10000))) return null;
  }

  if (routed) {
    const source = ctx.createMediaElementSource(el);
    const amp = ctx.createGain();
    amp.gain.value = 0;
    source.connect(amp).connect(player.bus);
    return {
      start(fade) {
        el.play().catch(() => {});
        amp.gain.setTargetAtTime(0.8, ctx.currentTime, fade / 3);
      },
      stop(fade) {
        amp.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
        setTimeout(() => {
          el.pause();
          source.disconnect();
        }, fade * 1000 + 200);
      },
    };
  }

  // Direct playback: fades are done on the element's own volume
  let level = player.muted ? 0 : player.volume;
  let target = 0;
  let timer = null;
  const ramp = (to, seconds, then) => {
    clearInterval(timer);
    const from = el.volume;
    const start = performance.now();
    timer = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / (seconds * 1000));
      el.volume = from + (to - from) * t;
      if (t >= 1) {
        clearInterval(timer);
        then && then();
      }
    }, 50);
  };
  el.volume = 0;
  return {
    direct: true,
    setLevel(v) {
      level = v;
      el.volume = Math.min(1, target * level * 0.8);
    },
    start(fade) {
      target = 1;
      el.play().catch(() => {});
      ramp(Math.min(1, level * 0.8), fade);
    },
    stop(fade) {
      target = 0;
      ramp(0, fade, () => el.pause());
    },
  };
}

// ---------------------------------------------------------------------------
// Generated music: a step sequencer scheduling short synthesized notes
// ---------------------------------------------------------------------------

class GeneratedVoice {
  constructor(player, recipe) {
    this.player = player;
    this.ctx = player.ctx;
    this.recipe = recipe;
    this.out = this.ctx.createGain();
    this.out.gain.value = 0;
    this.tone = this.ctx.createBiquadFilter(); // opens with the rally
    this.tone.type = 'lowpass';
    this.tone.frequency.value = recipe.closed || 2500;
    this.out.connect(this.tone).connect(player.bus);
    this.stepLength = 60 / recipe.bpm / 4; // sixteenth notes
    this.step = 0;
    this.intensity = 0;
    this.kit = makeKit(this.ctx, this.out, player.noise);
  }

  setIntensity(x) {
    this.intensity = x;
    const r = this.recipe;
    this.tone.frequency.setTargetAtTime((r.closed || 2500) + x * ((r.open || 9000) - (r.closed || 2500)), this.ctx.currentTime, 0.5);
  }

  start(fade) {
    this.nextTime = this.ctx.currentTime + 0.08;
    this.out.gain.setTargetAtTime(this.recipe.level || 0.5, this.ctx.currentTime, fade / 3);
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  schedule() {
    const ahead = this.ctx.currentTime + 0.15;
    while (this.nextTime < ahead) {
      const swing = this.recipe.swing && this.step % 2 === 1 ? this.stepLength * this.recipe.swing : 0;
      this.recipe.play(this.kit, this.step, this.nextTime + swing, this.stepLength, this.intensity);
      this.nextTime += this.stepLength;
      this.step++;
    }
  }

  stop(fade) {
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    setTimeout(() => {
      clearInterval(this.timer);
      this.out.disconnect();
    }, fade * 1000 + 300);
  }
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

/** Instruments shared by the generated tracks. Every note is a few nodes that clean themselves up. */
function makeKit(ctx, out, noiseBuffer) {
  const env = (gain, t, attack, hold, release, peak) => {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.setValueAtTime(peak, t + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return t + attack + hold + release + 0.05;
  };
  const noise = (t, length, filterType, freq, Q, peak, decay) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = Q;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(out);
    const end = env(g, t, 0.002, 0, decay, peak);
    src.start(t, Math.random() * 0.5);
    src.stop(end);
  };
  return {
    /** A tone: type, MIDI note, length, level, with an optional filter sweep. */
    note(t, n, length, { type = 'sine', gain = 0.2, attack = 0.005, release = 0.15, detune = 0, cutoff = null, q = 1, glideTo = null } = {}) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(midi(n), t);
      if (glideTo !== null) o.frequency.exponentialRampToValueAtTime(midi(glideTo), t + length);
      o.detune.value = detune;
      const g = ctx.createGain();
      let node = o;
      if (cutoff) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = cutoff;
        f.Q.value = q;
        node = o.connect(f);
      }
      node.connect(g).connect(out);
      const end = env(g, t, attack, Math.max(0, length - attack), release, gain);
      o.start(t);
      o.stop(end);
    },
    /** A soft chord: several detuned saws through a gentle low-pass. */
    pad(t, notes, length, { gain = 0.05, cutoff = 1400, attack = 0.6, release = 1.2 } = {}) {
      notes.forEach((n) =>
        [-6, 6].forEach((d) => this.note(t, n, length, { type: 'sawtooth', gain, attack, release, detune: d, cutoff, q: 0.4 }))
      );
    },
    kick(t, gain = 0.5) {
      this.note(t, 40, 0.12, { gain, attack: 0.002, release: 0.18, glideTo: 26 });
    },
    hat(t, gain = 0.05, open = false) {
      noise(t, 0, 'highpass', 7500, 0.7, gain, open ? 0.18 : 0.035);
    },
    snare(t, gain = 0.12) {
      noise(t, 0, 'bandpass', 1900, 0.8, gain, 0.12);
      this.note(t, 55, 0.02, { gain: gain * 0.4, release: 0.06 });
    },
    crackle(t, gain = 0.015) {
      noise(t, 0, 'bandpass', 3000 + Math.random() * 3000, 8, gain, 0.01);
    },
  };
}

function makeNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// Each recipe's play() is called once per sixteenth note: (kit, step, time, stepLength, intensity 0–1)
const GENERATED_TRACKS = {
  drift: {
    title: 'Drift',
    mood: 'calm',
    bpm: 70,
    level: 0.67, // levels matched to the recordings (about -24 dB RMS)
    closed: 1800,
    open: 5000,
    play(kit, step, t, len, intensity) {
      const bar = Math.floor(step / 16) % 8;
      const s = step % 16;
      const chords = [
        [48, 55, 59, 64], // Cmaj7
        [45, 52, 55, 60], // Am7
        [41, 48, 52, 57], // Fmaj7
        [43, 50, 55, 59], // G
      ];
      const chord = chords[Math.floor(bar / 2)];
      if (s === 0 && bar % 2 === 0) kit.pad(t, chord, len * 30, { gain: 0.035 });
      if (s === 0) kit.note(t, chord[0] - 12, len * 14, { gain: 0.12, attack: 0.08, release: 0.6 });
      // A slow, sparse arpeggio; busier as the rally builds
      if (s % 4 === 2 && Math.random() < 0.45 + intensity * 0.5) {
        const n = chord[(Math.floor(step / 4) + bar) % chord.length] + 12;
        kit.note(t, n, len * 2, { type: 'triangle', gain: 0.06, release: 0.9 });
      }
    },
  },

  tabletop: {
    title: 'Tabletop',
    mood: 'steady groove',
    bpm: 112,
    level: 0.58,
    closed: 1500,
    open: 7000,
    play(kit, step, t, len, intensity) {
      const s = step % 16;
      const bar = Math.floor(step / 16) % 4;
      if (s % 8 === 0 || (intensity > 0.45 && s % 4 === 0)) kit.kick(t, 0.42);
      if (s % 4 === 2) kit.hat(t, 0.045);
      if (intensity > 0.7 && s % 2 === 1) kit.hat(t, 0.02);
      if (s === 4 || s === 12) kit.snare(t, 0.06);
      const bass = [45, 0, 45, 0, 0, 48, 0, 45, 0, 0, 52, 0, 50, 0, 48, 0];
      const shift = [0, 0, -2, 3][bar];
      if (bass[s]) kit.note(t, bass[s] - 12 + shift, len * 1.6, { type: 'sawtooth', gain: 0.1, cutoff: 500 + intensity * 900, q: 3, release: 0.08 });
      if (s === 6 && bar % 2 === 1) kit.note(t, 69 + shift, len * 2, { type: 'triangle', gain: 0.045, release: 0.4 });
    },
  },

  arcade: {
    title: 'Arcade',
    mood: 'bright',
    bpm: 128,
    level: 0.88,
    closed: 2500,
    open: 8000,
    play(kit, step, t, len, intensity) {
      const s = step % 16;
      const bar = Math.floor(step / 16) % 4;
      const chords = [
        [60, 64, 67], // C
        [55, 59, 62], // G
        [57, 60, 64], // Am
        [53, 57, 60], // F
      ];
      const chord = chords[bar];
      const up = intensity > 0.6 ? 12 : 0;
      kit.note(t, chord[s % 3] + 12 + up, len * 0.8, { type: 'square', gain: 0.03, release: 0.05, cutoff: 3000 });
      if (s % 4 === 0) kit.note(t, chord[0] - 24, len * 3, { type: 'triangle', gain: 0.14, release: 0.05 });
      if (s % 4 === 2) kit.hat(t, 0.03);
      if (s === 8) kit.snare(t, 0.05);
    },
  },

  nightbus: {
    title: 'Night Bus',
    mood: 'lo-fi',
    bpm: 82,
    level: 0.71,
    swing: 0.28,
    closed: 1600,
    open: 4500,
    play(kit, step, t, len, intensity) {
      const s = step % 16;
      const bar = Math.floor(step / 16) % 4;
      const chords = [
        [50, 53, 57, 60, 64], // Dm9
        [43, 53, 57, 59, 64], // G13
        [48, 52, 55, 59, 62], // Cmaj9
        [45, 49, 52, 55, 58], // A7(b9)
      ];
      const chord = chords[bar];
      if (s === 0 || s === 10) chord.slice(1).forEach((n) => kit.note(t, n, len * 5, { gain: 0.03, attack: 0.01, release: 0.8 }));
      if (s === 0) kit.note(t, chord[0] - 12, len * 6, { gain: 0.13, release: 0.3 });
      if (s === 0 || s === 7) kit.kick(t, 0.3);
      if (s === 4 || s === 12) kit.snare(t, 0.05);
      if (s % 2 === 0) kit.hat(t, 0.02 + intensity * 0.015);
      if (Math.random() < 0.3) kit.crackle(t);
    },
  },
};
