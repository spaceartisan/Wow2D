/**
 * Generate custom pixel-art PNG icons for the game UI.
 * Run once: node generate-icons.js
 * Requires no external dependencies — uses raw PNG encoding.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 32;
const OUT = path.join(__dirname, "public", "assets", "icons");

/* ── tiny PNG writer ──────────────────────────────────── */

function createPng(width, height, pixels) {
  // pixels is a Uint8Array of RGBA data (width * height * 4)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const buf = Buffer.alloc(4 + type.length + data.length + 4);
    buf.writeUInt32BE(data.length, 0);
    buf.write(type, 4);
    data.copy(buf, 4 + type.length);
    const crc = crc32(Buffer.concat([Buffer.from(type), data]));
    buf.writeInt32BE(crc, buf.length - 4);
    return buf;
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT — raw pixel rows with filter byte 0
  const rowLen = width * 4 + 1;
  const raw = Buffer.alloc(height * rowLen);
  for (let y = 0; y < height; y++) {
    raw[y * rowLen] = 0; // filter: none
    pixels.copy(raw, y * rowLen + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw);

  // IEND
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", iend)
  ]);
}

// CRC32
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return crc ^ -1;
}

/* ── drawing helpers ──────────────────────────────────── */

function makeCanvas() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  return {
    pixels,
    set(x, y, r, g, b, a = 255) {
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
      x = Math.floor(x);
      y = Math.floor(y);
      const i = (y * SIZE + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    },
    rect(x, y, w, h, r, g, b, a = 255) {
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++)
          this.set(x + dx, y + dy, r, g, b, a);
    },
    line(x0, y0, x1, y1, r, g, b, a = 255) {
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      while (true) {
        this.set(x0, y0, r, g, b, a);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
      }
    },
    circle(cx, cy, rad, r, g, b, a = 255, fill = false) {
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (fill ? dist <= rad : Math.abs(dist - rad) < 1.2) {
            this.set(cx + dx, cy + dy, r, g, b, a);
          }
        }
      }
    }
  };
}

function save(name, canvas) {
  const png = createPng(SIZE, SIZE, canvas.pixels);
  fs.writeFileSync(path.join(OUT, name + ".png"), png);
  console.log(`  ✓ ${name}.png`);
}

/* ── icon definitions ─────────────────────────────────── */

function drawSword(c) {
  // Blade — diagonal from top-right to center
  for (let i = 0; i < 18; i++) {
    c.set(22 - i, 4 + i, 220, 220, 235);
    c.set(23 - i, 4 + i, 200, 200, 215);
  }
  // Blade edge highlight
  for (let i = 0; i < 16; i++) {
    c.set(21 - i, 5 + i, 240, 240, 255);
  }
  // Guard
  c.rect(3, 21, 10, 2, 180, 150, 60);
  c.rect(4, 20, 8, 1, 200, 170, 80);
  c.rect(4, 23, 8, 1, 140, 120, 50);
  // Handle
  for (let i = 0; i < 5; i++) {
    c.set(5 - i, 23 + i, 120, 80, 40);
    c.set(6 - i, 23 + i, 100, 65, 30);
  }
  // Pommel
  c.rect(0, 28, 3, 3, 180, 150, 60);
  c.set(1, 29, 220, 190, 90);
}

function drawShield(c) {
  // Shield body
  for (let y = 4; y < 28; y++) {
    const progress = (y - 4) / 24;
    const halfW = Math.floor(12 * (1 - progress * progress * 0.6));
    for (let dx = -halfW; dx <= halfW; dx++) {
      const x = 16 + dx;
      const edge = Math.abs(dx) >= halfW - 1;
      if (edge) {
        c.set(x, y, 140, 116, 73);
      } else {
        // Steel body with subtle gradient
        const shade = 60 + Math.floor(20 * (1 - Math.abs(dx) / halfW));
        c.set(x, y, shade + 40, shade + 50, shade + 70);
      }
    }
  }
  // Cross emblem
  c.rect(14, 10, 5, 14, 180, 150, 60);
  c.rect(10, 14, 13, 4, 180, 150, 60);
  // Cross highlight
  c.rect(15, 11, 3, 12, 210, 180, 80);
  c.rect(11, 15, 11, 2, 210, 180, 80);
  // Top rim
  for (let dx = -10; dx <= 10; dx++) {
    c.set(16 + dx, 4, 180, 160, 100);
  }
}

function drawScroll(c) {
  // Scroll body (parchment)
  c.rect(8, 6, 16, 20, 220, 200, 160);
  c.rect(9, 6, 14, 20, 230, 212, 175);
  // Top roll
  c.rect(6, 4, 20, 4, 180, 150, 100);
  c.rect(7, 5, 18, 2, 200, 170, 120);
  // Endcaps
  c.rect(6, 4, 3, 4, 140, 110, 70);
  c.rect(23, 4, 3, 4, 140, 110, 70);
  // Bottom roll
  c.rect(6, 24, 20, 4, 180, 150, 100);
  c.rect(7, 25, 18, 2, 200, 170, 120);
  c.rect(6, 24, 3, 4, 140, 110, 70);
  c.rect(23, 24, 3, 4, 140, 110, 70);
  // Text lines
  for (let i = 0; i < 5; i++) {
    const w = 8 + (i % 3) * 2;
    c.rect(12, 9 + i * 3, w, 1, 140, 120, 90);
  }
}

