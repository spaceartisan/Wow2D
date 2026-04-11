/**
 * generate-maps.js — Converts the existing procedural world into JSON tilemap files.
 *
 * Run:  node generate-maps.js
 *
 * Produces:
 *   public/data/maps/eldengrove.json   (starting village + surrounding area)
 *   public/data/maps/darkwood.json     (deeper forest / second zone)
 */

const fs = require("fs");
const path = require("path");

/* ── Global palette loaded from tilePalette.json ── */
const GLOBAL_PALETTE = JSON.parse(fs.readFileSync(path.join(__dirname, "public", "data", "tilePalette.json"), "utf8"));

/* Eldengrove uses these tiles (order defines index) */
const ELDENGROVE_NAMES = [
  "meadow", "meadow2", "townGrass", "townDirt", "road",
  "forest", "forestLight", "water", "houseWall", "cliff",
  "houseFloor", "stairs", "bedHead", "bedFoot"
];
/* Build blocked lookup from global palette for validation */
const ELDENGROVE_PALETTE = ELDENGROVE_NAMES.map(name => ({ name, ...GLOBAL_PALETTE[name] }));
const TILE_INDEX = {};
ELDENGROVE_NAMES.forEach((name, i) => { TILE_INDEX[name] = i; });

const TILE_SIZE = 48;

/* ── helpers ─────────────────────────────────────────── */

function tileKey(x, y) { return `${x},${y}`; }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* ════════════════════════════════════════════════════════
   ELDENGROVE MAP — replicate existing WorldSystem logic
   ════════════════════════════════════════════════════════ */

