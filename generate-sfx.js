/**
 * generate-sfx.js — Pure Node.js WAV generator for Azerfall SFX.
 * Run: node generate-sfx.js
 * Outputs WAV files to public/assets/sfx/
 */

const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 22050;
const CHANNELS = 1;
const BIT_DEPTH = 16;

function makeWav(samples) {
  const numSamples = samples.length;
  const byteRate = SAMPLE_RATE * CHANNELS * (BIT_DEPTH / 8);
  const blockAlign = CHANNELS * (BIT_DEPTH / 8);
  const dataSize = numSamples * blockAlign;
  const fileSize = 36 + dataSize;

  const buf = Buffer.alloc(44 + dataSize);
  let o = 0;

  // RIFF header
  buf.write("RIFF", o); o += 4;
  buf.writeUInt32LE(fileSize, o); o += 4;
  buf.write("WAVE", o); o += 4;

  // fmt chunk
  buf.write("fmt ", o); o += 4;
  buf.writeUInt32LE(16, o); o += 4; // chunk size
  buf.writeUInt16LE(1, o); o += 2;  // PCM
  buf.writeUInt16LE(CHANNELS, o); o += 2;
  buf.writeUInt32LE(SAMPLE_RATE, o); o += 4;
  buf.writeUInt32LE(byteRate, o); o += 4;
  buf.writeUInt16LE(blockAlign, o); o += 2;
  buf.writeUInt16LE(BIT_DEPTH, o); o += 2;

  // data chunk
  buf.write("data", o); o += 4;
  buf.writeUInt32LE(dataSize, o); o += 4;

  for (let i = 0; i < numSamples; i++) {
    const val = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(val * 32767), o);
    o += 2;
  }

  return buf;
}

// Helpers
function envelope(t, attack, sustain, release, total) {
  if (t < attack) return t / attack;
  if (t < attack + sustain) return 1;
  const rel = (t - attack - sustain) / release;
  return Math.max(0, 1 - rel);
}

function noise() { return Math.random() * 2 - 1; }

// ── SFX definitions ────────────────────────────────

function swordSwing() {
  // Quick whoosh — filtered noise with pitch sweep
  const dur = 0.25;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.01, 0.05, 0.19, dur);
    // Noise filtered by rapid amplitude modulation
    const mod = Math.sin(2 * Math.PI * (200 + t * 800) * t);
    samples[i] = noise() * env * 0.5 * Math.abs(mod);
  }
  return samples;
}

function swordHit() {
  // Impact thud + metallic ring
  const dur = 0.3;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Low thud
    const thud = Math.sin(2 * Math.PI * 80 * t) * envelope(t, 0.005, 0.02, 0.08, dur) * 0.6;
    // Metallic clang
    const clang = Math.sin(2 * Math.PI * 1200 * t) * envelope(t, 0.002, 0.01, 0.25, dur) * 0.25;
    const clang2 = Math.sin(2 * Math.PI * 1800 * t) * envelope(t, 0.002, 0.01, 0.2, dur) * 0.15;
    // Noise burst
    const nz = noise() * envelope(t, 0.002, 0.01, 0.04, dur) * 0.3;
    samples[i] = thud + clang + clang2 + nz;
  }
  return samples;
}

function heal() {
  // Shimmery ascending tone
  const dur = 0.6;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.05, 0.25, 0.3, dur);
    const freq = 400 + t * 600;
    const tone = Math.sin(2 * Math.PI * freq * t) * 0.3;
    const harmonic = Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.15;
    const shimmer = Math.sin(2 * Math.PI * freq * 2 * t + Math.sin(t * 20) * 2) * 0.1;
    samples[i] = (tone + harmonic + shimmer) * env;
  }
  return samples;
}

function pickupItem() {
  // Quick bright chirp (coin-like)
  const dur = 0.2;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.005, 0.03, 0.16, dur);
    const freq = 800 + t * 1200;
    samples[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.35;
  }
  return samples;
}

