/**
 * Generate 32x32 pixel-art skill icons for new skills.
 * Run: node tools/generateSkillIcons.js
 */
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'assets', 'sprites', 'skills');
const SIZE = 32;
const BG = '#2a2019';

function makeIcon(name, drawFn) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  // Dark background matching existing icons
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Subtle border
  ctx.strokeStyle = '#1a1410';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);

  drawFn(ctx);

  const out = path.join(OUT, `${name}.png`);
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  console.log(`  Created ${name}.png`);
}

function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// ── Thunderclap: yellow lightning bolt striking ground ──
makeIcon('thunderclap', (ctx) => {
  const yellow = '#ffe066';
  const bright = '#fff8cc';
  const dark = '#b89530';

  // Lightning bolt shape
  rect(ctx, 14, 4, 4, 2, bright);
  rect(ctx, 12, 6, 4, 2, yellow);
  rect(ctx, 10, 8, 4, 2, yellow);
  rect(ctx, 12, 10, 6, 2, bright);
  rect(ctx, 16, 12, 4, 2, yellow);
  rect(ctx, 14, 14, 4, 2, yellow);
  rect(ctx, 12, 16, 4, 2, bright);
  rect(ctx, 10, 18, 4, 2, yellow);

  // Ground impact sparks
  rect(ctx, 6, 22, 20, 2, dark);
  rect(ctx, 8, 24, 16, 2, '#8a6a20');
  px(ctx, 7, 20, yellow);
  px(ctx, 24, 20, yellow);
  px(ctx, 5, 21, dark);
  px(ctx, 26, 21, dark);
});

// ── Flame Strike: pillar of fire ──
makeIcon('flameStrike', (ctx) => {
  const red = '#e04020';
  const orange = '#f08030';
  const yellow = '#ffd040';
  const bright = '#fff0a0';

  // Fire pillar base (wide)
  rect(ctx, 8, 24, 16, 4, red);
  rect(ctx, 10, 22, 12, 2, orange);
  rect(ctx, 10, 20, 12, 2, orange);

  // Middle flame body
  rect(ctx, 11, 14, 10, 6, orange);
  rect(ctx, 12, 12, 8, 2, yellow);

  // Flame tip
  rect(ctx, 13, 8, 6, 4, yellow);
  rect(ctx, 14, 5, 4, 3, bright);
  rect(ctx, 15, 3, 2, 2, bright);

  // Sparks
  px(ctx, 9, 16, yellow);
  px(ctx, 22, 14, yellow);
  px(ctx, 8, 19, red);
  px(ctx, 23, 18, red);
});

// ── Blizzard: ice crystals / snowflakes falling ──
makeIcon('blizzard', (ctx) => {
  const ice = '#88ccff';
  const bright = '#ccefff';
  const white = '#eef8ff';
  const dark = '#4488bb';

  // Large snowflake center
  rect(ctx, 15, 8, 2, 10, bright);
  rect(ctx, 11, 12, 10, 2, bright);
  // Diagonals
  px(ctx, 13, 10, ice); px(ctx, 18, 10, ice);
  px(ctx, 13, 15, ice); px(ctx, 18, 15, ice);
  px(ctx, 12, 9, dark); px(ctx, 19, 9, dark);
  px(ctx, 12, 16, dark); px(ctx, 19, 16, dark);

  // Small snowflakes scattered
  px(ctx, 6, 5, white); px(ctx, 7, 6, ice);
  px(ctx, 5, 6, ice);

  px(ctx, 24, 7, white); px(ctx, 25, 8, ice);
  px(ctx, 23, 8, ice);

  px(ctx, 8, 20, white); px(ctx, 9, 21, ice);
  px(ctx, 7, 21, ice);

  px(ctx, 22, 22, white); px(ctx, 23, 23, ice);
  px(ctx, 21, 23, ice);

  // Falling streaks
  rect(ctx, 4, 3, 1, 3, dark);
  rect(ctx, 26, 12, 1, 3, dark);
  rect(ctx, 10, 24, 1, 3, dark);
  rect(ctx, 20, 26, 1, 3, dark);
});