function generateEldengrove() {
  const W = 128, H = 128;
  const tiles = Array.from({ length: H }, () => Array(W).fill("meadow"));
  const blocked = new Set();
  const trees = [];
  const buildings = [];
  const props = [];

  // Meadow variation
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((x + y) % 9 === 0) tiles[y][x] = "meadow2";
    }
  }

  // Town
  for (let y = 14; y <= 37; y++) {
    for (let x = 14; x <= 40; x++) {
      tiles[y][x] = (x + y) % 5 === 0 ? "townDirt" : "townGrass";
    }
  }

  // Roads — main east-west road extends all the way to the portal
  for (let x = 14; x < 124; x++) {
    for (let y = 25; y <= 28; y++) tiles[y][x] = "road";
  }
  // North-south crossroad through town
  for (let y = 14; y <= 37; y++) {
    for (let x = 24; x <= 27; x++) tiles[y][x] = "road";
  }
  // Forest branch south
  for (let y = 28; y < 86; y++) {
    for (let x = 96; x <= 99; x++) tiles[y][x] = "road";
  }
  for (let y = 58; y < 74; y++) {
    for (let x = 65; x <= 68; x++) tiles[y][x] = "road";
  }

  // Water lake
  const cx = 61, cy = 55, r = 9;
  for (let y = cy - r - 2; y <= cy + r + 2; y++) {
    for (let x = cx - r - 2; x <= cx + r + 2; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist <= r + ((x + y) % 3 === 0 ? 0.6 : -0.4)) {
        tiles[y][x] = "water";
        blocked.add(tileKey(x, y));
      }
    }
  }

  // Forest
  for (let y = 20; y < 118; y++) {
    for (let x = 74; x < 124; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (tiles[y][x] === "road") continue;
      tiles[y][x] = (x * 7 + y * 3) % 4 === 0 ? "forestLight" : "forest";

      const densePatch = (x + y * 2) % 7 === 0;
      const edgePatch = x > 114 && y % 3 !== 0;
      if ((densePatch || edgePatch) && tiles[y][x] !== "water") {
        trees.push({ tx: x, ty: y });
        blocked.add(tileKey(x, y));
      }
    }
  }

  // Cliffs (border)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x < 4 || y < 4 || x > W - 5 || y > H - 5) {
        tiles[y][x] = "cliff";
        blocked.add(tileKey(x, y));
      }
    }
  }

  // ── Building templates (tile-by-tile design) ──────────
  // Legend: 0=skip(grass), W=wall, F=floor, S=stairs, A=bedHead, B=bedFoot
  const W_ = "houseWall", F_ = "houseFloor", S_ = "stairs", A_ = "bedHead", B_ = "bedFoot";
  const __ = 0; // skip — leave existing terrain

  const buildingTemplates = [
    {
      name: "Elder's Hall",
      floors: 1,
      ox: 29, oy: 17,
      layout: [
        [W_,W_,W_,W_,W_,W_,W_,W_],
        [W_,F_,F_,F_,F_,F_,F_,W_],
        [W_,F_,F_,F_,F_,F_,F_,W_],
        [W_,F_,F_,F_,F_,F_,F_,W_],
        [W_,F_,F_,F_,F_,F_,F_,W_],
        [W_,F_,F_,F_,F_,F_,F_,W_],
        [W_,W_,W_,F_,F_,W_,W_,W_],
      ]
    },
    {
      // Barracks: rectangular with stairs + bed on ground floor, bunk room upstairs
      name: "Barracks",
      floors: 2,
      ox: 38, oy: 17,
      layout: [
        [W_,W_,W_,W_,W_,W_],
        [W_,S_,F_,F_,A_,W_],
        [W_,F_,F_,F_,B_,W_],
        [W_,F_,F_,F_,F_,W_],
        [W_,F_,F_,F_,F_,W_],
        [W_,F_,F_,F_,F_,W_],
        [W_,W_,F_,W_,W_,W_],
      ],
      upperFloors: [
        // Floor 2: bunk room with two beds
        [
          [W_,W_,W_,W_,W_,W_],
          [W_,S_,F_,F_,A_,W_],
          [W_,F_,F_,F_,B_,W_],
          [W_,F_,F_,F_,F_,W_],
          [W_,A_,F_,F_,A_,W_],
          [W_,B_,F_,F_,B_,W_],
          [W_,W_,W_,W_,W_,W_],
        ]
      ]
    },
    {
      // L-shaped inn with bedroom wing
      name: "Traveler's Rest Inn",
      floors: 2,
      ox: 16, oy: 28,
      layout: [
        [W_,W_,W_,W_,__,__,__],
        [W_,F_,F_,W_,__,__,__],
        [W_,F_,F_,W_,W_,W_,W_],
        [F_,F_,F_,W_,B_,A_,W_],
        [W_,F_,F_,W_,F_,F_,W_],
        [W_,S_,F_,F_,F_,F_,W_],
        [W_,F_,F_,W_,F_,F_,W_],
        [W_,F_,F_,W_,W_,W_,W_],
        [W_,W_,W_,W_,__,__,__],
      ],
      upperFloors: [
        // Floor 2: private rooms upstairs
        [
          [W_,W_,W_,W_,__,__,__],
          [W_,A_,F_,W_,__,__,__],
          [W_,B_,F_,W_,W_,W_,W_],
          [W_,F_,F_,W_,A_,F_,W_],
          [W_,F_,F_,W_,B_,F_,W_],
          [W_,S_,F_,F_,F_,F_,W_],
          [W_,F_,F_,W_,F_,F_,W_],
          [W_,A_,F_,W_,W_,W_,W_],
          [W_,B_,W_,W_,__,__,__],
        ]
      ]
    },
    {
      name: "Kael's Forge",
      floors: 1,
      ox: 30, oy: 29,
      layout: [
        [W_,W_,W_,W_,W_,W_],
        [W_,F_,F_,F_,F_,W_],
        [W_,F_,F_,F_,F_,W_],
        [W_,F_,F_,F_,F_,W_],
        [W_,F_,F_,F_,F_,W_],
        [W_,W_,F_,W_,W_,W_],
      ]
    }
  ];

  for (const bld of buildingTemplates) {
    const rows = bld.layout.length;
    const cols = bld.layout[0].length;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tileName = bld.layout[r][c];
        if (tileName === 0) continue; // skip
        const tx = bld.ox + c;
        const ty = bld.oy + r;
        tiles[ty][tx] = tileName;
        if (GLOBAL_PALETTE[tileName].blocked) {
          blocked.add(tileKey(tx, ty));
        } else {
          blocked.delete(tileKey(tx, ty));
        }
        // Remove any tree at this tile
        const treeIdx = trees.findIndex(t => t.tx === tx && t.ty === ty);
        if (treeIdx !== -1) trees.splice(treeIdx, 1);
      }
    }
    buildings.push({
      ox: bld.ox, oy: bld.oy, w: cols, h: rows,
      name: bld.name,
      floors: bld.floors || 1,
      upperFloors: (bld.upperFloors || []).map(floor =>
        floor.map(row => row.map(t => t === 0 ? -1 : (TILE_INDEX[t] ?? -1)))
      )
    });
  }

  // Ambient props
  for (let i = 0; i < 80; i++) {
    const x = 42 + ((i * 13) % 52);
    const y = 24 + ((i * 7) % 58);
    if (tiles[y][x] === "meadow" || tiles[y][x] === "meadow2") {
      props.push({ tx: x, ty: y, type: i % 2 === 0 ? "flower" : "rock" });
    }
  }

  // Convert tile names to palette indices
  const terrain = tiles.map(row => row.map(name => TILE_INDEX[name] ?? 0));

  // Convert blocked set to array of [x,y] for tiles NOT auto-derivable from palette
  // (trees + buildings produce extra blocked; palette-blocked like water/cliff/houseFloor auto-derive)
  const extraBlocked = [];
  for (const key of blocked) {
    const [x, y] = key.split(",").map(Number);
    const paletteIdx = terrain[y][x];
    if (!ELDENGROVE_PALETTE[paletteIdx].blocked) {
      extraBlocked.push([x, y]);
    }
  }

  // Merge trees into props as type:"tree"
  const allProps = [
    ...trees.map(t => ({ tx: t.tx, ty: t.ty, type: "tree" })),
    ...props
  ];

  return {
    id: "eldengrove",
    name: "Eldengrove Village",
    width: W,
    height: H,
    tileSize: TILE_SIZE,
    bgm: "town_day",
    spawnPoint: [25, 25],
    safeZones: [
      { x: 14, y: 14, w: 26, h: 23 }
    ],
    palette: ELDENGROVE_NAMES,
    terrain,
    extraBlocked,
    buildings,
    props: allProps,
    enemySpawns: [
      {
        type: "wolf",
        positions: [
          [82, 30], [87, 34], [93, 39], [101, 46], [108, 53],
          [111, 42], [84, 58], [96, 63], [105, 69], [114, 76]
        ]
      },
      {
        type: "boar",
        positions: [
          [74, 67], [78, 73], [88, 80], [98, 86], [110, 90], [119, 96]
        ]
      }
    ],
    npcs: [
      // Elder Rowan at Elder's Hall double-door (32-33, y:23 south gap → stands at 32,24)
      { npcId: "elder_rowan",     tx: 32, ty: 24 },
      // Captain Brenn at Barracks door (39, y:23 south gap → stands at 39,24)
      { npcId: "captain_brenn",   tx: 39, ty: 24 },
      // Innkeeper Lora at Inn door (16, y:31 west gap → stands at 15,31)
      { npcId: "innkeeper_lora",  tx: 15, ty: 31 },
      // Blacksmith Kael at Forge door (31, y:34 south gap → stands at 31,35)
      { npcId: "blacksmith_kael", tx: 31, ty: 35 }
    ],
    portals: [
      {
        x: 120, y: 25, w: 4, h: 4,
        targetMap: "darkwood",
        targetTx: 6, targetTy: 25,
        label: "To Darkwood"
      }
    ]
  };
}

