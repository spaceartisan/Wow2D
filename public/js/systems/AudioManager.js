/**
 * AudioManager — handles SFX playback and BGM, with volume controls.
 * Uses Web Audio API for low-latency SFX.
 */
export class AudioManager {
  constructor() {
    this.ctx = null; // AudioContext, created on first user gesture
    this.sfxGain = null;
    this.bgmGain = null;
    this.masterGain = null;

    this.sfxVolume = this._loadPref('sfxVolume', 0.5);
    this.bgmVolume = this._loadPref('bgmVolume', 0.3);
    this.muted = this._loadPref('muted', false);

    this._sfxBuffers = {}; // name -> AudioBuffer
    this._bgmElement = null; // HTMLAudioElement for BGM
    this._bgmSource = null;
    this._currentBgm = null;

    // SFX manifest
    this._sfxFiles = [
      "sword_swing", "sword_hit", "heal", "pickup",
      "quest_complete", "player_death", "level_up",
      "ui_click", "enemy_death", "chat_msg", "error", "footstep",
      "casting", "player_hit",
      "arrow_hit", "bow_shoot", "magic_hit", "staff_swing",
      "bite_hit", "punch_hit", "punch_swing", "potion_drink"
    ];

    this._loaded = false;
  }

  /** Call once after first user interaction (click / keydown). */
  async init() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 1;
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.masterGain);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = this.bgmVolume;
    this.bgmGain.connect(this.masterGain);

    await this._loadSfx();
    this._loaded = true;
  }

  async _loadSfx() {
    const promises = this._sfxFiles.map(async (name) => {
      try {
        const resp = await fetch(`/assets/sfx/${name}.wav`);
        const arrBuf = await resp.arrayBuffer();
        this._sfxBuffers[name] = await this.ctx.decodeAudioData(arrBuf);
      } catch (e) {
        console.warn(`AudioManager: failed to load ${name}.wav`, e);
      }
    });
    await Promise.all(promises);
  }

  /** Play a one-shot SFX by name (e.g. "sword_hit"). */
  play(name) {
    if (!this._loaded || this.muted) return;
    const buffer = this._sfxBuffers[name];
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.sfxGain);
    source.start(0);
  }

  /** Start looping a BGM track (e.g. "overworld"). Stops previous.
   *  Tries .mp3 first, falls back to .wav. */
  playBgm(name) {
    if (!this.ctx) return;
    if (this._currentBgm === name) return;
    this.stopBgm();

    this._currentBgm = name;
    const audio = new Audio(`/assets/bgm/${name}.mp3`);
    audio.loop = true;

    // Fall back to .wav if .mp3 fails to load
    audio.addEventListener('error', () => {
      if (audio !== this._bgmElement) return;
      audio.src = `/assets/bgm/${name}.wav`;
    }, { once: true });

    this._bgmElement = audio;

    const source = this.ctx.createMediaElementSource(audio);
    source.connect(this.bgmGain);
    this._bgmSource = source;

    audio.play().catch(() => {}); // may fail if no user gesture yet
  }

  stopBgm() {
    if (this._bgmElement) {
      this._bgmElement.pause();
      this._bgmElement.src = "";
      this._bgmElement = null;
    }
    this._bgmSource = null;
    this._currentBgm = null;
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.sfxGain) this.sfxGain.gain.value = v;
    this._savePref('sfxVolume', v);
  }

  setBgmVolume(v) {
    this.bgmVolume = v;
    if (this.bgmGain) this.bgmGain.gain.value = v;
    this._savePref('bgmVolume', v);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 1;
    }
    this._savePref('muted', this.muted);
    return this.muted;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 1;
    }
    this._savePref('muted', muted);
  }

  _savePref(key, value) {
    try { localStorage.setItem('audio_' + key, JSON.stringify(value)); } catch (e) {}
  }

  _loadPref(key, fallback) {
    try {
      const v = localStorage.getItem('audio_' + key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
}
