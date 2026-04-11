/**
 * Azerfall Map Editor — client-side logic
 */

/* ── State ────────────────────────────────── */
const S = {
  // Global data
  globalPalette: {},       // tilePalette.json
  enemyDefs: {},           // enemies.json
  npcDefs: {},             // npcs.json
  propDefs: {},            // props.json

  // Map data
  mapId: "",
  mapName: "",
  width: 80,
  height: 80,
  tileSize: 48,
  bgm: "",
  spawnPoint: [5, 5],
  palette: [],             // string[] of tile names
  terrain: [],             // number[][]
  portals: [],
  enemySpawns: [],         // { type, positions: [[tx,ty],...] }
  npcs: [],
  props: [],               // includes trees (type: "tree")
  buildings: [],
  statues: [],
  safeZones: [],
  extraBlocked: [],        // [[tx,ty],...]

  // Editor state
  tool: "paint",           // paint | erase | fill | pick
  objMode: null,           // portal | enemy | npc | prop | building | statue | safezone | blocked | null
  selectedPaletteIdx: 0,
  brushSize: 1,
  zoom: 1,
  camX: 0, camY: 0,
  isDragging: false,
  isPanning: false,
  panStart: null,
  lastPaintTile: null,
  selectedObjType: null,   // for object mode context
  selectedObjIndex: -1,
  dragRect: null,          // for rectangle-based placements
  hoverTile: null,          // [tx, ty] for cursor highlight

  // Floor editing
  editingFloor: 0,         // 0 = ground, 1+ = upper floor
  editingBuildingIdx: -1,  // index into S.buildings, -1 = none

  // Undo
  undoStack: [],
  redoStack: [],
  currentStroke: null,     // for batching paint strokes
};

const GRID_COLOR = "rgba(255,255,255,0.06)";
const SPAWN_COLOR = "#f9e2af";

/* ── Sprite Cache ─────────────────────────── */
const spriteCache = {};   // key → { img, loaded }

function loadSprite(path) {
  if (spriteCache[path]) return spriteCache[path];
  const entry = { img: new Image(), loaded: false };
  entry.img.onload = () => { entry.loaded = true; render(); };
  entry.img.onerror = () => { entry.loaded = false; };
  entry.img.src = path;
  spriteCache[path] = entry;
  return entry;
}

function getSprite(path) {
  const e = spriteCache[path] || loadSprite(path);
  return e.loaded ? e.img : null;
}

function tileSpritePath(name) { return `/assets/sprites/tiles/${name}.png`; }
function entitySpritePath(name) { return `/assets/sprites/entities/${name}.png`; }
function propSpritePath(name) { return `/assets/sprites/props/${name}.png`; }

/* ── DOM refs ─────────────────────────────── */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const canvas = $("#mapCanvas");
const ctx = canvas.getContext("2d");
const wrap = $("#canvasWrap");

/* ── Init ─────────────────────────────────── */
async function init() {
  const [palette, enemies, npcs, propDefs] = await Promise.all([
    fetch("/api/palette").then(r => r.json()),
    fetch("/api/enemies").then(r => r.json()),
    fetch("/api/npcs").then(r => r.json()),
    fetch("/api/props").then(r => r.json()),
  ]);
  S.globalPalette = palette;
  S.enemyDefs = enemies;
  S.npcDefs = npcs;
  S.propDefs = propDefs;

  // Preload all tile sprites
  for (const name of Object.keys(palette)) loadSprite(tileSpritePath(name));
  // Preload entity sprites
  for (const id of Object.keys(enemies)) loadSprite(entitySpritePath(id));
  for (const id of Object.keys(npcs)) loadSprite(entitySpritePath(id));
  // Preload prop sprites from props.json + portal
  for (const pName of Object.keys(propDefs)) loadSprite(propSpritePath(pName));
  loadSprite(propSpritePath("portal"));

  setupEventListeners();
  newMap(80, 80);
}

/* ── New Map ──────────────────────────────── */
function newMap(w, h) {
  S.width = w;
  S.height = h;
  S.mapId = "";
  S.mapName = "";
  S.bgm = "";
  S.spawnPoint = [Math.floor(w / 2), Math.floor(h / 2)];
  S.tileSize = 48;

  // Default palette: first 4 tile types
  const allNames = Object.keys(S.globalPalette);
  S.palette = allNames.slice(0, Math.min(4, allNames.length));
  S.selectedPaletteIdx = 0;

  // Fill terrain with 0
  S.terrain = Array.from({ length: h }, () => Array(w).fill(0));

  S.portals = [];
  S.enemySpawns = [];
  S.npcs = [];
  S.props = [];
  S.buildings = [];
  S.statues = [];
  S.safeZones = [];
  S.extraBlocked = [];

  S.undoStack = [];
  S.redoStack = [];

  syncFieldsToUI();
  buildPaletteUI();
  resizeCanvas();
  render();
}

/* ── Load Map ─────────────────────────────── */
async function loadMap(id) {
  const data = await fetch(`/api/maps/${encodeURIComponent(id)}`).then(r => r.json());
  S.mapId = data.id || id;
  S.mapName = data.name || "";
  S.width = data.width;
  S.height = data.height;
  S.tileSize = data.tileSize || 48;
  S.bgm = data.bgm || "";
  S.spawnPoint = data.spawnPoint || [5, 5];
  S.palette = data.palette || [];
  S.terrain = data.terrain || [];
  S.portals = data.portals || [];
  S.enemySpawns = data.enemySpawns || [];
  S.npcs = (data.npcs || []).map(n => ({ ...n, floor: n.floor || 0 }));
  // Merge legacy trees into props as type "tree" (backward compat for old map files)
  const loadedTrees = (data.trees || []).map(t => ({ tx: t.tx, ty: t.ty, type: "tree" }));
  S.props = [...loadedTrees, ...(data.props || [])];
  S.buildings = data.buildings || [];
  S.statues = data.statues || [];
  S.safeZones = data.safeZones || [];
  S.extraBlocked = data.extraBlocked || [];

  S.undoStack = [];
  S.redoStack = [];

  syncFieldsToUI();
  buildPaletteUI();
  updateObjectList();
  resizeCanvas();
  render();
}