function drawBag(c) {
  // Bag body
  for (let y = 12; y < 28; y++) {
    const progress = (y - 12) / 16;
    const halfW = Math.floor(11 + 2 * Math.sin(progress * Math.PI));
    for (let dx = -halfW; dx <= halfW; dx++) {
      const x = 16 + dx;
      const edge = Math.abs(dx) >= halfW - 1;
      if (edge) {
        c.set(x, y, 120, 80, 40);
      } else {
        c.set(x, y, 160, 110, 55);
      }
    }
  }
  // Bottom
  c.rect(6, 27, 20, 2, 120, 80, 40);
  // Top flap / opening
  c.rect(8, 11, 16, 3, 140, 95, 48);
  c.rect(9, 10, 14, 2, 130, 88, 44);
  // Drawstring
  c.line(12, 10, 14, 6, 180, 150, 80);
  c.line(20, 10, 18, 6, 180, 150, 80);
  c.line(14, 6, 18, 6, 180, 150, 80);
  // Buckle
  c.rect(14, 17, 5, 4, 200, 170, 80);
  c.rect(15, 18, 3, 2, 160, 110, 55);
}

function drawPerson(c) {
  // Head
  c.circle(16, 8, 5, 210, 180, 140, 255, true);
  c.circle(16, 8, 5, 180, 150, 110);
  // Body
  c.rect(12, 14, 9, 10, 100, 120, 170);
  c.rect(13, 14, 7, 10, 110, 130, 180);
  // Arms
  c.rect(8, 15, 4, 8, 100, 120, 170);
  c.rect(21, 15, 4, 8, 100, 120, 170);
  // Belt
  c.rect(12, 22, 9, 2, 140, 110, 60);
  c.set(16, 22, 200, 170, 80);
  c.set(16, 23, 200, 170, 80);
  // Legs
  c.rect(12, 24, 4, 6, 70, 60, 90);
  c.rect(17, 24, 4, 6, 70, 60, 90);
  // Boots
  c.rect(11, 28, 5, 2, 80, 55, 30);
  c.rect(17, 28, 5, 2, 80, 55, 30);
}

function drawLightning(c) {
  // Lightning bolt
  const pts = [
    [18, 2], [10, 14], [16, 14],
    [8, 30], [22, 16], [16, 16], [24, 2]
  ];
  // Fill the bolt shape
  // Simple approach: draw thick lines
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    c.line(x0, y0, x1, y1, 255, 230, 80);
    c.line(x0 + 1, y0, x1 + 1, y1, 255, 230, 80);
    c.line(x0 - 1, y0, x1 - 1, y1, 240, 210, 60);
  }
  // Bright center
  c.line(19, 3, 11, 14, 255, 255, 180);
  c.line(16, 14, 9, 29, 255, 255, 180);
  c.line(21, 16, 17, 16, 255, 255, 180);
  // Glow
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    c.line(x0 + 2, y0, x1 + 2, y1, 255, 220, 60, 100);
    c.line(x0 - 2, y0, x1 - 2, y1, 255, 220, 60, 100);
  }
}

function drawCoin(c) {
  // Outer ring
  c.circle(16, 16, 11, 200, 170, 50, 255, true);
  // Inner brighter area
  c.circle(16, 16, 9, 230, 200, 70, 255, true);
  // Highlight
  c.circle(14, 13, 7, 245, 220, 100, 255, true);
  // Edge shadow
  c.circle(16, 16, 11, 160, 130, 40);
  // Inner ring
  c.circle(16, 16, 8, 180, 150, 50);
  // "G" letter
  c.rect(13, 12, 7, 2, 160, 120, 30);
  c.rect(13, 12, 2, 8, 160, 120, 30);
  c.rect(13, 18, 7, 2, 160, 120, 30);
  c.rect(18, 15, 2, 5, 160, 120, 30);
  c.rect(16, 15, 4, 2, 160, 120, 30);
}

function drawHeal(c) {
  // Green glow background
  c.circle(16, 16, 12, 30, 120, 40, 80, true);
  c.circle(16, 16, 9, 40, 150, 50, 120, true);
  // Cross
  c.rect(12, 8, 8, 16, 60, 200, 80);
  c.rect(8, 12, 16, 8, 60, 200, 80);
  // Brighter center cross
  c.rect(13, 9, 6, 14, 80, 230, 100);
  c.rect(9, 13, 14, 6, 80, 230, 100);
  // Highlight
  c.rect(14, 10, 4, 12, 120, 255, 140);
  c.rect(10, 14, 12, 4, 120, 255, 140);
  // Sparkles
  c.set(6, 6, 200, 255, 200, 180);
  c.set(26, 8, 200, 255, 200, 180);
  c.set(8, 26, 200, 255, 200, 150);
  c.set(24, 24, 200, 255, 200, 150);
}

function drawMenu(c) {
  // Three horizontal bars
  c.rect(6, 9, 20, 3, 210, 200, 170);
  c.rect(6, 15, 20, 3, 210, 200, 170);
  c.rect(6, 21, 20, 3, 210, 200, 170);
  // Highlights
  c.rect(6, 9, 20, 1, 240, 230, 200);
  c.rect(6, 15, 20, 1, 240, 230, 200);
  c.rect(6, 21, 20, 1, 240, 230, 200);
}

/* ── generate all icons ───────────────────────────────── */

console.log("Generating icons...");

const icons = {
  sword: drawSword,
  shield: drawShield,
  scroll: drawScroll,
  bag: drawBag,
  person: drawPerson,
  lightning: drawLightning,
  coin: drawCoin,
  heal: drawHeal,
  menu: drawMenu
};

for (const [name, drawFn] of Object.entries(icons)) {
  const canvas = makeCanvas();
  drawFn(canvas);
  save(name, canvas);
}

console.log(`\nDone! ${Object.keys(icons).length} icons in ${OUT}`);
