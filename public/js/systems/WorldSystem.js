import { clamp, tileKey } from "../utils.js";

export class WorldSystem {
  constructor() {
    this.mapId = null;
    this.mapData = null;
    this.width = 0;
    this.height = 0;
    this.tileSize = 48;

    this.globalPalette = {};  // loaded from tilePalette.json
    this.terrain = [];        // 2D array of palette indices
    this.tilePalette = [];    // resolved array of { name, color:[r,g,b], blocked }
    this.blocked = new Set();
    this.trees = [];
    this.buildings = [];
    this.ambientProps = [];
    this.portals = [];
    this.safeZones = [];

    this.spawnPoint = { x: 0, y: 0 };

    // Multi-floor state
    this.currentFloor = 0;        // 0 = ground, 1 = 2nd floor, etc.
    this.insideBuilding = null;    // reference to the building the player is upstairs in
    this._onStairs = false;        // track if player is on stairs (must step off to re-use)
  }

  /**
   * Load a map from JSON. Returns a promise.
   * @param {string} mapId - e.g. "eldengrove"
   */
  async loadMap(mapId) {
    // Load global palette once (cached after first load)
    if (!this._globalPaletteLoaded) {
      const palResp = await fetch("/data/tilePalette.json");
      if (!palResp.ok) throw new Error("Failed to load tilePalette.json");
      this.globalPalette = await palResp.json();
      this._globalPaletteLoaded = true;
    }

    const resp = await fetch(`/data/maps/${mapId}.json`);
    if (!resp.ok) throw new Error(`Failed to load map: ${mapId}`);
    const data = await resp.json();
    this.applyMapData(data);
  }