// ── Fan of Knives: multiple daggers radiating outward ──
makeIcon('fanOfKnives', (ctx) => {
  const blade = '#c0c0c0';
  const bright = '#e8e8e8';
  const hilt = '#8a6a40';

  // Center point
  rect(ctx, 15, 15, 2, 2, hilt);

  // Dagger going up
  rect(ctx, 15, 5, 2, 4, bright);
  rect(ctx, 15, 9, 2, 3, blade);
  rect(ctx, 15, 12, 2, 3, hilt);

  // Dagger going right
  rect(ctx, 23, 15, 4, 2, bright);
  rect(ctx, 20, 15, 3, 2, blade);
  rect(ctx, 17, 15, 3, 2, hilt);

  // Dagger going down-left (diagonal)
  px(ctx, 10, 22, bright); px(ctx, 11, 21, bright);
  px(ctx, 12, 20, blade); px(ctx, 13, 19, blade);
  px(ctx, 14, 18, hilt); px(ctx, 13, 17, hilt);

  // Dagger going up-left (diagonal)
  px(ctx, 10, 8, bright); px(ctx, 11, 9, bright);
  px(ctx, 12, 10, blade); px(ctx, 13, 11, blade);
  px(ctx, 14, 12, hilt);

  // Dagger going down-right (diagonal)
  px(ctx, 22, 22, bright); px(ctx, 21, 21, bright);
  px(ctx, 20, 20, blade); px(ctx, 19, 19, blade);
  px(ctx, 18, 18, hilt);
});

// ── Shadow Barrage: dark purple cone of shadow daggers ──
makeIcon('shadowBarrage', (ctx) => {
  const purple = '#7744aa';
  const dark = '#4a2870';
  const bright = '#aa77dd';
  const white = '#ccaaee';

  // Cone shape expanding upward
  // Narrow base at bottom center
  rect(ctx, 15, 26, 2, 3, purple);
  rect(ctx, 14, 23, 4, 3, bright);

  // Widening cone
  rect(ctx, 12, 19, 8, 4, purple);
  rect(ctx, 10, 15, 12, 4, dark);
  rect(ctx, 8, 11, 16, 4, purple);
  rect(ctx, 6, 7, 20, 4, dark);

  // Bright streaks / dagger shapes inside cone
  px(ctx, 11, 13, bright); px(ctx, 15, 10, white);
  px(ctx, 20, 12, bright); px(ctx, 8, 9, bright);
  px(ctx, 23, 8, bright); px(ctx, 13, 8, white);
  px(ctx, 18, 9, bright); px(ctx, 10, 16, white);
  px(ctx, 21, 17, white);

  // Tip sparkles
  px(ctx, 7, 7, white); px(ctx, 24, 7, white);
  px(ctx, 16, 7, bright);
});

// ── Bladestorm: spinning circular blades ──
makeIcon('bladestorm', (ctx) => {
  const steel = '#c8c8c8';
  const bright = '#e8e8e8';
  const dark = '#888888';
  const gold = '#d4a030';
  const red = '#cc4444';

  // Central hilt/core
  rect(ctx, 14, 14, 4, 4, gold);
  rect(ctx, 15, 15, 2, 2, red);

  // Blade 1: top-right
  rect(ctx, 18, 8, 2, 6, steel);
  rect(ctx, 18, 6, 2, 2, bright);
  px(ctx, 19, 5, bright);

  // Blade 2: bottom-left
  rect(ctx, 12, 18, 2, 6, steel);
  rect(ctx, 12, 24, 2, 2, bright);
  px(ctx, 12, 26, bright);

  // Blade 3: left-top
  rect(ctx, 6, 12, 6, 2, steel);
  rect(ctx, 4, 12, 2, 2, bright);
  px(ctx, 3, 13, bright);

  // Blade 4: right-bottom
  rect(ctx, 20, 18, 6, 2, steel);
  rect(ctx, 26, 18, 2, 2, bright);
  px(ctx, 28, 18, bright);

  // Motion arcs (curved lines)
  px(ctx, 10, 8, dark); px(ctx, 9, 9, dark); px(ctx, 8, 10, dark);
  px(ctx, 22, 22, dark); px(ctx, 23, 23, dark); px(ctx, 24, 22, dark);
  px(ctx, 22, 9, dark); px(ctx, 23, 10, dark);
  px(ctx, 9, 23, dark); px(ctx, 10, 24, dark);
});