function questComplete() {
  // Triumphant ascending arpeggio
  const dur = 0.8;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let val = 0;
    for (let ni = 0; ni < notes.length; ni++) {
      const noteStart = ni * 0.15;
      const noteT = t - noteStart;
      if (noteT < 0) continue;
      const noteDur = dur - noteStart;
      const nEnv = envelope(noteT, 0.01, 0.1, noteDur - 0.11, noteDur);
      val += Math.sin(2 * Math.PI * notes[ni] * t) * nEnv * 0.2;
    }
    samples[i] = val;
  }
  return samples;
}

function playerDeath() {
  // Low descending tone + dark rumble
  const dur = 1.0;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.02, 0.3, 0.68, dur);
    const freq = 200 - t * 120;
    const tone = Math.sin(2 * Math.PI * freq * t) * 0.35;
    const rumble = noise() * envelope(t, 0.01, 0.1, 0.4, dur) * 0.15;
    const low = Math.sin(2 * Math.PI * 60 * t) * env * 0.25;
    samples[i] = (tone + rumble + low) * env;
  }
  return samples;
}

function levelUp() {
  // Bright fanfare — two ascending notes plus shimmer
  const dur = 1.0;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let val = 0;
    // First chord: C5 + E5
    const env1 = envelope(t, 0.01, 0.2, 0.3, dur);
    val += Math.sin(2 * Math.PI * 523 * t) * env1 * 0.2;
    val += Math.sin(2 * Math.PI * 659 * t) * env1 * 0.15;
    // Second chord: G5 + C6 starting at 0.25s
    if (t > 0.25) {
      const t2 = t - 0.25;
      const env2 = envelope(t2, 0.01, 0.3, 0.44, 0.75);
      val += Math.sin(2 * Math.PI * 784 * t) * env2 * 0.2;
      val += Math.sin(2 * Math.PI * 1047 * t) * env2 * 0.2;
      // Shimmer
      val += Math.sin(2 * Math.PI * 1568 * t + Math.sin(t * 12) * 3) * env2 * 0.08;
    }
    samples[i] = val;
  }
  return samples;
}

function uiClick() {
  // Subtle click
  const dur = 0.06;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.002, 0.01, 0.048, dur);
    samples[i] = Math.sin(2 * Math.PI * 1000 * t) * env * 0.3 + noise() * env * 0.1;
  }
  return samples;
}

function enemyDeath() {
  // Quick crumble — noise burst + descending tone
  const dur = 0.4;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.005, 0.05, 0.34, dur);
    const freq = 300 - t * 200;
    const tone = Math.sin(2 * Math.PI * freq * t) * 0.3;
    const nz = noise() * envelope(t, 0.005, 0.03, 0.15, dur) * 0.35;
    samples[i] = (tone + nz) * env;
  }
  return samples;
}

function chatMessage() {
  // Soft ping
  const dur = 0.15;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.005, 0.02, 0.125, dur);
    samples[i] = Math.sin(2 * Math.PI * 880 * t) * env * 0.2 +
                 Math.sin(2 * Math.PI * 1320 * t) * env * 0.1;
  }
  return samples;
}

function errorSound() {
  // Low buzz — two dissonant tones
  const dur = 0.25;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.005, 0.08, 0.165, dur);
    samples[i] = (Math.sin(2 * Math.PI * 220 * t) * 0.3 +
                  Math.sin(2 * Math.PI * 233 * t) * 0.3) * env;
  }
  return samples;
}

function footstep() {
  // Soft thump
  const dur = 0.08;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.003, 0.01, 0.067, dur);
    samples[i] = (Math.sin(2 * Math.PI * 100 * t) * 0.4 + noise() * 0.2) * env;
  }
  return samples;
}

