/**
 * generate-status-icons.js
 * Generates 32×32 PNG status effect icons using only built-in Node.js modules.
 * Run:  node tools/generate-status-icons.js
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 32;
const OUT = path.join(__dirname, "..", "public", "assets", "sprites", "status");

/* ── tiny PNG encoder (RGBA, 32×32) ───────────────────── */

function encodePNG(pixels) {
  // pixels: Uint8Array of SIZE*SIZE*4 (RGBA row-major)
  // Build raw filtered data: each row gets a 0-filter byte prefix
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (1 + SIZE * 4)] = 0; // filter: None
    pixels.copy(raw, y * (1 + SIZE * 4) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  const chunks = [];

  // Signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  function writeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcData = Buffer.concat([typeBuf, data]);
    const crc = crc32(crcData);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0, 0);
    chunks.push(len, typeBuf, data, crcBuf);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  writeChunk("IHDR", ihdr);

  // IDAT
  writeChunk("IDAT", compressed);

  // IEND
  writeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat(chunks);
}

/* ── CRC-32 ───────────────────────────────────────────── */
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/* ── drawing helpers ──────────────────────────────────── */

function createCanvas() {
  return Buffer.alloc(SIZE * SIZE * 4);
}

function setPixel(buf, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  x = Math.floor(x);
  y = Math.floor(y);
  const i = (y * SIZE + x) * 4;
  // Alpha blend
  if (a < 255 && buf[i + 3] > 0) {
    const srcA = a / 255;
    const dstA = buf[i + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    buf[i]     = Math.round((r * srcA + buf[i] * dstA * (1 - srcA)) / outA);
    buf[i + 1] = Math.round((g * srcA + buf[i+1] * dstA * (1 - srcA)) / outA);
    buf[i + 2] = Math.round((b * srcA + buf[i+2] * dstA * (1 - srcA)) / outA);
    buf[i + 3] = Math.round(outA * 255);
  } else {
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  }
}

function fillCircle(buf, cx, cy, r, cr, cg, cb, ca = 255) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) setPixel(buf, x, y, cr, cg, cb, ca);
    }
  }
}

function fillRect(buf, x0, y0, w, h, r, g, b, a = 255) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++)
      setPixel(buf, x, y, r, g, b, a);
}

function drawLine(buf, x0, y0, x1, y1, r, g, b, a = 255, thickness = 1) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + dx * t);
    const y = Math.round(y0 + dy * t);
    if (thickness <= 1) {
      setPixel(buf, x, y, r, g, b, a);
    } else {
      fillCircle(buf, x, y, thickness / 2, r, g, b, a);
    }
  }
}

function drawCircleOutline(buf, cx, cy, radius, r, g, b, a = 255, thickness = 1) {
  const steps = Math.ceil(radius * 2 * Math.PI * 2);
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    fillCircle(buf, x, y, thickness / 2, r, g, b, a);
  }
}

function drawDiamond(buf, cx, cy, r, cr, cg, cb, ca = 255) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (Math.abs(x - cx) + Math.abs(y - cy) <= r) setPixel(buf, x, y, cr, cg, cb, ca);
    }
  }
}

function drawBgCircle(buf, borderR, borderG, borderB, fillR, fillG, fillB) {
  fillCircle(buf, 15, 15, 14, borderR, borderG, borderB);
  fillCircle(buf, 15, 15, 12, fillR, fillG, fillB);
}

/* ── icon generators ──────────────────────────────────── */