/* ── Save Map ─────────────────────────────── */
async function saveMap() {
  syncUIToFields();
  if (!S.mapId) { alert("Set a map ID first."); return; }
  const data = buildMapJSON();
  const res = await fetch(`/api/maps/${encodeURIComponent(S.mapId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (result.ok) alert(`Saved to ${result.path}`);
  else alert(`Error: ${result.error}`);
}

function buildMapJSON() {
  const obj = {
    id: S.mapId,
    name: S.mapName,
    width: S.width,
    height: S.height,
    tileSize: S.tileSize,
    spawnPoint: S.spawnPoint,
    palette: S.palette,
    terrain: S.terrain,
  };
  if (S.bgm) obj.bgm = S.bgm;
  obj.safeZones = S.safeZones;
  obj.buildings = S.buildings;
  // All props (including trees) in a single array
  obj.props = S.props;
  obj.extraBlocked = S.extraBlocked;
  obj.enemySpawns = S.enemySpawns;
  obj.npcs = S.npcs;
  obj.statues = S.statues;
  obj.portals = S.portals;
  return obj;
}

/* ── Sync UI ↔ State ──────────────────────── */
function syncFieldsToUI() {
  $("#mapId").value = S.mapId;
  $("#mapName").value = S.mapName;
  $("#mapWidth").value = S.width;
  $("#mapHeight").value = S.height;
  $("#mapBgm").value = S.bgm;
  $("#spawnX").value = S.spawnPoint[0];
  $("#spawnY").value = S.spawnPoint[1];
}

function syncUIToFields() {
  S.mapId = $("#mapId").value.trim();
  S.mapName = $("#mapName").value.trim();
  S.bgm = $("#mapBgm").value.trim();
  S.spawnPoint = [parseInt($("#spawnX").value) || 0, parseInt($("#spawnY").value) || 0];

  const newW = Math.max(10, Math.min(256, parseInt($("#mapWidth").value) || 80));
  const newH = Math.max(10, Math.min(256, parseInt($("#mapHeight").value) || 80));
  if (newW !== S.width || newH !== S.height) {
    resizeTerrain(newW, newH);
  }
}

function resizeTerrain(newW, newH) {
  const oldTerrain = S.terrain;
  const oldW = S.width;
  const oldH = S.height;
  S.width = newW;
  S.height = newH;
  S.terrain = Array.from({ length: newH }, (_, y) =>
    Array.from({ length: newW }, (_, x) =>
      (y < oldH && x < oldW) ? oldTerrain[y][x] : 0
    )
  );
  resizeCanvas();
}

/* ── Palette UI ───────────────────────────── */
function buildPaletteUI() {
  const grid = $("#paletteGrid");
  grid.innerHTML = "";
  S.palette.forEach((name, idx) => {
    const info = S.globalPalette[name];
    const div = document.createElement("div");
    div.className = "palette-swatch" + (idx === S.selectedPaletteIdx ? " selected" : "");
    const sprite = getSprite(tileSpritePath(name));
    if (sprite) {
      div.style.backgroundImage = `url(${tileSpritePath(name)})`;
      div.style.backgroundSize = "cover";
    } else {
      const [r, g, b] = info ? info.color : [128, 128, 128];
      div.style.background = `rgb(${r},${g},${b})`;
    }
    div.title = `${idx}: ${name}${info && info.blocked ? " (blocked)" : ""}`;
    div.innerHTML = `<span class="idx">${idx}</span>`;
    div.onclick = () => {
      S.selectedPaletteIdx = idx;
      $$(".palette-swatch").forEach(s => s.classList.remove("selected"));
      div.classList.add("selected");
      $("#selectedTileInfo").textContent = `${idx}: ${name}${info && info.blocked ? " ■" : ""}`;
      // Switch to paint tool
      setTool("paint");
    };
    grid.appendChild(div);
  });
  const info = S.globalPalette[S.palette[S.selectedPaletteIdx]];
  const name = S.palette[S.selectedPaletteIdx] || "--";
  $("#selectedTileInfo").textContent = `${S.selectedPaletteIdx}: ${name}${info && info.blocked ? " ■" : ""}`;
}

/* ── Canvas sizing ────────────────────────── */
function resizeCanvas() {
  const ft = getFloorTerrain();
  canvas.width = ft.w * S.tileSize * S.zoom;
  canvas.height = ft.h * S.tileSize * S.zoom;
}

/* ── Render ───────────────────────────────── */
function render() {
  const ft = getFloorTerrain();
  const w = ft.w, h = ft.h, ts = S.tileSize, z = S.zoom;
  const pw = w * ts * z, ph = h * ts * z;
  canvas.width = pw;
  canvas.height = ph;
  ctx.clearRect(0, 0, pw, ph);

  // Terrain (ground or upper floor grid)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = ft.grid[y] ? ft.grid[y][x] : 0;
      if (idx === -1) {
        // Void tile on upper floors — draw dark checker
        ctx.fillStyle = ((x + y) % 2 === 0) ? "#181825" : "#11111b";
        ctx.fillRect(x * ts * z, y * ts * z, ts * z, ts * z);
        continue;
      }
      const name = S.palette[idx];
      const sprite = name ? getSprite(tileSpritePath(name)) : null;
      const dx = x * ts * z, dy = y * ts * z, sz = ts * z;
      if (sprite) {
        ctx.drawImage(sprite, dx, dy, sz, sz);
      } else {
        const info = name ? S.globalPalette[name] : null;
        const [r, g, b] = info ? info.color : [40, 40, 40];
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(dx, dy, sz, sz);
      }
    }
  }

  // Grid
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x++) {
    ctx.beginPath();
    ctx.moveTo(x * ts * z + 0.5, 0);
    ctx.lineTo(x * ts * z + 0.5, ph);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * ts * z + 0.5);
    ctx.lineTo(pw, y * ts * z + 0.5);
    ctx.stroke();
  }

  // ── Floor edit mode: only show NPCs on this floor, skip world objects ──
  if (ft.isFloor) {
    // Show NPCs assigned to this floor (local coords relative to building)
    const bld = S.buildings[S.editingBuildingIdx];
    for (const n of S.npcs) {
      if ((n.floor || 0) !== S.editingFloor) continue;
      const lx = n.tx - bld.x, ly = n.ty - bld.y;
      if (lx < 0 || ly < 0 || lx >= bld.w || ly >= bld.h) continue;
      const def = S.npcDefs[n.npcId];
      const dx = lx * ts * z, dy = ly * ts * z, sz = ts * z;
      const nSprite = getSprite(entitySpritePath(n.npcId));
      if (nSprite) {
        ctx.drawImage(nSprite, dx, dy, sz, sz);
      } else {
        ctx.fillStyle = def ? def.color : "#d4b17c";
        const cx = (lx + 0.5) * ts * z, cy = (ly + 0.5) * ts * z;
        ctx.beginPath();
        ctx.arc(cx, cy, ts * z * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${8 * z}px sans-serif`;
      ctx.fillText(def ? def.name : n.npcId, dx, dy - 2);
    }

    // Floor label overlay
    ctx.fillStyle = "rgba(249, 226, 175, 0.15)";
    ctx.fillRect(0, 0, pw, 18 * z);
    ctx.fillStyle = "#f9e2af";
    ctx.font = `bold ${11 * z}px sans-serif`;
    ctx.fillText(`Floor ${S.editingFloor + 1}  —  ${bld.name}`, 4 * z, 13 * z);
    return;
  }

  // ── Ground floor rendering (everything) ──

  // Extra blocked
  ctx.fillStyle = "rgba(255, 0, 0, 0.25)";
  for (const [bx, by] of S.extraBlocked) {
    ctx.fillRect(bx * ts * z, by * ts * z, ts * z, ts * z);
  }

  // Safe zones
  ctx.strokeStyle = "rgba(100, 255, 100, 0.5)";
  ctx.lineWidth = 2;
  for (const sz of S.safeZones) {
    const x1 = sz.x1 * ts * z, y1 = sz.y1 * ts * z;
    const x2 = (sz.x2 + 1) * ts * z, y2 = (sz.y2 + 1) * ts * z;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.fillStyle = "rgba(100, 255, 100, 0.06)";
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  }

  // Buildings
  ctx.lineWidth = 2;
  for (let bi = 0; bi < S.buildings.length; bi++) {
    const b = S.buildings[bi];
    const isMulti = (b.floors || 1) > 1;
    ctx.strokeStyle = isMulti ? "rgba(200, 160, 80, 0.9)" : "rgba(200, 160, 80, 0.6)";
    ctx.strokeRect(b.x * ts * z, b.y * ts * z, b.w * ts * z, b.h * ts * z);
    ctx.fillStyle = isMulti ? "rgba(200, 160, 80, 0.15)" : "rgba(200, 160, 80, 0.08)";
    ctx.fillRect(b.x * ts * z, b.y * ts * z, b.w * ts * z, b.h * ts * z);
    ctx.fillStyle = "rgba(200, 160, 80, 0.8)";
    ctx.font = `${10 * z}px sans-serif`;
    const floorLabel = isMulti ? ` [${b.floors}F]` : "";
    ctx.fillText((b.name || "Building") + floorLabel, b.x * ts * z + 2, b.y * ts * z + 11 * z);
  }

  // Portals
  for (const p of S.portals) {
    ctx.fillStyle = "rgba(80, 140, 255, 0.3)";
    ctx.fillRect(p.x * ts * z, p.y * ts * z, p.w * ts * z, p.h * ts * z);
    ctx.strokeStyle = "rgba(80, 140, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x * ts * z, p.y * ts * z, p.w * ts * z, p.h * ts * z);
    ctx.fillStyle = "#89b4fa";
    ctx.font = `bold ${9 * z}px sans-serif`;
    ctx.fillText(p.label || p.targetMap || "Portal", p.x * ts * z + 2, p.y * ts * z + 10 * z);
  }

  // Props (including trees)
  for (const p of S.props) {
    const dx = p.tx * ts * z, dy = p.ty * ts * z, sz = ts * z;
    const pSprite = getSprite(propSpritePath(p.type));
    if (pSprite) {
      ctx.drawImage(pSprite, dx, dy, sz, sz);
    } else {
      const def = S.propDefs[p.type];
      const c = def && def.color ? `rgb(${def.color.join(",")})` : "rgba(160, 160, 160, 0.5)";
      ctx.fillStyle = c;
      ctx.fillRect(dx + 4 * z, dy + 4 * z, sz - 8 * z, sz - 8 * z);
    }
    ctx.fillStyle = "#bac2de";
    ctx.font = `${8 * z}px sans-serif`;
    ctx.fillText(p.type || "?", p.tx * ts * z + 2, (p.ty + 1) * ts * z - 2);
  }

  // Enemy spawns
  for (const es of S.enemySpawns) {
    const eSprite = getSprite(entitySpritePath(es.type));
    for (const [ex, ey] of es.positions) {
      const dx = ex * ts * z, dy = ey * ts * z, sz = ts * z;
      if (eSprite) {
        ctx.drawImage(eSprite, dx, dy, sz, sz);
      } else {
        ctx.fillStyle = "rgba(255, 60, 60, 0.5)";
        const cx = (ex + 0.5) * ts * z, cy = (ey + 0.5) * ts * z;
        ctx.beginPath();
        ctx.arc(cx, cy, ts * z * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#f38ba8";
      ctx.font = `${8 * z}px sans-serif`;
      ctx.fillText(es.type, dx + 1, dy + 10 * z);
    }
  }

  // NPCs (ground floor only in main view)
  for (const n of S.npcs) {
    if ((n.floor || 0) !== 0) continue;
    const def = S.npcDefs[n.npcId];
    const dx = n.tx * ts * z, dy = n.ty * ts * z, sz = ts * z;
    const nSprite = getSprite(entitySpritePath(n.npcId));
    if (nSprite) {
      ctx.drawImage(nSprite, dx, dy, sz, sz);
    } else {
      ctx.fillStyle = def ? def.color : "#d4b17c";
      const cx = (n.tx + 0.5) * ts * z, cy = (n.ty + 0.5) * ts * z;
      ctx.beginPath();
      ctx.arc(cx, cy, ts * z * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${8 * z}px sans-serif`;
    ctx.fillText(def ? def.name : n.npcId, dx, dy - 2);
  }

  // Statues (waystones)
  for (const s of S.statues) {
    const cx = (s.tx + 0.5) * ts * z, cy = (s.ty + 0.5) * ts * z;
    ctx.fillStyle = "rgba(100, 255, 180, 0.4)";
    // diamond shape
    ctx.beginPath();
    ctx.moveTo(cx, cy - ts * z * 0.4);
    ctx.lineTo(cx + ts * z * 0.3, cy);
    ctx.lineTo(cx, cy + ts * z * 0.4);
    ctx.lineTo(cx - ts * z * 0.3, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#a6e3a1";
    ctx.font = `${8 * z}px sans-serif`;
    ctx.fillText(s.name || "Waystone", s.tx * ts * z, s.ty * ts * z - 2);
  }

  // Spawn point
  const sx = (S.spawnPoint[0] + 0.5) * ts * z;
  const sy = (S.spawnPoint[1] + 0.5) * ts * z;
  ctx.strokeStyle = SPAWN_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, ts * z * 0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx - 4 * z, sy);
  ctx.lineTo(sx + 4 * z, sy);
  ctx.moveTo(sx, sy - 4 * z);
  ctx.lineTo(sx, sy + 4 * z);
  ctx.stroke();

  // Delete tool hover highlight
  if (S.tool === "delete" && S.hoverTile) {
    const [hx, hy] = S.hoverTile;
    ctx.fillStyle = "rgba(243, 139, 168, 0.35)";
    ctx.fillRect(hx * ts * z, hy * ts * z, ts * z, ts * z);
    ctx.strokeStyle = "rgba(243, 139, 168, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(hx * ts * z, hy * ts * z, ts * z, ts * z);
  }

  // Drag rectangle preview
  if (S.dragRect) {
    const dr = S.dragRect;
    ctx.strokeStyle = "rgba(255, 255, 0, 0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(dr.x * ts * z, dr.y * ts * z, dr.w * ts * z, dr.h * ts * z);
    ctx.setLineDash([]);
  }
}

/* ── Tile ↔ Pixel helpers ─────────────────── */
function pixelToTile(px, py) {
  const ft = getFloorTerrain();
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((px - rect.left) / (S.tileSize * S.zoom));
  const y = Math.floor((py - rect.top) / (S.tileSize * S.zoom));
  return [Math.max(0, Math.min(x, ft.w - 1)), Math.max(0, Math.min(y, ft.h - 1))];
}

/* ── Undo / Redo ──────────────────────────── */
function pushUndo(action) {
  S.undoStack.push(action);
  if (S.undoStack.length > 200) S.undoStack.shift();
  S.redoStack = [];
}

function undo() {
  if (!S.undoStack.length) return;
  const action = S.undoStack.pop();
  S.redoStack.push(action);
  applyUndoAction(action, true);
  render();
}

function redo() {
  if (!S.redoStack.length) return;
  const action = S.redoStack.pop();
  S.undoStack.push(action);
  applyUndoAction(action, false);
  render();
}

function applyUndoAction(action, isUndo) {
  if (action.type === "terrain") {
    let grid;
    if (action.isFloor && action.buildingIdx >= 0 && action.floorIdx >= 0) {
      const bld = S.buildings[action.buildingIdx];
      grid = bld && bld.upperFloors ? bld.upperFloors[action.floorIdx] : null;
    } else {
      grid = S.terrain;
    }
    if (!grid) return;
    for (const { x, y, oldVal, newVal } of action.tiles) {
      if (grid[y]) grid[y][x] = isUndo ? oldVal : newVal;
    }
  }
}

/* ── Painting ─────────────────────────────── */
function paintTile(tx, ty) {
  const ft = getFloorTerrain();
  const bs = S.brushSize;
  const half = Math.floor(bs / 2);
  const val = S.tool === "erase" ? 0 : S.selectedPaletteIdx;
  if (!S.currentStroke) S.currentStroke = { type: "terrain", tiles: [], isFloor: ft.isFloor, floorIdx: ft.isFloor ? S.editingFloor - 1 : -1, buildingIdx: S.editingBuildingIdx };

  for (let dy = -half; dy < bs - half; dy++) {
    for (let dx = -half; dx < bs - half; dx++) {
      const px = tx + dx, py = ty + dy;
      if (px < 0 || py < 0 || px >= ft.w || py >= ft.h) continue;
      const old = ft.grid[py][px];
      if (old === val) continue;
      ft.grid[py][px] = val;
      S.currentStroke.tiles.push({ x: px, y: py, oldVal: old, newVal: val });
    }
  }
}

function floodFill(tx, ty) {
  const ft = getFloorTerrain();
  const target = ft.grid[ty][tx];
  const replacement = S.selectedPaletteIdx;
  if (target === replacement) return;

  const tiles = [];
  const visited = new Set();
  const stack = [[tx, ty]];

  while (stack.length) {
    const [cx, cy] = stack.pop();
    const key = `${cx},${cy}`;
    if (visited.has(key)) continue;
    if (cx < 0 || cy < 0 || cx >= ft.w || cy >= ft.h) continue;
    if (ft.grid[cy][cx] !== target) continue;

    visited.add(key);
    tiles.push({ x: cx, y: cy, oldVal: target, newVal: replacement });
    ft.grid[cy][cx] = replacement;
    stack.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]);
  }

  if (tiles.length) pushUndo({ type: "terrain", tiles, isFloor: ft.isFloor, floorIdx: ft.isFloor ? S.editingFloor - 1 : -1, buildingIdx: S.editingBuildingIdx });
  render();
}

/* ── Object placement ─────────────────────── */
function handleObjClick(tx, ty) {
  switch (S.objMode) {
    case "enemy": placeEnemy(tx, ty); break;
    case "npc": placeNPC(tx, ty); break;
    case "prop": placeProp(tx, ty); break;
    case "statue": placeStatue(tx, ty); break;
    case "blocked": toggleBlocked(tx, ty); break;
  }
  updateObjectList();
  render();
}

function handleObjDragStart(tx, ty) {
  if (["portal", "building", "safezone"].includes(S.objMode)) {
    S.dragRect = { x: tx, y: ty, w: 1, h: 1, startX: tx, startY: ty };
  }
}

function handleObjDragMove(tx, ty) {
  if (S.dragRect) {
    const sx = S.dragRect.startX, sy = S.dragRect.startY;
    S.dragRect.x = Math.min(sx, tx);
    S.dragRect.y = Math.min(sy, ty);
    S.dragRect.w = Math.abs(tx - sx) + 1;
    S.dragRect.h = Math.abs(ty - sy) + 1;
    render();
  }
}

function handleObjDragEnd() {
  if (!S.dragRect) return;
  const r = S.dragRect;
  S.dragRect = null;

  switch (S.objMode) {
    case "portal":
      showPortalDialog(r.x, r.y, r.w, r.h);
      break;
    case "building":
      showBuildingDialog(r.x, r.y, r.w, r.h);
      break;
    case "safezone":
      S.safeZones.push({ x1: r.x, y1: r.y, x2: r.x + r.w - 1, y2: r.y + r.h - 1 });
      break;
  }
  updateObjectList();
  render();
}

function placeEnemy(tx, ty) {
  const type = getSelectedEnemyType();
  if (!type) { alert("Select an enemy type in the Properties panel first."); return; }
  let group = S.enemySpawns.find(e => e.type === type);
  if (!group) { group = { type, positions: [] }; S.enemySpawns.push(group); }
  // Don't duplicate position
  if (!group.positions.some(([px, py]) => px === tx && py === ty)) {
    group.positions.push([tx, ty]);
  }
}

function placeNPC(tx, ty) {
  const npcId = getSelectedNPCId();
  if (!npcId) { alert("Select an NPC in the Properties panel first."); return; }
  let floor = $("#npcFloor") ? parseInt($("#npcFloor").value) || 0 : 0;
  let worldTx = tx, worldTy = ty;
  // In floor edit mode, convert local coords to world coords
  if (S.editingBuildingIdx >= 0) {
    const bld = S.buildings[S.editingBuildingIdx];
    worldTx = tx + bld.x;
    worldTy = ty + bld.y;
    floor = S.editingFloor;
  }
  // Remove if already placed
  S.npcs = S.npcs.filter(n => n.npcId !== npcId);
  S.npcs.push({ npcId, tx: worldTx, ty: worldTy, floor });
}

function placeProp(tx, ty) {
  const type = $("#propType") ? $("#propType").value : "rock";
  if (S.props.some(p => p.tx === tx && p.ty === ty && p.type === type)) return;
  S.props.push({ tx, ty, type });
}

function placeStatue(tx, ty) {
  const id = `${S.mapId || "map"}_waystone_${S.statues.length + 1}`;
  const name = `Waystone ${S.statues.length + 1}`;
  S.statues.push({ id, name, tx, ty });
}

function showStatueDialog(idx) {
  const s = S.statues[idx];
  if (!s) return;
  showModal(`
    <h2>Edit Waystone</h2>
    <label>ID: <input id="dlgStatueId" type="text" value="${s.id}"></label>
    <label>Name: <input id="dlgStatueName" type="text" value="${s.name}"></label>
    <div class="modal-row">
      <label>TX: <input id="dlgStatueTx" type="number" value="${s.tx}"></label>
      <label>TY: <input id="dlgStatueTy" type="number" value="${s.ty}"></label>
    </div>
    <br>
    <button class="primary" id="dlgStatueOk">Save</button>
    <button id="dlgCancel">Cancel</button>
  `);
  $("#dlgStatueOk").onclick = () => {
    S.statues[idx] = {
      id: $("#dlgStatueId").value.trim(),
      name: $("#dlgStatueName").value.trim(),
      tx: parseInt($("#dlgStatueTx").value) || s.tx,
      ty: parseInt($("#dlgStatueTy").value) || s.ty,
    };
    hideModal();
    updateObjectList();
    render();
  };
  $("#dlgCancel").onclick = hideModal;
}

function showBuildingEditDialog(idx) {
  const b = S.buildings[idx];
  if (!b) return;
  showModal(`
    <h2>Edit Building</h2>
    <label>Name: <input id="dlgBEName" type="text" value="${b.name || ""}"></label>
    <div class="modal-row">
      <label>X: <input id="dlgBEX" type="number" value="${b.x}"></label>
      <label>Y: <input id="dlgBEY" type="number" value="${b.y}"></label>
      <label>W: <input id="dlgBEW" type="number" value="${b.w}" min="1"></label>
      <label>H: <input id="dlgBEH" type="number" value="${b.h}" min="1"></label>
    </div>
    <label>Floors: <input id="dlgBEFloors" type="number" value="${b.floors || 1}" min="1" max="10"></label>
    <br><br>
    <button class="primary" id="dlgBuildingEditOk">Save</button>
    <button id="dlgCancel">Cancel</button>
  `);
  $("#dlgBuildingEditOk").onclick = () => {
    b.name = $("#dlgBEName").value.trim();
    b.x = parseInt($("#dlgBEX").value) || b.x;
    b.y = parseInt($("#dlgBEY").value) || b.y;
    b.w = Math.max(1, parseInt($("#dlgBEW").value) || b.w);
    b.h = Math.max(1, parseInt($("#dlgBEH").value) || b.h);
    const newFloors = Math.max(1, parseInt($("#dlgBEFloors").value) || 1);
    if (newFloors !== (b.floors || 1)) {
      b.floors = newFloors;
      if (newFloors > 1) {
        if (!b.upperFloors) b.upperFloors = [];
        // Add missing floor grids
        while (b.upperFloors.length < newFloors - 1) {
          const wallIdx = S.palette.indexOf("houseWall");
          const floorIdx = S.palette.indexOf("houseFloor");
          const wI = wallIdx >= 0 ? wallIdx : 0;
          const fI = floorIdx >= 0 ? floorIdx : 0;
          b.upperFloors.push(
            Array.from({ length: b.h }, (_, gy) =>
              Array.from({ length: b.w }, (_, gx) =>
                (gy === 0 || gy === b.h - 1 || gx === 0 || gx === b.w - 1) ? wI : fI
              )
            )
          );
        }
        // Trim excess floor grids
        if (b.upperFloors.length > newFloors - 1) b.upperFloors.length = newFloors - 1;
      } else {
        delete b.floors;
        delete b.upperFloors;
      }
    }
    hideModal();
    updateObjectList();
    render();
  };
  $("#dlgCancel").onclick = hideModal;
}

function showSafezoneDialog(idx) {
  const sz = S.safeZones[idx];
  if (!sz) return;
  showModal(`
    <h2>Edit Safe Zone</h2>
    <div class="modal-row">
      <label>X1: <input id="dlgSZX1" type="number" value="${sz.x1}"></label>
      <label>Y1: <input id="dlgSZY1" type="number" value="${sz.y1}"></label>
    </div>
    <div class="modal-row">
      <label>X2: <input id="dlgSZX2" type="number" value="${sz.x2}"></label>
      <label>Y2: <input id="dlgSZY2" type="number" value="${sz.y2}"></label>
    </div>
    <br>
    <button class="primary" id="dlgSZOk">Save</button>
    <button id="dlgCancel">Cancel</button>
  `);
  $("#dlgSZOk").onclick = () => {
    S.safeZones[idx] = {
      x1: parseInt($("#dlgSZX1").value) || 0,
      y1: parseInt($("#dlgSZY1").value) || 0,
      x2: parseInt($("#dlgSZX2").value) || 0,
      y2: parseInt($("#dlgSZY2").value) || 0,
    };
    hideModal();
    updateObjectList();
    render();
  };
  $("#dlgCancel").onclick = hideModal;
}

function toggleBlocked(tx, ty) {
  const idx = S.extraBlocked.findIndex(([bx, by]) => bx === tx && by === ty);
  if (idx >= 0) S.extraBlocked.splice(idx, 1);
  else S.extraBlocked.push([tx, ty]);
}

function getSelectedEnemyType() {
  const sel = $("#enemyTypeSelect");
  return sel ? sel.value : null;
}

function getSelectedNPCId() {
  const sel = $("#npcIdSelect");
  return sel ? sel.value : null;
}

/* ── Dialogs ──────────────────────────────── */
function showModal(html) {
  $("#modalContent").innerHTML = html;
  $("#modalOverlay").classList.remove("hidden");
}

function hideModal() {
  $("#modalOverlay").classList.add("hidden");
}

function showPortalDialog(x, y, w, h, editIdx) {
  const isEdit = editIdx !== undefined;
  const existing = isEdit ? S.portals[editIdx] : null;
  showModal(`
    <h2>${isEdit ? "Edit" : "New"} Portal</h2>
    <div class="modal-row">
      <label>X: <input id="dlgPX" type="number" value="${existing ? existing.x : x}"></label>
      <label>Y: <input id="dlgPY" type="number" value="${existing ? existing.y : y}"></label>
      <label>W: <input id="dlgPW" type="number" value="${existing ? existing.w : w}"></label>
      <label>H: <input id="dlgPH" type="number" value="${existing ? existing.h : h}"></label>
    </div>
    <label>Target Map ID: <input id="dlgTargetMap" type="text" placeholder="eldengrove" value="${existing ? existing.targetMap : ""}"></label>
    <div class="modal-row">
      <label>Target TX: <input id="dlgTargetTx" type="number" value="${existing ? existing.targetTx : 5}"></label>
      <label>Target TY: <input id="dlgTargetTy" type="number" value="${existing ? existing.targetTy : 5}"></label>
    </div>
    <label>Label: <input id="dlgLabel" type="text" placeholder="To Eldengrove" value="${existing ? existing.label : ""}"></label>
    <br><br>
    <button class="primary" id="dlgPortalOk">${isEdit ? "Save" : "Add Portal"}</button>
    <button id="dlgCancel">Cancel</button>
  `);
  $("#dlgPortalOk").onclick = () => {
    const portal = {
      x: parseInt($("#dlgPX").value) || 0,
      y: parseInt($("#dlgPY").value) || 0,
      w: parseInt($("#dlgPW").value) || 1,
      h: parseInt($("#dlgPH").value) || 1,
      targetMap: $("#dlgTargetMap").value.trim(),
      targetTx: parseInt($("#dlgTargetTx").value) || 0,
      targetTy: parseInt($("#dlgTargetTy").value) || 0,
      label: $("#dlgLabel").value.trim(),
    };
    if (isEdit) {
      S.portals[editIdx] = portal;
    } else {
      S.portals.push(portal);
    }
    hideModal();
    updateObjectList();
    render();
  };
  $("#dlgCancel").onclick = hideModal;
}

function showBuildingDialog(x, y, w, h) {
  showModal(`
    <h2>New Building</h2>
    <div class="modal-row">
      <label>X: <input type="number" value="${x}" readonly></label>
      <label>Y: <input type="number" value="${y}" readonly></label>
      <label>W: <input type="number" value="${w}" readonly></label>
      <label>H: <input type="number" value="${h}" readonly></label>
    </div>
    <label>Name: <input id="dlgBName" type="text" placeholder="Small Cottage"></label>
    <label>Floors: <input id="dlgBFloors" type="number" value="1" min="1" max="5"></label>
    <br><br>
    <button class="primary" id="dlgBuildingOk">Add Building</button>
    <button id="dlgCancel2">Cancel</button>
  `);
  $("#dlgBuildingOk").onclick = () => {
    const bld = { x, y, w, h, name: $("#dlgBName").value.trim() };
    const floors = parseInt($("#dlgBFloors").value) || 1;
    if (floors > 1) {
      bld.floors = floors;
      // Initialize empty upperFloors grids (houseWall border + houseFloor interior)
      const wallIdx = S.palette.indexOf("houseWall");
      const floorIdx = S.palette.indexOf("houseFloor");
      const wI = wallIdx >= 0 ? wallIdx : 0;
      const fI = floorIdx >= 0 ? floorIdx : 0;
      bld.upperFloors = [];
      for (let f = 0; f < floors - 1; f++) {
        const grid = Array.from({ length: h }, (_, gy) =>
          Array.from({ length: w }, (_, gx) =>
            (gy === 0 || gy === h - 1 || gx === 0 || gx === w - 1) ? wI : fI
          )
        );
        bld.upperFloors.push(grid);
      }
    }
    S.buildings.push(bld);
    hideModal();
    updateObjectList();
    render();
  };
  $("#dlgCancel2").onclick = hideModal;
}

function showLoadDialog() {
  fetch("/api/maps").then(r => r.json()).then(maps => {
    if (!maps.length) { alert("No maps found in public/data/maps/."); return; }
    const options = maps.map(m => `<option value="${m}">${m}</option>`).join("");
    showModal(`
      <h2>Load Map</h2>
      <label>Select map: <select id="dlgMapSelect">${options}</select></label>
      <br><br>
      <button class="primary" id="dlgLoadOk">Load</button>
      <button id="dlgLoadCancel">Cancel</button>
    `);
    $("#dlgLoadOk").onclick = () => {
      loadMap($("#dlgMapSelect").value);
      hideModal();
    };
    $("#dlgLoadCancel").onclick = hideModal;
  });
}

function showNewMapDialog() {
  showModal(`
    <h2>New Map</h2>
    <div class="modal-row">
      <label>Width: <input id="dlgNewW" type="number" value="80" min="10" max="256"></label>
      <label>Height: <input id="dlgNewH" type="number" value="80" min="10" max="256"></label>
    </div>
    <br>
    <button class="primary" id="dlgNewOk">Create</button>
    <button id="dlgNewCancel">Cancel</button>
  `);
  $("#dlgNewOk").onclick = () => {
    newMap(parseInt($("#dlgNewW").value) || 80, parseInt($("#dlgNewH").value) || 80);
    hideModal();
  };
  $("#dlgNewCancel").onclick = hideModal;
}

function showPaletteEditor() {
  const allNames = Object.keys(S.globalPalette);
  const available = allNames.filter(n => !S.palette.includes(n));

  let rows = S.palette.map((name, idx) => {
    const info = S.globalPalette[name];
    const [r, g, b] = info ? info.color : [128, 128, 128];
    const sprite = getSprite(tileSpritePath(name));
    const swatchStyle = sprite
      ? `background-image:url(${tileSpritePath(name)});background-size:cover`
      : `background:rgb(${r},${g},${b})`;
    return `<div class="palette-editor-row">
      <span class="pe-idx">${idx}</span>
      <span class="pe-swatch" style="${swatchStyle}"></span>
      <span class="pe-name">${name}${info && info.blocked ? " ■" : ""}</span>
      <button onclick="removePaletteEntry(${idx})">✕</button>
    </div>`;
  }).join("");

  const opts = available.map(n => {
    const info = S.globalPalette[n];
    return `<option value="${n}">${n}${info && info.blocked ? " (blocked)" : ""}</option>`;
  }).join("");

  showModal(`
    <h2>Edit Map Palette</h2>
    <p style="color:#6c7086;font-size:11px;margin-bottom:8px;">
      Choose which tile types this map uses. Order defines palette indices.
      Removing a tile resets terrain using that index to 0.
    </p>
    <div id="peRows">${rows}</div>
    <br>
    <div class="modal-row">
      <label>Add tile: <select id="peAddSelect"><option value="">--</option>${opts}</select></label>
      <button id="peAddBtn" style="align-self:flex-end;">Add</button>
    </div>
    <br>
    <button class="primary" id="peDone">Done</button>
  `);

  $("#peAddBtn").onclick = () => {
    const name = $("#peAddSelect").value;
    if (!name) return;
    S.palette.push(name);
    buildPaletteUI();
    showPaletteEditor(); // refresh dialog
  };
  $("#peDone").onclick = () => {
    hideModal();
    buildPaletteUI();
    render();
  };
}

// Global so inline onclick works
window.removePaletteEntry = function(idx) {
  // Reset terrain tiles with this index to 0, shift higher indices down
  for (let y = 0; y < S.height; y++) {
    for (let x = 0; x < S.width; x++) {
      if (S.terrain[y][x] === idx) S.terrain[y][x] = 0;
      else if (S.terrain[y][x] > idx) S.terrain[y][x]--;
    }
  }
  // Also update all building upperFloors grids
  for (const bld of S.buildings) {
    if (!bld.upperFloors) continue;
    for (const grid of bld.upperFloors) {
      for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
          if (grid[y][x] === idx) grid[y][x] = 0;
          else if (grid[y][x] > idx) grid[y][x]--;
        }
      }
    }
  }
  S.palette.splice(idx, 1);
  if (S.selectedPaletteIdx >= S.palette.length) S.selectedPaletteIdx = Math.max(0, S.palette.length - 1);
  buildPaletteUI();
  showPaletteEditor();
};

/* ── Properties Panel ─────────────────────── */
function updatePropsPanel() {
  const panel = $("#propsPanel");

  if (S.objMode === "enemy") {
    const types = Object.keys(S.enemyDefs);
    const opts = types.map(t => `<option value="${t}">${S.enemyDefs[t].name} (${t})</option>`).join("");
    panel.innerHTML = `
      <label>Enemy Type:
        <select id="enemyTypeSelect">${opts}</select>
      </label>
      <p class="muted">Click on map to place spawn positions.</p>
    `;
  } else if (S.objMode === "npc") {
    const ids = Object.keys(S.npcDefs);
    const opts = ids.map(id => `<option value="${id}">${S.npcDefs[id].name} (${id})</option>`).join("");
    panel.innerHTML = `
      <label>NPC:
        <select id="npcIdSelect">${opts}</select>
      </label>
      <label>Floor:
        <input id="npcFloor" type="number" value="0" min="0" max="10" style="width:50px">
      </label>
      <p class="muted">Click on map to place. Replaces previous position for same NPC.</p>
    `;
  } else if (S.objMode === "prop") {
    const propTypes = Object.keys(S.propDefs);
    const opts = propTypes.map(t => {
      const def = S.propDefs[t];
      const tag = def.blocked ? " [blocked]" : "";
      return `<option value="${t}">${t}${tag}</option>`;
    }).join("");
    panel.innerHTML = `
      <label>Type:
        <select id="propType">${opts}</select>
      </label>
      <p class="muted">Click to place. Blocking defined in props.json.</p>
    `;
  } else if (S.objMode === "portal") {
    panel.innerHTML = `<p class="muted">Click and drag on the map to define portal rectangle.</p>`;
  } else if (S.objMode === "building") {
    panel.innerHTML = `<p class="muted">Click and drag on the map to define building footprint.</p>`;
  } else if (S.objMode === "safezone") {
    panel.innerHTML = `<p class="muted">Click and drag on the map to define safe zone rectangle.</p>`;
  } else if (S.objMode === "statue") {
    panel.innerHTML = `<p class="muted">Click on the map to place a waystone.</p>`;
  } else if (S.objMode === "blocked") {
    panel.innerHTML = `<p class="muted">Click tiles to toggle extra blocked status.</p>`;
  } else {
    panel.innerHTML = `<p class="muted">Select a tool or object mode.</p>`;
  }
}

/* ── Object List ──────────────────────────── */
function updateObjectList() {
  const list = $("#objectList");
  let html = "";

  S.portals.forEach((p, i) => {
    html += `<div class="obj-item" data-type="portal" data-idx="${i}">
      <span>🌀 ${p.label || p.targetMap} (${p.x},${p.y} ${p.w}×${p.h})</span>
      <span style="display:flex;gap:4px;align-items:center;">
        <span class="obj-edit-portal" data-idx="${i}" title="Edit portal" style="color:#89b4fa;cursor:pointer;font-size:10px;">✎</span>
        <span class="obj-del" data-type="portal" data-idx="${i}">✕</span>
      </span>
    </div>`;
  });

  S.enemySpawns.forEach((es, i) => {
    html += `<div class="obj-item" data-type="enemyGroup" data-idx="${i}">
      <span>👹 ${es.type} ×${es.positions.length}</span>
      <span class="obj-del" data-type="enemyGroup" data-idx="${i}">✕</span>
    </div>`;
  });

  S.npcs.forEach((n, i) => {
    const def = S.npcDefs[n.npcId];
    const floorTag = n.floor ? ` F${n.floor}` : "";
    html += `<div class="obj-item" data-type="npc" data-idx="${i}">
      <span>🧙 ${def ? def.name : n.npcId} (${n.tx},${n.ty})${floorTag}</span>
      <span class="obj-del" data-type="npc" data-idx="${i}">✕</span>
    </div>`;
  });

  S.buildings.forEach((b, i) => {
    const floorCount = b.floors || 1;
    const floorLabel = floorCount > 1 ? ` [${floorCount}F]` : "";
    html += `<div class="obj-item" data-type="building" data-idx="${i}">
      <span>🏠 ${b.name}${floorLabel} (${b.x},${b.y})</span>
      <span style="display:flex;gap:4px;align-items:center;">
        ${floorCount > 1 ? `<span class="obj-edit-floors" data-idx="${i}" title="Edit upper floors" style="color:#89b4fa;cursor:pointer;font-size:10px;">✎F</span>` : ""}
        <span class="obj-edit-building" data-idx="${i}" title="Edit building" style="color:#89b4fa;cursor:pointer;font-size:10px;">✎</span>
        <span class="obj-del" data-type="building" data-idx="${i}">✕</span>
      </span>
    </div>`;
  });

  S.statues.forEach((s, i) => {
    html += `<div class="obj-item" data-type="statue" data-idx="${i}">
      <span>💎 ${s.name} (${s.tx},${s.ty})</span>
      <span style="display:flex;gap:4px;align-items:center;">
        <span class="obj-edit-statue" data-idx="${i}" title="Edit waystone" style="color:#89b4fa;cursor:pointer;font-size:10px;">✎</span>
        <span class="obj-del" data-type="statue" data-idx="${i}">✕</span>
      </span>
    </div>`;
  });

  S.safeZones.forEach((sz, i) => {
    html += `<div class="obj-item" data-type="safezone" data-idx="${i}">
      <span>🛡 Safe (${sz.x1},${sz.y1})→(${sz.x2},${sz.y2})</span>
      <span style="display:flex;gap:4px;align-items:center;">
        <span class="obj-edit-safezone" data-idx="${i}" title="Edit safe zone" style="color:#89b4fa;cursor:pointer;font-size:10px;">✎</span>
        <span class="obj-del" data-type="safezone" data-idx="${i}">✕</span>
      </span>
    </div>`;
  });

  html += `<div class="obj-item" style="color:#6c7086">
    <span>📦 Props: ${S.props.length} | Blocked: ${S.extraBlocked.length}</span>
  </div>`;

  list.innerHTML = html;

  // Wire up delete buttons
  list.querySelectorAll(".obj-del").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const type = btn.dataset.type;
      const idx = parseInt(btn.dataset.idx);
      deleteObject(type, idx);
    };
  });

  // Wire up floor-edit buttons
  list.querySelectorAll(".obj-edit-floors").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      enterFloorEdit(parseInt(btn.dataset.idx));
    };
  });

  // Wire up portal-edit buttons
  list.querySelectorAll(".obj-edit-portal").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      showPortalDialog(0, 0, 1, 1, parseInt(btn.dataset.idx));
    };
  });

  // Wire up waystone-edit buttons
  list.querySelectorAll(".obj-edit-statue").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      showStatueDialog(parseInt(btn.dataset.idx));
    };
  });

  // Wire up building-edit buttons
  list.querySelectorAll(".obj-edit-building").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      showBuildingEditDialog(parseInt(btn.dataset.idx));
    };
  });

  // Wire up safezone-edit buttons
  list.querySelectorAll(".obj-edit-safezone").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      showSafezoneDialog(parseInt(btn.dataset.idx));
    };
  });
}

function deleteObject(type, idx) {
  switch (type) {
    case "portal": S.portals.splice(idx, 1); break;
    case "enemyGroup": S.enemySpawns.splice(idx, 1); break;
    case "npc": S.npcs.splice(idx, 1); break;
    case "building": S.buildings.splice(idx, 1); break;
    case "statue": S.statues.splice(idx, 1); break;
    case "safezone": S.safeZones.splice(idx, 1); break;
    case "prop": S.props.splice(idx, 1); break;
  }
  updateObjectList();
  render();
}

function deleteObjectAtTile(tx, ty) {
  // In floor edit mode, only handle NPCs on current floor
  if (S.editingBuildingIdx >= 0) {
    const bld = S.buildings[S.editingBuildingIdx];
    const worldTx = tx + bld.x, worldTy = ty + bld.y;
    const ni = S.npcs.findIndex(n => n.tx === worldTx && n.ty === worldTy && (n.floor || 0) === S.editingFloor);
    if (ni >= 0) { S.npcs.splice(ni, 1); updateObjectList(); render(); }
    return;
  }

  // If an object category is selected, only delete that category
  const mode = S.objMode;
  if (mode) {
    switch (mode) {
      case "statue": {
        const i = S.statues.findIndex(s => s.tx === tx && s.ty === ty);
        if (i >= 0) { S.statues.splice(i, 1); updateObjectList(); render(); }
        return;
      }
      case "npc": {
        const i = S.npcs.findIndex(n => n.tx === tx && n.ty === ty && (n.floor || 0) === 0);
        if (i >= 0) { S.npcs.splice(i, 1); updateObjectList(); render(); }
        return;
      }
      case "enemy": {
        for (let ei = 0; ei < S.enemySpawns.length; ei++) {
          const pi = S.enemySpawns[ei].positions.findIndex(([ex, ey]) => ex === tx && ey === ty);
          if (pi >= 0) {
            S.enemySpawns[ei].positions.splice(pi, 1);
            if (S.enemySpawns[ei].positions.length === 0) S.enemySpawns.splice(ei, 1);
            updateObjectList(); render(); return;
          }
        }
        return;
      }
      case "prop": {
        const i = S.props.findIndex(p => p.tx === tx && p.ty === ty);
        if (i >= 0) { S.props.splice(i, 1); updateObjectList(); render(); }
        return;
      }
      case "portal": {
        const i = S.portals.findIndex(p => tx >= p.x && tx < p.x + p.w && ty >= p.y && ty < p.y + p.h);
        if (i >= 0) { S.portals.splice(i, 1); updateObjectList(); render(); }
        return;
      }
      case "building": {
        const i = S.buildings.findIndex(b => tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h);
        if (i >= 0) { S.buildings.splice(i, 1); updateObjectList(); render(); }
        return;
      }
      case "safezone": {
        const i = S.safeZones.findIndex(sz => tx >= sz.x1 && tx <= sz.x2 && ty >= sz.y1 && ty <= sz.y2);
        if (i >= 0) { S.safeZones.splice(i, 1); updateObjectList(); render(); }
        return;
      }
      case "blocked": {
        const i = S.extraBlocked.findIndex(([bx, by]) => bx === tx && by === ty);
        if (i >= 0) { S.extraBlocked.splice(i, 1); updateObjectList(); render(); }
        return;
      }
    }
    return;
  }

  // No category selected — fall through all types (priority order)
  const si = S.statues.findIndex(s => s.tx === tx && s.ty === ty);
  if (si >= 0) { S.statues.splice(si, 1); updateObjectList(); render(); return; }

  const ni = S.npcs.findIndex(n => n.tx === tx && n.ty === ty && (n.floor || 0) === 0);
  if (ni >= 0) { S.npcs.splice(ni, 1); updateObjectList(); render(); return; }

  for (let ei = 0; ei < S.enemySpawns.length; ei++) {
    const pi = S.enemySpawns[ei].positions.findIndex(([ex, ey]) => ex === tx && ey === ty);
    if (pi >= 0) {
      S.enemySpawns[ei].positions.splice(pi, 1);
      if (S.enemySpawns[ei].positions.length === 0) S.enemySpawns.splice(ei, 1);
      updateObjectList(); render(); return;
    }
  }

  const pri = S.props.findIndex(p => p.tx === tx && p.ty === ty);
  if (pri >= 0) { S.props.splice(pri, 1); updateObjectList(); render(); return; }

  const poi = S.portals.findIndex(p => tx >= p.x && tx < p.x + p.w && ty >= p.y && ty < p.y + p.h);
  if (poi >= 0) { S.portals.splice(poi, 1); updateObjectList(); render(); return; }

  const bi = S.buildings.findIndex(b => tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h);
  if (bi >= 0) { S.buildings.splice(bi, 1); updateObjectList(); render(); return; }

  const szi = S.safeZones.findIndex(sz => tx >= sz.x1 && tx <= sz.x2 && ty >= sz.y1 && ty <= sz.y2);
  if (szi >= 0) { S.safeZones.splice(szi, 1); updateObjectList(); render(); return; }

  const bli = S.extraBlocked.findIndex(([bx, by]) => bx === tx && by === ty);
  if (bli >= 0) { S.extraBlocked.splice(bli, 1); updateObjectList(); render(); return; }
}

/* ── Floor Editing ─────────────────────────── */
function enterFloorEdit(buildingIdx) {
  const bld = S.buildings[buildingIdx];
  if (!bld || !bld.floors || bld.floors <= 1) return;
  if (!bld.upperFloors) {
    // Initialize if missing
    const wallIdx = S.palette.indexOf("houseWall");
    const floorIdx = S.palette.indexOf("houseFloor");
    const wI = wallIdx >= 0 ? wallIdx : 0;
    const fI = floorIdx >= 0 ? floorIdx : 0;
    bld.upperFloors = [];
    for (let f = 0; f < bld.floors - 1; f++) {
      bld.upperFloors.push(
        Array.from({ length: bld.h }, (_, gy) =>
          Array.from({ length: bld.w }, (_, gx) =>
            (gy === 0 || gy === bld.h - 1 || gx === 0 || gx === bld.w - 1) ? wI : fI
          )
        )
      );
    }
  }
  S.editingBuildingIdx = buildingIdx;
  S.editingFloor = 1;
  updateFloorUI();
  resizeCanvas();
  render();
}

function exitFloorEdit() {
  S.editingBuildingIdx = -1;
  S.editingFloor = 0;
  updateFloorUI();
  resizeCanvas();
  render();
}

function changeFloor(delta) {
  if (S.editingBuildingIdx < 0) return;
  const bld = S.buildings[S.editingBuildingIdx];
  const maxFloor = (bld.floors || 1) - 1;
  S.editingFloor = Math.max(1, Math.min(maxFloor, S.editingFloor + delta));
  updateFloorUI();
  render();
}

function updateFloorUI() {
  const controls = $("#floorControls");
  if (S.editingBuildingIdx >= 0) {
    controls.style.display = "flex";
    const bld = S.buildings[S.editingBuildingIdx];
    $("#floorInfo").textContent = `${bld.name} — Floor ${S.editingFloor + 1}/${bld.floors}`;
    const ft = getFloorTerrain();
    $("#floorWidth").value = ft.w;
    $("#floorHeight").value = ft.h;
  } else {
    controls.style.display = "none";
  }
}

function getFloorTerrain() {
  // Returns the terrain grid and dimensions for the current editing context
  if (S.editingBuildingIdx >= 0 && S.editingFloor > 0) {
    const bld = S.buildings[S.editingBuildingIdx];
    const floorGrid = bld.upperFloors[S.editingFloor - 1];
    const h = floorGrid.length;
    const w = h > 0 ? floorGrid[0].length : 0;
    return { grid: floorGrid, w, h, offsetX: 0, offsetY: 0, isFloor: true };
  }
  return { grid: S.terrain, w: S.width, h: S.height, offsetX: 0, offsetY: 0, isFloor: false };
}

function resizeFloorGrid() {
  if (S.editingBuildingIdx < 0 || S.editingFloor <= 0) return;
  const bld = S.buildings[S.editingBuildingIdx];
  const floorIdx = S.editingFloor - 1;
  const oldGrid = bld.upperFloors[floorIdx];
  const oldH = oldGrid.length;
  const oldW = oldH > 0 ? oldGrid[0].length : 0;
  const newW = Math.max(3, Math.min(64, parseInt($("#floorWidth").value) || oldW));
  const newH = Math.max(3, Math.min(64, parseInt($("#floorHeight").value) || oldH));
  if (newW === oldW && newH === oldH) return;
  bld.upperFloors[floorIdx] = Array.from({ length: newH }, (_, y) =>
    Array.from({ length: newW }, (_, x) =>
      (y < oldH && x < oldW) ? oldGrid[y][x] : -1
    )
  );
  resizeCanvas();
  render();
}

/* ── Tool switching ───────────────────────── */
function setTool(name) {
  S.tool = name;
  S.objMode = null;
  $$(".tool-btn").forEach(b => b.classList.toggle("active", b.dataset.tool === name));
  $$(".obj-btn").forEach(b => b.classList.remove("active"));
  updatePropsPanel();
}

function setObjMode(name) {
  if (S.objMode === name) {
    // Toggle off
    S.objMode = null;
    $$(".obj-btn").forEach(b => b.classList.remove("active"));
  } else {
    S.objMode = name;
    S.tool = null;
    $$(".tool-btn").forEach(b => b.classList.remove("active"));
    $$(".obj-btn").forEach(b => b.classList.toggle("active", b.dataset.obj === name));
  }
  updatePropsPanel();
}

/* ── Event Listeners ──────────────────────── */
function setupEventListeners() {
  // Top bar buttons
  $("#btnNew").onclick = showNewMapDialog;
  $("#btnLoad").onclick = showLoadDialog;
  $("#btnSave").onclick = saveMap;
  $("#btnExport").onclick = () => {
    syncUIToFields();
    const json = JSON.stringify(buildMapJSON(), null, 2);
    navigator.clipboard.writeText(json).then(() => alert("Map JSON copied to clipboard!"));
  };
  $("#btnResetView").onclick = resetView;

  // Tool buttons
  $$(".tool-btn").forEach(btn => {
    btn.onclick = () => setTool(btn.dataset.tool);
  });

  // Object buttons
  $$(".obj-btn").forEach(btn => {
    btn.onclick = () => setObjMode(btn.dataset.obj);
  });

  // Palette editor
  $("#btnEditPalette").onclick = showPaletteEditor;

  // Floor controls
  $("#btnFloorDown").onclick = () => changeFloor(-1);
  $("#btnFloorUp").onclick = () => changeFloor(1);
  $("#btnExitFloor").onclick = () => exitFloorEdit();
  $("#floorWidth").onchange = resizeFloorGrid;
  $("#floorHeight").onchange = resizeFloorGrid;

  // Brush size
  $("#brushSize").onchange = (e) => { S.brushSize = parseInt(e.target.value); };

  // Refresh object list
  $("#btnRefreshObjs").onclick = () => { updateObjectList(); render(); };

  // Clear selected object
  $("#btnClearObj").onclick = () => {
    // Nothing specific selected; could add multi-select later
  };

  // Canvas mouse events
  canvas.addEventListener("mousedown", onCanvasMouseDown);
  canvas.addEventListener("mousemove", onCanvasMouseMove);
  canvas.addEventListener("mouseup", onCanvasMouseUp);
  canvas.addEventListener("mouseleave", onCanvasMouseUp);
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  // Zoom
  wrap.addEventListener("wheel", onWheel, { passive: false });

  // Keyboard shortcuts
  document.addEventListener("keydown", onKeyDown);

  // Width/height change
  $("#mapWidth").onchange = () => { syncUIToFields(); resizeCanvas(); render(); };
  $("#mapHeight").onchange = () => { syncUIToFields(); resizeCanvas(); render(); };

  // Modal overlay click to close
  $("#modalOverlay").onclick = (e) => {
    if (e.target === $("#modalOverlay")) hideModal();
  };
}

function onCanvasMouseDown(e) {
  const [tx, ty] = pixelToTile(e.clientX, e.clientY);

  // Middle mouse or Space+click: pan
  if (e.button === 1) {
    S.isPanning = true;
    S.panStart = { x: e.clientX - canvas.offsetLeft, y: e.clientY - canvas.offsetTop };
    return;
  }

  // Right click: pick tile
  if (e.button === 2) {
    const ft = getFloorTerrain();
    S.selectedPaletteIdx = ft.grid[ty][tx];
    buildPaletteUI();
    setTool("paint");
    return;
  }

  // Alt+click: pick
  if (e.altKey) {
    const ft = getFloorTerrain();
    S.selectedPaletteIdx = ft.grid[ty][tx];
    buildPaletteUI();
    return;
  }

  // Object mode
  if (S.objMode) {
    if (["portal", "building", "safezone"].includes(S.objMode)) {
      handleObjDragStart(tx, ty);
      S.isDragging = true;
    } else {
      handleObjClick(tx, ty);
    }
    return;
  }

  // Paint/erase
  if (S.tool === "paint" || S.tool === "erase") {
    S.isDragging = true;
    S.currentStroke = null;
    paintTile(tx, ty);
    S.lastPaintTile = `${tx},${ty}`;
    render();
  }

  // Fill
  if (S.tool === "fill") {
    floodFill(tx, ty);
  }

  // Pick
  if (S.tool === "pick") {
    const ft = getFloorTerrain();
    S.selectedPaletteIdx = ft.grid[ty][tx];
    buildPaletteUI();
    setTool("paint");
  }

  // Delete object at tile
  if (S.tool === "delete") {
    S.isDragging = true;
    S.lastPaintTile = `${tx},${ty}`;
    deleteObjectAtTile(tx, ty);
  }
}

function onCanvasMouseMove(e) {
  const [tx, ty] = pixelToTile(e.clientX, e.clientY);
  $("#cursorInfo").textContent = `${tx}, ${ty}`;
  S.hoverTile = [tx, ty];

  // Update cursor style
  canvas.style.cursor = S.tool === "delete" ? "crosshair" : "";

  // Panning
  if (S.isPanning && S.panStart) {
    canvas.style.left = (e.clientX - S.panStart.x) + "px";
    canvas.style.top = (e.clientY - S.panStart.y) + "px";
    return;
  }

  // Obj drag
  if (S.isDragging && S.objMode && S.dragRect) {
    handleObjDragMove(tx, ty);
    return;
  }

  // Painting
  if (S.isDragging && (S.tool === "paint" || S.tool === "erase")) {
    const key = `${tx},${ty}`;
    if (key !== S.lastPaintTile) {
      paintTile(tx, ty);
      S.lastPaintTile = key;
      render();
    }
  }

  // Delete drag
  if (S.isDragging && S.tool === "delete") {
    const key = `${tx},${ty}`;
    if (key !== S.lastPaintTile) {
      deleteObjectAtTile(tx, ty);
      S.lastPaintTile = key;
    }
  }

  // Redraw hover highlight for delete tool
  if (S.tool === "delete") render();
}

function onCanvasMouseUp(e) {
  if (S.isPanning) {
    S.isPanning = false;
    S.panStart = null;
    return;
  }

  if (S.isDragging && S.objMode && S.dragRect) {
    handleObjDragEnd();
  }

  // Finish paint stroke
  if (S.currentStroke && S.currentStroke.tiles.length) {
    pushUndo(S.currentStroke);
  }
  S.currentStroke = null;
  S.isDragging = false;
  S.lastPaintTile = null;
}

function onWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  S.zoom = Math.max(0.2, Math.min(3, S.zoom + delta));
  $("#zoomInfo").textContent = `${Math.round(S.zoom * 100)}%`;
  resizeCanvas();
  render();
}

function resetView() {
  S.zoom = 1;
  canvas.style.left = "0px";
  canvas.style.top = "0px";
  $("#zoomInfo").textContent = "100%";
  resizeCanvas();
  render();
}

function onKeyDown(e) {
  // Don't capture if typing in input
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;

  switch (e.key.toLowerCase()) {
    case "b": setTool("paint"); break;
    case "e": setTool("erase"); break;
    case "g": setTool("fill"); break;
    case "z": if (e.ctrlKey) { e.preventDefault(); undo(); } break;
    case "y": if (e.ctrlKey) { e.preventDefault(); redo(); } break;
    case "s": if (e.ctrlKey) { e.preventDefault(); saveMap(); } break;
    case "1": S.brushSize = 1; $("#brushSize").value = "1"; break;
    case "2": S.brushSize = 2; $("#brushSize").value = "2"; break;
    case "3": S.brushSize = 3; $("#brushSize").value = "3"; break;
    case "5": S.brushSize = 5; $("#brushSize").value = "5"; break;
    case "x": setTool("delete"); break;
    case "home": resetView(); break;
    case "escape":
      if (S.editingBuildingIdx >= 0) {
        exitFloorEdit();
      } else {
        S.objMode = null;
        S.dragRect = null;
        $$(".obj-btn").forEach(b => b.classList.remove("active"));
        updatePropsPanel();
        render();
      }
      break;
  }
}

/* ── Start ────────────────────────────────── */
init();
