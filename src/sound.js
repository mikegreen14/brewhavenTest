/*
 * Tiny procedural sound effects using the Web Audio API.
 * No audio files — every sound is synthesized on the fly so the game
 * stays fully self-contained. Safe to call before the user interacts;
 * it just no-ops until the AudioContext is unlocked by a gesture.
 */

// Slow lo-fi chord loop for the background music bed (ii-V-I-vi in C),
// each entry a handful of note frequencies (Hz) held as one soft pad chord.
const MUSIC_CHORDS = [
  [146.83, 174.61, 261.63], // Dm7  (D3 F3 C4)
  [98.00, 123.47, 174.61],  // G7   (G2 B2 F3)
  [130.81, 164.81, 246.94], // Cmaj7 (C3 E3 B3)
  [110.00, 130.81, 196.00], // Am7  (A2 C3 G3)
];
const MUSIC_CHORD_DUR = 6; // seconds per chord

const SFX = {
  ctx: null,
  muted: false,
  musicPlaying: false,
  _pourNode: null,
  _musicGain: null,
  _musicTimer: null,
  _musicNextTime: 0,
  _musicChordIndex: 0,

  // Browsers require an AudioContext to be created/resumed after a user gesture.
  // Some mobile browsers (notably iOS Safari) start a freshly-created context
  // in "suspended" state even during a gesture, so always try to resume it
  // right after creation too — not just on later calls.
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.startMusic();
    } catch (e) {
      this.ctx = null; // Audio simply unavailable — game still runs.
    }
  },

  _now() {
    return this.ctx ? this.ctx.currentTime : 0;
  },

  // A short pitched blip. Used for buttons, dings, coins.
  blip(freq = 660, dur = 0.08, type = 'square', vol = 0.18) {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  // Pleasant two-note "success" chime.
  ding() {
    this.blip(880, 0.1, 'triangle', 0.2);
    setTimeout(() => this.blip(1320, 0.14, 'triangle', 0.18), 70);
  },

  // Coin pickup — bright and quick.
  coin() {
    this.blip(1046, 0.06, 'square', 0.12);
    setTimeout(() => this.blip(1568, 0.09, 'square', 0.12), 50);
  },

  // Soft error / sad trombone-ish for an unhappy customer.
  buzz() {
    this.blip(220, 0.18, 'sawtooth', 0.14);
    setTimeout(() => this.blip(160, 0.22, 'sawtooth', 0.14), 100);
  },

  // Cash register cha-ching for buying an upgrade.
  cash() {
    this.blip(660, 0.05, 'square', 0.15);
    setTimeout(() => this.blip(990, 0.05, 'square', 0.15), 50);
    setTimeout(() => this.blip(1320, 0.12, 'triangle', 0.18), 110);
  },

  // Continuous filtered-noise "pour" loop. Call startPour()/stopPour().
  startPour() {
    if (!this.ctx || this.muted || this._pourNode) return;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 1, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.07;
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start();
    this._pourNode = { src, gain };
  },

  stopPour() {
    if (!this._pourNode) return;
    try {
      this._pourNode.gain.gain.setTargetAtTime(0.0001, this._now(), 0.05);
      this._pourNode.src.stop(this._now() + 0.15);
    } catch (e) { /* ignore */ }
    this._pourNode = null;
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopPour();
      this.stopMusic();
    } else {
      this.startMusic();
    }
    return this.muted;
  },

  // ---- Background music: a soft, slow lo-fi chord loop -------------------
  // Schedules pad chords ahead of time (classic Web Audio lookahead pattern)
  // so the loop stays gapless even if the tab is briefly throttled.
  startMusic() {
    if (!this.ctx || this.muted || this.musicPlaying) return;
    this.musicPlaying = true;
    if (!this._musicGain) {
      this._musicGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1000;
      this._musicGain.connect(filter).connect(this.ctx.destination);
    }
    this._musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this._musicGain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    this._musicChordIndex = 0;
    this._musicNextTime = this.ctx.currentTime + 0.1;
    this._scheduleMusic();
  },

  _scheduleMusic() {
    if (!this.musicPlaying) return;
    const lookahead = 0.25;
    while (this._musicNextTime < this.ctx.currentTime + lookahead + MUSIC_CHORD_DUR) {
      this._playChord(MUSIC_CHORDS[this._musicChordIndex % MUSIC_CHORDS.length], this._musicNextTime, MUSIC_CHORD_DUR);
      this._musicChordIndex++;
      this._musicNextTime += MUSIC_CHORD_DUR;
    }
    this._musicTimer = setTimeout(() => this._scheduleMusic(), 200);
  },

  // One soft pad chord: each note fades in, holds, and fades out again —
  // overlapping with the next chord's fade-in for a smooth crossfade.
  _playChord(freqs, startTime, dur) {
    freqs.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const peak = i === 0 ? 0.9 : 0.5;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(peak, startTime + dur * 0.35);
      gain.gain.linearRampToValueAtTime(peak * 0.8, startTime + dur * 0.7);
      gain.gain.linearRampToValueAtTime(0, startTime + dur);
      osc.connect(gain).connect(this._musicGain);
      osc.start(startTime);
      osc.stop(startTime + dur + 0.05);
    });
  },

  stopMusic() {
    this.musicPlaying = false;
    if (this._musicTimer) clearTimeout(this._musicTimer);
    this._musicTimer = null;
    if (this._musicGain) {
      try { this._musicGain.gain.setTargetAtTime(0, this._now(), 0.3); } catch (e) { /* ignore */ }
    }
  },
};
