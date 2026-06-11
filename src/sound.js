/*
 * Tiny procedural sound effects using the Web Audio API.
 * No audio files — every sound is synthesized on the fly so the game
 * stays fully self-contained. Safe to call before the user interacts;
 * it just no-ops until the AudioContext is unlocked by a gesture.
 */

// A bright, bouncy "happy adventure" loop — a chiming melody over warm
// major chords, in the spirit of a cheerful fairy-fountain tune.
// I-vi-IV-V in C, all major/major-leaning chords (one per bar).
const MUSIC_BPM = 112;
const MUSIC_BEAT = 60 / MUSIC_BPM; // seconds per quarter note
const MUSIC_STEP = MUSIC_BEAT / 2; // 8th-note grid
const MUSIC_BAR_STEPS = 8;
const MUSIC_CHORDS = [
  [130.81, 164.81, 196.00], // C  (C3 E3 G3)
  [110.00, 130.81, 164.81], // Am (A2 C3 E3)
  [174.61, 220.00, 261.63], // F  (F3 A3 C4)
  [98.00, 123.47, 146.83],  // G  (G2 B2 D3)
];
const MUSIC_CHORD_DUR = MUSIC_BEAT * 4; // one bar per chord

// A bouncy, pentatonic-flavoured melody — one note per 8th-note step,
// looping over all 4 bars of the chord progression above.
const MUSIC_MELODY = [
  261.63, 329.63, 392.00, 329.63, 440.00, 392.00, 329.63, 293.66, // bar 1 (C)
  261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66, 261.63, // bar 2 (Am)
  349.23, 440.00, 523.25, 440.00, 349.23, 392.00, 440.00, 392.00, // bar 3 (F)
  329.63, 293.66, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66, // bar 4 (G)
];

const SFX = {
  ctx: null,
  muted: false,
  musicPlaying: false,
  _pourNode: null,
  _musicGain: null,
  _melodyGain: null,
  _drumGain: null,
  _noiseBuffer: null,
  _musicTimer: null,
  _musicNextTime: 0,
  _musicStep: 0,

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

  // ---- Background music: a bright, bouncy "happy adventure" loop ---------
  // A chiming bell melody over warm major chords and a gentle shaker —
  // schedules everything ahead of time (classic Web Audio lookahead
  // pattern) so the loop stays gapless even if the tab throttles.
  startMusic() {
    if (!this.ctx || this.muted || this.musicPlaying) return;
    this.musicPlaying = true;
    if (!this._musicGain) {
      this._musicGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      this._musicGain.connect(filter).connect(this.ctx.destination);
    }
    if (!this._melodyGain) {
      this._melodyGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 7000;
      this._melodyGain.connect(filter).connect(this.ctx.destination);
    }
    if (!this._drumGain) {
      this._drumGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 6000;
      this._drumGain.connect(filter).connect(this.ctx.destination);
    }
    this._musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this._musicGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    this._melodyGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this._melodyGain.gain.setValueAtTime(0.22, this.ctx.currentTime);
    this._drumGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this._drumGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    this._musicStep = 0;
    this._musicNextTime = this.ctx.currentTime + 0.1;
    this._scheduleMusic();
  },

  _scheduleMusic() {
    if (!this.musicPlaying) return;
    const lookahead = 0.3;
    while (this._musicNextTime < this.ctx.currentTime + lookahead) {
      const step = this._musicStep % MUSIC_BAR_STEPS;
      const bar = Math.floor(this._musicStep / MUSIC_BAR_STEPS) % MUSIC_CHORDS.length;
      const chord = MUSIC_CHORDS[bar];

      // New chord + bass root at the top of every bar, with a second
      // gentle bass hit on beat 3 for a light bounce.
      if (step === 0) {
        this._playChord(chord, this._musicNextTime, MUSIC_CHORD_DUR);
        this._bassNote(chord[0] / 2, this._musicNextTime, MUSIC_BEAT * 1.4);
      }
      if (step === 4) this._bassNote(chord[0] / 2, this._musicNextTime, MUSIC_BEAT * 1.2);

      // Light shaker on the off-beats for a gentle skip-along feel.
      if (step % 2 === 1) this._shaker(this._musicNextTime, 0.025);

      // Bright chiming bell melody, one note per 8th note.
      const note = MUSIC_MELODY[this._musicStep % MUSIC_MELODY.length];
      this._bell(note, this._musicNextTime);

      this._musicStep++;
      this._musicNextTime += MUSIC_STEP;
    }
    this._musicTimer = setTimeout(() => this._scheduleMusic(), 100);
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

  // A short plucked bass note, an octave below the chord tone.
  _bassNote(freq, startTime, dur) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.35, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
    osc.connect(gain).connect(this._musicGain);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.05);
  },

  // Bright two-oscillator bell/chime for the melody — a fairy-fountain
  // style lead with a quick attack and a brief, sparkly overtone on top.
  _bell(freq, startTime) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.5, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.4);
    osc.connect(gain).connect(this._melodyGain);
    osc.start(startTime);
    osc.stop(startTime + 0.45);

    const overtone = this.ctx.createOscillator();
    const ogain = this.ctx.createGain();
    overtone.type = 'sine';
    overtone.frequency.value = freq * 2;
    ogain.gain.setValueAtTime(0, startTime);
    ogain.gain.linearRampToValueAtTime(0.15, startTime + 0.005);
    ogain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.15);
    overtone.connect(ogain).connect(this._melodyGain);
    overtone.start(startTime);
    overtone.stop(startTime + 0.2);
  },

  // Reusable white-noise buffer for the shaker.
  _getNoiseBuffer() {
    if (!this._noiseBuffer) {
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this._noiseBuffer = buffer;
    }
    return this._noiseBuffer;
  },

  // Soft shaker tick — gentle band-passed noise for a light skip-along feel.
  _shaker(startTime, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._getNoiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 6000;
    filter.Q.value = 0.6;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.05);
    src.connect(filter).connect(gain).connect(this._drumGain);
    src.start(startTime);
    src.stop(startTime + 0.06);
  },

  stopMusic() {
    this.musicPlaying = false;
    if (this._musicTimer) clearTimeout(this._musicTimer);
    this._musicTimer = null;
    if (this._musicGain) {
      try { this._musicGain.gain.setTargetAtTime(0, this._now(), 0.3); } catch (e) { /* ignore */ }
    }
    if (this._melodyGain) {
      try { this._melodyGain.gain.setTargetAtTime(0, this._now(), 0.3); } catch (e) { /* ignore */ }
    }
    if (this._drumGain) {
      try { this._drumGain.gain.setTargetAtTime(0, this._now(), 0.3); } catch (e) { /* ignore */ }
    }
  },
};
