/**
 * Sprite Generator — produces PNG assets for all game visuals.
 * Run: node tools/generate-sprites.js
 *
 * Output: public/assets/sprites/{tiles,entities,props}/
 *
 * These are placeholder sprites that match the original programmatic look.
 * Replace any PNG with custom art of the same dimensions to upgrade graphics.
 */

const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");

// ── Paths ──────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "..", "public", "data");
const OUT_DIR  = path.join(__dirname, "..", "public", "assets", "sprites");

const TILE_SIZE = 48;

// ── Helpers ────────────────────────────────────────────────────
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function save(subdir, name, canvas) {
  const dir = path.join(OUT_DIR, subdir);
  ensureDir(dir);
  const filePath = path.join(dir, `${name}.png`);
  const buf = canvas.toBuffer("image/png");
  fs.writeFileSync(filePath, buf);
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function rgbStr(r, g, b) {
  return `rgb(${r},${g},${b})`;
}

function darker(r, g, b, amt = 30) {
  return rgbStr(Math.max(0, r - amt), Math.max(0, g - amt), Math.max(0, b - amt));
}

function lighter(r, g, b, amt = 25) {
  return rgbStr(Math.min(255, r + amt), Math.min(255, g + amt), Math.min(255, b + amt));
}

// ── Tile generators ─────────────────────────────────────────────
function generateBaseTile(name, rgb) {
  const c = createCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = c.getContext("2d");
  const [r, g, b] = rgb;

  // Base fill
  ctx.fillStyle = rgbStr(r, g, b);
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Subtle noise texture
  for (let py = 0; py < TILE_SIZE; py += 4) {
    for (let px = 0; px < TILE_SIZE; px += 4) {
      const jitter = ((px * 17 + py * 29) % 7) - 3;
      ctx.fillStyle = `rgba(${jitter > 0 ? 255 : 0},${jitter > 0 ? 255 : 0},${jitter > 0 ? 255 : 0},${Math.abs(jitter) * 0.012})`;
      ctx.fillRect(px, py, 4, 4);
    }
  }

  return { canvas: c, ctx };
}

function generateTile_houseWall(rgb) {
  const { canvas: c, ctx } = generateBaseTile("houseWall", rgb);
  const ts = TILE_SIZE;
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, ts * 0.33); ctx.lineTo(ts, ts * 0.33);
  ctx.moveTo(0, ts * 0.66); ctx.lineTo(ts, ts * 0.66);
  ctx.moveTo(ts * 0.5, 0); ctx.lineTo(ts * 0.5, ts * 0.33);
  ctx.moveTo(ts * 0.25, ts * 0.33); ctx.lineTo(ts * 0.25, ts * 0.66);
  ctx.moveTo(ts * 0.75, ts * 0.66); ctx.lineTo(ts * 0.75, ts);
  ctx.stroke();
  return c;
}

function generateTile_houseFloor(rgb) {
  const { canvas: c, ctx } = generateBaseTile("houseFloor", rgb);
  const ts = TILE_SIZE;
  ctx.strokeStyle = "rgba(80,55,25,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    ctx.moveTo(0, i * ts / 4);
    ctx.lineTo(ts, i * ts / 4);
  }
  ctx.stroke();
  return c;
}

function generateTile_stairs(rgb) {
  const { canvas: c, ctx } = generateBaseTile("stairs", rgb);
  const ts = TILE_SIZE;
  // Step lines
  ctx.fillStyle = "rgba(90,65,30,0.3)";
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const sy = i * (ts / steps);
    const sw = ts - i * 4;
    ctx.fillRect((ts - sw) / 2, sy, sw, 2);
  }
  // Arrow up
  ctx.fillStyle = "rgba(255,255,200,0.5)";
  ctx.beginPath();
  ctx.moveTo(ts / 2, 6);
  ctx.lineTo(ts / 2 - 5, 14);
  ctx.lineTo(ts / 2 + 5, 14);
  ctx.fill();
  return c;
}