/* ════════════════════════════════════════════════════════
   DARKWOOD MAP — new second zone (deeper forest)
   ════════════════════════════════════════════════════════ */

function generateDarkwood() {
  const W = 80, H = 80;

  /* Darkwood uses these global palette entries (order defines index) */
  const DARKWOOD_NAMES = [
    "darkGrass", "darkGrass2", "forestDense", "forestPath", "moss",
    "deepWater", "darkCliff", "campfire", "ruins"
  ];
  const DARKWOOD_PALETTE = DARKWOOD_NAMES.map(name => ({ name, ...GLOBAL_PALETTE[name] }));
  /* Local tile-name → index map (uses local names for generation logic) */
  const LOCAL_NAMES = [
    "darkGrass", "darkGrass2", "forestDense", "forestPath", "moss",
    "water", "cliff", "campfire", "ruins"
  ];
  const DI = {};
  LOCAL_NAMES.forEach((name, i) => { DI[name] = i; });

  const tiles = Array.from({ length: H }, () => Array(W).fill("darkGrass"));
  const blocked = new Set();
  const trees = [];
  const props = [];

  // Variation
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((x + y) % 7 === 0) tiles[y][x] = "darkGrass2";
      if ((x * 3 + y * 5) % 11 === 0) tiles[y][x] = "moss";
    }
  }

  // Dense forest (most of the map)
  for (let y = 4; y < H - 4; y++) {
    for (let x = 4; x < W - 4; x++) {
      if ((x * 7 + y * 3) % 5 === 0) {
        tiles[y][x] = "forestDense";
      }
      // Trees everywhere except paths
      const densePatch = (x + y * 2) % 6 === 0;
      if (densePatch) {
        trees.push({ tx: x, ty: y });
        blocked.add(tileKey(x, y));
      }
    }
  }

  // Forest path (connects portal entry to points of interest)
  // Horizontal path from west entrance
  for (let x = 4; x < 45; x++) {
    for (let y = 24; y <= 26; y++) {
      tiles[y][x] = "forestPath";
      blocked.delete(tileKey(x, y));
      // Remove trees on path
      const idx = trees.findIndex(t => t.tx === x && t.ty === y);
      if (idx >= 0) trees.splice(idx, 1);
    }
  }

  // Path fork south
  for (let y = 26; y < 55; y++) {
    for (let x = 38; x <= 40; x++) {
      tiles[y][x] = "forestPath";
      blocked.delete(tileKey(x, y));
      const idx = trees.findIndex(t => t.tx === x && t.ty === y);
      if (idx >= 0) trees.splice(idx, 1);
    }
  }

  // Path fork north
  for (let y = 10; y <= 24; y++) {
    for (let x = 22; x <= 24; x++) {
      tiles[y][x] = "forestPath";
      blocked.delete(tileKey(x, y));
      const idx = trees.findIndex(t => t.tx === x && t.ty === y);
      if (idx >= 0) trees.splice(idx, 1);
    }
  }

  // Ruins area (north fork destination)
  for (let y = 8; y <= 12; y++) {
    for (let x = 18; x <= 28; x++) {
      tiles[y][x] = "ruins";
      blocked.add(tileKey(x, y));
      const idx = trees.findIndex(t => t.tx === x && t.ty === y);
      if (idx >= 0) trees.splice(idx, 1);
    }
  }
  // Clear path around ruins entrance
  for (let y = 10; y <= 12; y++) {
    for (let x = 22; x <= 24; x++) {
      tiles[y][x] = "forestPath";
      blocked.delete(tileKey(x, y));
    }
  }

  // Small stream
  for (let y = 44; y < 60; y++) {
    const sx = 55 + Math.round(Math.sin(y * 0.4) * 2);
    for (let dx = 0; dx < 2; dx++) {
      const x = sx + dx;
      if (x >= 0 && x < W && y >= 0 && y < H) {
        tiles[y][x] = "water";
        blocked.add(tileKey(x, y));
        const idx = trees.findIndex(t => t.tx === x && t.ty === y);
        if (idx >= 0) trees.splice(idx, 1);
      }
    }
  }

  // Campfire clearing (south fork destination)
  for (let y = 52; y <= 56; y++) {
    for (let x = 36; x <= 42; x++) {
      tiles[y][x] = "darkGrass";
      blocked.delete(tileKey(x, y));
      const idx = trees.findIndex(t => t.tx === x && t.ty === y);
      if (idx >= 0) trees.splice(idx, 1);
    }
  }
  tiles[54][39] = "campfire";

  // Cliffs (border)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x < 3 || y < 3 || x > W - 4 || y > H - 4) {
        tiles[y][x] = "cliff";
        blocked.add(tileKey(x, y));
      }
    }
  }

  // Props
  for (let i = 0; i < 40; i++) {
    const x = 8 + ((i * 11) % 60);
    const y = 8 + ((i * 7) % 60);
    if (x >= 0 && x < W && y >= 0 && y < H && !blocked.has(tileKey(x, y))) {
      props.push({ tx: x, ty: y, type: i % 3 === 0 ? "mushroom" : "rock" });
    }
  }

  // Convert
  const terrain = tiles.map(row => row.map(name => DI[name] ?? 0));

  const extraBlocked = [];
  for (const key of blocked) {
    const [x, y] = key.split(",").map(Number);
    const paletteIdx = terrain[y][x];
    if (!DARKWOOD_PALETTE[paletteIdx].blocked) {
      extraBlocked.push([x, y]);
    }
  }

  // Merge trees into props as type:"tree"
  const allProps = [
    ...trees.map(t => ({ tx: t.tx, ty: t.ty, type: "tree" })),
    ...props
  ];

  return {
    id: "darkwood",
    name: "The Darkwood",
    width: W,
    height: H,
    tileSize: TILE_SIZE,
    bgm: "dark_forest",
    spawnPoint: [5, 25],
    safeZones: [],
    palette: DARKWOOD_NAMES,
    terrain,
    extraBlocked,
    buildings: [],
    props: allProps,
    enemySpawns: [
      {
        type: "wolf",
        positions: [
          [14, 20], [18, 30], [28, 18], [32, 35]
        ]
      },
      {
        type: "boar",
        positions: [
          [45, 42], [50, 50], [42, 60], [35, 48]
        ]
      },
      {
        type: "bandit",
        positions: [
          [20, 10], [24, 9], [22, 14], [40, 52], [38, 56]
        ]
      }
    ],
    npcs: [],
    portals: [
      {
        x: 3, y: 24, w: 2, h: 4,
        targetMap: "eldengrove",
        targetTx: 118, targetTy: 26,
        label: "To Eldengrove"
      }
    ]
  };
}

/* ── Write files ─────────────────────────────────────── */

const outDir = path.join(__dirname, "public", "data", "maps");
ensureDir(outDir);

const eldengrove = generateEldengrove();
const darkwood = generateDarkwood();

fs.writeFileSync(path.join(outDir, "eldengrove.json"), JSON.stringify(eldengrove));
fs.writeFileSync(path.join(outDir, "darkwood.json"), JSON.stringify(darkwood));

console.log(`Generated eldengrove.json (${eldengrove.width}x${eldengrove.height}, ${eldengrove.props.length} props)`);
console.log(`Generated darkwood.json (${darkwood.width}x${darkwood.height}, ${darkwood.props.length} props)`);
console.log("Done!");