function gatherMining() {
  // Pickaxe strike — sharp metallic clink + rocky crumble
  const dur = 0.35;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Metallic pick strike
    const strike = Math.sin(2 * Math.PI * 900 * t) * envelope(t, 0.003, 0.01, 0.08, dur) * 0.35;
    const strike2 = Math.sin(2 * Math.PI * 1400 * t) * envelope(t, 0.003, 0.008, 0.06, dur) * 0.2;
    // Low rocky thud
    const thud = Math.sin(2 * Math.PI * 120 * t) * envelope(t, 0.005, 0.02, 0.1, dur) * 0.4;
    // Crumbly noise tail
    const crumble = noise() * envelope(t, 0.02, 0.05, 0.25, dur) * 0.15;
    samples[i] = strike + strike2 + thud + crumble;
  }
  return samples;
}

function gatherChopping() {
  // Axe chop — woody thwack + splintering
  const dur = 0.3;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Woody thwack (lower than metallic)
    const thwack = Math.sin(2 * Math.PI * 250 * t) * envelope(t, 0.003, 0.015, 0.08, dur) * 0.45;
    const thwack2 = Math.sin(2 * Math.PI * 400 * t) * envelope(t, 0.003, 0.01, 0.06, dur) * 0.2;
    // Splintering noise
    const splinter = noise() * envelope(t, 0.01, 0.04, 0.2, dur) * 0.2;
    // Subtle low body
    const body = Math.sin(2 * Math.PI * 90 * t) * envelope(t, 0.005, 0.02, 0.06, dur) * 0.25;
    samples[i] = thwack + thwack2 + splinter + body;
  }
  return samples;
}

function gatherFishing() {
  // Water splash — bubbly noise + gentle plop
  const dur = 0.4;
  const n = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Water plop (low sine burst)
    const plop = Math.sin(2 * Math.PI * 180 * t) * envelope(t, 0.005, 0.02, 0.1, dur) * 0.35;
    // Bubbly modulated noise
    const bubble = noise() * Math.abs(Math.sin(2 * Math.PI * 12 * t)) * envelope(t, 0.02, 0.1, 0.25, dur) * 0.2;
    // High water ripple
    const ripple = Math.sin(2 * Math.PI * (600 + Math.sin(t * 30) * 200) * t) * envelope(t, 0.03, 0.05, 0.3, dur) * 0.1;
    samples[i] = plop + bubble + ripple;
  }
  return samples;
}

// ── Generate all ──────────────────────────────────

const sfxList = [
  ["sword_swing.wav", swordSwing],
  ["sword_hit.wav",   swordHit],
  ["heal.wav",        heal],
  ["pickup.wav",      pickupItem],
  ["quest_complete.wav", questComplete],
  ["player_death.wav", playerDeath],
  ["level_up.wav",    levelUp],
  ["ui_click.wav",    uiClick],
  ["enemy_death.wav", enemyDeath],
  ["chat_msg.wav",    chatMessage],
  ["error.wav",       errorSound],
  ["footstep.wav",    footstep],
  ["gather_mining.wav",   gatherMining],
  ["gather_chopping.wav", gatherChopping],
  ["gather_fishing.wav",  gatherFishing],
];

const outDir = path.join(__dirname, "public", "assets", "sfx");
fs.mkdirSync(outDir, { recursive: true });

for (const [filename, genFn] of sfxList) {
  const samples = genFn();
  const wav = makeWav(samples);
  fs.writeFileSync(path.join(outDir, filename), wav);
  console.log(`  ✓ ${filename} (${wav.length} bytes)`);
}

// Create BGM placeholder directory + readme
const bgmDir = path.join(__dirname, "public", "assets", "bgm");
fs.mkdirSync(bgmDir, { recursive: true });

// Create short silent WAV placeholders for BGM
const silentSamples = new Float64Array(SAMPLE_RATE); // 1 second of silence
const silentWav = makeWav(silentSamples);

const bgmFiles = [
  "login_theme.wav",
  "overworld.wav",
  "combat.wav",
  "town.wav",
  "dungeon.wav"
];

for (const f of bgmFiles) {
  fs.writeFileSync(path.join(bgmDir, f), silentWav);
  console.log(`  ✓ bgm/${f} (placeholder — replace with real music)`);
}

console.log(`\nDone! ${sfxList.length} SFX + ${bgmFiles.length} BGM placeholders generated.`);