function generateTile_bedHead(rgb) {
  const { canvas: c, ctx } = generateBaseTile("bedHead", rgb);
  const ts = TILE_SIZE;
  ctx.fillStyle = "rgba(220,200,180,0.7)";
  ctx.fillRect(6, 6, ts - 12, ts - 12);
  ctx.strokeStyle = "rgba(100,30,30,0.4)";
  ctx.strokeRect(4, 4, ts - 8, ts - 8);
  return c;
}

function generateTile_bedFoot(rgb) {
  const { canvas: c, ctx } = generateBaseTile("bedFoot", rgb);
  const ts = TILE_SIZE;
  ctx.fillStyle = "rgba(120,35,35,0.3)";
  ctx.fillRect(6, 6, ts - 12, ts - 12);
  ctx.strokeStyle = "rgba(100,30,30,0.4)";
  ctx.strokeRect(4, 4, ts - 8, ts - 8);
  return c;
}

function generateTile_water(rgb) {
  const { canvas: c, ctx } = generateBaseTile("water", rgb);
  const [r, g, b] = rgb;
  // Wavey highlights
  ctx.strokeStyle = lighter(r, g, b, 20);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const y = 10 + i * 14;
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(12, y - 4, 24, y);
    ctx.quadraticCurveTo(36, y + 4, 48, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}

function generateTile_deepWater(rgb) {
  return generateTile_water(rgb); // same wavey style, different base color
}

function generateTile_cliff(rgb) {
  const { canvas: c, ctx } = generateBaseTile("cliff", rgb);
  const [r, g, b] = rgb;
  // Rocky cracks
  ctx.strokeStyle = darker(r, g, b, 15);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.moveTo(8, 0); ctx.lineTo(12, 16); ctx.lineTo(6, 32); ctx.lineTo(10, 48);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(30, 0); ctx.lineTo(34, 20); ctx.lineTo(28, 40); ctx.lineTo(32, 48);
  ctx.stroke();
  ctx.globalAlpha = 1;
  return c;
}

function generateTile_campfire(rgb) {
  const { canvas: c, ctx } = generateBaseTile("campfire", rgb);
  const ts = TILE_SIZE;
  const cx = ts / 2, cy = ts / 2;
  // Inner flame
  ctx.fillStyle = "rgba(255,160,40,0.6)";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 10);
  ctx.quadraticCurveTo(cx + 8, cy - 2, cx + 5, cy + 6);
  ctx.quadraticCurveTo(cx, cy + 10, cx - 5, cy + 6);
  ctx.quadraticCurveTo(cx - 8, cy - 2, cx, cy - 10);
  ctx.fill();
  // Bright core
  ctx.fillStyle = "rgba(255,240,120,0.5)";
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function generateTile_ruins(rgb) {
  const { canvas: c, ctx } = generateBaseTile("ruins", rgb);
  const [r, g, b] = rgb;
  ctx.fillStyle = darker(r, g, b, 10);
  // Broken stone blocks
  ctx.fillRect(4, 6, 14, 10);
  ctx.fillRect(28, 30, 16, 12);
  ctx.fillRect(10, 34, 10, 8);
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.strokeRect(4, 6, 14, 10);
  ctx.strokeRect(28, 30, 16, 12);
  return c;
}

// Map of special tile generators
const SPECIAL_TILES = {
  houseWall: generateTile_houseWall,
  houseFloor: generateTile_houseFloor,
  stairs: generateTile_stairs,
  bedHead: generateTile_bedHead,
  bedFoot: generateTile_bedFoot,
  water: generateTile_water,
  deepWater: generateTile_deepWater,
  cliff: generateTile_cliff,
  darkCliff: generateTile_cliff,
  campfire: generateTile_campfire,
  ruins: generateTile_ruins,
};

// ── Grass/terrain detail generators (dots / tufts) ──────────
function addGrassDetail(ctx, rgb) {
  const [r, g, b] = rgb;
  ctx.fillStyle = lighter(r, g, b, 15);
  // Small tufts
  for (let i = 0; i < 5; i++) {
    const px = 4 + ((i * 37) % 40);
    const py = 6 + ((i * 23) % 36);
    ctx.fillRect(px, py, 2, 2);
  }
}

const GRASS_TILES = new Set([
  "meadow", "meadow2", "townGrass", "forest", "forestLight",
  "darkGrass", "darkGrass2", "forestDense", "moss"
]);

// ── Entity generators ──────────────────────────────────────────
function generateEnemy(name, color, radius) {
  const size = radius * 2 + 8; // padding for glow
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  const cx = size / 2, cy = size / 2;
  const [r, g, b] = hexToRgb(color);

  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Shading — darker bottom half
  const grad = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
  grad.addColorStop(0, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Eye dots
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 3, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 4, cy - 3, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Pupils
  ctx.fillStyle = "rgba(20,20,20,0.8)";
  ctx.beginPath();
  ctx.arc(cx - 3.5, cy - 2.5, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 4.5, cy - 2.5, 1.2, 0, Math.PI * 2);
  ctx.fill();

  return c;
}

function generateNpc(name, color) {
  const size = 36;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  const cx = size / 2, cy = size / 2;
  const [r, g, b] = hexToRgb(color);

  // Body circle
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.fill();

  // Shading
  const grad = ctx.createLinearGradient(cx, cy - 14, cx, cy + 14);
  grad.addColorStop(0, "rgba(255,255,255,0.15)");
  grad.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.fill();

  // Friendly eyes (slightly larger, smile lines)
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 3, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 4, cy - 3, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(30,30,30,0.7)";
  ctx.beginPath();
  ctx.arc(cx - 3.5, cy - 2.5, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 4.5, cy - 2.5, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy + 1, 5, 0.2, Math.PI - 0.2);
  ctx.stroke();

  return c;
}

function generatePlayer(className, color) {
  const size = 40;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  const cx = size / 2, cy = size / 2;
  const radius = 16;

  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Shading
  const grad = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
  grad.addColorStop(0, "rgba(255,255,255,0.15)");
  grad.addColorStop(1, "rgba(0,0,0,0.15)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Border
  ctx.strokeStyle = "#e8e8f8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  return c;
}

function generateDrop() {
  const c = createCanvas(16, 14);
  const ctx = c.getContext("2d");

  // Bag body
  ctx.fillStyle = "#72582b";
  ctx.fillRect(2, 2, 12, 10);
  ctx.strokeStyle = "#d7ba7a";
  ctx.lineWidth = 1;
  ctx.strokeRect(2, 2, 12, 10);

  // Clasp
  ctx.fillStyle = "#d7ba7a";
  ctx.fillRect(6, 0, 4, 3);

  return c;
}

function generatePortal() {
  const c = createCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = c.getContext("2d");

  ctx.fillStyle = "rgba(100, 180, 255, 0.15)";
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = "rgba(100, 180, 255, 0.5)";
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
  ctx.setLineDash([]);

  // Inner glow
  const grad = ctx.createRadialGradient(TILE_SIZE / 2, TILE_SIZE / 2, 2, TILE_SIZE / 2, TILE_SIZE / 2, TILE_SIZE / 2);
  grad.addColorStop(0, "rgba(140,200,255,0.25)");
  grad.addColorStop(1, "rgba(100,180,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  return c;
}

// ── Prop generators ────────────────────────────────────────────
function generateTree(tint) {
  const w = 48, h = 52;
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  const cx = w / 2;
  const canopyY = 16;
  const radius = w * 0.4;

  // Trunk
  ctx.fillStyle = "#4d311f";
  ctx.fillRect(cx - 4, canopyY + 8, 8, 14);

  // Canopy
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.arc(cx, canopyY, radius, 0, Math.PI * 2);
  ctx.fill();

  // Canopy shading
  const grad = ctx.createRadialGradient(cx - 4, canopyY - 4, 2, cx, canopyY, radius);
  grad.addColorStop(0, "rgba(255,255,255,0.1)");
  grad.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, canopyY, radius, 0, Math.PI * 2);
  ctx.fill();

  // Leaf highlight
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(cx - radius * 0.25, canopyY - radius * 0.2, radius * 0.35, 0, Math.PI * 2);
  ctx.fill();

  return c;
}

function generateFlower() {
  const c = createCanvas(12, 12);
  const ctx = c.getContext("2d");
  // Petals
  ctx.fillStyle = "#f2b8d7";
  const cx = 6, cy = 6;
  for (let a = 0; a < 5; a++) {
    const angle = (a / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * 2.5, cy + Math.sin(angle) * 2.5, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Center
  ctx.fillStyle = "#f5e860";
  ctx.beginPath();
  ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function generateMushroom() {
  const c = createCanvas(12, 12);
  const ctx = c.getContext("2d");
  // Stem
  ctx.fillStyle = "#e0d5c0";
  ctx.fillRect(4, 6, 4, 5);
  // Cap
  ctx.fillStyle = "#c97a5e";
  ctx.beginPath();
  ctx.arc(6, 6, 4, Math.PI, 0);
  ctx.fill();
  // Spots
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.arc(5, 4, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(8, 5, 0.8, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function generateRock() {
  const c = createCanvas(14, 14);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#808a8d";
  ctx.beginPath();
  ctx.moveTo(3, 10);
  ctx.lineTo(1, 6);
  ctx.lineTo(4, 2);
  ctx.lineTo(10, 2);
  ctx.lineTo(13, 5);
  ctx.lineTo(12, 10);
  ctx.closePath();
  ctx.fill();
  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(4, 4);
  ctx.lineTo(6, 3);
  ctx.lineTo(9, 3);
  ctx.lineTo(7, 5);
  ctx.closePath();
  ctx.fill();
  return c;
}

// ── Main ─────────────────────────────────────────────────────
function main() {
  console.log("Generating sprites...");

  // 1. Tiles
  const palette = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "tilePalette.json"), "utf-8"));
  let tileCount = 0;
  for (const [name, entry] of Object.entries(palette)) {
    const rgb = entry.color;
    let canvas;
    if (SPECIAL_TILES[name]) {
      canvas = SPECIAL_TILES[name](rgb);
    } else {
      const result = generateBaseTile(name, rgb);
      if (GRASS_TILES.has(name)) addGrassDetail(result.ctx, rgb);
      canvas = result.canvas;
    }
    save("tiles", name, canvas);
    tileCount++;
  }
  console.log(`  Tiles: ${tileCount}`);

  // 2. Enemies
  const enemies = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "enemies.json"), "utf-8"));
  let enemyCount = 0;
  for (const [id, def] of Object.entries(enemies)) {
    const c = generateEnemy(id, def.color, def.radius || 15);
    save("entities", id, c);
    enemyCount++;
  }
  console.log(`  Enemies: ${enemyCount}`);

  // 3. NPCs
  const npcs = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "npcs.json"), "utf-8"));
  let npcCount = 0;
  for (const [id, def] of Object.entries(npcs)) {
    const c = generateNpc(id, def.color);
    save("entities", id, c);
    npcCount++;
  }
  console.log(`  NPCs: ${npcCount}`);

  // 4. Player classes
  const classColors = {
    warrior: "#d48a5e",
    mage: "#8a7dc9",
    rogue: "#7cc97d"
  };
  for (const [cls, color] of Object.entries(classColors)) {
    save("entities", `player_${cls}`, generatePlayer(cls, color));
  }
  // Local player (blue)
  save("entities", "player_local", generatePlayer("warrior", "#7db1d5"));
  // Dead player
  save("entities", "player_dead", generatePlayer("warrior", "#5d4b67"));
  console.log("  Players: 5 (3 classes + local + dead)");

  // 5. Drop
  save("entities", "drop", generateDrop());
  console.log("  Drop: 1");

  // 6. Portal
  save("props", "portal", generatePortal());
  console.log("  Portal: 1");

  // 7. Trees — generate a few tint variants
  const treeTints = [
    { name: "tree_default", tint: "#2c4f2f" },
    { name: "tree_dark",    tint: "#1e3a22" },
    { name: "tree_light",   tint: "#3a6a3a" },
    { name: "tree_autumn",  tint: "#7a5a2f" },
  ];
  for (const t of treeTints) {
    save("props", t.name, generateTree(t.tint));
  }
  console.log(`  Trees: ${treeTints.length} variants`);

  // 8. Ambient props
  save("props", "flower", generateFlower());
  save("props", "mushroom", generateMushroom());
  save("props", "rock", generateRock());
  console.log("  Props: 3 (flower, mushroom, rock)");

  console.log(`\nDone! Sprites written to: ${OUT_DIR}`);
}

main();
