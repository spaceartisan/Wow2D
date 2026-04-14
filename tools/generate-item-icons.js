/**
 * Item Icon Generator — produces 32x32 PNG icons for all items.
 * Run: node tools/generate-item-icons.js
 *
 * Output: public/assets/sprites/icons/<itemId>.png
 */

const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");

const DATA_DIR = path.join(__dirname, "..", "public", "data");
const OUT_DIR  = path.join(__dirname, "..", "public", "assets", "sprites", "icons");
const SIZE = 32;

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function save(name, canvas) {
  ensureDir(OUT_DIR);
  const filePath = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(filePath, canvas.toBuffer("image/png"));
  console.log(`  ${name}.png`);
}

// ── Drawing helpers ────────────────────────────────────────────
function bg(ctx, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(1, 1, SIZE - 2, SIZE - 2, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function highlight(ctx) {
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  ctx.fillRect(3, 3, SIZE - 6, 6);
}

// ── JUNK ICONS ─────────────────────────────────────────────────
function drawWolfPelt(ctx) {
  bg(ctx, "#5a4a3a");
  highlight(ctx);
  // fur shape
  ctx.fillStyle = "#8b7355";
  ctx.beginPath();
  ctx.ellipse(16, 17, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b5b45";
  ctx.beginPath();
  ctx.ellipse(16, 17, 7, 5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // texture lines
  ctx.strokeStyle = "#9a8565";
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(10 + i * 4, 12);
    ctx.lineTo(9 + i * 4, 22);
    ctx.stroke();
  }
}

function drawBoarTusk(ctx) {
  bg(ctx, "#4a3a2a");
  highlight(ctx);
  ctx.fillStyle = "#e8dcc8";
  ctx.beginPath();
  ctx.moveTo(12, 26);
  ctx.quadraticCurveTo(8, 14, 14, 6);
  ctx.lineTo(18, 8);
  ctx.quadraticCurveTo(12, 16, 16, 26);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#c4b8a4";
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

function drawBanditBadge(ctx) {
  bg(ctx, "#3a3a44");
  highlight(ctx);
  // metal circle badge
  ctx.fillStyle = "#888";
  ctx.beginPath();
  ctx.arc(16, 16, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#666";
  ctx.beginPath();
  ctx.arc(16, 16, 6, 0, Math.PI * 2);
  ctx.fill();
  // X mark
  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(12, 12); ctx.lineTo(20, 20);
  ctx.moveTo(20, 12); ctx.lineTo(12, 20);
  ctx.stroke();
}

function drawWolfFang(ctx) {
  bg(ctx, "#4a3a2a");
  highlight(ctx);
  ctx.fillStyle = "#f0e6d2";
  ctx.beginPath();
  ctx.moveTo(14, 26);
  ctx.lineTo(16, 5);
  ctx.lineTo(18, 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ddd0bc";
  ctx.beginPath();
  ctx.moveTo(14.5, 26);
  ctx.lineTo(16, 12);
  ctx.lineTo(17.5, 26);
  ctx.closePath();
  ctx.fill();
}

function drawBoarHide(ctx) {
  bg(ctx, "#5a4a3a");
  highlight(ctx);
  ctx.fillStyle = "#7a5a3a";
  ctx.beginPath();
  ctx.roundRect(6, 8, 20, 16, 3);
  ctx.fill();
  // stitch marks
  ctx.strokeStyle = "#9a7a5a";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.strokeRect(8, 10, 16, 12);
  ctx.setLineDash([]);
}

function drawBanditCoin(ctx) {
  bg(ctx, "#3a3530");
  highlight(ctx);
  ctx.fillStyle = "#c8a84e";
  ctx.beginPath();
  ctx.arc(16, 16, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b0922e";
  ctx.beginPath();
  ctx.arc(16, 16, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d4b85e";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("B", 16, 17);
}

function drawBanditMap(ctx) {
  bg(ctx, "#4a4234");
  highlight(ctx);
  // parchment
  ctx.fillStyle = "#d4c8a0";
  ctx.beginPath();
  ctx.roundRect(6, 6, 20, 20, 2);
  ctx.fill();
  // lines (routes)
  ctx.strokeStyle = "#8a7e60";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(9, 12); ctx.lineTo(15, 10); ctx.lineTo(23, 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(10, 18); ctx.lineTo(18, 20); ctx.lineTo(23, 18);
  ctx.stroke();
  // X marks
  ctx.strokeStyle = "#aa3030";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(14, 14); ctx.lineTo(16, 16);
  ctx.moveTo(16, 14); ctx.lineTo(14, 16);
  ctx.stroke();
}

// ── WEAPON ICONS ───────────────────────────────────────────────
function drawSword(ctx, bladeColor, hiltColor, label) {
  bg(ctx, "#3a3545");
  highlight(ctx);
  // blade
  ctx.fillStyle = bladeColor;
  ctx.beginPath();
  ctx.moveTo(16, 4);
  ctx.lineTo(19, 20);
  ctx.lineTo(16, 22);
  ctx.lineTo(13, 20);
  ctx.closePath();
  ctx.fill();
  // edge highlight
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.moveTo(16, 4);
  ctx.lineTo(17.5, 20);
  ctx.lineTo(16, 21);
  ctx.closePath();
  ctx.fill();
  // guard
  ctx.fillStyle = hiltColor;
  ctx.fillRect(10, 20, 12, 3);
  // grip
  ctx.fillStyle = "#5a3a2a";
  ctx.fillRect(14, 23, 4, 5);
  // pommel
  ctx.fillStyle = hiltColor;
  ctx.beginPath();
  ctx.arc(16, 29, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawBow(ctx, woodColor, stringColor) {
  bg(ctx, "#3a4535");
  highlight(ctx);
  // bow arc
  ctx.strokeStyle = woodColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(20, 16, 12, Math.PI * 0.65, Math.PI * 1.35);
  ctx.stroke();
  // string
  ctx.strokeStyle = stringColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(12, 6);
  ctx.lineTo(12, 26);
  ctx.stroke();
  // arrow
  ctx.fillStyle = "#d4c8a0";
  ctx.fillRect(11, 14, 14, 2);
  // arrowhead
  ctx.fillStyle = "#aaa";
  ctx.beginPath();
  ctx.moveTo(25, 11);
  ctx.lineTo(27, 15);
  ctx.lineTo(25, 19);
  ctx.closePath();
  ctx.fill();
}

function drawStaff(ctx, woodColor, gemColor) {
  bg(ctx, "#35354a");
  highlight(ctx);
  // shaft
  ctx.fillStyle = woodColor;
  ctx.fillRect(14, 8, 4, 22);
  // top ornament
  ctx.fillStyle = gemColor;
  ctx.beginPath();
  ctx.arc(16, 8, 5, 0, Math.PI * 2);
  ctx.fill();
  // gem shine
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.arc(14.5, 6.5, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // base
  ctx.fillStyle = "#888";
  ctx.beginPath();
  ctx.arc(16, 30, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawDagger(ctx) {
  bg(ctx, "#3a3540");
  highlight(ctx);
  // blade
  ctx.fillStyle = "#b0b0b8";
  ctx.beginPath();
  ctx.moveTo(16, 4);
  ctx.lineTo(20, 16);
  ctx.lineTo(16, 18);
  ctx.lineTo(12, 16);
  ctx.closePath();
  ctx.fill();
  // serrated edge
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(12 + i * 0.5, 8 + i * 2);
    ctx.lineTo(11, 9 + i * 2);
    ctx.stroke();
  }
  // guard
  ctx.fillStyle = "#6a4a2a";
  ctx.fillRect(11, 17, 10, 2);
  // wrap grip
  ctx.fillStyle = "#4a3020";
  ctx.fillRect(14, 19, 4, 6);
  ctx.strokeStyle = "#6a5030";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(14, 20 + i * 2);
    ctx.lineTo(18, 20 + i * 2);
    ctx.stroke();
  }
}

// ── ARMOR ICONS ────────────────────────────────────────────────
function drawShirt(ctx, color) {
  bg(ctx, "#3a3a3a");
  highlight(ctx);
  ctx.fillStyle = color;
  // body
  ctx.beginPath();
  ctx.moveTo(10, 10);
  ctx.lineTo(6, 14);   // left sleeve
  ctx.lineTo(6, 18);
  ctx.lineTo(10, 16);
  ctx.lineTo(10, 28);
  ctx.lineTo(22, 28);
  ctx.lineTo(22, 16);
  ctx.lineTo(26, 18);
  ctx.lineTo(26, 14);
  ctx.lineTo(22, 10);
  // neckline
  ctx.lineTo(19, 8);
  ctx.quadraticCurveTo(16, 10, 13, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function drawShield(ctx, color, emblemColor) {
  bg(ctx, "#3a3a44");
  highlight(ctx);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(16, 4);
  ctx.lineTo(26, 8);
  ctx.lineTo(24, 22);
  ctx.lineTo(16, 28);
  ctx.lineTo(8, 22);
  ctx.lineTo(6, 8);
  ctx.closePath();
  ctx.fill();
  // border
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // emblem cross
  ctx.fillStyle = emblemColor;
  ctx.fillRect(14, 10, 4, 14);
  ctx.fillRect(10, 14, 12, 4);
}

function drawCloak(ctx, color) {
  bg(ctx, "#354535");
  highlight(ctx);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(12, 6);
  ctx.quadraticCurveTo(16, 4, 20, 6);
  ctx.lineTo(24, 26);
  ctx.quadraticCurveTo(16, 30, 8, 26);
  ctx.closePath();
  ctx.fill();
  // clasp
  ctx.fillStyle = "#c8a84e";
  ctx.beginPath();
  ctx.arc(16, 7, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // folds
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(13, 10); ctx.quadraticCurveTo(12, 20, 10, 26);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(19, 10); ctx.quadraticCurveTo(20, 20, 22, 26);
  ctx.stroke();
}

// ── TRINKET ICONS ──────────────────────────────────────────────
function drawNecklace(ctx, beadColor) {
  bg(ctx, "#3a3540");
  highlight(ctx);
  // chain
  ctx.strokeStyle = "#c8a84e";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(16, 12, 8, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  // teeth/beads
  for (let i = 0; i < 5; i++) {
    const angle = Math.PI * 0.2 + i * Math.PI * 0.15;
    const x = 16 + Math.cos(angle) * 8;
    const y = 12 + Math.sin(angle) * 8;
    ctx.fillStyle = beadColor;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // pendant
  ctx.fillStyle = beadColor;
  ctx.beginPath();
  ctx.moveTo(16, 20);
  ctx.lineTo(13, 26);
  ctx.lineTo(19, 26);
  ctx.closePath();
  ctx.fill();
}

function drawRing(ctx, stoneColor) {
  bg(ctx, "#35354a");
  highlight(ctx);
  // ring band
  ctx.strokeStyle = "#c8a84e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(16, 18, 8, 0, Math.PI * 2);
  ctx.stroke();
  // setting prongs
  ctx.fillStyle = "#c8a84e";
  ctx.fillRect(12, 8, 8, 5);
  // stone
  ctx.fillStyle = stoneColor;
  ctx.beginPath();
  ctx.ellipse(16, 10, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // shine
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.ellipse(15, 9, 1.5, 1, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTalisman(ctx, glowColor) {
  bg(ctx, "#2a2a3a");
  highlight(ctx);
  // cord
  ctx.strokeStyle = "#6a5030";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(10, 4);
  ctx.quadraticCurveTo(16, 8, 22, 4);
  ctx.stroke();
  // carved piece
  ctx.fillStyle = "#5a4a3a";
  ctx.beginPath();
  ctx.moveTo(16, 8);
  ctx.lineTo(22, 14);
  ctx.lineTo(20, 24);
  ctx.lineTo(12, 24);
  ctx.lineTo(10, 14);
  ctx.closePath();
  ctx.fill();
  // glow rune
  ctx.fillStyle = glowColor;
  ctx.beginPath();
  ctx.arc(16, 16, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.arc(15, 15, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawMedal(ctx) {
  bg(ctx, "#3a3545");
  highlight(ctx);
  // ribbon
  ctx.fillStyle = "#4466aa";
  ctx.beginPath();
  ctx.moveTo(12, 4);
  ctx.lineTo(10, 14);
  ctx.lineTo(16, 11);
  ctx.lineTo(22, 14);
  ctx.lineTo(20, 4);
  ctx.closePath();
  ctx.fill();
  // medal disc
  ctx.fillStyle = "#d4a830";
  ctx.beginPath();
  ctx.arc(16, 20, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c09020";
  ctx.beginPath();
  ctx.arc(16, 20, 6, 0, Math.PI * 2);
  ctx.fill();
  // star
  ctx.fillStyle = "#e8c848";
  const cx = 16, cy = 20;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
    const a2 = a + Math.PI / 5;
    ctx.lineTo(cx + Math.cos(a) * 4.5, cy + Math.sin(a) * 4.5);
    ctx.lineTo(cx + Math.cos(a2) * 2, cy + Math.sin(a2) * 2);
  }
  ctx.closePath();
  ctx.fill();
}

function drawCharm(ctx) {
  bg(ctx, "#3a3540");
  highlight(ctx);
  // cord
  ctx.strokeStyle = "#8a7050";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(12, 4); ctx.lineTo(16, 8); ctx.lineTo(20, 4);
  ctx.stroke();
  // amber gem
  const grd = ctx.createRadialGradient(16, 18, 2, 16, 18, 9);
  grd.addColorStop(0, "#f0c860");
  grd.addColorStop(1, "#c08820");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.ellipse(16, 18, 8, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // shine
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(14, 14, 3, 2, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

// ── CONSUMABLE ICONS ───────────────────────────────────────────
function drawPotion(ctx, liquidColor, size) {
  bg(ctx, "#2a2a3a");
  highlight(ctx);
  const w = size === "large" ? 12 : size === "med" ? 10 : 8;
  const h = size === "large" ? 16 : size === "med" ? 14 : 12;
  const x = 16 - w / 2;
  const y = 26 - h;
  // bottle
  ctx.fillStyle = "rgba(180,200,220,0.3)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.fill();
  // liquid
  ctx.fillStyle = liquidColor;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + h * 0.3, w - 2, h * 0.65, 2);
  ctx.fill();
  // neck
  ctx.fillStyle = "rgba(180,200,220,0.3)";
  ctx.fillRect(14, y - 4, 4, 5);
  // cork
  ctx.fillStyle = "#8a6a40";
  ctx.fillRect(13.5, y - 6, 5, 3);
  // shine
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(x + 2, y + 2, 2, h - 4);
}

function drawAntidote(ctx) {
  bg(ctx, "#2a3a2a");
  highlight(ctx);
  // leafy bottle
  ctx.fillStyle = "rgba(180,200,180,0.3)";
  ctx.beginPath();
  ctx.roundRect(11, 10, 10, 14, 3);
  ctx.fill();
  // green liquid
  ctx.fillStyle = "#4a8a3a";
  ctx.beginPath();
  ctx.roundRect(12, 16, 8, 7, 2);
  ctx.fill();
  // neck
  ctx.fillStyle = "rgba(180,200,180,0.3)";
  ctx.fillRect(14, 6, 4, 5);
  // leaf cork
  ctx.fillStyle = "#3a7a2a";
  ctx.beginPath();
  ctx.ellipse(16, 5, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // shine
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(13, 12, 2, 8);
}

// ── METAL BAR ICONS ────────────────────────────────────────────
function drawBar(ctx, barColor, highlightColor) {
  bg(ctx, "#3a3a3a");
  highlight(ctx);
  // Bar shape — a 3D-ish ingot
  ctx.fillStyle = barColor;
  ctx.beginPath();
  ctx.moveTo(6, 20);
  ctx.lineTo(10, 12);
  ctx.lineTo(26, 12);
  ctx.lineTo(26, 20);
  ctx.closePath();
  ctx.fill();
  // Top face
  ctx.fillStyle = highlightColor;
  ctx.beginPath();
  ctx.moveTo(10, 12);
  ctx.lineTo(14, 8);
  ctx.lineTo(26, 8);
  ctx.lineTo(26, 12);
  ctx.closePath();
  ctx.fill();
  // Shine
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(12, 9, 8, 2);
}

// ── PLANK ICONS ────────────────────────────────────────────────
function drawPlank(ctx, woodColor, grainColor) {
  bg(ctx, "#3a3a2a");
  highlight(ctx);
  // Plank shape
  ctx.fillStyle = woodColor;
  ctx.beginPath();
  ctx.roundRect(5, 10, 22, 12, 2);
  ctx.fill();
  // Wood grain lines
  ctx.strokeStyle = grainColor;
  ctx.lineWidth = 0.5;
  for (let y = 13; y <= 19; y += 3) {
    ctx.beginPath();
    ctx.moveTo(7, y);
    ctx.lineTo(25, y);
    ctx.stroke();
  }
  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(6, 11, 20, 3);
}

// ── MEAL ICONS ─────────────────────────────────────────────────
function drawMeal(ctx, fishColor, plateColor) {
  bg(ctx, "#3a2a2a");
  highlight(ctx);
  // Plate
  ctx.fillStyle = plateColor;
  ctx.beginPath();
  ctx.ellipse(16, 20, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cooked fish on plate
  ctx.fillStyle = fishColor;
  ctx.beginPath();
  ctx.ellipse(16, 17, 8, 4, -0.1, 0, Math.PI * 2);
  ctx.fill();
  // Grill marks
  ctx.strokeStyle = "rgba(80,40,0,0.5)";
  ctx.lineWidth = 1;
  for (let x = 10; x <= 22; x += 3) {
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x, 20);
    ctx.stroke();
  }
  // Steam
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 0.8;
  for (let x = 12; x <= 20; x += 4) {
    ctx.beginPath();
    ctx.moveTo(x, 12);
    ctx.quadraticCurveTo(x + 1, 9, x, 6);
    ctx.stroke();
  }
}

// ── Generate all icons ─────────────────────────────────────────
function generate() {
  console.log("Generating item icons (32x32)...\n");

  const items = {
    // Junk
    wolfPelt:     (ctx) => drawWolfPelt(ctx),
    boarTusk:     (ctx) => drawBoarTusk(ctx),
    banditBadge:  (ctx) => drawBanditBadge(ctx),
    wolfFang:     (ctx) => drawWolfFang(ctx),
    boarHide:     (ctx) => drawBoarHide(ctx),
    banditCoin:   (ctx) => drawBanditCoin(ctx),
    banditMap:    (ctx) => drawBanditMap(ctx),

    // Weapons
    rustySword:       (ctx) => drawSword(ctx, "#8a7a6a", "#6a5a3a"),
    noviceBlade:      (ctx) => drawSword(ctx, "#a0a0a8", "#7a6a4a"),
    forestBow:        (ctx) => drawBow(ctx, "#6a8a4a", "#c8c8a0"),
    banditDagger:     (ctx) => drawDagger(ctx),
    darkwoodStaff:    (ctx) => drawStaff(ctx, "#4a3a2a", "#8866cc"),
    huntersBow:       (ctx) => drawBow(ctx, "#8a6a3a", "#e0d8b0"),
    steelLongsword:   (ctx) => drawSword(ctx, "#c8c8d0", "#8a7a5a"),
    eldenwoodStaff:   (ctx) => drawStaff(ctx, "#6a5a3a", "#44ccaa"),

    // Armor
    tornShirt:        (ctx) => drawShirt(ctx, "#8a8070"),
    stitchedVest:     (ctx) => drawShirt(ctx, "#7a5a3a"),
    ironShield:       (ctx) => drawShield(ctx, "#7a7a84", "#c8c8d0"),
    hardLeatherTunic: (ctx) => drawShirt(ctx, "#6a4a2a"),
    chainmailVest:    (ctx) => drawShirt(ctx, "#9a9aa0"),
    forestCloak:      (ctx) => drawCloak(ctx, "#3a6a3a"),

    // Trinkets
    wolftoothNecklace: (ctx) => drawNecklace(ctx, "#e0d8c0"),
    amberCharm:        (ctx) => drawCharm(ctx),
    mossAgate:         (ctx) => drawRing(ctx, "#4a8a4a"),
    darkwoodTalisman:  (ctx) => drawTalisman(ctx, "#8866cc"),
    captainsMedal:     (ctx) => drawMedal(ctx),

    // Consumables
    minorHealingPotion:   (ctx) => drawPotion(ctx, "#cc3333", "small"),
    healingPotion:        (ctx) => drawPotion(ctx, "#cc3333", "med"),
    greaterHealingPotion: (ctx) => drawPotion(ctx, "#cc3333", "large"),
    minorManaPotion:      (ctx) => drawPotion(ctx, "#3366cc", "small"),
    manaPotion:           (ctx) => drawPotion(ctx, "#3366cc", "med"),
    antidote:             (ctx) => drawAntidote(ctx),

    // Bars (smelting output)
    copperBar:    (ctx) => drawBar(ctx, "#b87333", "#d4956a"),
    tinBar:       (ctx) => drawBar(ctx, "#a0a0a0", "#c8c8c8"),
    ironBar:      (ctx) => drawBar(ctx, "#6a6a70", "#8a8a90"),

    // Planks (milling output)
    oakPlank:     (ctx) => drawPlank(ctx, "#8a7050", "#6a5a3a"),
    maplePlank:   (ctx) => drawPlank(ctx, "#c09060", "#a07a4a"),
    yewPlank:     (ctx) => drawPlank(ctx, "#6a3a2a", "#4a2a1a"),

    // Meals (cooking output)
    grilledTrout:   (ctx) => drawMeal(ctx, "#c09070", "#d8d0c0"),
    bakedSalmon:    (ctx) => drawMeal(ctx, "#e08060", "#d8d0c0"),
    roastedLobster: (ctx) => drawMeal(ctx, "#cc4040", "#d8d0c0"),
  };

  let count = 0;
  for (const [name, drawFn] of Object.entries(items)) {
    const canvas = createCanvas(SIZE, SIZE);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, SIZE, SIZE);
    drawFn(ctx);
    save(name, canvas);
    count++;
  }

  console.log(`\nDone — ${count} item icons generated in ${OUT_DIR}`);
}

generate();