const icons = {
  /* ── BUFFS ──────────────────────────────────────────── */

  battleShout(buf) {
    // Red-orange background, crossed swords
    drawBgCircle(buf, 180, 60, 30, 90, 25, 10);
    // Sword 1 (top-left to bottom-right)
    drawLine(buf, 8, 8, 22, 22, 240, 210, 150, 255, 2);
    // Sword 2 (top-right to bottom-left)
    drawLine(buf, 22, 8, 8, 22, 240, 210, 150, 255, 2);
    // Hilts
    drawLine(buf, 6, 10, 10, 6, 200, 170, 100, 255, 2);
    drawLine(buf, 20, 6, 24, 10, 200, 170, 100, 255, 2);
    // Center glow
    fillCircle(buf, 15, 15, 3, 255, 100, 40, 180);
  },

  arcaneIntellect(buf) {
    // Blue-purple background, glowing star
    drawBgCircle(buf, 80, 60, 180, 30, 20, 80);
    // Star: 4 pointed
    const cx = 15, cy = 15;
    drawLine(buf, cx, cy - 9, cx, cy + 9, 180, 160, 255, 255, 2);
    drawLine(buf, cx - 9, cy, cx + 9, cy, 180, 160, 255, 255, 2);
    drawLine(buf, cx - 6, cy - 6, cx + 6, cy + 6, 140, 120, 230, 255, 1);
    drawLine(buf, cx + 6, cy - 6, cx - 6, cy + 6, 140, 120, 230, 255, 1);
    // Center bright
    fillCircle(buf, cx, cy, 3, 220, 210, 255, 255);
    fillCircle(buf, cx, cy, 1, 255, 255, 255, 255);
  },

  evasion(buf) {
    // Green background, wing/speed lines
    drawBgCircle(buf, 50, 160, 70, 20, 70, 30);
    // Boot shape
    fillRect(buf, 11, 8, 5, 12, 140, 220, 140, 255);
    fillRect(buf, 11, 18, 10, 4, 140, 220, 140, 255);
    fillRect(buf, 18, 16, 3, 6, 140, 220, 140, 255);
    // Speed lines
    drawLine(buf, 6, 10, 3, 10, 100, 255, 130, 200, 1);
    drawLine(buf, 6, 14, 2, 14, 100, 255, 130, 200, 1);
    drawLine(buf, 6, 18, 3, 18, 100, 255, 130, 200, 1);
  },

  inspired(buf) {
    // Warm orange background, flame/spark
    drawBgCircle(buf, 200, 140, 40, 90, 55, 15);
    // Upward flame
    fillCircle(buf, 15, 18, 5, 255, 160, 40, 255);
    fillCircle(buf, 15, 14, 4, 255, 200, 60, 255);
    fillCircle(buf, 15, 10, 3, 255, 240, 100, 255);
    fillCircle(buf, 15, 7, 2, 255, 255, 180, 220);
    // Inner glow
    fillCircle(buf, 15, 15, 2, 255, 255, 200, 255);
  },

  manaShield(buf) {
    // Blue background, shield with arcane glow
    drawBgCircle(buf, 60, 100, 200, 20, 40, 90);
    // Shield shape
    const sx = 9, sy = 7;
    for (let y = 0; y < 16; y++) {
      const halfW = y < 8 ? 7 : 7 - Math.floor((y - 7) * 7 / 9);
      if (halfW <= 0) continue;
      for (let x = -halfW; x <= halfW; x++) {
        const bright = (y < 2 || Math.abs(x) >= halfW - 1) ? 1 : 0;
        if (bright) {
          setPixel(buf, sx + 6 + x, sy + y, 120, 170, 255, 255);
        } else {
          setPixel(buf, sx + 6 + x, sy + y, 60, 100, 200, 255);
        }
      }
    }
    // Arcane swirl
    fillCircle(buf, 15, 14, 2, 180, 200, 255, 200);
  },

  sprinting(buf) {
    // Teal-green background, double arrows
    drawBgCircle(buf, 40, 180, 140, 15, 70, 55);
    // Arrow 1
    drawLine(buf, 8, 15, 18, 15, 100, 255, 200, 255, 2);
    drawLine(buf, 14, 10, 18, 15, 100, 255, 200, 255, 2);
    drawLine(buf, 14, 20, 18, 15, 100, 255, 200, 255, 2);
    // Arrow 2 (behind)
    drawLine(buf, 12, 15, 22, 15, 160, 255, 220, 255, 2);
    drawLine(buf, 18, 10, 22, 15, 160, 255, 220, 255, 2);
    drawLine(buf, 18, 20, 22, 15, 160, 255, 220, 255, 2);
  },

  /* ── DEBUFFS ────────────────────────────────────────── */

  chilled(buf) {
    // Ice blue background, snowflake
    drawBgCircle(buf, 100, 160, 220, 30, 55, 90);
    const cx = 15, cy = 15;
    // Main arms (6)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const ex = cx + Math.cos(a) * 9;
      const ey = cy + Math.sin(a) * 9;
      drawLine(buf, cx, cy, Math.round(ex), Math.round(ey), 180, 220, 255, 255, 1);
      // Branch at 60%
      const bx = cx + Math.cos(a) * 6;
      const by = cy + Math.sin(a) * 6;
      const ba1 = a + 0.6;
      const ba2 = a - 0.6;
      drawLine(buf, Math.round(bx), Math.round(by),
        Math.round(bx + Math.cos(ba1) * 3), Math.round(by + Math.sin(ba1) * 3),
        160, 200, 255, 255, 1);
      drawLine(buf, Math.round(bx), Math.round(by),
        Math.round(bx + Math.cos(ba2) * 3), Math.round(by + Math.sin(ba2) * 3),
        160, 200, 255, 255, 1);
    }
    fillCircle(buf, cx, cy, 2, 220, 240, 255, 255);
  },

  stunned(buf) {
    // Yellow-brown background, stars/dizzy
    drawBgCircle(buf, 200, 180, 50, 80, 65, 20);
    // Three small stars
    function drawStar(cx, cy, size, r, g, b) {
      drawLine(buf, cx, cy - size, cx, cy + size, r, g, b, 255, 1);
      drawLine(buf, cx - size, cy, cx + size, cy, r, g, b, 255, 1);
      drawLine(buf, cx - size + 1, cy - size + 1, cx + size - 1, cy + size - 1, r, g, b, 255, 1);
      drawLine(buf, cx + size - 1, cy - size + 1, cx - size + 1, cy + size - 1, r, g, b, 255, 1);
    }
    drawStar(10, 10, 4, 255, 240, 100);
    drawStar(20, 12, 3, 255, 220, 80);
    drawStar(14, 20, 3, 255, 230, 90);
    // Bright centers
    setPixel(buf, 10, 10, 255, 255, 220, 255);
    setPixel(buf, 20, 12, 255, 255, 220, 255);
    setPixel(buf, 14, 20, 255, 255, 220, 255);
  },

  sundered(buf) {
    // Dark red background, broken shield/crack
    drawBgCircle(buf, 180, 50, 40, 70, 20, 15);
    // Shield outline
    const sx = 9, sy = 8;
    for (let y = 0; y < 14; y++) {
      const halfW = y < 6 ? 6 : 6 - Math.floor((y - 5) * 6 / 9);
      if (halfW <= 0) continue;
      for (let x = -halfW; x <= halfW; x++) {
        if (Math.abs(x) >= halfW - 1 || y < 1 || y >= 12) {
          setPixel(buf, sx + 6 + x, sy + y, 200, 120, 100, 255);
        }
      }
    }
    // Crack through middle
    drawLine(buf, 14, 8, 16, 12, 255, 80, 60, 255, 2);
    drawLine(buf, 16, 12, 13, 16, 255, 80, 60, 255, 2);
    drawLine(buf, 13, 16, 17, 20, 255, 80, 60, 255, 2);
  },

  weakened(buf) {
    // Purple-dark background, downward arrow / skull
    drawBgCircle(buf, 140, 60, 160, 55, 20, 65);
    // Down arrow
    drawLine(buf, 15, 7, 15, 22, 200, 140, 220, 255, 2);
    drawLine(buf, 9, 17, 15, 23, 200, 140, 220, 255, 2);
    drawLine(buf, 21, 17, 15, 23, 200, 140, 220, 255, 2);
    // Cross bar
    drawLine(buf, 10, 12, 20, 12, 180, 100, 200, 255, 1);
  },

  poisoned(buf) {
    // Sickly green background, poison drop
    drawBgCircle(buf, 60, 160, 40, 20, 65, 15);
    // Droplet shape
    fillCircle(buf, 15, 18, 6, 80, 220, 60, 255);
    // Taper to top
    for (let y = 8; y < 14; y++) {
      const w = Math.floor((y - 8) * 5 / 6);
      for (let x = -w; x <= w; x++) {
        setPixel(buf, 15 + x, y, 80, 220, 60, 255);
      }
    }
    // Skull hint — two dot eyes
    setPixel(buf, 13, 17, 20, 60, 10, 255);
    setPixel(buf, 14, 17, 20, 60, 10, 255);
    setPixel(buf, 17, 17, 20, 60, 10, 255);
    setPixel(buf, 18, 17, 20, 60, 10, 255);
    // Drip highlight
    fillCircle(buf, 13, 15, 1, 140, 255, 120, 150);
  }
};

/* ── main ─────────────────────────────────────────────── */

fs.mkdirSync(OUT, { recursive: true });

let count = 0;
for (const [name, drawFn] of Object.entries(icons)) {
  const buf = createCanvas();
  drawFn(buf);
  const png = encodePNG(buf);
  const outPath = path.join(OUT, `${name}.png`);
  fs.writeFileSync(outPath, png);
  count++;
  console.log(`  ✓ ${name}.png`);
}

console.log(`\nGenerated ${count} status icons in ${path.relative(process.cwd(), OUT)}/`);