  /**
   * Apply map data object directly (used by server which reads JSON from fs).
   */
  applyMapData(data) {
    this.mapId = data.id;
    this.mapData = data;
    this.width = data.width;
    this.height = data.height;
    this.tileSize = data.tileSize || 48;
    this.terrain = data.terrain || [];

    // Resolve palette: map's "palette" is an array of string names into globalPalette
    if (data.palette && this.globalPalette) {
      this.tilePalette = data.palette.map(name => {
        const entry = this.globalPalette[name];
        return entry ? { name, ...entry } : { name, color: [128, 128, 128], blocked: false };
      });
    } else {
      // Fallback: inline tilePalette (legacy format)
      this.tilePalette = data.tilePalette || [];
    }
    this.portals = data.portals || [];
    this.safeZones = data.safeZones || [];

    // Play map BGM if specified
    if (data.bgm && this.game && this.game.audio) {
      this.game.audio.playBgm(data.bgm);
    }

    // Spawn point (stored as tile coords)
    const sp = data.spawnPoint || [0, 0];
    this.spawnPoint = { x: sp[0] * this.tileSize, y: sp[1] * this.tileSize };

    // Build blocked set from palette + extraBlocked
    this.blocked = new Set();

    // Auto-block tiles whose palette entry has blocked:true
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = this.terrain[y]?.[x] ?? 0;
        if (this.tilePalette[idx]?.blocked) {
          this.blocked.add(tileKey(x, y));
        }
      }
    }

    // Extra blocked tiles (trees, etc.)
    if (data.extraBlocked) {
      for (const [x, y] of data.extraBlocked) {
        this.blocked.add(tileKey(x, y));
      }
    }

    // Buildings (metadata for labels/badges — tiles are in terrain)
    this.buildings = (data.buildings || []).map(b => ({
      x: (b.ox ?? b.x) * this.tileSize,
      y: (b.oy ?? b.y) * this.tileSize,
      ox: b.ox ?? b.x,
      oy: b.oy ?? b.y,
      w: b.w * this.tileSize,
      h: b.h * this.tileSize,
      cols: b.w,
      rows: b.h,
      name: b.name || "",
      floors: b.floors || 1,
      upperFloors: b.upperFloors || []   // array of 2D palette-index grids
    }));

    // Reset floor state on map load
    this.currentFloor = 0;
    this.insideBuilding = null;

    // Trees (stored as tile coords → convert to world center)
    this.trees = (data.trees || []).map(t => ({
      x: t.tx * this.tileSize + this.tileSize * 0.5,
      y: t.ty * this.tileSize + this.tileSize * 0.5,
      radius: this.tileSize * 0.4,
      tint: t.tint || "#2c4f2f"
    }));

    // Props (stored as tile coords → convert to world center)
    this.ambientProps = (data.props || []).map(p => ({
      x: p.tx * this.tileSize + this.tileSize * 0.5,
      y: p.ty * this.tileSize + this.tileSize * 0.5,
      type: p.type || "rock"
    }));
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isBlockedPoint(worldX, worldY, radius = 14) {
    const checks = [
      [0, 0],
      [radius, 0], [-radius, 0],
      [0, radius], [0, -radius],
      [radius * 0.7, radius * 0.7], [-radius * 0.7, radius * 0.7],
      [radius * 0.7, -radius * 0.7], [-radius * 0.7, -radius * 0.7]
    ];

    for (const [dx, dy] of checks) {
      const tx = Math.floor((worldX + dx) / this.tileSize);
      const ty = Math.floor((worldY + dy) / this.tileSize);
      if (!this.inBounds(tx, ty)) return true;

      // When on upper floor, use that floor's layout for collision
      if (this.currentFloor > 0 && this.insideBuilding) {
        const tile = this._getUpperFloorTile(tx, ty);
        if (!tile) return true;       // void / out of building = blocked
        if (tile.blocked) return true;
        continue;
      }

      if (this.blocked.has(tileKey(tx, ty))) {
        return true;
      }
    }

    return false;
  }

  isSafeZone(worldX, worldY) {
    for (const zone of this.safeZones) {
      const x1 = zone.x * this.tileSize;
      const y1 = zone.y * this.tileSize;
      const x2 = (zone.x + zone.w) * this.tileSize;
      const y2 = (zone.y + zone.h) * this.tileSize;
      if (worldX >= x1 && worldX <= x2 && worldY >= y1 && worldY <= y2) {
        return true;
      }
    }
    return false;
  }

  getWorldWidth() {
    return this.width * this.tileSize;
  }

  getWorldHeight() {
    return this.height * this.tileSize;
  }

  worldToTile(worldX, worldY) {
    return {
      x: clamp(Math.floor(worldX / this.tileSize), 0, this.width - 1),
      y: clamp(Math.floor(worldY / this.tileSize), 0, this.height - 1)
    };
  }

  /**
   * Check if a world-space point overlaps any portal, return portal data or null.
   */
  getPortalAt(worldX, worldY) {
    const ts = this.tileSize;
    for (const portal of this.portals) {
      const px = portal.x * ts;
      const py = portal.y * ts;
      const pw = portal.w * ts;
      const ph = portal.h * ts;
      if (worldX >= px && worldX < px + pw && worldY >= py && worldY < py + ph) {
        return portal;
      }
    }
    return null;
  }

  /**
   * Check if the player is standing on stairs and handle floor transitions.
   * "stairs" tiles go UP one floor, "stairsDown" tiles go DOWN one floor.
   * Requires the player to step off and back on to use stairs again.
   * Call this each frame from Game.update().
   */
  checkStairs(worldX, worldY, _dt) {
    const tile = this.worldToTile(worldX, worldY);

    // Determine which tile the player is on — check upper floor grid first
    let tileName;
    if (this.currentFloor > 0 && this.insideBuilding) {
      const upperTile = this._getUpperFloorTile(tile.x, tile.y);
      tileName = upperTile ? upperTile.name : null;
    } else {
      const idx = this.terrain[tile.y]?.[tile.x] ?? 0;
      tileName = this.tilePalette[idx]?.name;
    }

    const onStairsUp = tileName === "stairs";
    const onStairsDown = tileName === "stairsDown";

    // Require stepping off before triggering again
    if (!onStairsUp && !onStairsDown) {
      this._onStairs = false;
      return null;
    }
    if (this._onStairs) return null;

    // Find which building this stair tile belongs to
    for (const bld of this.buildings) {
      if (bld.floors <= 1) continue;
      const localX = tile.x - bld.ox;
      const localY = tile.y - bld.oy;
      if (localX < 0 || localY < 0) continue;

      // Check bounds against current floor grid (upper floors can be larger than ground)
      if (this.currentFloor > 0) {
        const curGrid = bld.upperFloors[this.currentFloor - 1];
        if (!curGrid || localY >= curGrid.length || localX >= (curGrid[localY]?.length || 0)) continue;
      } else {
        if (localX >= bld.cols || localY >= bld.rows) continue;
      }

      if (onStairsUp && this.currentFloor < bld.upperFloors.length) {
        // Go up one floor — player stays at same position
        this.currentFloor++;
        this.insideBuilding = bld;
        this._onStairs = true;
        return { action: "up", floor: this.currentFloor, building: bld.name };
      } else if (onStairsDown && this.currentFloor > 0) {
        // Go down one floor — player stays at same position
        this.currentFloor--;
        if (this.currentFloor === 0) this.insideBuilding = null;
        else this.insideBuilding = bld;
        this._onStairs = true;
        return { action: "down", floor: this.currentFloor, building: bld.name };
      }
    }
    return null;
  }

  /**
   * Get the upper-floor tile at a world position, or null if not on upper floor.
   */
  _getUpperFloorTile(tileX, tileY) {
    if (this.currentFloor === 0 || !this.insideBuilding) return null;
    const bld = this.insideBuilding;
    const lx = tileX - bld.ox;
    const ly = tileY - bld.oy;
    const floorGrid = bld.upperFloors[this.currentFloor - 1];
    if (!floorGrid) return null;
    if (ly < 0 || ly >= floorGrid.length || lx < 0 || lx >= floorGrid[0].length) return null;
    const idx = floorGrid[ly][lx];
    if (idx < 0) return null; // skip tile (void)
    return this.tilePalette[idx] || null;
  }

  drawTerrain(ctx, camera, canvas, sprites) {
    const ts = this.tileSize;
    const startX = clamp(Math.floor(camera.x / ts) - 1, 0, this.width - 1);
    const endX = clamp(Math.ceil((camera.x + canvas.width) / ts) + 1, 0, this.width - 1);
    const startY = clamp(Math.floor(camera.y / ts) - 1, 0, this.height - 1);
    const endY = clamp(Math.ceil((camera.y + canvas.height) / ts) + 1, 0, this.height - 1);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const idx = this.terrain[y]?.[x] ?? 0;
        const tile = this.tilePalette[idx];
        if (!tile) continue;

        const dx = x * ts - camera.x;
        const dy = y * ts - camera.y;

        const img = sprites && sprites.get(`tiles/${tile.name}`);
        if (img) {
          ctx.drawImage(img, dx, dy, ts, ts);
        } else {
          ctx.fillStyle = this._tileColor(tile.color, x, y);
          ctx.fillRect(dx, dy, ts, ts);
        }
      }
    }

    // Draw portal indicators
    const portalImg = sprites && sprites.get("props/portal");
    for (const portal of this.portals) {
      const px = portal.x * ts - camera.x;
      const py = portal.y * ts - camera.y;
      const pw = portal.w * ts;
      const ph = portal.h * ts;

      if (px + pw < 0 || px > canvas.width || py + ph < 0 || py > canvas.height) continue;

      if (portalImg) {
        // Tile the portal sprite across the portal area
        for (let ty = 0; ty < portal.h; ty++) {
          for (let tx = 0; tx < portal.w; tx++) {
            ctx.drawImage(portalImg, px + tx * ts, py + ty * ts, ts, ts);
          }
        }
      } else {
        ctx.fillStyle = "rgba(100, 180, 255, 0.15)";
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = "rgba(100, 180, 255, 0.5)";
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(px, py, pw, ph);
        ctx.setLineDash([]);
      }

      if (portal.label) {
        ctx.fillStyle = "rgba(200, 230, 255, 0.8)";
        ctx.font = "11px Trebuchet MS";
        ctx.textAlign = "center";
        ctx.fillText(portal.label, px + pw / 2, py - 4);
      }
    }

    // ── Upper floor overlay ──────────────────────────
    if (this.currentFloor > 0 && this.insideBuilding) {
      const bld = this.insideBuilding;
      const floorGrid = bld.upperFloors[this.currentFloor - 1];
      if (floorGrid) {
        // Darken the entire screen
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw upper floor tiles
        for (let r = 0; r < floorGrid.length; r++) {
          for (let c = 0; c < floorGrid[r].length; c++) {
            const idx = floorGrid[r][c];
            if (idx < 0) continue; // void/skip
            const tile = this.tilePalette[idx];
            if (!tile) continue;
            const dx = (bld.ox + c) * ts - camera.x;
            const dy = (bld.oy + r) * ts - camera.y;

            const img = sprites && sprites.get(`tiles/${tile.name}`);
            if (img) {
              ctx.drawImage(img, dx, dy, ts, ts);
            } else {
              ctx.fillStyle = this._tileColor(tile.color, bld.ox + c, bld.oy + r);
              ctx.fillRect(dx, dy, ts, ts);
            }
          }
        }
      }
    }
  }

  drawObjects(ctx, camera, canvas, sprites) {
    const minX = camera.x - this.tileSize;
    const maxX = camera.x + canvas.width + this.tileSize;
    const minY = camera.y - this.tileSize;
    const maxY = camera.y + canvas.height + this.tileSize;

    for (const prop of this.ambientProps) {
      if (prop.x < minX || prop.x > maxX || prop.y < minY || prop.y > maxY) continue;

      const px = prop.x - camera.x;
      const py = prop.y - camera.y;

      const img = sprites && sprites.get(`props/${prop.type}`);
      if (img) {
        ctx.drawImage(img, px - img.width / 2, py - img.height / 2);
      } else if (prop.type === "flower") {
        ctx.fillStyle = "#f2b8d7";
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (prop.type === "mushroom") {
        ctx.fillStyle = "#c97a5e";
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#808a8d";
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Building name labels & floor badges (tiles already rendered in terrain)
    for (const building of this.buildings) {
      if (building.x > maxX || building.x + building.w < minX ||
          building.y > maxY || building.y + building.h < minY) continue;

      const drawX = building.x - camera.x;
      const drawY = building.y - camera.y;

      // Building name label (above building)
      if (building.name) {
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        const labelX = drawX + building.w / 2;
        const labelY = drawY - 6;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillText(building.name, labelX + 1, labelY + 1);
        ctx.fillStyle = "#f0e6d0";
        ctx.fillText(building.name, labelX, labelY);
        ctx.textAlign = "left";
      }

      // Floor badge (for multi-story)
      if (building.floors > 1) {
        const badgeText = building.floors + "F";
        const badgeX = drawX + building.w - 18;
        const badgeY = drawY + 14;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(badgeX - 2, badgeY - 10, 20, 14);
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = "#ffd080";
        ctx.fillText(badgeText, badgeX, badgeY);
      }
    }

    for (const tree of this.trees) {
      if (tree.x < minX || tree.x > maxX || tree.y < minY || tree.y > maxY) continue;

      const x = tree.x - camera.x;
      const y = tree.y - camera.y;

      // Pick tree sprite variant based on tint
      const treeKey = this._treeVariant(tree.tint);
      const img = sprites && sprites.get(`props/${treeKey}`);
      if (img) {
        ctx.drawImage(img, x - img.width / 2, y - img.height / 2 + 4);
      } else {
        ctx.fillStyle = "#4d311f";
        ctx.fillRect(x - 4, y + 8, 8, 14);
        ctx.fillStyle = tree.tint;
        ctx.beginPath();
        ctx.arc(x, y, tree.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.arc(x - tree.radius * 0.25, y - tree.radius * 0.2, tree.radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _treeVariant(tint) {
    if (!tint || tint === "#2c4f2f") return "tree_default";
    // Match to closest variant
    const r = parseInt(tint.slice(1, 3), 16);
    const g = parseInt(tint.slice(3, 5), 16);
    if (r > 100) return "tree_autumn";
    if (g > 80) return "tree_light";
    if (g < 50) return "tree_dark";
    return "tree_default";
  }

  _tileColor(rgb, x, y) {
    const jitter = ((x * 17 + y * 29) % 7) - 3;
    return `rgb(${rgb[0] + jitter}, ${rgb[1] + jitter}, ${rgb[2] + jitter})`;
  }
}