// ── Rain of Fire: fire raining from sky ──
makeIcon('rainOfFire', (ctx) => {
  const red = '#cc3020';
  const orange = '#e06030';
  const yellow = '#ffc040';
  const bright = '#ffe880';
  const dark = '#882010';

  // Dark cloud at top
  rect(ctx, 4, 3, 24, 4, '#3a3030');
  rect(ctx, 6, 2, 20, 2, '#4a3a30');
  rect(ctx, 8, 7, 16, 2, '#3a3030');

  // Fire drops falling at various positions
  // Drop 1
  rect(ctx, 7, 11, 2, 3, yellow);
  rect(ctx, 7, 14, 2, 2, orange);
  px(ctx, 7, 16, red);

  // Drop 2
  rect(ctx, 14, 13, 2, 3, bright);
  rect(ctx, 14, 16, 2, 2, yellow);
  px(ctx, 14, 18, orange);

  // Drop 3
  rect(ctx, 22, 10, 2, 3, yellow);
  rect(ctx, 22, 13, 2, 2, orange);
  px(ctx, 22, 15, red);

  // Drop 4
  rect(ctx, 10, 19, 2, 3, orange);
  rect(ctx, 10, 22, 2, 2, red);
  px(ctx, 10, 24, dark);

  // Drop 5
  rect(ctx, 19, 17, 2, 3, yellow);
  rect(ctx, 19, 20, 2, 2, orange);
  px(ctx, 19, 22, red);

  // Ground fire
  rect(ctx, 4, 27, 24, 2, dark);
  rect(ctx, 6, 26, 8, 1, red);
  rect(ctx, 18, 26, 8, 1, red);
});

// ── Garrote: strangling wire/hands ──
makeIcon('garrote', (ctx) => {
  const wire = '#a0a0a0';
  const bright = '#d0d0d0';
  const red = '#cc3030';
  const darkRed = '#882020';
  const skin = '#d4a878';

  // Wire/rope in an X or loop shape
  // Left hand
  rect(ctx, 4, 12, 4, 3, skin);
  rect(ctx, 5, 11, 2, 1, skin);
  rect(ctx, 5, 15, 2, 1, skin);

  // Right hand
  rect(ctx, 24, 12, 4, 3, skin);
  rect(ctx, 25, 11, 2, 1, skin);
  rect(ctx, 25, 15, 2, 1, skin);

  // Wire connecting hands (taut garrote)
  rect(ctx, 8, 13, 16, 1, bright);
  rect(ctx, 8, 14, 16, 1, wire);

  // Blood drops
  px(ctx, 14, 16, red); px(ctx, 16, 17, red);
  px(ctx, 18, 16, red); px(ctx, 15, 18, darkRed);
  px(ctx, 17, 19, darkRed);

  // Tension lines above wire
  px(ctx, 12, 11, wire); px(ctx, 16, 10, wire);
  px(ctx, 20, 11, wire);

  // Red glow around wire center
  px(ctx, 14, 12, darkRed); px(ctx, 16, 12, darkRed);
  px(ctx, 18, 12, darkRed);
  px(ctx, 15, 15, red); px(ctx, 17, 15, red);
});

console.log('\nDone! 8 skill icons generated.');
