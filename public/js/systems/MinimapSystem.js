/**
 * MinimapSystem — renders a corner minimap and a toggleable full map overlay.
 *
 * Minimap (bottom-right):  shows nearby terrain, enemies (red), player (white).
 * Full map (M key toggle): shows entire map with player, portals, waystones,
 *                          quest-giving NPCs.
 *
 * Both are drawn to off-screen canvases and composited each frame.
 */
export class MinimapSystem {
  constructor(game) {
    this.game = game;

    // ── Minimap settings ──
    this.miniSize = 160;          // px square
    this.miniScale = 3;           // pixels per map-tile on minimap
    this.miniCanvas = document.createElement("canvas");
    this.miniCanvas.width = this.miniSize;
    this.miniCanvas.height = this.miniSize;
    this.miniCtx = this.miniCanvas.getContext("2d");

    // ── Full-map settings ──
    this.fullMapOpen = false;
    this.fullCanvas = document.createElement("canvas");
    this.fullCtx = this.fullCanvas.getContext("2d");

    // Pre-rendered terrain image (regenerated on map load)
    this._terrainImg = null;
    this._terrainMapId = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Terrain cache                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Build a 1-pixel-per-tile image of the entire map terrain.
   * Called once per map load.
   */
  _buildTerrainImage() {
    const world = this.game.world;
    if (!world || !world.terrain || !world.tilePalette) return;
    if (this._terrainMapId === world.mapId) return; // already cached

    const w = world.width;
    const h = world.height;
    const cvs = document.createElement("canvas");
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext("2d");
    const imgData = ctx.createImageData(w, h);
    const d = imgData.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = world.terrain[y]?.[x] ?? 0;
        const tile = world.tilePalette[idx];
        const c = tile ? tile.color : [60, 60, 60];
        const off = (y * w + x) * 4;
        d[off] = c[0];
        d[off + 1] = c[1];
        d[off + 2] = c[2];
        d[off + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    this._terrainImg = cvs;
    this._terrainMapId = world.mapId;
  }

  /* ------------------------------------------------------------------ */
  /*  Minimap (corner)                                                   */
  /* ------------------------------------------------------------------ */

  drawMinimap(ctx, canvasW, canvasH) {
    this._buildTerrainImage();
    if (!this._terrainImg) return;

    const world = this.game.world;
    const player = this.game.entities.player;
    const ts = world.tileSize;
    const ptx = Math.floor(player.x / ts);
    const pty = Math.floor(player.y / ts);
    const scale = this.miniScale;

    // How many tiles fit in the minimap at this scale
    const tilesVisible = Math.ceil(this.miniSize / scale);
    const half = Math.floor(tilesVisible / 2);

    // Source rect in tile coords (centered on player)
    const sx = ptx - half;
    const sy = pty - half;

    const mCtx = this.miniCtx;
    mCtx.clearRect(0, 0, this.miniSize, this.miniSize);

    // Fill background (for out-of-bounds)
    mCtx.fillStyle = "#111";
    mCtx.fillRect(0, 0, this.miniSize, this.miniSize);

    // Draw terrain snippet scaled up
    mCtx.imageSmoothingEnabled = false;
    mCtx.drawImage(
      this._terrainImg,
      Math.max(sx, 0), Math.max(sy, 0),
      tilesVisible, tilesVisible,
      (Math.max(sx, 0) - sx) * scale,
      (Math.max(sy, 0) - sy) * scale,
      tilesVisible * scale, tilesVisible * scale
    );

    // ── Draw enemies (red dots) ──
    const enemies = this.game.entities.enemies || [];
    for (const e of enemies) {
      if (e.dead) continue;
      const etx = Math.floor(e.x / ts);
      const ety = Math.floor(e.y / ts);
      const dx = (etx - sx) * scale;
      const dy = (ety - sy) * scale;
      if (dx < 0 || dy < 0 || dx >= this.miniSize || dy >= this.miniSize) continue;
      mCtx.fillStyle = "#ff3333";
      mCtx.fillRect(dx - 1, dy - 1, 3, 3);
    }

    // ── Draw other players (cyan dots) ──
    const others = this.game.entities.remotePlayers || [];
    for (const op of others) {
      const otx = Math.floor(op.x / ts);
      const oty = Math.floor(op.y / ts);
      const dx = (otx - sx) * scale;
      const dy = (oty - sy) * scale;
      if (dx < 0 || dy < 0 || dx >= this.miniSize || dy >= this.miniSize) continue;
      mCtx.fillStyle = "#44ddff";
      mCtx.fillRect(dx - 1, dy - 1, 3, 3);
    }

    // ── Player dot (white, center) ──
    const px = half * scale;
    const py = half * scale;
    mCtx.fillStyle = "#ffffff";
    mCtx.fillRect(px - 2, py - 2, 5, 5);

    // ── Composite minimap onto main canvas ──
    const margin = 10;
    const destX = canvasW - this.miniSize - margin;
    const destY = canvasH - this.miniSize - margin;

    // Border
    ctx.save();
    ctx.fillStyle = "rgba(10, 8, 4, 0.85)";
    ctx.fillRect(destX - 3, destY - 3, this.miniSize + 6, this.miniSize + 6);
    ctx.strokeStyle = "rgba(226, 194, 133, 0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(destX - 3, destY - 3, this.miniSize + 6, this.miniSize + 6);

    ctx.drawImage(this.miniCanvas, destX, destY);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  Full map overlay                                                   */
  /* ------------------------------------------------------------------ */

  toggle() {
    this.fullMapOpen = !this.fullMapOpen;
  }

  drawFullMap(ctx, canvasW, canvasH) {
    if (!this.fullMapOpen) return;
    this._buildTerrainImage();
    if (!this._terrainImg) return;

    const world = this.game.world;
    const player = this.game.entities.player;
    const ts = world.tileSize;

    // Map dimensions
    const mapW = world.width;
    const mapH = world.height;

    // Fit map into ~80% of screen, maintain aspect ratio
    const maxW = canvasW * 0.8;
    const maxH = canvasH * 0.8;
    const mapScale = Math.min(maxW / mapW, maxH / mapH);
    const drawW = Math.floor(mapW * mapScale);
    const drawH = Math.floor(mapH * mapScale);
    const ox = Math.floor((canvasW - drawW) / 2);
    const oy = Math.floor((canvasH - drawH) / 2);

    // Darken background
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Panel background
    ctx.fillStyle = "rgba(18, 14, 8, 0.92)";
    ctx.fillRect(ox - 4, oy - 28, drawW + 8, drawH + 36);
    ctx.strokeStyle = "rgba(226, 194, 133, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox - 4, oy - 28, drawW + 8, drawH + 36);

    // Title
    ctx.fillStyle = "#e2c285";
    ctx.font = "bold 14px Trebuchet MS";
    ctx.textAlign = "center";
    const mapName = world.mapId ? world.mapId.charAt(0).toUpperCase() + world.mapId.slice(1) : "Map";
    ctx.fillText(mapName, canvasW / 2, oy - 10);

    // Draw terrain image scaled
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._terrainImg, ox, oy, drawW, drawH);

    // Helper: tile to screen coords on the full map
    const t2s = (tx, ty) => ({
      x: ox + tx * mapScale,
      y: oy + ty * mapScale
    });

    // ── Safe zones (light outline) ──
    for (const sz of world.safeZones || []) {
      const p1 = t2s(sz.x1, sz.y1);
      const p2 = t2s(sz.x2, sz.y2);
      ctx.strokeStyle = "rgba(100, 200, 100, 0.3)";
      ctx.lineWidth = 1;
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    }

    // ── Portals (blue diamonds) ──
    for (const p of world.portals || []) {
      const pos = t2s(p.x + p.w / 2, p.y + p.h / 2);
      this._drawDiamond(ctx, pos.x, pos.y, 6, "#4488ff");
      ctx.fillStyle = "#aaccff";
      ctx.font = "10px Trebuchet MS";
      ctx.textAlign = "center";
      const label = p.label || ("→ " + (p.targetMap || "?"));
      ctx.fillText(label, pos.x, pos.y - 9);
    }

    // ── Waystones (green diamonds) ──
    const statues = this.game.entities.statues || [];
    for (const s of statues) {
      const pos = t2s(s.x / ts, s.y / ts);
      this._drawDiamond(ctx, pos.x, pos.y, 5, "#44dd66");
      ctx.fillStyle = "#aaffbb";
      ctx.font = "9px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(s.name, pos.x, pos.y - 8);
    }

    // ── Quest NPCs ──
    const npcs = this.game.entities.npcs || [];
    for (const npc of npcs) {
      if (!npc.questIds || npc.questIds.length === 0) continue;
      const marker = this._getFullQuestMarker(npc);
      if (!marker) continue;
      const pos = t2s(npc.x / ts, npc.y / ts);
      ctx.fillStyle = marker.color;
      ctx.font = "bold 14px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(marker.symbol, pos.x, pos.y - 4);
      ctx.fillStyle = "#ddd";
      ctx.font = "9px Trebuchet MS";
      ctx.fillText(npc.name, pos.x, pos.y + 10);
    }

    // ── Player position (white blinking dot) ──
    const pp = t2s(player.x / ts, player.y / ts);
    const blink = Math.sin(Date.now() / 200) > 0;
    ctx.fillStyle = blink ? "#ffffff" : "#cccccc";
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.stroke();

    // ── Legend ──
    const lx = ox + 6;
    let ly = oy + drawH - 54;
    ctx.font = "10px Trebuchet MS";
    ctx.textAlign = "left";
    const legend = [
      ["#ffffff", "● You"],
      ["#4488ff", "◆ Portal"],
      ["#44dd66", "◆ Waystone"],
      ["#ffcc00", "! Available"],
      ["#aaaaaa", "… In Progress"],
      ["#44dd66", "? Turn In"],
    ];
    for (const [color, text] of legend) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(lx - 2, ly - 9, 72, 13);
      ctx.fillStyle = color;
      ctx.fillText(text, lx, ly);
      ly += 14;
    }

    // Close hint
    ctx.fillStyle = "rgba(200,180,140,0.6)";
    ctx.font = "11px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("Press M to close", canvasW / 2, oy + drawH + 14);

    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Extended quest marker: returns {symbol, color} for any quest state,
   * not just available/turn-in.
   */
  _getFullQuestMarker(npc) {
    const qs = this.game.quests;
    const questIds = npc.questIds || [];
    let hasAvailable = false;
    let hasActive = false;

    for (const qid of questIds) {
      const state = qs.quests[qid];
      if (state?.state === "ready_to_turn_in") return { symbol: "?", color: "#44dd66" };
      if (state?.state === "active") { hasActive = true; continue; }
      if (state?.state === "completed") continue;
      if (qs.canStartQuest(qid)) hasAvailable = true;
    }

    if (hasAvailable) return { symbol: "!", color: "#ffcc00" };
    if (hasActive) return { symbol: "…", color: "#aaaaaa" };
    return null;
  }

  _drawDiamond(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /**
   * Invalidate the terrain cache (call on map change).
   */
  invalidate() {
    this._terrainMapId = null;
    this._terrainImg = null;
  }
}
