/**
 * ServerWorld – authoritative server-side game state.
 * Manages enemies (AI, respawn), combat resolution, loot drops,
 * and connected players. Broadcasts state at a fixed tick rate.
 */

const fs = require("fs");
const path = require("path");

/* ── load data from JSON files ─────────────────────────── */

const dataDir = path.join(__dirname, "..", "public", "data");

function loadDataFile(filename) {
  const filePath = path.join(dataDir, filename);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`[ServerWorld] Failed to load ${filename}: ${err.message}`);
    throw new Error(`Data file '${filename}' is missing or corrupted.`);
  }
}

const ITEMS = loadDataFile("items.json");
const ENEMY_TYPES = loadDataFile("enemies.json");
const QUEST_DEFS = loadDataFile("quests.json");
const SKILLS = loadDataFile("skills.json");
const GLOBAL_PALETTE = loadDataFile("tilePalette.json");
const PROP_DEFS = loadDataFile("props.json");
const RESOURCE_NODE_DEFS = loadDataFile("resourceNodes.json");
const GATHERING_SKILLS = loadDataFile("gatheringSkills.json");
const RECIPES = loadDataFile("recipes.json");
const AOE_PATTERNS = loadDataFile("aoePatterns.json");
const PARTY_CONFIG = loadDataFile("party.json");
const PVP_CONFIG = loadDataFile("pvp.json");
const THEME = loadDataFile("theme.json");

/* Shared player base stats — single source of truth for client + server */
const PLAYER_BASE_DATA = loadDataFile("playerBase.json");
const PLAYER_BASE = PLAYER_BASE_DATA.defaults;
const CLASSES = PLAYER_BASE_DATA.classes || {};

function classStats(classId) {
  const cls = CLASSES[classId] || {};
  return { ...PLAYER_BASE, ...cls };
}

function loadMap(mapId) {
  const data = JSON.parse(fs.readFileSync(path.join(dataDir, "maps", `${mapId}.json`), "utf8"));
  // Resolve palette string refs into full tile objects
  if (data.palette && !data.tilePalette) {
    data.tilePalette = data.palette.map(name => {
      const entry = GLOBAL_PALETTE[name];
      return entry ? { name, ...entry } : { name, color: [128, 128, 128], blocked: false };
    });
  }
  return data;
}

/* ── utilities ───────────────────────────────────────────── */

function dist(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalize(x, y) {
  const len = Math.sqrt(x * x + y * y);
  return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randRange(min, max) {
  return Math.random() * (max - min) + min;
}

function chance(prob) {
  return Math.random() < prob;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function tileKey(x, y) {
  return `${x},${y}`;
}

/* ── AoE pattern helpers ─────────────────────────────────── */

/**
 * Rotate a tile offset [dx, dy] by the given direction index (0–7).
 * Direction 0 = north (no rotation), increments clockwise by 45°.
 */
function rotateTileOffset(dx, dy, dirIndex) {
  // 90° rotations are exact; 45° rotations use √2/2 with rounding
  const S = Math.SQRT2 / 2; // 0.7071067811865476
  switch (dirIndex) {
    case 0: return [dx, dy];                                                       // N
    case 1: return [Math.round((dx - dy) * S), Math.round((dx + dy) * S)]; // NE
    case 2: return [-dy, dx];                                                      // E
    case 3: return [Math.round((-dx - dy) * S), Math.round((dx - dy) * S)]; // SE  (= 90+45)
    case 4: return [-dx, -dy];                                                     // S
    case 5: return [Math.round((-dx + dy) * S), Math.round((-dx - dy) * S)]; // SW
    case 6: return [dy, -dx];                                                      // W
    case 7: return [Math.round((dx + dy) * S), Math.round((-dx + dy) * S)]; // NW  (= 270+45)
    default: return [dx, dy];
  }
}

/**
 * Get the 8-direction index (0=N, 1=NE, 2=E, ... 7=NW) from a direction vector.
 */
function directionIndex(dx, dy) {
  const angle = Math.atan2(dx, -dy); // 0 = north, CW positive
  const idx = Math.round(angle / (Math.PI / 4));
  return ((idx % 8) + 8) % 8;
}

/**
 * Resolve an AoE pattern into a Set of "tx,ty" tile keys.
 * @param {Object} pattern — entry from AOE_PATTERNS
 * @param {number} originTx — tile X of the pattern origin
 * @param {number} originTy — tile Y of the pattern origin
 * @param {number} [dirIdx] — 8-direction index for directional patterns
 * @returns {Set<string>}
 */
function resolveAoeTiles(pattern, originTx, originTy, dirIdx) {
  const tiles = new Set();
  for (const [dx, dy] of pattern.tiles) {
    let rx = dx, ry = dy;
    if (pattern.directional && dirIdx != null) {
      [rx, ry] = rotateTileOffset(dx, dy, dirIdx);
    }
    tiles.add(tileKey(originTx + rx, originTy + ry));
  }
  return tiles;
}

/* ═══════════════════════════════════════════════════════════
   COLLISION MAP (built from map JSON data)
   ═══════════════════════════════════════════════════════════ */

class CollisionMap {
  constructor(mapData) {
    this.blocked = new Set();
    this.tileSize = mapData.tileSize || 48;
    this.mapWidth = mapData.width;
    this.mapHeight = mapData.height;

    // Spawn point (tile coords → world coords, validated)
    const sp = mapData.spawnPoint || [0, 0];
    const spx = Math.max(0, Math.min(sp[0], (this.mapWidth || 1) - 1));
    const spy = Math.max(0, Math.min(sp[1], (this.mapHeight || 1) - 1));
    this.spawnPoint = { x: spx * this.tileSize + this.tileSize / 2, y: spy * this.tileSize + this.tileSize / 2 };

    // Safe zones from map data (tile coords: x1, y1, x2, y2)
    this.safeZones = (mapData.safeZones || []).map(sz => ({
      x1: sz.x1 * this.tileSize,
      y1: sz.y1 * this.tileSize,
      x2: sz.x2 * this.tileSize,
      y2: sz.y2 * this.tileSize
    }));

    // Store building data for upper-floor collision
    this.buildings = (mapData.buildings || []).map(b => ({
      ox: b.x,
      oy: b.y,
      cols: b.w,
      rows: b.h,
      floors: b.floors || 1,
      upperFloors: b.upperFloors || []
    }));
    this.tilePalette = mapData.tilePalette || [];

    this.buildFromMapData(mapData);
  }

  buildFromMapData(data) {
    const palette = data.tilePalette || [];
    const terrain = data.terrain || [];

    // Block tiles based on palette blocked flag
    for (let y = 0; y < terrain.length; y++) {
      const row = terrain[y];
      for (let x = 0; x < row.length; x++) {
        const idx = row[x];
        if (palette[idx] && palette[idx].blocked) {
          this.blocked.add(tileKey(x, y));
        }
      }
    }

    // Extra blocked tiles (stored as [x, y] pairs)
    for (const entry of (data.extraBlocked || [])) {
      if (Array.isArray(entry)) {
        this.blocked.add(tileKey(entry[0], entry[1]));
      } else {
        this.blocked.add(entry);
      }
    }

    // Buildings are now tile-based (walls blocked via palette), no rectangle blocking needed

    // Props (including trees) — blocked per props.json definition
    this.blockedByFloor = {};   // floor → Set of tileKeys (non-ground floors)
    for (const p of (data.props || [])) {
      const def = PROP_DEFS[p.type];
      if (!def?.blocked) continue;
      const floor = p.floor || 0;
      if (floor === 0) {
        this.blocked.add(tileKey(p.tx, p.ty));
      } else {
        if (!this.blockedByFloor[floor]) this.blockedByFloor[floor] = new Set();
        this.blockedByFloor[floor].add(tileKey(p.tx, p.ty));
      }
    }

    // Tile modifier zones (invisible buffs/debuffs/hazards)
    this.tileModifiers = new Map();  // "tx,ty,floor" → modifiers[]
    for (const zone of (data.tileModifiers || [])) {
      const floor = zone.floor || 0;
      const key = `${zone.x},${zone.y},${floor}`;
      this.tileModifiers.set(key, zone.modifiers || []);
    }
  }

  isBlocked(worldX, worldY, radius = 15, floor = 0) {
    const checks = [
      [0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius],
      [radius * 0.7, radius * 0.7], [-radius * 0.7, radius * 0.7],
      [radius * 0.7, -radius * 0.7], [-radius * 0.7, -radius * 0.7]
    ];
    for (const [dx, dy] of checks) {
      const tx = Math.floor((worldX + dx) / this.tileSize);
      const ty = Math.floor((worldY + dy) / this.tileSize);
      if (tx < 0 || ty < 0 || tx >= this.mapWidth || ty >= this.mapHeight) return true;

      if (floor > 0) {
        // Check upper-floor grid collision
        const tile = this._getUpperFloorTile(tx, ty, floor);
        if (!tile) return true;       // out of building / void = blocked
        if (tile.blocked) return true;
        // Also check floor-specific prop blocking
        const floorBlocked = this.blockedByFloor[floor];
        if (floorBlocked && floorBlocked.has(tileKey(tx, ty))) return true;
      } else {
        if (this.blocked.has(tileKey(tx, ty))) return true;
      }
    }
    return false;
  }

  _getUpperFloorTile(tileX, tileY, floor) {
    for (const bld of this.buildings) {
      if (bld.floors <= 1) continue;
      const grid = bld.upperFloors[floor - 1];
      if (!grid) continue;
      const lx = tileX - bld.ox;
      const ly = tileY - bld.oy;
      if (ly < 0 || ly >= grid.length || lx < 0 || lx >= (grid[ly]?.length || 0)) continue;
      const idx = grid[ly][lx];
      if (idx < 0) return null;
      return this.tilePalette[idx] || null;
    }
    return null;  // not inside any building
  }

  isSafeZone(wx, wy) {
    for (const sz of this.safeZones) {
      if (wx >= sz.x1 && wx <= sz.x2 && wy >= sz.y1 && wy <= sz.y2) return true;
    }
    return false;
  }

  /** Return modifier array for the tile at world coords, or null. */
  getTileModifiers(worldX, worldY, floor = 0) {
    const tx = Math.floor(worldX / this.tileSize);
    const ty = Math.floor(worldY / this.tileSize);
    return this.tileModifiers.get(`${tx},${ty},${floor}`) || null;
  }
}

/* ═══════════════════════════════════════════════════════════
   SERVER WORLD
   ═══════════════════════════════════════════════════════════ */

let nextPlayerId = 1;
let enemyIdCounter = 1;
let dropIdCounter = 1;
let resourceNodeIdCounter = 1;

class ServerWorld {
  constructor() {
    // Load all maps
    this.maps = new Map();       // mapId → { data, collision, enemies[], drops[] }
    for (const mapId of ["eldengrove", "darkwood", "moonfall_cavern", "southmere", "stonegate","titanreach","magical_tower"]) {
      const data = loadMap(mapId);
      const collision = new CollisionMap(data);
      const enemies = this._createEnemiesForMap(data, collision);
      const resourceNodes = this._createResourceNodesForMap(data, collision);
      this.maps.set(mapId, { _mapId: mapId, data, collision, enemies, drops: [], projectiles: [], resourceNodes });
    }

    this.defaultMapId = THEME.defaultMap || "eldengrove";
    this.players = new Map();   // playerId → PlayerState
    this._usernameIndex = new Map(); // username → PlayerState (O(1) lookup)
    this._nextPartyId = 1;
    this.parties = new Map();   // partyId → { id, leader, members: Set<playerId>, pendingInvites: Map<targetId, targetName> }
    this._nextProjId = 1;
    this.tickRate = 60;         // Hz
    this.tickInterval = null;
    this.lastTick = Date.now();
    this.tickCount = 0;          // monotonic counter sent with every state
  }

  /* ── lifecycle ──────────────────────────────────────── */

  start() {
    const msPerTick = 1000 / this.tickRate;
    let nextTickTime = Date.now() + msPerTick;

    const step = () => {
      this.tick();

      // Self-correcting timer: compensate for drift so the long-term
      // average stays exactly at the target interval (50 ms for 20 Hz).
      const now = Date.now();
      nextTickTime += msPerTick;
      const delay = Math.max(1, nextTickTime - now);
      this._tickTimer = setTimeout(step, delay);
    };

    this._tickTimer = setTimeout(step, msPerTick);
    console.log(`[ServerWorld] running at ${this.tickRate} ticks/sec`);
  }

  stop() {
    clearTimeout(this._tickTimer);
  }

  /* ── player management ──────────────────────────────── */

  addPlayer(ws, charData, username) {
    const id = `p${nextPlayerId++}`;

    // Restore saved map/position, or fall back to default spawn
    let mapId = this.defaultMapId;
    let spawnX, spawnY, spawnFloor = 0;

    if (charData.mapId && this.maps.has(charData.mapId) &&
        typeof charData.posX === "number" && charData.posX >= 0 &&
        typeof charData.posY === "number" && charData.posY >= 0) {
      mapId = charData.mapId;
      spawnX = charData.posX;
      spawnY = charData.posY;
      spawnFloor = charData.floor || 0;
    } else {
      const mapEntry = this.maps.get(mapId);
      spawnX = mapEntry.collision.spawnPoint.x;
      spawnY = mapEntry.collision.spawnPoint.y;
    }

    const mapEntry = this.maps.get(mapId);

    const level = Math.max(1, Math.min(100, Number(charData.level) || 1));
    const xp = Math.max(0, Number(charData.xp) || 0);
    const gold = Math.max(0, Number(charData.gold) || 12);

    const charClass = CLASSES[charData.charClass] ? charData.charClass : "warrior";
    const cs = classStats(charClass);

    // Scale stats by level using class-specific scaling
    const maxHp = cs.maxHp + (level - 1) * cs.hpPerLevel;
    const maxMana = cs.maxMana + (level - 1) * cs.manaPerLevel;
    const baseDamage = cs.damage + (level - 1) * cs.damagePerLevel;

    const state = {
      id,
      ws,
      username: username || null,
      partyId: null,
      mapId,
      charId: charData.id || null,
      name: String(charData.name || "Unknown").slice(0, 16),
      charClass,
      portrait: charData.portrait || "portrait_1",
      level,
      xp,
      gold,
      x: spawnX,
      y: spawnY,
      floor: spawnFloor,
      hp: clamp(Number(charData.hp) || maxHp, 1, maxHp),
      maxHp,
      mana: clamp(Number(charData.mana) || maxMana, 0, maxMana),
      maxMana,
      baseDamage,
      damage: baseDamage,
      attackRange: cs.attackRange,
      attackCooldown: cs.attackCooldown,
      lastAttackAt: 0,
      lastHealAt: 0,
      dead: false,
      deathUntil: 0,
      inventory: (() => {
        const raw = Array.isArray(charData.inventory) ? charData.inventory : [];
        const slots = new Array(20).fill(null);
        for (let i = 0; i < Math.min(raw.length, 20); i++) {
          const saved = raw[i];
          if (!saved) continue;
          // Reconcile with current template so reclassified items update
          const tpl = ITEMS[saved.id];
          if (tpl) {
            saved.type = tpl.type;
            saved.name = tpl.name;
            saved.icon = tpl.icon;
          }
          slots[i] = saved;
        }
        return slots;
      })(),
      equipment: (() => {
        const raw = (charData.equipment && typeof charData.equipment === "object") ? charData.equipment : {};
        // Migrate old 3-slot format → new 9-slot format
        const eq = {
          mainHand: raw.mainHand || raw.weapon || null,
          offHand: raw.offHand || null,
          armor: raw.armor || null,
          helmet: raw.helmet || null,
          pants: raw.pants || null,
          boots: raw.boots || null,
          ring1: raw.ring1 || null,
          ring2: raw.ring2 || null,
          amulet: raw.amulet || raw.trinket || null
        };
        // Reconcile equipped items with current templates
        for (const slot of Object.keys(eq)) {
          const it = eq[slot];
          if (!it) continue;
          const tpl = ITEMS[it.id];
          if (tpl) { it.type = tpl.type; it.name = tpl.name; it.icon = tpl.icon; }
        }
        return eq;
      })(),
      quests: (charData.quests && typeof charData.quests === "object") ? charData.quests : {},
      hearthstone: (charData.hearthstone && typeof charData.hearthstone === "object") ? charData.hearthstone : null,
      bank: (() => {
        const raw = Array.isArray(charData.bank) ? charData.bank : [];
        const slots = new Array(48).fill(null);
        for (let i = 0; i < Math.min(raw.length, 48); i++) {
          const saved = raw[i];
          if (!saved) continue;
          const tpl = ITEMS[saved.id];
          if (tpl) { saved.type = tpl.type; saved.name = tpl.name; saved.icon = tpl.icon; }
          slots[i] = saved;
        }
        return slots;
      })(),
      hotbar: (() => {
        const raw = Array.isArray(charData.hotbar) ? charData.hotbar : [];
        const slots = new Array(10).fill(null);
        // Default: slot 0 = attack, slot 1 = heal
        const defaults = [
          { type: "skill", skillId: "attack" },
          { type: "skill", skillId: "heal" },
          null, null, null, null, null, null, null, null
        ];
        for (let i = 0; i < 10; i++) slots[i] = raw[i] || defaults[i] || null;
        return slots;
      })(),
      casting: null,    // { type, startedAt, duration, data }
      gatheringSkills: (() => {
        const raw = (charData.gatheringSkills && typeof charData.gatheringSkills === "object") ? charData.gatheringSkills : {};
        // Ensure all gathering skills exist with defaults
        const skills = {};
        for (const skillId of Object.keys(GATHERING_SKILLS)) {
          skills[skillId] = { level: 1, xp: 0, ...(raw[skillId] || {}) };
        }
        return skills;
      })(),
      // PVP state
      pvpKills: Number(charData.pvpKills) || 0,
      pvpDeaths: Number(charData.pvpDeaths) || 0,
      pvpCombatUntil: 0,  // timestamp: combat timer preventing safe zone entry
    };

    this.players.set(id, state);
    if (state.username) this._usernameIndex.set(state.username, state);

    // Ensure player has a hearthstone (grant if missing)
    if (!state.inventory.some(s => s && s.id === "hearthstone")) {
      const emptySlot = state.inventory.indexOf(null);
      if (emptySlot !== -1) {
        const hs = ITEMS["hearthstone"];
        state.inventory[emptySlot] = { id: hs.id, name: hs.name, type: hs.type, icon: hs.icon };
      }
    }

    // Apply equipment bonuses on load
    this._recalcStats(state);

    // tell the new player about existing state on their map
    this.send(ws, {
      type: "welcome",
      playerId: id,
      mapId,
      tick: this.tickCount,
      tickRate: this.tickRate,
      enemies: this.enemySnapshot(mapId),
      players: this.otherPlayersSnapshot(id, mapId),
      drops: this.dropsSnapshot(mapId),
      inventory: state.inventory,
      equipment: state.equipment,
      level: state.level,
      xp: state.xp,
      xpToLevel: this._xpToLevelForLevel(state.level),
      gold: state.gold,
      quests: state.quests,
      hearthstone: state.hearthstone,
      bank: state.bank,
      hotbar: state.hotbar,
      hp: state.hp,
      maxHp: state.maxHp,
      mana: state.mana,
      maxMana: state.maxMana,
      gatheringSkills: state.gatheringSkills,
      resourceNodes: this.resourceNodeSnapshot(mapId),
      x: state.x,
      y: state.y,
      floor: state.floor || 0,
      pvpMode: mapEntry.data.pvpMode || "none",
      pvpKills: state.pvpKills || 0,
      pvpDeaths: state.pvpDeaths || 0,
      portrait: state.portrait
    });

    // tell everyone else on the same map a player joined
    this.broadcastToMap(mapId, {
      type: "player_joined",
      player: this.playerPublic(state)
    }, id);

    console.log(`[ServerWorld] ${state.name} (${id}) joined ${mapId}. Total: ${this.players.size}`);
    return id;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    const mapId = p?.mapId;

    // Clean up duel state
    if (p) {
      this._endDuel(p);
      this._clearDuelPending(p);
      // Also clear any pending duel FROM this player to someone else
      if (p._pendingDuelTarget) {
        const target = this.players.get(p._pendingDuelTarget);
        if (target) this._clearDuelPending(target);
      }
      // Clean up trade state
      this._cancelTrade(p);
      if (p._pendingTradeTarget) {
        const target = this.players.get(p._pendingTradeTarget);
        if (target) { this._clearTradePending(target); this.send(target.ws, { type: "trade_cancelled" }); }
      }
      if (p._pendingTradeFrom) {
        const from = this.players.get(p._pendingTradeFrom);
        if (from) { this._clearTradePending(from); this.send(from.ws, { type: "trade_cancelled" }); }
      }
      this._clearTradePending(p);
    }

    // Clean up party membership
    if (p && p.partyId) this._removeFromParty(p);

    // Save character progression to DB
    if (p && p.charId) {
      this._savePlayer(p);
    }

    this.players.delete(id);
    if (p && p.username) this._usernameIndex.delete(p.username);
    if (mapId) {
      this.broadcastToMap(mapId, { type: "player_left", playerId: id });
    } else {
      this.broadcast({ type: "player_left", playerId: id });
    }
    if (p) {
      console.log(`[ServerWorld] ${p.name} (${id}) left. Total: ${this.players.size}`);
    }
  }

  /* ── incoming messages from clients ─────────────────── */

  /* Load NPC data for shop validation */
  static _NPC_DATA = JSON.parse(fs.readFileSync(path.join(dataDir, "npcs.json"), "utf8"));

  handleMessage(playerId, msg) {
    const player = this.players.get(playerId);
    if (!player) return;

    // Global message rate limit (120 messages/sec per player, excluding moves)
    if (msg.type !== "move") {
      const now = Date.now();
      if (!player._msgRateStart || now - player._msgRateStart > 1000) {
        player._msgRateStart = now;
        player._msgRateCount = 0;
      }
      player._msgRateCount++;
      if (player._msgRateCount > 120) return;
    }

    switch (msg.type) {
      case "move":
        this.handleMove(player, msg);
        break;
      case "attack":
        this.handleAttack(player, msg);
        break;
      case "heal":
        this.handleHeal(player);
        break;
      case "chat":
        this.handleChat(player, msg);
        break;
      case "map_change":
        this.handleMapChange(player, msg);
        break;
      case "use_item":
        this.handleUseItem(player, msg);
        break;
      case "sell_item":
        this.handleSellItem(player, msg);
        break;
      case "buy_item":
        this.handleBuyItem(player, msg);
        break;
      case "equip_item":
        this.handleEquipItem(player, msg);
        break;
      case "unequip_item":
        this.handleUnequipItem(player, msg);
        break;
      case "complete_quest":
        this.handleCompleteQuest(player, msg);
        break;
      case "quest_state_update":
        this.handleQuestStateUpdate(player, msg);
        break;
      case "use_hearthstone":
        this.handleUseHearthstone(player, msg);
        break;
      case "cancel_hearthstone":
        this.handleCancelHearthstone(player);
        break;
      case "cancel_cast":
        this._interruptCast(player, "manual");
        break;
      case "attune_hearthstone":
        this.handleAttuneHearthstone(player, msg);
        break;
      case "bank_deposit":
        this.handleBankDeposit(player, msg);
        break;
      case "bank_withdraw":
        this.handleBankWithdraw(player, msg);
        break;
      case "hotbar_update":
        this.handleHotbarUpdate(player, msg);
        break;
      case "swap_items":
        this.handleSwapItems(player, msg);
        break;
      case "split_stack":
        this.handleSplitStack(player, msg);
        break;
      case "drop_item":
        this.handleDropItem(player, msg);
        break;
      case "loot_open":
        this.handleLootOpen(player, msg);
        break;
      case "loot_take":
        this.handleLootTake(player, msg);
        break;
      case "use_skill":
        this.handleUseSkill(player, msg);
        break;
      case "gather":
        this.handleGather(player, msg);
        break;
      case "craft":
        this.handleCraft(player, msg);
        break;
      case "dismantle_item":
        this.handleDismantleItem(player, msg);
        break;
      case "respawn":
        // client signals it's ready to respawn
        break;
      case "friend_request":
        this.handleFriendRequest(player, msg);
        break;
      case "friend_accept":
        this.handleFriendAccept(player, msg);
        break;
      case "friend_reject":
        this.handleFriendReject(player, msg);
        break;
      case "friend_remove":
        this.handleFriendRemove(player, msg);
        break;
      case "friend_list":
        this.handleFriendList(player);
        break;
      case "block_player":
        this.handleBlockPlayer(player, msg);
        break;
      case "unblock_player":
        this.handleUnblockPlayer(player, msg);
        break;
      case "block_list":
        this.handleBlockList(player);
        break;
      case "party_create":
        this.handlePartyCreate(player);
        break;
      case "party_invite":
        this.handlePartyInvite(player, msg);
        break;
      case "party_accept":
        this.handlePartyAccept(player, msg);
        break;
      case "party_decline":
        this.handlePartyDecline(player, msg);
        break;
      case "party_leave":
        this.handlePartyLeave(player);
        break;
      case "party_kick":
        this.handlePartyKick(player, msg);
        break;
      case "party_rescind":
        this.handlePartyRescind(player, msg);
        break;
      case "party_list":
        this.handlePartyList(player);
        break;
      case "pvp_stats":
        this.send(player.ws, {
          type: "pvp_stats",
          pvpKills: player.pvpKills || 0,
          pvpDeaths: player.pvpDeaths || 0
        });
        break;
      case "duel_challenge":
        this.handleDuelChallenge(player, msg);
        break;
      case "duel_accept":
        this.handleDuelAccept(player, msg);
        break;
      case "duel_decline":
        this.handleDuelDecline(player, msg);
        break;
      case "duel_cancel":
        this.handleDuelCancel(player);
        break;
      case "trade_request":
        this.handleTradeRequest(player, msg);
        break;
      case "trade_accept":
        this.handleTradeAccept(player, msg);
        break;
      case "trade_decline":
        this.handleTradeDecline(player, msg);
        break;
      case "trade_offer_update":
        this.handleTradeOfferUpdate(player, msg);
        break;
      case "trade_confirm":
        this.handleTradeConfirm(player);
        break;
      case "trade_cancel":
        this.handleTradeCancel(player);
        break;
      default:
        break;
    }
  }

  handleMove(player, msg) {
    if (player.dead) return;

    const x = Number(msg.x);
    const y = Number(msg.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const floor = Math.max(0, Math.min(10, Number(msg.floor) || 0));

    // Track sequence for client-side prediction reconciliation
    if (msg.seq !== undefined) player.lastAckSeq = msg.seq;

    // basic validation: don't teleport too far per tick
    // Allow larger jump when floor changes (stair teleport to partner stairs)
    // but only allow changing by 1 floor at a time
    const spdMult = this._getPlayerSpeedMult(player);
    const floorDiff = Math.abs(floor - player.floor);
    if (floorDiff > 1) return; // only allow adjacent floor changes
    const maxDist = (floor !== player.floor) ? 300 : Math.ceil(80 * spdMult);
    const d = dist(player.x, player.y, x, y);
    if (d > maxDist) return;

    // Don't allow moving into blocked tiles (use player's current map)
    const mapEntry = this.maps.get(player.mapId);
    if (mapEntry && !mapEntry.collision.isBlocked(x, y, 16, floor)) {
      // Also check that the path doesn't clip through walls diagonally
      if (floor === player.floor && d > 2) {
        const midX = (player.x + x) / 2;
        const midY = (player.y + y) / 2;
        if (mapEntry.collision.isBlocked(midX, midY, 16, floor)) return;
      }
      // PVP combat timer: prevent entering safe zones
      if (player.pvpCombatUntil > Date.now() && mapEntry.collision.isSafeZone(x, y)) {
        this.send(player.ws, { type: "pvp_safe_zone_blocked" });
        return;
      }
      player.x = x;
      player.y = y;
      player.floor = floor;
    }
  }

  handleMapChange(player, msg) {
    if (player.dead) return;
    const targetMapId = String(msg.mapId || "").slice(0, 32);
    const targetX = Number(msg.x);
    const targetY = Number(msg.y);

    if (!this.maps.has(targetMapId)) return;
    if (isNaN(targetX) || isNaN(targetY)) return;

    const oldMapId = player.mapId;
    const mapEntry = this.maps.get(oldMapId);
    if (!mapEntry) return;

    // Validate player is near a portal leading to the target map
    const tileSize = mapEntry.collision.tileSize || 48;
    const portals = mapEntry.data.portals || [];
    const nearPortal = portals.some(portal => {
      if (portal.targetMap !== targetMapId) return false;
      // Portals only accessible from ground floor (floor 0)
      if ((player.floor || 0) !== (portal.floor || 0)) return false;
      const portalCenterX = (portal.x + portal.w / 2) * tileSize;
      const portalCenterY = (portal.y + portal.h / 2) * tileSize;
      return dist(player.x, player.y, portalCenterX, portalCenterY) < tileSize * 5;
    });
    if (!nearPortal) return;

    // Notify old map players that this player left
    this.broadcastToMap(oldMapId, { type: "player_left", playerId: player.id }, player.id);

    // Clean up duel on map change
    this._endDuel(player);
    this._clearDuelPending(player);

    // Cancel trade on map change
    this._cancelTrade(player);
    this._clearTradePending(player);

    // Move player to new map
    player.mapId = targetMapId;
    player.x = targetX;
    player.y = targetY;
    player.floor = 0;

    // Send fresh state for new map
    const newMapEntry = this.maps.get(targetMapId);
    this.send(player.ws, {
      type: "map_changed",
      mapId: targetMapId,
      enemies: this.enemySnapshot(targetMapId),
      players: this.otherPlayersSnapshot(player.id, targetMapId),
      drops: this.dropsSnapshot(targetMapId),
      pvpMode: newMapEntry?.data.pvpMode || "none"
    });

    // Notify new map players
    this.broadcastToMap(targetMapId, {
      type: "player_joined",
      player: this.playerPublic(player)
    }, player.id);
  }

  handleAttack(player, msg) {
    if (player.dead) return;

    const now = Date.now();
    const cooldownMs = player.attackCooldown * 1000;
    if (now - player.lastAttackAt < cooldownMs) return;

    const mapEntry = this.maps.get(player.mapId);
    if (!mapEntry) return;

    // ── PVP attack ──
    if (msg.targetPlayerId) {
      const target = this.players.get(msg.targetPlayerId);
      if (!target || target.dead || target.mapId !== player.mapId) return;
      if (!this._canPvpAttack(player, target, mapEntry)) return;

      player.lastAttackAt = now;
      const weaponDef = player.equipment?.mainHand ? ITEMS[player.equipment.mainHand.id] : null;

      // Ranged PVP
      if (weaponDef?.range) {
        if (weaponDef.requiresQuiver) {
          const quiver = player.equipment.offHand;
          if (!quiver || quiver.type !== "quiver" || !(quiver.arrows > 0)) {
            this.send(player.ws, { type: "attack_result", ok: false, reason: "Out of arrows!" });
            return;
          }
          quiver.arrows--;
          this.send(player.ws, { type: "quiver_update", arrows: quiver.arrows, maxArrows: ITEMS[quiver.id]?.maxArrows || quiver.maxArrows || 50 });
        }
        const projId = this._nextProjId++;
        mapEntry.projectiles.push({
          id: projId, playerId: player.id, targetPlayerId: target.id,
          x: player.x, y: player.y, speed: 360,
          type: "pvp_attack",
          hitParticle: weaponDef.hitParticle || "hit_spark",
          hitSfx: weaponDef.hitSfx || "sword_hit",
        });
        this.broadcastToMap(player.mapId, {
          type: "projectile_spawn",
          attackerId: player.id,
          sx: player.x, sy: player.y,
          tx: target.x, ty: target.y,
          targetPlayerId: target.id,
          speed: 360,
          weaponId: player.equipment?.mainHand?.id || null,
        });
        this._setPvpCombatTimer(player, "attack", now);
        return;
      }

      // Melee PVP
      const d = dist(player.x, player.y, target.x, target.y);
      if (d > player.attackRange + 30) return;

      this._applyPvpDamage(player, target, mapEntry, now);
      return;
    }

    // ── PVE attack (existing) ──
    const enemy = mapEntry.enemies.find((e) => e.id === msg.enemyId);
    if (!enemy || enemy.dead) return;

    const d = dist(player.x, player.y, enemy.x, enemy.y);
    if (d > player.attackRange + 30) return; // allow small latency buffer

    player.lastAttackAt = now;
    const weaponDef = player.equipment?.mainHand ? ITEMS[player.equipment.mainHand.id] : null;

    // ── Ranged weapon — create server-side projectile, defer damage ──
    if (weaponDef?.range) {
      // Bow requires a quiver with arrows
      if (weaponDef.requiresQuiver) {
        const quiver = player.equipment.offHand;
        if (!quiver || quiver.type !== "quiver" || !(quiver.arrows > 0)) {
          this.send(player.ws, { type: "attack_result", ok: false, reason: "Out of arrows!" });
          return;
        }
        quiver.arrows--;
        // Notify client of updated arrow count
        this.send(player.ws, { type: "quiver_update", arrows: quiver.arrows, maxArrows: ITEMS[quiver.id]?.maxArrows || quiver.maxArrows || 50 });
      }

      const projId = this._nextProjId++;
      mapEntry.projectiles.push({
        id: projId, playerId: player.id, targetEnemyId: enemy.id,
        x: player.x, y: player.y, speed: 360,
        type: "attack",
        hitParticle: weaponDef.hitParticle || "hit_spark",
        hitSfx: weaponDef.hitSfx || "sword_hit",
      });
      this.broadcastToMap(player.mapId, {
        type: "projectile_spawn",
        attackerId: player.id,
        sx: player.x, sy: player.y,
        tx: enemy.x, ty: enemy.y,
        targetEnemyId: enemy.id,
        speed: 360,
        weaponId: player.equipment?.mainHand?.id || null,
      });
      return;
    }

    // ── Melee — immediate damage ──
    const dmgMult = this._getPlayerDamageMultiplier(player);
    const takenMult = this._getEnemyDamageTakenMult(enemy);
    const damage = Math.max(2, Math.round((player.damage + randInt(-2, 4)) * dmgMult * takenMult));
    enemy.hp -= damage;

    // tell attacker about the hit
    this.send(player.ws, {
      type: "attack_result",
      enemyId: enemy.id,
      damage,
      enemyHp: enemy.hp,
      enemyMaxHp: enemy.maxHp
    });

    // Broadcast visual effect to all OTHER players on this map
    this.broadcastToMap(player.mapId, {
      type: "combat_visual",
      attackerId: player.id,
      ax: player.x,
      ay: player.y,
      enemyId: enemy.id,
      ex: enemy.x,
      ey: enemy.y,
      weaponId: player.equipment?.mainHand?.id || null,
      isRanged: false,
      hitParticle: weaponDef?.hitParticle || "hit_spark",
      hitSfx: weaponDef?.hitSfx || "sword_hit",
      damage,
      enemyHp: enemy.hp,
      enemyMaxHp: enemy.maxHp
    }, player.id);

    if (enemy.hp <= 0) {
      enemy.hp = 0;
      this.killEnemy(enemy, player);
    }
  }

  /* ── PVP helpers ─────────────────────────────────────── */

  /**
   * Check if player can PVP attack target on the given map.
   */
  _canPvpAttack(attacker, target, mapEntry) {
    if (attacker.id === target.id) return false;
    if (target.dead) return false;
    const mapData = mapEntry.data;
    const pvpMode = mapData.pvpMode || "none";
    if (pvpMode === "none") return false;

    // Party immunity — can't hit party members
    if (attacker.partyId && attacker.partyId === target.partyId) {
      if (!PVP_CONFIG.friendlyFireParty) return false;
    }

    if (pvpMode === "ffa") {
      // Safe zone protection
      if (mapData.pvpSafeZoneProtection) {
        if (mapEntry.collision.isSafeZone(attacker.x, attacker.y)) return false;
        if (mapEntry.collision.isSafeZone(target.x, target.y)) return false;
      }
      return true;
    }

    // "duel" mode — only if both players have an active duel (future: duel invite system)
    // For now, duel mode blocks all PVP unless in a duel
    if (pvpMode === "duel") {
      return (attacker._duelTarget === target.id && target._duelTarget === attacker.id);
    }
    return false;
  }

  /**
   * Apply melee PVP damage from attacker to target.
   */
  _applyPvpDamage(attacker, target, mapEntry, now) {
    const dmgMult = this._getPlayerDamageMultiplier(attacker);
    const damage = Math.max(2, Math.round((attacker.damage + randInt(-2, 4)) * dmgMult));
    target.hp -= damage;

    const weaponDef = attacker.equipment?.mainHand ? ITEMS[attacker.equipment.mainHand.id] : null;

    // Tell attacker about the hit
    this.send(attacker.ws, {
      type: "pvp_attack_result",
      targetId: target.id,
      targetName: target.name,
      damage,
      targetHp: target.hp,
      targetMaxHp: target.maxHp
    });

    // Tell the victim
    this.send(target.ws, {
      type: "player_damaged",
      attackerId: attacker.id,
      attackerName: attacker.name,
      damage,
      hp: target.hp,
      maxHp: target.maxHp,
      isPvp: true
    });

    // Broadcast visual to everyone on the map
    this.broadcastToMap(attacker.mapId, {
      type: "pvp_combat_visual",
      attackerId: attacker.id,
      ax: attacker.x, ay: attacker.y,
      targetId: target.id,
      tx: target.x, ty: target.y,
      weaponId: attacker.equipment?.mainHand?.id || null,
      hitParticle: weaponDef?.hitParticle || "hit_spark",
      hitSfx: weaponDef?.hitSfx || "sword_hit",
      damage,
      targetHp: target.hp,
      targetMaxHp: target.maxHp
    });

    this._setPvpCombatTimer(attacker, "attack", now);

    if (target.hp <= 0) {
      target.hp = 0;
      this._onPvpDeath(target, attacker, now);
    }
  }

  /**
   * Set the PVP combat timer (prevents safe zone entry).
   * type: "attack" = short timer, "kill" = long timer
   */
  _setPvpCombatTimer(player, type, now) {
    const sec = type === "kill"
      ? (PVP_CONFIG.killTimerSec || 300)
      : (PVP_CONFIG.combatTimerSec || 30);
    const until = now + sec * 1000;
    if (until > player.pvpCombatUntil) {
      player.pvpCombatUntil = until;
      this.send(player.ws, { type: "pvp_combat_timer", until, duration: sec });
    }
  }

  /**
   * Handle PVP death — different from PVE.
   */
  _onPvpDeath(victim, killer, now) {
    victim.dead = true;
    victim.deathUntil = now + 4200;
    victim.lootingDropId = null;

    // End any active duel on death
    this._endDuel(victim);
    this._clearDuelPending(victim);

    // Cancel any active trade on death
    this._cancelTrade(victim);
    this._clearTradePending(victim);

    // PVP death gold penalty (configurable, defaults to 5)
    const goldLost = Math.min(victim.gold || 0, PVP_CONFIG.deathGoldPenalty || 5);
    victim.gold = Math.max(0, (victim.gold || 0) - goldLost);

    // Update PVP stats
    victim.pvpDeaths = (victim.pvpDeaths || 0) + 1;

    // Killer may have disconnected between fatal blow and death processing
    if (killer && this.players.has(killer.id)) {
      killer.pvpKills = (killer.pvpKills || 0) + 1;
      this._setPvpCombatTimer(killer, "kill", now);
      this.send(killer.ws, {
        type: "pvp_kill",
        victimName: victim.name,
        pvpKills: killer.pvpKills,
        pvpDeaths: killer.pvpDeaths
      });
    }

    // Notify victim
    this.send(victim.ws, {
      type: "you_died",
      goldLost,
      pvp: true,
      killerName: killer ? killer.name : "Unknown",
      pvpDeaths: victim.pvpDeaths,
      pvpKills: victim.pvpKills
    });

    // Clear enemy aggro on victim
    const mapEntry = this.maps.get(victim.mapId);
    if (mapEntry) {
      for (const e of mapEntry.enemies) {
        if (e.targetPlayerId === victim.id) {
          e.targetPlayerId = null;
        }
      }
    }
  }

  /**
   * Get map pvpMode for a player's current map.
   */
  _getMapPvpMode(player) {
    const mapEntry = this.maps.get(player.mapId);
    if (!mapEntry) return "none";
    return mapEntry.data.pvpMode || "none";
  }

  /* ── Duel system ───────────────────────────────────── */

  handleDuelChallenge(player, msg) {
    const targetId = msg.targetId;
    const target = this.players.get(targetId);
    if (!target || target.dead || target.mapId !== player.mapId) {
      this.send(player.ws, { type: "duel_result", error: "Player not found." });
      return;
    }
    if (target.id === player.id) return;

    // Can't duel on maps with pvpMode "none"
    const pvpMode = this._getMapPvpMode(player);
    if (pvpMode === "none") {
      this.send(player.ws, { type: "duel_result", error: "PVP is not allowed in this area." });
      return;
    }

    // Can't challenge if you're already in a duel
    if (player._duelTarget) {
      this.send(player.ws, { type: "duel_result", error: "You are already in a duel." });
      return;
    }
    // Can't challenge someone already in a duel
    if (target._duelTarget) {
      this.send(player.ws, { type: "duel_result", error: `${target.name} is already in a duel.` });
      return;
    }
    // Can't challenge someone who already has a pending challenge from you
    if (player._pendingDuelTarget === target.id) {
      this.send(player.ws, { type: "duel_result", error: "Challenge already sent." });
      return;
    }

    // Track pending duel
    player._pendingDuelTarget = target.id;
    target._pendingDuelFrom = player.id;

    // Notify target
    this.send(target.ws, {
      type: "duel_challenge_received",
      fromId: player.id,
      fromName: player.name
    });

    this.send(player.ws, { type: "duel_result", ok: true, message: `Duel challenge sent to ${target.name}.` });
  }

  handleDuelAccept(player, msg) {
    const challengerId = player._pendingDuelFrom;
    if (!challengerId) {
      this.send(player.ws, { type: "duel_result", error: "No pending duel challenge." });
      return;
    }
    const challenger = this.players.get(challengerId);
    if (!challenger || challenger.dead || challenger.mapId !== player.mapId) {
      this._clearDuelPending(player);
      this.send(player.ws, { type: "duel_result", error: "Challenger is no longer available." });
      return;
    }

    // Clear pending state
    this._clearDuelPending(player);
    this._clearDuelPending(challenger);

    // Start duel
    player._duelTarget = challenger.id;
    challenger._duelTarget = player.id;

    this.send(player.ws, { type: "duel_started", opponentId: challenger.id, opponentName: challenger.name });
    this.send(challenger.ws, { type: "duel_started", opponentId: player.id, opponentName: player.name });
  }

  handleDuelDecline(player, msg) {
    const challengerId = player._pendingDuelFrom;
    if (!challengerId) return;
    const challenger = this.players.get(challengerId);

    this._clearDuelPending(player);
    if (challenger) {
      this._clearDuelPending(challenger);
      this.send(challenger.ws, { type: "duel_result", error: `${player.name} declined your duel challenge.` });
    }
    this.send(player.ws, { type: "duel_result", ok: true, message: "Duel declined." });
  }

  handleDuelCancel(player) {
    // Cancel outgoing challenge
    const targetId = player._pendingDuelTarget;
    if (targetId) {
      const target = this.players.get(targetId);
      if (target) {
        this._clearDuelPending(target);
        this.send(target.ws, { type: "duel_challenge_cancelled" });
      }
      this._clearDuelPending(player);
    }
    // End active duel
    this._endDuel(player);
  }

  _clearDuelPending(player) {
    player._pendingDuelTarget = null;
    player._pendingDuelFrom = null;
  }

  _endDuel(player) {
    const opponentId = player._duelTarget;
    if (!opponentId) return;
    player._duelTarget = null;
    const opponent = this.players.get(opponentId);
    if (opponent && opponent._duelTarget === player.id) {
      opponent._duelTarget = null;
      this.send(opponent.ws, { type: "duel_ended" });
    }
    this.send(player.ws, { type: "duel_ended" });
  }

  /* ── Trading ────────────────────────────────────────── */

  handleTradeRequest(player, msg) {
    if (player.dead) return;
    const targetId = msg.targetId;
    const target = this.players.get(targetId);
    if (!target || target.dead || target.mapId !== player.mapId) {
      this.send(player.ws, { type: "trade_result", error: "Player not found." });
      return;
    }
    if (target.id === player.id) return;

    // Block check (bidirectional)
    const database = require("./database");
    if (database.isBlocked(player.username, target.username) ||
        database.isBlocked(target.username, player.username)) {
      this.send(player.ws, { type: "trade_result", error: "Cannot trade with that player." });
      return;
    }

    // Can't request trade while already in a trade
    if (player._tradeWith) {
      this.send(player.ws, { type: "trade_result", error: "You are already in a trade." });
      return;
    }
    if (target._tradeWith) {
      this.send(player.ws, { type: "trade_result", error: `${target.name} is already trading.` });
      return;
    }
    // Can't send duplicate pending request
    if (player._pendingTradeTarget === target.id) {
      this.send(player.ws, { type: "trade_result", error: "Trade request already sent." });
      return;
    }

    // Distance check (within 300 px)
    if (dist(player.x, player.y, target.x, target.y) > 300) {
      this.send(player.ws, { type: "trade_result", error: "Too far away to trade." });
      return;
    }

    player._pendingTradeTarget = target.id;
    target._pendingTradeFrom = player.id;

    this.send(target.ws, {
      type: "trade_request_received",
      fromId: player.id,
      fromName: player.name
    });
    this.send(player.ws, { type: "trade_result", ok: true, message: `Trade request sent to ${target.name}.` });
  }

  handleTradeAccept(player) {
    const requesterId = player._pendingTradeFrom;
    if (!requesterId) {
      this.send(player.ws, { type: "trade_result", error: "No pending trade request." });
      return;
    }
    const requester = this.players.get(requesterId);
    if (!requester || requester.dead || requester.mapId !== player.mapId) {
      this._clearTradePending(player);
      this.send(player.ws, { type: "trade_result", error: "Requester is no longer available." });
      return;
    }

    // Clear pending state
    this._clearTradePending(player);
    this._clearTradePending(requester);

    // Start trade session
    player._tradeWith = requester.id;
    requester._tradeWith = player.id;
    player._tradeOffer = { gold: 0, items: [] };
    requester._tradeOffer = { gold: 0, items: [] };
    player._tradeConfirmed = false;
    requester._tradeConfirmed = false;

    this.send(player.ws, {
      type: "trade_opened",
      partnerId: requester.id,
      partnerName: requester.name
    });
    this.send(requester.ws, {
      type: "trade_opened",
      partnerId: player.id,
      partnerName: player.name
    });
  }

  handleTradeDecline(player) {
    const requesterId = player._pendingTradeFrom;
    if (!requesterId) return;
    const requester = this.players.get(requesterId);

    this._clearTradePending(player);
    if (requester) {
      this._clearTradePending(requester);
      this.send(requester.ws, { type: "trade_result", error: `${player.name} declined your trade request.` });
    }
    this.send(player.ws, { type: "trade_result", ok: true, message: "Trade declined." });
  }

  handleTradeOfferUpdate(player, msg) {
    if (!player._tradeWith) return;
    const partner = this.players.get(player._tradeWith);
    if (!partner) { this._cancelTrade(player); return; }

    const gold = Math.max(0, Math.min(Math.floor(Number(msg.gold) || 0), player.gold || 0));
    const itemIndices = Array.isArray(msg.items) ? msg.items : [];

    // Validate item indices — must be valid inventory slots with items, max 10 items
    const validItems = [];
    const seenSlots = new Set();
    for (const idx of itemIndices) {
      const i = Number(idx);
      if (!Number.isInteger(i) || i < 0 || i >= 20) continue;
      if (seenSlots.has(i)) continue;
      if (!player.inventory[i]) continue;
      seenSlots.add(i);
      if (validItems.length >= 10) break;
      validItems.push(i);
    }

    player._tradeOffer = { gold, items: validItems };

    // Reset both confirmations when offer changes
    player._tradeConfirmed = false;
    partner._tradeConfirmed = false;

    // Build item details for partner display
    const itemDetails = validItems.map(i => ({
      slot: i,
      ...player.inventory[i]
    }));

    // Notify partner of updated offer
    this.send(partner.ws, {
      type: "trade_partner_offer",
      gold,
      items: itemDetails
    });

    // Notify player their offer was accepted, and reset confirm states
    this.send(player.ws, {
      type: "trade_offer_accepted",
      gold,
      items: validItems,
      confirmed: false,
      partnerConfirmed: false
    });
    this.send(partner.ws, {
      type: "trade_confirm_update",
      confirmed: false,
      partnerConfirmed: false
    });
  }

  handleTradeConfirm(player) {
    if (!player._tradeWith) return;
    const partner = this.players.get(player._tradeWith);
    if (!partner) { this._cancelTrade(player); return; }

    player._tradeConfirmed = true;

    // Notify both of confirm state
    this.send(player.ws, {
      type: "trade_confirm_update",
      confirmed: true,
      partnerConfirmed: partner._tradeConfirmed
    });
    this.send(partner.ws, {
      type: "trade_confirm_update",
      confirmed: partner._tradeConfirmed,
      partnerConfirmed: true
    });

    // If both confirmed, execute the trade
    if (player._tradeConfirmed && partner._tradeConfirmed) {
      this._executeTrade(player, partner);
    }
  }

  handleTradeCancel(player) {
    this._cancelTrade(player);
    // Also cancel pending requests
    const pendingTarget = player._pendingTradeTarget;
    if (pendingTarget) {
      const target = this.players.get(pendingTarget);
      if (target) {
        this._clearTradePending(target);
        this.send(target.ws, { type: "trade_cancelled" });
      }
      this._clearTradePending(player);
    }
  }

  _clearTradePending(player) {
    player._pendingTradeTarget = null;
    player._pendingTradeFrom = null;
  }

  _cancelTrade(player) {
    const partnerId = player._tradeWith;
    if (!partnerId) return;

    player._tradeWith = null;
    player._tradeOffer = null;
    player._tradeConfirmed = false;

    const partner = this.players.get(partnerId);
    if (partner && partner._tradeWith === player.id) {
      partner._tradeWith = null;
      partner._tradeOffer = null;
      partner._tradeConfirmed = false;
      this.send(partner.ws, { type: "trade_cancelled" });
    }
    this.send(player.ws, { type: "trade_cancelled" });
  }

  _executeTrade(p1, p2) {
    const offer1 = p1._tradeOffer;
    const offer2 = p2._tradeOffer;

    // Re-validate gold
    if ((offer1.gold || 0) > (p1.gold || 0) || (offer2.gold || 0) > (p2.gold || 0)) {
      this.send(p1.ws, { type: "trade_result", error: "Trade failed: insufficient gold." });
      this.send(p2.ws, { type: "trade_result", error: "Trade failed: insufficient gold." });
      this._cancelTrade(p1);
      return;
    }

    // Re-validate items still exist in inventory
    const p1Items = [];
    for (const idx of offer1.items) {
      if (!p1.inventory[idx]) {
        this.send(p1.ws, { type: "trade_result", error: "Trade failed: item no longer available." });
        this.send(p2.ws, { type: "trade_result", error: "Trade failed: partner's item no longer available." });
        this._cancelTrade(p1);
        return;
      }
      p1Items.push({ idx, item: { ...p1.inventory[idx] } });
    }
    const p2Items = [];
    for (const idx of offer2.items) {
      if (!p2.inventory[idx]) {
        this.send(p2.ws, { type: "trade_result", error: "Trade failed: item no longer available." });
        this.send(p1.ws, { type: "trade_result", error: "Trade failed: partner's item no longer available." });
        this._cancelTrade(p1);
        return;
      }
      p2Items.push({ idx, item: { ...p2.inventory[idx] } });
    }

    // Check inventory space: each player needs enough room for incoming items
    // First remove offered items to free slots, then check if incoming items fit
    const p1SlotsCopy = [...p1.inventory];
    for (const { idx } of p1Items) p1SlotsCopy[idx] = null;
    const p2SlotsCopy = [...p2.inventory];
    for (const { idx } of p2Items) p2SlotsCopy[idx] = null;

    // Test if p2's items fit into p1's inventory (after removing p1's offered items)
    const p1Test = p1SlotsCopy.map(s => s ? { ...s } : null);
    for (const { item } of p2Items) {
      if (this._addItemToSlots(p1Test, { ...item }) < 0) {
        this.send(p1.ws, { type: "trade_result", error: "Trade failed: not enough inventory space." });
        this.send(p2.ws, { type: "trade_result", error: "Trade failed: partner doesn't have enough inventory space." });
        this._cancelTrade(p1);
        return;
      }
    }
    // Test if p1's items fit into p2's inventory
    const p2Test = p2SlotsCopy.map(s => s ? { ...s } : null);
    for (const { item } of p1Items) {
      if (this._addItemToSlots(p2Test, { ...item }) < 0) {
        this.send(p2.ws, { type: "trade_result", error: "Trade failed: not enough inventory space." });
        this.send(p1.ws, { type: "trade_result", error: "Trade failed: partner doesn't have enough inventory space." });
        this._cancelTrade(p1);
        return;
      }
    }

    // Execute: remove offered items
    for (const { idx } of p1Items) p1.inventory[idx] = null;
    for (const { idx } of p2Items) p2.inventory[idx] = null;

    // Swap gold
    p1.gold = (p1.gold || 0) - (offer1.gold || 0) + (offer2.gold || 0);
    p2.gold = (p2.gold || 0) - (offer2.gold || 0) + (offer1.gold || 0);

    // Add received items
    for (const { item } of p2Items) this._addItemToSlots(p1.inventory, item);
    for (const { item } of p1Items) this._addItemToSlots(p2.inventory, item);

    // Clear trade state
    p1._tradeWith = null;
    p1._tradeOffer = null;
    p1._tradeConfirmed = false;
    p2._tradeWith = null;
    p2._tradeOffer = null;
    p2._tradeConfirmed = false;

    // Notify both
    this.send(p1.ws, {
      type: "trade_completed",
      inventory: p1.inventory,
      gold: p1.gold
    });
    this.send(p2.ws, {
      type: "trade_completed",
      inventory: p2.inventory,
      gold: p2.gold
    });

    this._savePlayer(p1);
    this._savePlayer(p2);
  }

  handleHeal(player) {
    if (player.dead) return;

    const now = Date.now();
    if (now - player.lastHealAt < 5300) {
      this.send(player.ws, { type: "heal_result", ok: false, reason: "cooldown" });
      return;
    }

    const manaCost = 22;
    if (player.mana < manaCost) {
      this.send(player.ws, { type: "heal_result", ok: false, reason: "mana" });
      return;
    }

    player.mana -= manaCost;
    const healAmount = 34 + player.level * 6;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    player.lastHealAt = now;

    this.send(player.ws, {
      type: "heal_result",
      ok: true,
      healAmount,
      hp: player.hp,
      maxHp: player.maxHp,
      mana: player.mana,
      maxMana: player.maxMana
    });

    // Broadcast heal visual to other players
    this.broadcastToMap(player.mapId, {
      type: "combat_visual",
      attackerId: player.id,
      ax: player.x,
      ay: player.y,
      selfTarget: true,
      particle: "heal",
      sfx: "heal"
    }, player.id);
  }

  handleUseSkill(player, msg) {
    if (player.dead) return;
    if (player.casting) return; // Already casting something

    const skillId = String(msg.skillId || "").slice(0, 64);
    const skillDef = SKILLS[skillId];
    if (!skillDef) return;

    // Delegate auto-attack & heal to existing handlers
    if (skillId === "attack") { this.handleAttack(player, msg); return; }
    if (skillId === "heal") { this.handleHeal(player); return; }

    // Class check
    if (skillDef.classes && !skillDef.classes.includes(player.charClass)) return;

    // Level check
    if (player.level < (skillDef.levelReq || 1)) return;

    // Weapon requirement check
    if (skillDef.requiresWeapon && !player.equipment?.mainHand) {
      this.send(player.ws, { type: "skill_result", ok: false, skillId, reason: "Requires a weapon!" });
      return;
    }
    if (skillDef.requiresShield) {
      const offHand = player.equipment?.offHand;
      if (!offHand || offHand.type !== "shield") {
        this.send(player.ws, { type: "skill_result", ok: false, skillId, reason: "Requires a shield!" });
        return;
      }
    }
    if (skillDef.requiresWeaponType) {
      const weapon = player.equipment?.mainHand;
      const wDef = weapon ? ITEMS[weapon.id] : null;
      if (!wDef || !skillDef.requiresWeaponType.includes(wDef.weaponType)) {
        this.send(player.ws, { type: "skill_result", ok: false, skillId, reason: "Requires " + skillDef.requiresWeaponType.join(" or ") + "!" });
        return;
      }
    }

    // Cooldown check
    const now = Date.now();
    const cooldownMs = (skillDef.cooldown || 0) * 1000;
    if (!player.skillCooldowns) player.skillCooldowns = {};
    const lastUsed = player.skillCooldowns[skillId] || 0;
    if (cooldownMs > 0 && now - lastUsed < cooldownMs) {
      this.send(player.ws, { type: "skill_result", ok: false, skillId, reason: "cooldown" });
      return;
    }

    // Mana check
    const manaCost = skillDef.manaCost || 0;
    if (player.mana < manaCost) {
      this.send(player.ws, { type: "skill_result", ok: false, skillId, reason: "mana" });
      return;
    }

    // For enemy-targeted skills, validate target and range
    let enemy = null;
    let pvpTarget = null;
    const targeting = skillDef.targeting;
    if (targeting === "enemy") {
      const mapEntry = this.maps.get(player.mapId);
      if (!mapEntry) return;

      // PVP target?
      if (msg.targetPlayerId) {
        pvpTarget = this.players.get(msg.targetPlayerId);
        if (!pvpTarget || pvpTarget.dead || pvpTarget.mapId !== player.mapId) return;
        if (!this._canPvpAttack(player, pvpTarget, mapEntry)) return;

        const d = dist(player.x, player.y, pvpTarget.x, pvpTarget.y);
        const skillRange = skillDef.range || player.attackRange;
        if (d > skillRange + 30) return;
      } else {
        enemy = mapEntry.enemies.find(e => e.id === msg.enemyId);
        if (!enemy || enemy.dead) return;

        const d = dist(player.x, player.y, enemy.x, enemy.y);
        const skillRange = skillDef.range || player.attackRange;
        if (d > skillRange + 30) return;
      }
    }
    // ground_aoe / directional — validate target position is in range
    if (targeting === "ground_aoe" || targeting === "directional") {
      const tx = msg.targetX, ty = msg.targetY;
      if (tx == null || ty == null) return;
      const d = dist(player.x, player.y, tx, ty);
      const skillRange = skillDef.range || 200;
      if (d > skillRange + 30) return;
    }
    // self_aoe — no target needed

    // ── Cast time: if skill has castTime, begin casting instead of resolving now ──
    const castTimeSec = skillDef.castTime || 0;
    if (castTimeSec > 0) {
      // Pre-consume mana so it's locked in on cast start
      player.mana -= manaCost;
      player.skillCooldowns[skillId] = now;

      player.casting = {
        type: "skill",
        skillId,
        skillDef,
        startedAt: now,
        duration: castTimeSec * 1000,
        concentration: (skillDef.concentration !== false) && !skillDef.ignoreConcentration,
        ignoreHits: !!skillDef.ignoreConcentration,
        castX: player.x,
        castY: player.y,
        // Store targeting data for resolution on complete
        enemyId: msg.enemyId || null,
        targetPlayerId: msg.targetPlayerId || null,
        targetX: msg.targetX ?? null,
        targetY: msg.targetY ?? null,
      };

      this.send(player.ws, {
        type: "skill_cast_start",
        skillId,
        castTime: castTimeSec,
        name: skillDef.name,
        mana: player.mana,
        maxMana: player.maxMana,
      });
      this.broadcastToMap(player.mapId, {
        type: "player_cast_start",
        playerId: player.id,
        skillId,
        castTime: castTimeSec,
      }, player.id);
      return;
    }

    // ── Channeled: if skill is channeled, begin channel ──
    if (skillDef.channeled) {
      player.mana -= manaCost;
      player.skillCooldowns[skillId] = now;

      const ticks = skillDef.channelTicks || skillDef.hits || skillDef.healTicks || 1;
      const tickIntervalSec = skillDef.hitInterval || skillDef.healInterval || 1.0;
      const channelDuration = skillDef.channelDuration || (ticks * tickIntervalSec);

      player.casting = {
        type: "channel",
        skillId,
        skillDef,
        startedAt: now,
        duration: channelDuration * 1000,
        concentration: !skillDef.ignoreConcentration,
        ignoreHits: !!skillDef.ignoreConcentration,
        castX: player.x,
        castY: player.y,
        enemyId: msg.enemyId || null,
        targetPlayerId: msg.targetPlayerId || null,
        targetX: msg.targetX ?? null,
        targetY: msg.targetY ?? null,
        tickInterval: tickIntervalSec * 1000,
        lastTickAt: now,
        ticksRemaining: ticks,
        totalTicks: ticks,
      };

      this.send(player.ws, {
        type: "skill_channel_start",
        skillId,
        channelDuration,
        ticks,
        name: skillDef.name,
        mana: player.mana,
        maxMana: player.maxMana,
      });
      this.broadcastToMap(player.mapId, {
        type: "player_channel_start",
        playerId: player.id,
        skillId,
        channelDuration,
      }, player.id);
      return;
    }

    // Consume mana & record cooldown
    player.mana -= manaCost;
    player.skillCooldowns[skillId] = now;

    this._resolveSkill(player, skillDef, skillId, enemy, now, msg, pvpTarget);
  }

  /**
   * Resolve skill effects — extracted so both instant and cast-time paths use it.
   */
  _resolveSkill(player, skillDef, skillId, enemy, now, msg, pvpTarget) {
    const targeting = skillDef.targeting;

    // ── PVP single-target skill ──
    if (pvpTarget && (skillDef.type === "attack" || skillDef.type === "debuff") && targeting === "enemy") {
      const mapEntry = this.maps.get(player.mapId);
      if (!mapEntry) return;

      // Ranged PVP skill — create projectile
      if (skillDef.projectileSpeed > 0) {
        const projId = this._nextProjId++;
        mapEntry.projectiles.push({
          id: projId, playerId: player.id, targetPlayerId: pvpTarget.id,
          x: player.x, y: player.y, speed: skillDef.projectileSpeed,
          type: "pvp_skill", skillId,
          hitParticle: skillDef.hitParticle || skillDef.particle || null,
          hitSfx: skillDef.sfx || null,
          damageType: skillDef.damageType || "physical",
          debuff: skillDef.debuff || null,
        });
        this.send(player.ws, { type: "skill_result", ok: true, skillId, mana: player.mana, maxMana: player.maxMana });
        this.broadcastToMap(player.mapId, {
          type: "projectile_spawn",
          attackerId: player.id,
          sx: player.x, sy: player.y,
          tx: pvpTarget.x, ty: pvpTarget.y,
          targetPlayerId: pvpTarget.id,
          speed: skillDef.projectileSpeed,
          skillId,
          damageType: skillDef.damageType || "physical",
        });
        this._setPvpCombatTimer(player, "attack", now);
        return;
      }

      // Melee PVP skill — instant damage
      let baseDmg = (skillDef.damage || 0) + (skillDef.damagePerLevel || 0) * (player.level - 1);
      if (skillDef.damageType === "physical") baseDmg += player.damage;
      const dmgMult = this._getPlayerDamageMultiplier(player);
      const damage = Math.max(1, Math.round((baseDmg + randInt(-2, 4)) * dmgMult));
      pvpTarget.hp -= damage;

      this.send(player.ws, {
        type: "skill_result", ok: true, skillId, mana: player.mana, maxMana: player.maxMana,
        pvpHit: { targetPlayerId: pvpTarget.id, damage, targetHp: pvpTarget.hp, targetMaxHp: pvpTarget.maxHp }
      });
      this.send(pvpTarget.ws, {
        type: "player_damaged", attackerId: player.id, attackerName: player.name,
        damage, hp: pvpTarget.hp, maxHp: pvpTarget.maxHp, isPvp: true, skillId
      });
      this.broadcastToMap(player.mapId, {
        type: "pvp_combat_visual",
        attackerId: player.id, ax: player.x, ay: player.y,
        targetId: pvpTarget.id, tx: pvpTarget.x, ty: pvpTarget.y,
        skillId, hitParticle: skillDef.hitParticle || skillDef.particle || null,
        hitSfx: skillDef.sfx || null, damage, targetHp: pvpTarget.hp, targetMaxHp: pvpTarget.maxHp
      });
      this._setPvpCombatTimer(player, "attack", now);
      if (pvpTarget.hp <= 0) {
        pvpTarget.hp = 0;
        this._onPvpDeath(pvpTarget, player, now);
      }
      return;
    }

    // ── PVE path (existing) ──

    // Resolve skill effects by type
    if (skillDef.type === "attack" || skillDef.type === "debuff") {
      const isAoe = targeting === "self_aoe" || targeting === "ground_aoe" || targeting === "directional";

      // ── Ranged single-target skill — create server-side projectile, defer damage ──
      if (!isAoe && skillDef.projectileSpeed > 0) {
        if (!enemy) return;
        const mapEntry = this.maps.get(player.mapId);
        const projId = this._nextProjId++;
        mapEntry.projectiles.push({
          id: projId, playerId: player.id, targetEnemyId: enemy.id,
          x: player.x, y: player.y, speed: skillDef.projectileSpeed,
          type: "skill", skillId,
          hitParticle: skillDef.hitParticle || skillDef.particle || null,
          hitSfx: skillDef.sfx || null,
          damageType: skillDef.damageType || "physical",
          debuff: skillDef.debuff || null,
        });
        this.send(player.ws, {
          type: "skill_result", ok: true, skillId,
          mana: player.mana, maxMana: player.maxMana,
        });
        this.broadcastToMap(player.mapId, {
          type: "projectile_spawn",
          attackerId: player.id,
          sx: player.x, sy: player.y,
          tx: enemy.x, ty: enemy.y,
          targetEnemyId: enemy.id,
          speed: skillDef.projectileSpeed,
          skillId,
          damageType: skillDef.damageType || "physical",
        });
        return;
      }

      // ── AoE skill — hit all enemies in the pattern area ──
      if (isAoe) {
        const mapEntry = this.maps.get(player.mapId);
        if (!mapEntry) return;
        const ts = mapEntry.collision.tileSize || 48;
        const pattern = AOE_PATTERNS[skillDef.aoePattern];
        if (!pattern) return;

        // Determine origin and direction
        let originX, originY, dirIdx;
        if (targeting === "self_aoe") {
          originX = player.x;
          originY = player.y;
        } else if (targeting === "ground_aoe") {
          originX = msg.targetX;
          originY = msg.targetY;
        } else { // directional
          originX = player.x;
          originY = player.y;
        }
        const originTx = Math.floor(originX / ts);
        const originTy = Math.floor(originY / ts);

        if (pattern.directional) {
          const dx = (targeting === "directional" || targeting === "ground_aoe")
            ? (msg.targetX || player.x) - player.x
            : 0;
          const dy = (targeting === "directional" || targeting === "ground_aoe")
            ? (msg.targetY || player.y) - player.y
            : -1; // default north
          dirIdx = directionIndex(dx, dy);
        }

        const affectedTiles = resolveAoeTiles(pattern, originTx, originTy, dirIdx);

        // Find all alive enemies on the same floor whose tile is in the AoE
        const hits = [];
        let baseDmg = (skillDef.damage || 0) + (skillDef.damagePerLevel || 0) * (player.level - 1);
        if (!skillDef.range && skillDef.damageType === "physical") baseDmg += player.damage;
        const dmgMult = this._getPlayerDamageMultiplier(player);

        for (const e of mapEntry.enemies) {
          if (e.dead) continue;
          if ((e.floor || 0) !== (player.floor || 0)) continue;
          if (!this._enemyOverlapsTiles(e, ts, affectedTiles)) continue;

          const takenMult = this._getEnemyDamageTakenMult(e);
          const damage = Math.max(1, Math.round((baseDmg + randInt(-2, 4)) * dmgMult * takenMult));
          e.hp -= damage;

          let debuffApplied = null;
          if (skillDef.debuff) {
            if (!e.activeDebuffs) e.activeDebuffs = [];
            e.activeDebuffs = e.activeDebuffs.filter(d => d.id !== skillDef.debuff.id);
            e.activeDebuffs.push({
              ...skillDef.debuff,
              appliedAt: now,
              expiresAt: now + (skillDef.debuff.duration || 0) * 1000,
              casterId: player.id,
              casterLevel: player.level,
            });
            debuffApplied = { id: skillDef.debuff.id, stat: skillDef.debuff.stat, modifier: skillDef.debuff.modifier, duration: skillDef.debuff.duration };
          }

          hits.push({ enemyId: e.id, damage, enemyHp: e.hp, enemyMaxHp: e.maxHp, debuff: debuffApplied });

          // Broadcast visual per hit to other players
          this.broadcastToMap(player.mapId, {
            type: "combat_visual",
            attackerId: player.id,
            ax: player.x, ay: player.y,
            enemyId: e.id, ex: e.x, ey: e.y,
            skillId,
            hitParticle: skillDef.hitParticle || skillDef.particle || null,
            hitSfx: skillDef.sfx || null,
            projectileSpeed: 0,
            damageType: skillDef.damageType || "physical",
            damage, enemyHp: e.hp, enemyMaxHp: e.maxHp,
          }, player.id);

          if (e.hp <= 0) {
            e.hp = 0;
            this.killEnemy(e, player);
          }
        }

        // ── AoE PVP: also hit players in the affected area ──
        const pvpHits = [];
        for (const [pid, p] of this.players) {
          if (p.dead || p.mapId !== player.mapId || p.id === player.id) continue;
          if ((p.floor || 0) !== (player.floor || 0)) continue;
          if (!this._canPvpAttack(player, p, mapEntry)) continue;
          const ptx = Math.floor(p.x / ts);
          const pty = Math.floor(p.y / ts);
          if (!affectedTiles.has(tileKey(ptx, pty))) continue;

          const pvpDmg = Math.max(1, Math.round((baseDmg + randInt(-2, 4)) * dmgMult));
          p.hp -= pvpDmg;
          pvpHits.push({ targetPlayerId: p.id, damage: pvpDmg, targetHp: p.hp, targetMaxHp: p.maxHp });

          this.send(p.ws, {
            type: "player_damaged", attackerId: player.id, attackerName: player.name,
            damage: pvpDmg, hp: p.hp, maxHp: p.maxHp, isPvp: true, skillId,
          });
          this.broadcastToMap(player.mapId, {
            type: "pvp_combat_visual",
            attackerId: player.id, ax: player.x, ay: player.y,
            targetId: p.id, tx: p.x, ty: p.y,
            skillId,
            hitParticle: skillDef.hitParticle || skillDef.particle || null,
            hitSfx: skillDef.sfx || null,
            damageType: skillDef.damageType || "physical",
            damage: pvpDmg, targetHp: p.hp, targetMaxHp: p.maxHp,
          });
          this._setPvpCombatTimer(player, "attack", now);
          this._setPvpCombatTimer(p, "defend", now);

          if (p.hp <= 0) {
            p.hp = 0;
            this._onPvpDeath(p, player);
          }
        }

        const aoeTileCoords = [...affectedTiles].map(k => {
          const [tx, ty] = k.split(",").map(Number);
          return [tx * ts + ts / 2, ty * ts + ts / 2];
        });
        this.send(player.ws, {
          type: "skill_result",
          ok: true,
          skillId,
          aoe: true,
          hits,
          pvpHits: pvpHits.length > 0 ? pvpHits : undefined,
          aoeTiles: aoeTileCoords,
          mana: player.mana,
          maxMana: player.maxMana,
        });
        // Broadcast AoE ground effect to observers
        if (skillDef.aoeParticleEffect) {
          this.broadcastToMap(player.mapId, {
            type: "skill_aoe_visual",
            playerId: player.id,
            skillId,
            aoeParticleEffect: skillDef.aoeParticleEffect,
            aoeTiles: aoeTileCoords,
          }, player.id);
        }
        return;
      }

      // ── Instant single-target skill — apply damage immediately ──
      if (!enemy) return;
      let baseDmg = (skillDef.damage || 0) + (skillDef.damagePerLevel || 0) * (player.level - 1);
      if (!skillDef.range && skillDef.damageType === 'physical') baseDmg += player.damage;
      const dmgMult = this._getPlayerDamageMultiplier(player);
      const takenMult = this._getEnemyDamageTakenMult(enemy);
      const damage = Math.max(1, Math.round((baseDmg + randInt(-2, 4)) * dmgMult * takenMult));
      enemy.hp -= damage;

      let debuffApplied = null;
      if (skillDef.debuff) {
        if (!enemy.activeDebuffs) enemy.activeDebuffs = [];
        enemy.activeDebuffs = enemy.activeDebuffs.filter(d => d.id !== skillDef.debuff.id);
        const debuffEntry = {
          ...skillDef.debuff,
          appliedAt: now,
          expiresAt: now + (skillDef.debuff.duration || 0) * 1000,
          casterId: player.id,
          casterLevel: player.level
        };
        enemy.activeDebuffs.push(debuffEntry);
        debuffApplied = { id: skillDef.debuff.id, stat: skillDef.debuff.stat, modifier: skillDef.debuff.modifier, duration: skillDef.debuff.duration };
      }

      this.send(player.ws, {
        type: "skill_result",
        ok: true,
        skillId,
        enemyId: enemy.id,
        damage,
        enemyHp: enemy.hp,
        enemyMaxHp: enemy.maxHp,
        mana: player.mana,
        maxMana: player.maxMana,
        debuff: debuffApplied
      });

      this.broadcastToMap(player.mapId, {
        type: "combat_visual",
        attackerId: player.id,
        ax: player.x, ay: player.y,
        enemyId: enemy.id, ex: enemy.x, ey: enemy.y,
        skillId,
        hitParticle: skillDef.hitParticle || skillDef.particle || null,
        hitSfx: skillDef.sfx || null,
        projectileSpeed: 0,
        damageType: skillDef.damageType || "physical",
        damage, enemyHp: enemy.hp, enemyMaxHp: enemy.maxHp
      }, player.id);

      if (enemy.hp <= 0) {
        enemy.hp = 0;
        this.killEnemy(enemy, player);
      }
    } else if (skillDef.type === "heal") {
      const healAmount = (skillDef.healAmount || 0) + (skillDef.healPerLevel || 0) * (player.level - 1);

      // HoT (heal over time) — apply as a buff with ticking heals
      if (skillDef.healTicks && skillDef.healInterval) {
        if (!player.activeBuffs) player.activeBuffs = [];
        const hotId = "hot_" + skillId;
        player.activeBuffs = player.activeBuffs.filter(b => b.id !== hotId);
        const duration = skillDef.healTicks * skillDef.healInterval;
        player.activeBuffs.push({
          id: hotId,
          stat: "hot",
          tickHeal: healAmount,
          tickInterval: skillDef.healInterval,
          ticksRemaining: skillDef.healTicks,
          duration,
          appliedAt: now,
          expiresAt: now + duration * 1000,
          _lastTickAt: now
        });
        this.send(player.ws, {
          type: "skill_result",
          ok: true,
          skillId,
          healAmount: 0,
          hp: player.hp,
          maxHp: player.maxHp,
          mana: player.mana,
          maxMana: player.maxMana,
          hot: { id: hotId, tickHeal: healAmount, ticks: skillDef.healTicks, interval: skillDef.healInterval }
        });
      } else {
        // Instant heal
        player.hp = Math.min(player.maxHp, player.hp + healAmount);

        this.send(player.ws, {
          type: "skill_result",
          ok: true,
          skillId,
          healAmount,
          hp: player.hp,
          maxHp: player.maxHp,
          mana: player.mana,
          maxMana: player.maxMana
        });
      }

      // Broadcast heal visual to other players
      if (skillDef.particle) {
        this.broadcastToMap(player.mapId, {
          type: "combat_visual",
          attackerId: player.id,
          ax: player.x,
          ay: player.y,
          selfTarget: true,
          particle: skillDef.particle,
          sfx: skillDef.sfx || null
        }, player.id);
      }
    } else if (skillDef.type === "buff" || skillDef.type === "support") {
      // Apply buff to player
      let buffApplied = null;
      if (skillDef.buff) {
        if (!player.activeBuffs) player.activeBuffs = [];
        // Replace existing buff of same id OR same stat (prevents stacking e.g. mana shields)
        player.activeBuffs = player.activeBuffs.filter(b => b.id !== skillDef.buff.id && b.stat !== skillDef.buff.stat);
        const buffEntry = {
          ...skillDef.buff,
          appliedAt: now,
          expiresAt: now + (skillDef.buff.duration || 0) * 1000
        };
        // Initialize absorb remaining for mana shield
        if (skillDef.buff.absorbAmount !== undefined) {
          buffEntry.absorbRemaining = (skillDef.buff.absorbAmount || 0) + (skillDef.buff.absorbPerLevel || 0) * (player.level - 1);
        }
        player.activeBuffs.push(buffEntry);
        buffApplied = { id: skillDef.buff.id, stat: skillDef.buff.stat, modifier: skillDef.buff.modifier, duration: skillDef.buff.duration };
      }

      // Compute AoE tile positions for particle effects
      let aoeTiles = null;
      if (skillDef.aoePattern && AOE_PATTERNS[skillDef.aoePattern]) {
        const mapEntry = this.maps.get(player.mapId);
        if (mapEntry) {
          const ts = mapEntry.collision.tileSize || 48;
          const pattern = AOE_PATTERNS[skillDef.aoePattern];
          const originTx = Math.floor(player.x / ts);
          const originTy = Math.floor(player.y / ts);
          const tiles = resolveAoeTiles(pattern, originTx, originTy);
          aoeTiles = [...tiles].map(k => {
            const [tx, ty] = k.split(",").map(Number);
            return [tx * ts + ts / 2, ty * ts + ts / 2];
          });
        }
      }

      const result = {
        type: "skill_result",
        ok: true,
        skillId,
        mana: player.mana,
        maxMana: player.maxMana,
        buff: buffApplied
      };
      if (aoeTiles) result.aoeTiles = aoeTiles;
      this.send(player.ws, result);

      // Broadcast buff visual to other players
      if (skillDef.particle) {
        this.broadcastToMap(player.mapId, {
          type: "combat_visual",
          attackerId: player.id,
          ax: player.x,
          ay: player.y,
          selfTarget: true,
          particle: skillDef.particle,
          sfx: skillDef.sfx || null
        }, player.id);
      }
    }
  }

  handleChat(player, msg) {
    const text = String(msg.text || "").slice(0, 200).trim();
    if (!text) return;

    // whisper: /w PlayerName message
    const whisperMatch = text.match(/^\/w\s+(\S+)\s+([\s\S]+)/i);
    if (whisperMatch) {
      const targetName = whisperMatch[1];
      const whisperText = whisperMatch[2].trim();
      if (!whisperText) return;

      // find target player by name (case-insensitive)
      let target = null;
      for (const [, p] of this.players) {
        if (p.name.toLowerCase() === targetName.toLowerCase()) {
          target = p;
          break;
        }
      }

      if (!target) {
        this.send(player.ws, {
          type: "chat",
          channel: "system",
          from: "System",
          text: `Player "${targetName}" not found.`
        });
        return;
      }

      if (target.id === player.id) {
        this.send(player.ws, {
          type: "chat",
          channel: "system",
          from: "System",
          text: "You can't whisper yourself."
        });
        return;
      }

      // Block check – either direction
      const database = require("./database");
      if (database.isBlocked(player.username, target.username) || database.isBlocked(target.username, player.username)) {
        this.send(player.ws, {
          type: "chat",
          channel: "system",
          from: "System",
          text: "Unable to send message to that player."
        });
        return;
      }

      // send to recipient
      this.send(target.ws, {
        type: "chat",
        channel: "whisper",
        from: player.name,
        to: target.name,
        text: whisperText
      });

      // echo back to sender
      this.send(player.ws, {
        type: "chat",
        channel: "whisper",
        from: player.name,
        to: target.name,
        text: whisperText
      });
      return;
    }

    // party chat: /p message
    const partyMatch = text.match(/^\/p\s+([\s\S]+)/i);
    if (partyMatch) {
      const partyText = partyMatch[1].trim();
      if (!partyText) return;

      if (!player.partyId) {
        this.send(player.ws, {
          type: "chat",
          channel: "system",
          from: "System",
          text: "You are not in a party."
        });
        return;
      }

      const party = this.parties.get(player.partyId);
      if (!party) return;

      for (const memberId of party.members) {
        const member = this.players.get(memberId);
        if (member) {
          this.send(member.ws, {
            type: "chat",
            channel: "party",
            from: player.name,
            text: partyText
          });
        }
      }
      return;
    }

    // regular world chat
    this.broadcast({
      type: "chat",
      channel: "world",
      from: player.name,
      playerId: player.id,
      text
    });
  }

  /* ── item actions (use / buy / sell) ────────────────── */

  /** Try to add item to a slot array, stacking if possible. Returns index or -1. */
  _addItemToSlots(slots, item) {
    const template = ITEMS[item.id];
    const maxStack = (template && template.stackSize) || 1;

    // If stackable, try to find existing stack with room
    if (maxStack > 1) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s && s.id === item.id && (s.qty || 1) < maxStack) {
          s.qty = (s.qty || 1) + (item.qty || 1);
          if (s.qty > maxStack) {
            // overflow — need more slots
            const overflow = s.qty - maxStack;
            s.qty = maxStack;
            // place overflow in new slot
            const overflowItem = { ...item, qty: overflow };
            return this._addItemToSlots(slots, overflowItem) >= 0 ? i : i;
          }
          return i;
        }
      }
    }

    // No existing stack or unstackable — find empty slot
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i]) {
        slots[i] = { ...item, qty: item.qty || 1 };
        return i;
      }
    }
    return -1; // full
  }

  handleUseItem(player, msg) {
    if (player.dead) return;
    if (player._tradeWith) return; // Block item use during active trade
    const index = Number(msg.index);
    if (!Number.isInteger(index) || index < 0 || index >= 20) return;

    const inventory = player.inventory;
    const item = inventory[index];
    if (!item || item.type !== "consumable") return;

    const template = ITEMS[item.id];
    if (!template) return;

    // Build the effects list: new "effects" array or legacy "effect"/"power" fallback
    const effects = template.effects || (template.effect ? [{ type: template.effect, power: template.power }] : []);
    if (effects.length === 0) {
      this.send(player.ws, { type: "use_item_result", ok: false, reason: "unknown_effect" });
      return;
    }

    // Pre-check: if any effect requires a quiver, verify it exists before consuming
    if (effects.some(e => e.type === "refillQuiver")) {
      const quiver = player.equipment.offHand;
      if (!quiver || quiver.type !== "quiver") {
        this.send(player.ws, { type: "use_item_result", ok: false, reason: "No quiver equipped." });
        return;
      }
    }

    // Decrement stack or remove
    const qty = item.qty || 1;
    if (qty > 1) {
      item.qty = qty - 1;
    } else {
      inventory[index] = null;
    }

    const now = Date.now();
    const appliedEffects = [];
    let quiverUpdated = false;

    for (const fx of effects) {
      switch (fx.type) {
        case "healHp": {
          const before = player.hp;
          player.hp = Math.min(player.maxHp, player.hp + fx.power);
          appliedEffects.push({ type: "healHp", amount: player.hp - before });
          break;
        }
        case "healMana": {
          const before = player.mana;
          player.mana = Math.min(player.maxMana, player.mana + fx.power);
          appliedEffects.push({ type: "healMana", amount: player.mana - before });
          break;
        }
        case "refillQuiver": {
          const quiver = player.equipment.offHand;
          const maxArr = ITEMS[quiver.id]?.maxArrows || quiver.maxArrows || 50;
          const before = quiver.arrows || 0;
          quiver.arrows = Math.min(maxArr, before + fx.power);
          appliedEffects.push({ type: "refillQuiver", amount: quiver.arrows - before });
          quiverUpdated = true;
          break;
        }
        case "buff":
        case "debuff":
        case "hot":
        case "dot": {
          if (!player.activeBuffs) player.activeBuffs = [];
          // Remove existing buff/debuff of same id
          player.activeBuffs = player.activeBuffs.filter(b => b.id !== fx.id);
          const entry = {
            id: fx.id,
            stat: fx.stat || (fx.type === "hot" ? "hot" : fx.type === "dot" ? "dot" : fx.stat),
            modifier: fx.modifier || 0,
            duration: fx.duration || 0,
            appliedAt: now,
            expiresAt: now + (fx.duration || 0) * 1000
          };
          if (fx.type === "hot") {
            entry.stat = "hot";
            entry.tickHeal = fx.tickHeal || 0;
            entry.tickInterval = fx.tickInterval || 2;
            entry.lastTick = now;
          }
          if (fx.type === "dot") {
            entry.stat = "dot";
            entry.tickDamage = fx.tickDamage || 0;
            entry.tickInterval = fx.tickInterval || 2;
            entry.lastTick = now;
          }
          player.activeBuffs.push(entry);
          appliedEffects.push({
            type: fx.type,
            id: fx.id,
            stat: entry.stat,
            modifier: entry.modifier,
            duration: fx.duration
          });
          break;
        }
        case "cleanse": {
          if (player.activeBuffs) {
            const before = player.activeBuffs.length;
            player.activeBuffs = player.activeBuffs.filter(b => {
              // Remove debuffs and dots (negative effects)
              const isDot = b.stat === "dot";
              const isDebuff = (b.modifier !== undefined && b.modifier < 0) || b.stat === "stunned" || isDot;
              return !isDebuff;
            });
            appliedEffects.push({ type: "cleanse", removed: before - player.activeBuffs.length });
          } else {
            appliedEffects.push({ type: "cleanse", removed: 0 });
          }
          break;
        }
        default:
          appliedEffects.push({ type: fx.type });
          break;
      }
    }

    this.send(player.ws, {
      type: "use_item_result",
      ok: true,
      index,
      itemId: item.id,
      remainingItem: inventory[index],
      effects: appliedEffects,
      // Legacy fields for backward compat with client
      effect: appliedEffects[0]?.type,
      amount: appliedEffects[0]?.amount,
      hp: player.hp,
      maxHp: player.maxHp,
      mana: player.mana,
      maxMana: player.maxMana
    });

    if (quiverUpdated) {
      const quiver = player.equipment.offHand;
      const maxArr = ITEMS[quiver.id]?.maxArrows || quiver.maxArrows || 50;
      this.send(player.ws, { type: "quiver_update", arrows: quiver.arrows, maxArrows: maxArr });
    }
  }

  handleSellItem(player, msg) {
    if (player.dead) return;
    const index = Number(msg.index);
    if (!Number.isInteger(index) || index < 0 || index >= 20) return;

    // Verify player is near a vendor NPC
    const mapEntry = this.maps.get(player.mapId);
    if (!mapEntry) return;
    const tileSize = mapEntry.collision.tileSize || 48;
    const npcsOnMap = mapEntry.data.npcs || [];
    const nearVendor = npcsOnMap.some(npcPlacement => {
      const npcDef = ServerWorld._NPC_DATA[npcPlacement.npcId];
      if (!npcDef || !npcDef.shop || npcDef.shop.length === 0) return false;
      const npcX = npcPlacement.tx * tileSize + tileSize / 2;
      const npcY = npcPlacement.ty * tileSize + tileSize / 2;
      return dist(player.x, player.y, npcX, npcY) < tileSize * 1.5;
    });
    if (!nearVendor) {
      this.send(player.ws, { type: "sell_item_result", ok: false, reason: "too_far" });
      return;
    }

    const inventory = player.inventory;
    const item = inventory[index];
    if (!item) return;

    const template = ITEMS[item.id];
    if (!template) return;

    // Cannot sell permanent items (hearthstone)
    if (template.permanent) {
      this.send(player.ws, { type: "sell_item_result", ok: false, reason: "permanent" });
      return;
    }

    // sell for half value (floor)
    const unitPrice = Math.max(1, Math.floor(template.value / 2));
    const qty = item.qty || 1;
    const sellAll = !!msg.all;
    const sellQty = sellAll ? qty : 1;
    const sellPrice = unitPrice * sellQty;
    player.gold += sellPrice;
    const soldName = item.name;
    if (qty > sellQty) {
      item.qty = qty - sellQty;
    } else {
      inventory[index] = null;
    }

    this.send(player.ws, {
      type: "sell_item_result",
      ok: true,
      index,
      remainingItem: inventory[index],
      gold: player.gold,
      soldName,
      sellPrice,
      sellQty
    });
  }

  handleBuyItem(player, msg) {
    if (player.dead) return;
    const itemId = String(msg.itemId || "").slice(0, 64);
    const npcId = String(msg.npcId || "").slice(0, 64);

    // Validate NPC has the item in their shop
    const npcDef = ServerWorld._NPC_DATA[npcId];
    if (!npcDef || !npcDef.shop || !npcDef.shop.includes(itemId)) return;

    // Verify player is near this NPC
    const mapEntry = this.maps.get(player.mapId);
    if (!mapEntry) return;
    const tileSize = mapEntry.collision.tileSize || 48;
    const npcPlacement = (mapEntry.data.npcs || []).find(n => n.npcId === npcId);
    if (!npcPlacement) return;
    const npcX = npcPlacement.tx * tileSize + tileSize / 2;
    const npcY = npcPlacement.ty * tileSize + tileSize / 2;
    if (dist(player.x, player.y, npcX, npcY) >= tileSize * 1.5) {
      this.send(player.ws, { type: "buy_item_result", ok: false, reason: "too_far" });
      return;
    }

    const template = ITEMS[itemId];
    if (!template) return;

    const buyPrice = template.value;
    if (player.gold < buyPrice) {
      this.send(player.ws, { type: "buy_item_result", ok: false, reason: "gold" });
      return;
    }

    // Check inventory space (stacking or free slot)
    const inventory = player.inventory;
    const newItem = { ...template, qty: 1 };
    const addIndex = this._addItemToSlots(inventory, newItem);
    if (addIndex === -1) {
      this.send(player.ws, { type: "buy_item_result", ok: false, reason: "inventory_full" });
      return;
    }

    player.gold -= buyPrice;

    this.send(player.ws, {
      type: "buy_item_result",
      ok: true,
      item: inventory[addIndex],
      index: addIndex,
      gold: player.gold,
      buyPrice
    });
  }

  /* ── Equipment slot helpers ───────────────────────────── */

  static EQUIPPABLE_TYPES = new Set([
    "weapon", "shield", "quiver", "armor", "helmet", "pants", "boots", "ring", "amulet"
  ]);

  static EQUIPMENT_SLOTS = [
    "mainHand", "offHand", "armor", "helmet", "pants", "boots", "ring1", "ring2", "amulet"
  ];

  /** Map item type → target equipment slot (rings handled specially). */
  _equipSlotForItem(player, item) {
    switch (item.type) {
      case "weapon": return "mainHand";
      case "shield": case "quiver": return "offHand";
      case "armor":  return "armor";
      case "helmet": return "helmet";
      case "pants":  return "pants";
      case "boots":  return "boots";
      case "amulet": return "amulet";
      case "ring":
        if (!player.equipment.ring1) return "ring1";
        if (!player.equipment.ring2) return "ring2";
        return "ring1"; // both full → swap ring1
      default: return null;
    }
  }

  handleEquipItem(player, msg) {
    if (player.dead) return;
    if (player._tradeWith) return; // Block equip during active trade
    const index = Number(msg.index);
    if (!Number.isInteger(index) || index < 0 || index >= 20) return;

    const inventory = player.inventory;
    const item = inventory[index];
    if (!item || !ServerWorld.EQUIPPABLE_TYPES.has(item.type)) return;

    const slot = this._equipSlotForItem(player, item);
    if (!slot) return;

    // ── 2H / bow / offHand constraint checks ──
    const mainDef = player.equipment.mainHand ? ITEMS[player.equipment.mainHand.id] : null;

    if (slot === "mainHand") {
      const weaponDef = ITEMS[item.id];
      if (weaponDef?.handed === 2 && player.equipment.offHand) {
        // 2H weapon — auto-unequip offHand (unless bow + quiver combo)
        if (weaponDef.requiresQuiver && player.equipment.offHand.type === "quiver") {
          // bow allows quiver to stay
        } else {
          // After the swap, inventory[index] will hold the old mainhand (or null).
          // If old mainhand is null, index itself is free for the offhand.
          const oldMainHand = player.equipment.mainHand;
          if (!oldMainHand) {
            // No old weapon → inventory[index] will be null after swap → use it
            // Do the full swap here: equip new weapon, put offhand in inventory[index]
            player.equipment.mainHand = item;
            inventory[index] = player.equipment.offHand;
            player.equipment.offHand = null;
            this._recalcStats(player);
            this.send(player.ws, {
              type: "equip_item_result", ok: true, index, slot,
              newItem: item, oldItem: null,
              equipment: { ...player.equipment },
              inventory: [...inventory],
              hp: player.hp, maxHp: player.maxHp,
              mana: player.mana, maxMana: player.maxMana, damage: player.damage
            });
            return;
          }
          // Old mainhand exists → need a separate free slot for offhand
          const emptyIdx = inventory.findIndex((s, i) => s === null && i !== index);
          if (emptyIdx === -1) {
            this.send(player.ws, {
              type: "equip_item_result", ok: false,
              reason: "Inventory full — unequip off-hand first.",
              equipment: { ...player.equipment },
              inventory: [...inventory]
            });
            return;
          }
          inventory[emptyIdx] = player.equipment.offHand;
          player.equipment.offHand = null;
        }
      }
    }

    if (slot === "offHand") {
      if (mainDef?.handed === 2) {
        if (mainDef.requiresQuiver && item.type === "quiver") {
          // allow quiver with bow
        } else {
          this.send(player.ws, {
            type: "equip_item_result", ok: false,
            reason: "Cannot equip off-hand with a two-handed weapon.",
            equipment: { ...player.equipment },
            inventory: [...inventory]
          });
          return;
        }
      }
    }

    // ── Quiver: initialise arrow count ──
    if (item.type === "quiver" && item.arrows === undefined) {
      const template = ITEMS[item.id];
      item.arrows = template?.maxArrows || 50;
    }

    // ── Perform the swap ──
    const oldItem = player.equipment[slot] || null;
    player.equipment[slot] = item;
    inventory[index] = oldItem;

    this._recalcStats(player);

    // Build full inventory snapshot for client so auto-unequips are reflected
    this.send(player.ws, {
      type: "equip_item_result",
      ok: true,
      index,
      slot,
      newItem: item,
      oldItem,
      equipment: { ...player.equipment },
      inventory: [...inventory],
      hp: player.hp,
      maxHp: player.maxHp,
      mana: player.mana,
      maxMana: player.maxMana,
      damage: player.damage
    });
  }

  handleUnequipItem(player, msg) {
    if (player.dead) return;
    if (player._tradeWith) return; // Block unequip during active trade
    const slot = msg.slot;
    if (!ServerWorld.EQUIPMENT_SLOTS.includes(slot)) return;

    const item = player.equipment[slot];
    if (!item) return;

    // Find an empty inventory slot
    const emptyIdx = player.inventory.indexOf(null);
    if (emptyIdx === -1) {
      this.send(player.ws, { type: "unequip_item_result", ok: false, reason: "Inventory full" });
      return;
    }

    player.equipment[slot] = null;
    player.inventory[emptyIdx] = item;

    this._recalcStats(player);

    this.send(player.ws, {
      type: "unequip_item_result",
      ok: true,
      slot,
      item,
      index: emptyIdx,
      hp: player.hp,
      maxHp: player.maxHp,
      mana: player.mana,
      maxMana: player.maxMana,
      damage: player.damage
    });
  }

  handleQuestStateUpdate(player, msg) {
    // Accept quest state updates from client (accept, progress) but never allow
    // the client to mark quests as "completed" — that's server-authoritative via handleCompleteQuest
    if (!msg.quests || typeof msg.quests !== "object") return;
    for (const [questId, state] of Object.entries(msg.quests)) {
      if (typeof questId !== "string" || questId.length > 64) continue;
      if (!state || typeof state !== "object") continue;
      // Only allow quests that exist in QUEST_DEFS
      if (!QUEST_DEFS[questId]) continue;
      // Only allow non-completed states to be synced from client
      const existing = player.quests[questId];
      if (existing && existing.state === "completed") continue;
      if (state.state === "completed") continue; // client can't force completion
      // Validate progress array against quest definition objectives
      const def = QUEST_DEFS[questId];
      const objectives = def.objectives || [];
      if (state.progress) {
        if (!Array.isArray(state.progress)) continue;
        // Clamp progress to valid range per objective
        state.progress = state.progress.slice(0, objectives.length).map((val, i) => {
          const count = objectives[i]?.count || 0;
          return clamp(Number(val) || 0, 0, count);
        });
      }
      // Only allow known state values
      if (!["active", "ready_to_turn_in", "not_started"].includes(state.state)) continue;
      player.quests[questId] = state;
    }
  }

  handleCompleteQuest(player, msg) {
    if (player.dead) return;
    const questId = String(msg.questId || "").slice(0, 64);
    const def = QUEST_DEFS[questId];
    if (!def) return;

    // Prevent double-completion using persisted quest state
    const questState = player.quests[questId];
    if (questState && questState.state === "completed") return;

    // Mark as completed in persisted quest state
    player.quests[questId] = {
      ...(questState || {}),
      id: questId,
      state: "completed"
    };

    const rewards = def.rewards || {};
    const rewardItems = [];

    // Grant XP
    if (rewards.xp) this._grantXp(player, rewards.xp);

    // Grant gold
    if (rewards.gold) player.gold = (player.gold || 0) + rewards.gold;

    // Grant items (with stacking)
    for (const itemId of (rewards.items || [])) {
      const template = ITEMS[itemId];
      if (!template) continue;
      const newItem = { ...template, qty: 1 };
      const placed = this._addItemToSlots(player.inventory, newItem);
      if (placed !== -1) {
        rewardItems.push({ item: player.inventory[placed], index: placed });
      }
    }

    this.send(player.ws, {
      type: "quest_complete_result",
      ok: true,
      questId,
      xp: rewards.xp || 0,
      gold: rewards.gold || 0,
      items: rewardItems,
      playerGold: player.gold,
      playerXp: player.xp,
      playerLevel: player.level,
      hp: player.hp,
      maxHp: player.maxHp,
      mana: player.mana,
      maxMana: player.maxMana
    });

    this._savePlayer(player);
  }

  /* ── Hearthstone ────────────────────────────────────── */

  handleAttuneHearthstone(player, msg) {
    if (player.dead) return;
    const statueId = String(msg.statueId || "").slice(0, 64);

    // Verify statue exists on current map
    const mapEntry = this.maps.get(player.mapId);
    if (!mapEntry) return;
    const statues = mapEntry.data.statues || [];
    const statue = statues.find(s => s.id === statueId);
    if (!statue) return;

    // Verify proximity to statue
    const tileSize = mapEntry.collision.tileSize || 48;
    const sx = statue.tx * tileSize + tileSize / 2;
    const sy = statue.ty * tileSize + tileSize / 2;
    if (dist(player.x, player.y, sx, sy) > tileSize * 4) {
      this.send(player.ws, { type: "attune_result", ok: false, reason: "too_far" });
      return;
    }

    // Verify player has hearthstone in inventory
    if (!player.inventory.some(s => s && s.id === "hearthstone")) {
      this.send(player.ws, { type: "attune_result", ok: false, reason: "no_hearthstone" });
      return;
    }

    player.hearthstone = {
      statueId: statue.id,
      statueName: statue.name,
      mapId: player.mapId,
      tx: statue.tx,
      ty: statue.ty,
      lastUsedAt: player.hearthstone?.lastUsedAt || 0
    };

    this.send(player.ws, {
      type: "attune_result",
      ok: true,
      hearthstone: player.hearthstone
    });
  }

  handleUseHearthstone(player, msg) {
    if (player.dead) return;

    // Must have attunement
    if (!player.hearthstone || !player.hearthstone.mapId) {
      this.send(player.ws, { type: "hearthstone_result", ok: false, reason: "not_attuned" });
      return;
    }

    // Must have hearthstone in inventory
    if (!player.inventory.some(s => s && s.id === "hearthstone")) {
      this.send(player.ws, { type: "hearthstone_result", ok: false, reason: "no_hearthstone" });
      return;
    }

    // Check cooldown (180 seconds)
    const now = Date.now();
    const cooldown = (ITEMS["hearthstone"]?.cooldown || 180) * 1000;
    const lastUsed = player.hearthstone.lastUsedAt || 0;
    if (now - lastUsed < cooldown) {
      const remaining = Math.ceil((cooldown - (now - lastUsed)) / 1000);
      this.send(player.ws, { type: "hearthstone_result", ok: false, reason: "cooldown", remaining });
      return;
    }

    // Already casting?
    if (player.casting) {
      this.send(player.ws, { type: "hearthstone_result", ok: false, reason: "already_casting" });
      return;
    }

    // Start cast
    const castTime = (ITEMS["hearthstone"]?.castTime || 8) * 1000;
    player.casting = {
      type: "hearthstone",
      startedAt: now,
      duration: castTime,
      concentration: !!ITEMS["hearthstone"]?.concentration,
      castX: player.x,
      castY: player.y
    };

    this.send(player.ws, {
      type: "hearthstone_cast_start",
      castTime: castTime / 1000,
      destination: player.hearthstone.statueName
    });
  }

  handleCancelHearthstone(player) {
    if (player.casting && player.casting.type === "hearthstone") {
      player.casting = null;
      this.send(player.ws, { type: "hearthstone_cast_cancelled", reason: "manual" });
    }
  }

  /* ── bank actions ───────────────────────────────────── */

  _isNearBanker(player) {
    const mapEntry = this.maps.get(player.mapId);
    if (!mapEntry) return false;
    const tileSize = mapEntry.collision.tileSize || 48;
    const npcsOnMap = mapEntry.data.npcs || [];
    return npcsOnMap.some(npcPlacement => {
      const npcDef = ServerWorld._NPC_DATA[npcPlacement.npcId];
      if (!npcDef || npcDef.type !== "banker") return false;
      const npcX = npcPlacement.tx * tileSize + tileSize / 2;
      const npcY = npcPlacement.ty * tileSize + tileSize / 2;
      return dist(player.x, player.y, npcX, npcY) < tileSize * 1.5;
    });
  }

  handleBankDeposit(player, msg) {
    if (player.dead) return;
    if (!this._isNearBanker(player)) {
      this.send(player.ws, { type: "bank_result", ok: false, reason: "too_far" });
      return;
    }
    const invIndex = Number(msg.invIndex);
    if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= 20) return;

    const item = player.inventory[invIndex];
    if (!item) return;

    // Cannot bank permanent items
    const template = ITEMS[item.id];
    if (template && template.permanent) {
      this.send(player.ws, { type: "bank_result", ok: false, reason: "permanent" });
      return;
    }

    const bankIndex = this._addItemToSlots(player.bank, { ...item });
    if (bankIndex === -1) {
      this.send(player.ws, { type: "bank_result", ok: false, reason: "bank_full" });
      return;
    }
    player.inventory[invIndex] = null;

    this.send(player.ws, {
      type: "bank_result",
      ok: true,
      action: "deposit",
      invIndex,
      bankIndex,
      inventory: player.inventory,
      bank: player.bank
    });
  }

  handleBankWithdraw(player, msg) {
    if (player.dead) return;
    if (!this._isNearBanker(player)) {
      this.send(player.ws, { type: "bank_result", ok: false, reason: "too_far" });
      return;
    }
    const bankIndex = Number(msg.bankIndex);
    if (!Number.isInteger(bankIndex) || bankIndex < 0 || bankIndex >= 48) return;

    const item = player.bank[bankIndex];
    if (!item) return;

    const invIndex = this._addItemToSlots(player.inventory, { ...item });
    if (invIndex === -1) {
      this.send(player.ws, { type: "bank_result", ok: false, reason: "inventory_full" });
      return;
    }
    player.bank[bankIndex] = null;

    this.send(player.ws, {
      type: "bank_result",
      ok: true,
      action: "withdraw",
      invIndex,
      bankIndex,
      inventory: player.inventory,
      bank: player.bank
    });
  }

  /* ── hotbar actions ─────────────────────────────────── */

  handleHotbarUpdate(player, msg) {
    const slots = msg.hotbar;
    if (!Array.isArray(slots) || slots.length !== 10) return;

    // Validate each slot
    for (let i = 0; i < 10; i++) {
      const s = slots[i];
      if (s === null) {
        player.hotbar[i] = null;
      } else if (s && s.type === "skill" && typeof s.skillId === "string") {
        const sid = s.skillId.slice(0, 32);
        if (SKILLS[sid]) {
          player.hotbar[i] = { type: "skill", skillId: sid };
        }
      } else if (s && s.type === "item" && typeof s.itemId === "string") {
        // Validate item exists in items DB AND player owns it
        const itemId = s.itemId.slice(0, 64);
        if (ITEMS[itemId] && player.inventory.some(it => it && it.id === itemId)) {
          player.hotbar[i] = { type: "item", itemId };
        }
      }
    }

    this.send(player.ws, { type: "hotbar_result", ok: true, hotbar: player.hotbar });
  }

  /* ── inventory swap/move ────────────────────────────── */

  handleSplitStack(player, msg) {
    if (player.dead) return;
    if (player._tradeWith) return; // Block split during active trade
    const container = String(msg.container || "inventory").slice(0, 20);
    const index = Number(msg.index);
    const splitQty = Number(msg.qty);

    let slots;
    if (container === "inventory") {
      slots = player.inventory;
    } else if (container === "bank") {
      if (!this._isNearBanker(player)) {
        this.send(player.ws, { type: "split_stack_result", ok: false, reason: "too_far" });
        return;
      }
      slots = player.bank;
    } else {
      this.send(player.ws, { type: "split_stack_result", ok: false, reason: "invalid" });
      return;
    }

    if (!Number.isInteger(index) || index < 0 || index >= slots.length) {
      this.send(player.ws, { type: "split_stack_result", ok: false, reason: "invalid" });
      return;
    }
    if (!Number.isInteger(splitQty) || splitQty < 1) {
      this.send(player.ws, { type: "split_stack_result", ok: false, reason: "invalid" });
      return;
    }

    const item = slots[index];
    if (!item) return;
    const currentQty = item.qty || 1;
    if (splitQty >= currentQty) {
      this.send(player.ws, { type: "split_stack_result", ok: false, reason: "invalid" });
      return;
    }

    // Find an empty slot in the same container
    let emptyIdx = -1;
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i]) { emptyIdx = i; break; }
    }
    if (emptyIdx < 0) {
      this.send(player.ws, { type: "split_stack_result", ok: false, reason: "full" });
      return;
    }

    // Perform the split
    item.qty = currentQty - splitQty;
    slots[emptyIdx] = { ...item, qty: splitQty };

    this.send(player.ws, {
      type: "split_stack_result",
      ok: true,
      inventory: player.inventory,
      bank: player.bank
    });
  }

  handleSwapItems(player, msg) {
    if (player.dead) return;
    const from = Number(msg.from);
    const to = Number(msg.to);
    const fromContainer = String(msg.fromContainer || "inventory").slice(0, 20);
    const toContainer = String(msg.toContainer || "inventory").slice(0, 20);

    const getSlots = (name) => {
      if (name === "inventory") return player.inventory;
      if (name === "bank") {
        if (!this._isNearBanker(player)) return null;
        return player.bank;
      }
      return null;
    };

    const srcSlots = getSlots(fromContainer);
    const dstSlots = getSlots(toContainer);
    if (!srcSlots || !dstSlots) {
      this.send(player.ws, { type: "swap_result", ok: false, reason: "invalid" });
      return;
    }

    if (from < 0 || from >= srcSlots.length || to < 0 || to >= dstSlots.length) {
      this.send(player.ws, { type: "swap_result", ok: false, reason: "invalid" });
      return;
    }

    const srcItem = srcSlots[from];
    const dstItem = dstSlots[to];

    // Don't allow banking permanent items
    if (toContainer === "bank" && srcItem) {
      const template = ITEMS[srcItem.id];
      if (template && template.permanent) {
        this.send(player.ws, { type: "swap_result", ok: false, reason: "permanent" });
        return;
      }
    }

    // If same item type and stackable, try to merge
    if (srcItem && dstItem && srcItem.id === dstItem.id) {
      const template = ITEMS[srcItem.id];
      const maxStack = (template && template.stackSize) || 1;
      if (maxStack > 1) {
        const total = (srcItem.qty || 1) + (dstItem.qty || 1);
        if (total <= maxStack) {
          dstItem.qty = total;
          srcSlots[from] = null;
        } else {
          dstItem.qty = maxStack;
          srcItem.qty = total - maxStack;
        }
        this.send(player.ws, {
          type: "swap_result", ok: true,
          inventory: player.inventory,
          bank: player.bank
        });
        return;
      }
    }

    // Simple swap
    srcSlots[from] = dstItem;
    dstSlots[to] = srcItem;

    this.send(player.ws, {
      type: "swap_result", ok: true,
      inventory: player.inventory,
      bank: player.bank
    });
  }

  handleDropItem(player, msg) {
    if (player.dead) return;
    if (player._tradeWith) return; // Block drop during active trade
    const index = Number(msg.index);
    if (!Number.isInteger(index) || index < 0 || index >= 20) return;

    const item = player.inventory[index];
    if (!item) return;

    // Prevent dropping permanent items (e.g. hearthstone)
    const template = ITEMS[item.id];
    if (template?.permanent) {
      this.send(player.ws, { type: "drop_item_result", ok: false, reason: "Cannot drop that item." });
      return;
    }

    player.inventory[index] = null;

    // Create world drop at player position
    const drop = {
      id: `d${dropIdCounter++}`,
      x: player.x + randInt(-12, 12),
      y: player.y + randInt(-12, 12),
      gold: 0,
      item: { ...item },
      ownerId: null,
      ownerUntil: 0,
      expiresAt: Date.now() + 60000
    };

    const mapEntry = this.maps.get(player.mapId);
    if (mapEntry) mapEntry.drops.push(drop);

    this.send(player.ws, {
      type: "drop_item_result", ok: true, index,
      inventory: [...player.inventory]
    });

    this.broadcastToMap(player.mapId, {
      type: "drop_spawned",
      drop: { id: drop.id, x: drop.x, y: drop.y }
    });
  }

  handleLootOpen(player, msg) {
    if (player.dead) return;
    const dropId = msg.dropId;
    if (typeof dropId !== "string") return;

    const mapEntry = this.maps.get(player.mapId);
    if (!mapEntry) return;

    const drop = mapEntry.drops.find(d => d.id === dropId);
    if (!drop) {
      this.send(player.ws, { type: "loot_open_result", ok: false, reason: "Drop not found." });
      return;
    }

    if (dist(player.x, player.y, drop.x, drop.y) > 64) {
      this.send(player.ws, { type: "loot_open_result", ok: false, reason: "Too far away." });
      return;
    }

    const now = Date.now();
    if (now < drop.ownerUntil && player.id !== drop.ownerId) {
      this.send(player.ws, { type: "loot_open_result", ok: false, reason: "Someone else's loot." });
      return;
    }

    player.lootingDropId = dropId;

    this.send(player.ws, {
      type: "loot_open_result",
      ok: true,
      dropId,
      gold: drop.gold || 0,
      item: drop.item || null
    });
  }

  handleLootTake(player, msg) {
    if (player.dead) {
      this.send(player.ws, { type: "loot_take_result", ok: false, reason: "You are dead." });
      return;
    }
    const dropId = msg.dropId;
    const what = msg.what; // "gold", "item", "all"
    if (typeof dropId !== "string") {
      this.send(player.ws, { type: "loot_take_result", ok: false, reason: "Invalid request." });
      return;
    }
    if (!["gold", "item", "all"].includes(what)) {
      this.send(player.ws, { type: "loot_take_result", ok: false, reason: "Invalid loot action." });
      return;
    }

    const mapEntry = this.maps.get(player.mapId);
    if (!mapEntry) return;

    const drop = mapEntry.drops.find(d => d.id === dropId);
    if (!drop) {
      this.send(player.ws, { type: "loot_take_result", ok: false, reason: "Drop not found." });
      return;
    }

    if (dist(player.x, player.y, drop.x, drop.y) > 64) {
      this.send(player.ws, { type: "loot_take_result", ok: false, reason: "Too far away." });
      return;
    }

    const now = Date.now();
    if (now < drop.ownerUntil && player.id !== drop.ownerId) {
      this.send(player.ws, { type: "loot_take_result", ok: false, reason: "Someone else's loot." });
      return;
    }

    let takenGold = 0;
    let takenItem = null;
    let lootIndex = -1;

    if (what === "gold" || what === "all") {
      if (drop.gold > 0) {
        takenGold = drop.gold;
        player.gold = (player.gold || 0) + drop.gold;
        drop.gold = 0;
      }
    }

    if (what === "item" || what === "all") {
      if (drop.item) {
        const lootItem = { ...drop.item, qty: drop.item.qty || 1 };
        lootIndex = this._addItemToSlots(player.inventory, lootItem);
        if (lootIndex >= 0) {
          takenItem = drop.item;
          drop.item = null;
        }
      }
    }

    const dropEmpty = !drop.gold && !drop.item;

    this.send(player.ws, {
      type: "loot_take_result",
      ok: true,
      dropId,
      takenGold,
      takenItem,
      lootIndex,
      slotItem: lootIndex >= 0 ? player.inventory[lootIndex] : null,
      remainingGold: drop.gold || 0,
      remainingItem: drop.item || null,
      dropEmpty,
      inventory: [...player.inventory]
    });

    if (dropEmpty) {
      mapEntry.drops = mapEntry.drops.filter(d => d.id !== dropId);
      this.broadcastToMap(player.mapId, { type: "drop_removed", dropId });
      if (player.lootingDropId === dropId) player.lootingDropId = null;
    }
  }

  _completeCast(player) {
    if (!player.casting) return;
    const cast = player.casting;
    player.casting = null;

    if (cast.type === "hearthstone") {
      this._completeCastHearthstone(player);
    } else if (cast.type === "skill") {
      this._completeCastSkill(player, cast);
    } else if (cast.type === "channel") {
      this._completeCastChannel(player, cast);
    }
    // Notify other players the cast/channel ended
    this.broadcastToMap(player.mapId, {
      type: "player_cast_end",
      playerId: player.id,
    }, player.id);
  }

  _completeCastHearthstone(player) {
    const hs = player.hearthstone;
    player.hearthstone.lastUsedAt = Date.now();

    // Teleport
    const targetMapId = hs.mapId;
    const mapEntry = this.maps.get(targetMapId);
    if (!mapEntry) return;

    const tileSize = mapEntry.collision.tileSize || 48;
    const targetX = hs.tx * tileSize + tileSize / 2;
    const targetY = hs.ty * tileSize + tileSize / 2;

    if (player.mapId !== targetMapId) {
      // Cross-map teleport — clean up duel
      this._endDuel(player);
      this._clearDuelPending(player);

      player.mapId = targetMapId;
      player.x = targetX;
      player.y = targetY;
      player.floor = hs.floor || 0;

      this.send(player.ws, {
        type: "hearthstone_teleport",
        mapId: targetMapId,
        x: targetX,
        y: targetY,
        enemies: this.enemySnapshot(targetMapId),
        players: this.otherPlayersSnapshot(player.id, targetMapId),
        drops: this.dropsSnapshot(targetMapId),
        hearthstone: player.hearthstone
      });
    } else {
      // Same-map teleport
      player.x = targetX;
      player.y = targetY;
      player.floor = hs.floor || 0;

      this.send(player.ws, {
        type: "hearthstone_teleport",
        mapId: targetMapId,
        x: targetX,
        y: targetY,
        hearthstone: player.hearthstone
      });
    }
  }

  _interruptCast(player, reason) {
    if (!player.casting) return;
    const castType = player.casting.type;
    const skillId = player.casting.skillId || null;
    player.casting = null;

    if (castType === "hearthstone") {
      this.send(player.ws, { type: "hearthstone_cast_cancelled", reason: reason || "interrupted" });
    } else if (castType === "skill") {
      this.send(player.ws, { type: "skill_cast_cancelled", skillId, reason: reason || "interrupted" });
    } else if (castType === "channel") {
      this.send(player.ws, { type: "skill_channel_cancelled", skillId, reason: reason || "interrupted" });
    }
    // Notify other players the cast/channel ended
    this.broadcastToMap(player.mapId, {
      type: "player_cast_end",
      playerId: player.id,
    }, player.id);
  }

  /**
   * Complete a skill cast — re-invoke the skill resolution logic.
   * Mana/cooldown were already consumed at cast start.
   */
  _completeCastSkill(player, cast) {
    const skillDef = cast.skillDef;
    const skillId = cast.skillId;
    if (!skillDef) return;
    if (player.dead) return;

    // Re-validate target (enemy may have died or moved during cast)
    const targeting = skillDef.targeting;
    const now = Date.now();
    let enemy = null;
    let pvpTarget = null;

    if (targeting === "enemy") {
      const mapEntry = this.maps.get(player.mapId);
      if (!mapEntry) return;

      if (cast.targetPlayerId) {
        // PVP target
        pvpTarget = this.players.get(cast.targetPlayerId);
        if (!pvpTarget || pvpTarget.dead || pvpTarget.mapId !== player.mapId) {
          this.send(player.ws, { type: "skill_cast_cancelled", skillId, reason: "target_lost" });
          return;
        }
        if (!this._canPvpAttack(player, pvpTarget, mapEntry)) {
          this.send(player.ws, { type: "skill_cast_cancelled", skillId, reason: "target_lost" });
          return;
        }
        const d = dist(player.x, player.y, pvpTarget.x, pvpTarget.y);
        const skillRange = skillDef.range || player.attackRange;
        if (d > skillRange + 30) {
          this.send(player.ws, { type: "skill_cast_cancelled", skillId, reason: "out_of_range" });
          return;
        }
      } else {
        enemy = mapEntry.enemies.find(e => e.id === cast.enemyId);
        if (!enemy || enemy.dead) {
          this.send(player.ws, { type: "skill_cast_cancelled", skillId, reason: "target_lost" });
          return;
        }
        const d = dist(player.x, player.y, enemy.x, enemy.y);
        const skillRange = skillDef.range || player.attackRange;
        if (d > skillRange + 30) {
          this.send(player.ws, { type: "skill_cast_cancelled", skillId, reason: "out_of_range" });
          return;
        }
      }
    }

    // Notify cast complete, then resolve using the same msg shape
    this.send(player.ws, { type: "skill_cast_complete", skillId });
    // Build a synthetic msg and call the resolution path
    this._resolveSkill(player, skillDef, skillId, enemy, now, {
      enemyId: cast.enemyId,
      targetPlayerId: cast.targetPlayerId,
      targetX: cast.targetX,
      targetY: cast.targetY,
    }, pvpTarget);
  }

  _completeCastChannel(player, cast) {
    this.send(player.ws, { type: "skill_channel_complete", skillId: cast.skillId });
  }

  /**
   * Process one tick of a channeled spell.
   */
  _channelTick(player, now) {
    const cast = player.casting;
    if (!cast || cast.type !== "channel") return;

    const skillDef = cast.skillDef;
    const skillId = cast.skillId;
    const tickNum = cast.totalTicks - cast.ticksRemaining + 1;

    cast.lastTickAt = now;
    cast.ticksRemaining--;

    const targeting = skillDef.targeting;

    if (skillDef.type === "attack" || skillDef.type === "debuff") {
      const isAoe = targeting === "self_aoe" || targeting === "ground_aoe" || targeting === "directional";

      if (isAoe) {
        // AoE channel tick
        const mapEntry = this.maps.get(player.mapId);
        if (!mapEntry) return;
        const ts = mapEntry.collision.tileSize || 48;
        const pattern = AOE_PATTERNS[skillDef.aoePattern];
        if (!pattern) return;

        let originX, originY, dirIdx;
        if (targeting === "self_aoe") {
          originX = player.x; originY = player.y;
        } else if (targeting === "ground_aoe") {
          originX = cast.targetX; originY = cast.targetY;
        } else {
          originX = player.x; originY = player.y;
        }
        const originTx = Math.floor(originX / ts);
        const originTy = Math.floor(originY / ts);

        if (pattern.directional) {
          const dx = (cast.targetX || player.x) - player.x;
          const dy = (cast.targetY || player.y) - player.y;
          dirIdx = directionIndex(dx, dy);
        }

        const affectedTiles = resolveAoeTiles(pattern, originTx, originTy, dirIdx);

        const hits = [];
        let baseDmg = (skillDef.damage || 0) + (skillDef.damagePerLevel || 0) * (player.level - 1);
        if (!skillDef.range && skillDef.damageType === "physical") baseDmg += player.damage;
        const dmgMult = this._getPlayerDamageMultiplier(player);

        for (const e of mapEntry.enemies) {
          if (e.dead) continue;
          if ((e.floor || 0) !== (player.floor || 0)) continue;
          if (!this._enemyOverlapsTiles(e, ts, affectedTiles)) continue;

          const takenMult = this._getEnemyDamageTakenMult(e);
          const damage = Math.max(1, Math.round((baseDmg + randInt(-2, 4)) * dmgMult * takenMult));
          e.hp -= damage;

          let debuffApplied = null;
          if (skillDef.debuff) {
            if (!e.activeDebuffs) e.activeDebuffs = [];
            e.activeDebuffs = e.activeDebuffs.filter(d => d.id !== skillDef.debuff.id);
            e.activeDebuffs.push({
              ...skillDef.debuff,
              appliedAt: now,
              expiresAt: now + (skillDef.debuff.duration || 0) * 1000,
              casterId: player.id,
              casterLevel: player.level,
            });
            debuffApplied = { id: skillDef.debuff.id, stat: skillDef.debuff.stat, modifier: skillDef.debuff.modifier, duration: skillDef.debuff.duration };
          }

          hits.push({ enemyId: e.id, damage, enemyHp: e.hp, enemyMaxHp: e.maxHp, debuff: debuffApplied });

          this.broadcastToMap(player.mapId, {
            type: "combat_visual",
            attackerId: player.id,
            ax: player.x, ay: player.y,
            enemyId: e.id, ex: e.x, ey: e.y,
            skillId,
            hitParticle: skillDef.hitParticle || skillDef.particle || null,
            hitSfx: skillDef.sfx || null,
            projectileSpeed: 0,
            damageType: skillDef.damageType || "physical",
            damage, enemyHp: e.hp, enemyMaxHp: e.maxHp,
          }, player.id);

          if (e.hp <= 0) {
            e.hp = 0;
            this.killEnemy(e, player);
          }
        }

        // ── AoE channel PVP: also hit players in the affected area ──
        const pvpHits = [];
        for (const [pid, p] of this.players) {
          if (p.dead || p.mapId !== player.mapId || p.id === player.id) continue;
          if ((p.floor || 0) !== (player.floor || 0)) continue;
          if (!this._canPvpAttack(player, p, mapEntry)) continue;
          const ptx = Math.floor(p.x / ts);
          const pty = Math.floor(p.y / ts);
          if (!affectedTiles.has(tileKey(ptx, pty))) continue;

          const pvpDmg = Math.max(1, Math.round((baseDmg + randInt(-2, 4)) * dmgMult));
          p.hp -= pvpDmg;
          pvpHits.push({ targetPlayerId: p.id, damage: pvpDmg, targetHp: p.hp, targetMaxHp: p.maxHp });

          this.send(p.ws, {
            type: "player_damaged", attackerId: player.id, attackerName: player.name,
            damage: pvpDmg, hp: p.hp, maxHp: p.maxHp, isPvp: true, skillId,
          });
          this.broadcastToMap(player.mapId, {
            type: "pvp_combat_visual",
            attackerId: player.id, ax: player.x, ay: player.y,
            targetId: p.id, tx: p.x, ty: p.y,
            skillId,
            hitParticle: skillDef.hitParticle || skillDef.particle || null,
            hitSfx: skillDef.sfx || null,
            damageType: skillDef.damageType || "physical",
            damage: pvpDmg, targetHp: p.hp, targetMaxHp: p.maxHp,
          });
          this._setPvpCombatTimer(player, "attack", now);
          this._setPvpCombatTimer(p, "defend", now);

          if (p.hp <= 0) {
            p.hp = 0;
            this._onPvpDeath(p, player);
          }
        }

        const aoeTileCoords = [...affectedTiles].map(k => {
          const [tx, ty] = k.split(",").map(Number);
          return [tx * ts + ts / 2, ty * ts + ts / 2];
        });
        this.send(player.ws, {
          type: "skill_channel_tick",
          skillId,
          tickNum,
          aoe: true,
          hits,
          pvpHits: pvpHits.length > 0 ? pvpHits : undefined,
          aoeTiles: aoeTileCoords,
        });
        // Broadcast AoE ground effect to observers
        if (skillDef.aoeParticleEffect) {
          this.broadcastToMap(player.mapId, {
            type: "skill_aoe_visual",
            playerId: player.id,
            skillId,
            aoeParticleEffect: skillDef.aoeParticleEffect,
            aoeTiles: aoeTileCoords,
          }, player.id);
        }
      } else {
        // Single-target channel tick
        const mapEntry = this.maps.get(player.mapId);
        if (!mapEntry) { this._interruptCast(player, "target_lost"); return; }

        // PVP target
        if (cast.targetPlayerId) {
          const pvpTarget = this.players.get(cast.targetPlayerId);
          if (!pvpTarget || pvpTarget.dead || pvpTarget.mapId !== player.mapId) {
            this._interruptCast(player, "target_lost"); return;
          }
          if (!this._canPvpAttack(player, pvpTarget, mapEntry)) {
            this._interruptCast(player, "target_lost"); return;
          }
          const d = dist(player.x, player.y, pvpTarget.x, pvpTarget.y);
          const skillRange = skillDef.range || player.attackRange;
          if (d > skillRange + 30) { this._interruptCast(player, "out_of_range"); return; }

          let baseDmg = (skillDef.damage || 0) + (skillDef.damagePerLevel || 0) * (player.level - 1);
          if (skillDef.damageType === "physical") baseDmg += player.damage;
          const dmgMult = this._getPlayerDamageMultiplier(player);
          const damage = Math.max(1, Math.round((baseDmg + randInt(-2, 4)) * dmgMult));
          pvpTarget.hp -= damage;

          // Broadcast projectile for channeled skills with projectileSpeed
          if (skillDef.projectileSpeed > 0) {
            this.broadcastToMap(player.mapId, {
              type: "projectile_spawn",
              attackerId: player.id,
              sx: player.x, sy: player.y,
              tx: pvpTarget.x, ty: pvpTarget.y,
              targetPlayerId: pvpTarget.id,
              speed: skillDef.projectileSpeed,
              skillId,
              damageType: skillDef.damageType || "physical",
            });
          }

          this.send(player.ws, {
            type: "skill_channel_tick",
            skillId,
            tickNum,
            pvpHit: { targetPlayerId: pvpTarget.id, damage, targetHp: pvpTarget.hp, targetMaxHp: pvpTarget.maxHp },
          });
          this.send(pvpTarget.ws, {
            type: "player_damaged", attackerId: player.id, attackerName: player.name,
            damage, hp: pvpTarget.hp, maxHp: pvpTarget.maxHp, isPvp: true, skillId,
          });
          this.broadcastToMap(player.mapId, {
            type: "pvp_combat_visual",
            attackerId: player.id, ax: player.x, ay: player.y,
            targetId: pvpTarget.id, tx: pvpTarget.x, ty: pvpTarget.y,
            skillId,
            hitParticle: skillDef.hitParticle || skillDef.particle || null,
            hitSfx: skillDef.sfx || null,
            damageType: skillDef.damageType || "physical",
            damage, targetHp: pvpTarget.hp, targetMaxHp: pvpTarget.maxHp,
            projectileHit: skillDef.projectileSpeed > 0 ? true : undefined,
          });
          this._setPvpCombatTimer(player, "attack", now);
          this._setPvpCombatTimer(pvpTarget, "defend", now);

          if (pvpTarget.hp <= 0) {
            pvpTarget.hp = 0;
            this._onPvpDeath(pvpTarget, player);
            this._interruptCast(player, "target_lost");
          }
        } else {
          // PVE target
          const enemy = mapEntry.enemies.find(e => e.id === cast.enemyId);
          if (!enemy || enemy.dead) { this._interruptCast(player, "target_lost"); return; }

          const d = dist(player.x, player.y, enemy.x, enemy.y);
          const skillRange = skillDef.range || player.attackRange;
          if (d > skillRange + 30) { this._interruptCast(player, "out_of_range"); return; }

          let baseDmg = (skillDef.damage || 0) + (skillDef.damagePerLevel || 0) * (player.level - 1);
          if (!skillDef.range && skillDef.damageType === "physical") baseDmg += player.damage;
          const dmgMult = this._getPlayerDamageMultiplier(player);
          const takenMult = this._getEnemyDamageTakenMult(enemy);
          const damage = Math.max(1, Math.round((baseDmg + randInt(-2, 4)) * dmgMult * takenMult));
          enemy.hp -= damage;

          let debuffApplied = null;
          if (skillDef.debuff) {
            if (!enemy.activeDebuffs) enemy.activeDebuffs = [];
            enemy.activeDebuffs = enemy.activeDebuffs.filter(d => d.id !== skillDef.debuff.id);
            enemy.activeDebuffs.push({
              ...skillDef.debuff,
              appliedAt: now,
              expiresAt: now + (skillDef.debuff.duration || 0) * 1000,
              casterId: player.id,
              casterLevel: player.level,
            });
            debuffApplied = { id: skillDef.debuff.id, stat: skillDef.debuff.stat, modifier: skillDef.debuff.modifier, duration: skillDef.debuff.duration };
          }

          // Broadcast projectile for channeled skills with projectileSpeed
          if (skillDef.projectileSpeed > 0) {
            this.broadcastToMap(player.mapId, {
              type: "projectile_spawn",
              attackerId: player.id,
              sx: player.x, sy: player.y,
              tx: enemy.x, ty: enemy.y,
              targetEnemyId: enemy.id,
              speed: skillDef.projectileSpeed,
              skillId,
              damageType: skillDef.damageType || "physical",
            });
          }

          this.send(player.ws, {
            type: "skill_channel_tick",
            skillId,
            tickNum,
            enemyId: enemy.id,
            damage,
            enemyHp: enemy.hp,
            enemyMaxHp: enemy.maxHp,
            debuff: debuffApplied,
          });

          this.broadcastToMap(player.mapId, {
            type: "combat_visual",
            attackerId: player.id,
            ax: player.x, ay: player.y,
            enemyId: enemy.id, ex: enemy.x, ey: enemy.y,
            skillId,
            hitParticle: skillDef.hitParticle || skillDef.particle || null,
            hitSfx: skillDef.sfx || null,
            projectileHit: skillDef.projectileSpeed > 0 ? true : false,
            damageType: skillDef.damageType || "physical",
            damage, enemyHp: enemy.hp, enemyMaxHp: enemy.maxHp,
          }, player.id);

          if (enemy.hp <= 0) {
            enemy.hp = 0;
            this.killEnemy(enemy, player);
            this._interruptCast(player, "target_lost");
          }
        }
      }
    } else if (skillDef.type === "heal") {
      const healAmount = (skillDef.healAmount || 0) + (skillDef.healPerLevel || 0) * (player.level - 1);
      player.hp = Math.min(player.maxHp, player.hp + healAmount);

      this.send(player.ws, {
        type: "skill_channel_tick",
        skillId,
        tickNum,
        healAmount,
        hp: player.hp,
        maxHp: player.maxHp,
      });

      if (skillDef.particle) {
        this.broadcastToMap(player.mapId, {
          type: "combat_visual",
          attackerId: player.id,
          ax: player.x, ay: player.y,
          selfTarget: true,
          particle: skillDef.particle,
          sfx: skillDef.sfx || null,
        }, player.id);
      }
    } else if (skillDef.type === "buff" || skillDef.type === "support") {
      if (skillDef.buff) {
        if (!player.activeBuffs) player.activeBuffs = [];
        player.activeBuffs = player.activeBuffs.filter(b => b.id !== skillDef.buff.id);
        player.activeBuffs.push({
          ...skillDef.buff,
          appliedAt: now,
          expiresAt: now + (skillDef.buff.duration || 0) * 1000,
        });
      }

      this.send(player.ws, {
        type: "skill_channel_tick",
        skillId,
        tickNum,
        buff: skillDef.buff ? { id: skillDef.buff.id, stat: skillDef.buff.stat, modifier: skillDef.buff.modifier, duration: skillDef.buff.duration } : null,
      });
    }
  }

  /* ── stat recalculation ─────────────────────────────── */

  _recalcStats(player) {
    const eq = player.equipment;
    const allSlots = ["mainHand", "offHand", "armor", "helmet", "pants", "boots", "ring1", "ring2", "amulet"];
    const cs = classStats(player.charClass);

    // Sum all stat bonuses from every equipped item (any slot can boost any stat)
    let hpBonus = 0;
    let manaBonus = 0;
    let attackBonus = 0;
    let defenseBonus = 0;

    for (const slot of allSlots) {
      const item = eq[slot];
      if (!item) continue;
      if (item.stats) {
        hpBonus += item.stats.maxHp || 0;
        manaBonus += item.stats.maxMana || 0;
        attackBonus += item.stats.attack || 0;
        defenseBonus += item.stats.defense || 0;
      } else {
        // Backward compat for old item format in existing saves
        hpBonus += item.hpBonus || 0;
        manaBonus += item.manaBonus || 0;
        attackBonus += item.attackBonus || 0;
      }
    }

    const maxHp = cs.maxHp + (player.level - 1) * cs.hpPerLevel + hpBonus;
    const maxMana = cs.maxMana + (player.level - 1) * cs.manaPerLevel + manaBonus;
    const damage = player.baseDamage + attackBonus;

    // Use weapon range if present (ranged weapons), otherwise default melee range
    const weapon = eq.mainHand || null;
    const weaponDef = weapon ? ITEMS[weapon.id] : null;
    player.attackRange = weaponDef?.range || cs.attackRange;

    // Preserve HP/mana ratio when max changes
    const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 1;
    const manaRatio = player.maxMana > 0 ? player.mana / player.maxMana : 1;

    player.maxHp = maxHp;
    player.maxMana = maxMana;
    player.damage = damage;
    player.defense = defenseBonus;
    player.hp = clamp(Math.round(maxHp * hpRatio), 1, maxHp);
    player.mana = clamp(Math.round(maxMana * manaRatio), 0, maxMana);
  }

  _xpToLevelForLevel(level) {
    return Math.round(160 * Math.pow(1.28, level - 1));
  }

  _grantXp(player, amount) {
    player.xp = (player.xp || 0) + amount;
    let xpToLevel = this._xpToLevelForLevel(player.level);

    while (player.xp >= xpToLevel && player.level < 100) {
      player.xp -= xpToLevel;
      player.level += 1;
      const cs = classStats(player.charClass);
      player.baseDamage = cs.damage + (player.level - 1) * cs.damagePerLevel;
      this._recalcStats(player);
      // Fully heal on level-up
      player.hp = player.maxHp;
      player.mana = player.maxMana;
      xpToLevel = this._xpToLevelForLevel(player.level);
    }

    // Save after any XP grant (covers level-ups, enemy kills, etc)
    this._savePlayer(player);
  }

  /**
   * Grant XP from an enemy kill, split among eligible party members.
   * Uses PARTY_CONFIG.xpShare settings for range, level diff, and split mode.
   */
  _grantPartyXp(killer, totalXp) {
    const cfg = PARTY_CONFIG.xpShare || {};
    if (!cfg.enabled || !killer.partyId) {
      // No party or sharing disabled — killer gets 100%
      this._grantXp(killer, totalXp);
      return;
    }

    const party = this.parties.get(killer.partyId);
    if (!party) {
      this._grantXp(killer, totalXp);
      return;
    }

    const rangeTiles = cfg.rangeTiles ?? 50;
    const levelDiff = cfg.levelDiff ?? 4;
    const range = rangeTiles * 16; // convert tiles to pixels (16px per tile)

    // Collect eligible recipients (same map, within range, within level diff)
    const eligible = [];
    for (const memberId of party.members) {
      const m = this.players.get(memberId);
      if (!m) continue;
      if (m.mapId !== killer.mapId) continue;

      const dx = m.x - killer.x;
      const dy = m.y - killer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (m.id !== killer.id && dist > range) continue;

      if (Math.abs(m.level - killer.level) > levelDiff) continue;

      eligible.push(m);
    }

    if (eligible.length <= 1) {
      // Only the killer qualifies — full XP
      this._grantXp(killer, totalXp);
      return;
    }

    // Split evenly, but scale by member's level relative to killer
    for (const m of eligible) {
      // Reduce XP for members much lower level than killer (anti-power-leveling)
      const lvlRatio = m.level / Math.max(1, killer.level);
      const scaledShare = Math.max(1, Math.floor((totalXp / eligible.length) * Math.min(1, lvlRatio)));
      this._grantXp(m, scaledShare);
      // Notify non-killers they received shared XP
      if (m.id !== killer.id) {
        this.send(m.ws, {
          type: "chat",
          channel: "system",
          message: `You received ${scaledShare} shared XP.`
        });
      }
    }
  }

  /**
   * Share quest kill credit with eligible party members (not the killer).
   * Only "kill" objectives are shared; other objective types are individual.
   */
  _shareQuestKillCredit(killer, enemyType) {
    const cfg = PARTY_CONFIG.questShareKills || {};
    if (!cfg.enabled || !killer.partyId) return;

    const party = this.parties.get(killer.partyId);
    if (!party) return;

    const rangeTiles = cfg.rangeTiles ?? 50;
    const levelDiff = cfg.levelDiff ?? 4;
    const range = rangeTiles * 16; // tiles → pixels

    for (const memberId of party.members) {
      if (memberId === killer.id) continue; // killer already got credit via enemy_killed
      const m = this.players.get(memberId);
      if (!m) continue;
      if (m.mapId !== killer.mapId) continue;

      const dx = m.x - killer.x;
      const dy = m.y - killer.y;
      if (Math.sqrt(dx * dx + dy * dy) > range) continue;
      if (Math.abs(m.level - killer.level) > levelDiff) continue;

      // Check if this member has an active quest needing this enemy type
      let hasRelevantQuest = false;
      for (const [questId, qs] of Object.entries(m.quests || {})) {
        if (qs.state !== "active") continue;
        const def = QUEST_DEFS[questId];
        if (!def) continue;
        for (const obj of (def.objectives || [])) {
          if (obj.type === "kill" && obj.target === enemyType) {
            hasRelevantQuest = true;
            break;
          }
        }
        if (hasRelevantQuest) break;
      }

      if (hasRelevantQuest) {
        this.send(m.ws, { type: "quest_kill_credit", enemyType });
      }
    }
  }

  /* ── enemy management ───────────────────────────────── */

  _createEnemiesForMap(mapData, collision) {
    const enemies = [];
    const tileSize = collision.tileSize;
    const spawns = mapData.enemySpawns || [];

    for (const spawn of spawns) {
      const type = spawn.type;
      const positions = spawn.positions || [];
      const floor = spawn.floor || 0;
      for (const [tx, ty] of positions) {
        const t = ENEMY_TYPES[type];
        const ets = (t && t.tileSize) || 1;
        const cx = tx * tileSize + (ets * tileSize) / 2;
        const cy = ty * tileSize + (ets * tileSize) / 2;
        const e = this.makeEnemy(type, cx, cy, floor);
        if (e) enemies.push(e);
      }
    }

    return enemies;
  }

  makeEnemy(type, x, y, floor = 0) {
    const t = ENEMY_TYPES[type];
    if (!t) {
      console.warn(`[ServerWorld] Unknown enemy type: ${type}`);
      return null;
    }
    return {
      id: `e${enemyIdCounter++}`,
      type,
      name: t.name,
      x, y,
      spawnX: x,
      spawnY: y,
      floor,
      tileSize: t.tileSize || 1,
      radius: t.radius || (((t.tileSize || 1) * 48) / 2),
      hp: t.maxHp,
      maxHp: t.maxHp,
      damage: t.damage,
      speed: t.speed,
      xpReward: t.xp,
      goldMin: t.goldMin,
      goldMax: t.goldMax,
      respawnSeconds: t.respawnSeconds,
      color: t.color,
      dead: false,
      deadUntil: 0,
      aggroRange: t.aggroRange || 210,
      attackRange: t.attackRange || 34,
      attackCooldown: t.attackCooldown || 1.35,
      lastAttackAt: 0,
      targetPlayerId: null,
      wanderDir: { x: 0, y: 0 },
      wanderTimer: 0,
      wanderIdle: true,
      loot: t.loot || []
    };
  }

  killEnemy(enemy, killerPlayer) {
    enemy.dead = true;
    enemy.deadUntil = Date.now() + enemy.respawnSeconds * 1000;
    enemy.targetPlayerId = null;

    // create loot drop using data-driven loot table
    const gold = randInt(enemy.goldMin, enemy.goldMax);
    let item = null;

    for (const lootEntry of (enemy.loot || [])) {
      if (chance(lootEntry.chance)) {
        const template = ITEMS[lootEntry.itemId];
        if (template) {
          item = { ...template };
          break; // only one item per kill
        }
      }
    }

    const drop = {
      id: `d${dropIdCounter++}`,
      x: enemy.x + randInt(-8, 8),
      y: enemy.y + randInt(-8, 8),
      gold,
      item,
      ownerId: killerPlayer.id,
      ownerUntil: Date.now() + 10000,
      expiresAt: Date.now() + 25000
    };

    const mapEntry = this.maps.get(killerPlayer.mapId);
    if (mapEntry) mapEntry.drops.push(drop);

    // Grant XP (party-shared if applicable)
    this._grantPartyXp(killerPlayer, enemy.xpReward);

    // tell killer about kill
    this.send(killerPlayer.ws, {
      type: "enemy_killed",
      enemyId: enemy.id,
      enemyType: enemy.type,
      xpReward: enemy.xpReward
    });

    // Share quest kill credit with eligible party members
    this._shareQuestKillCredit(killerPlayer, enemy.type);

    // tell everyone on this map about the drop
    this.broadcastToMap(killerPlayer.mapId, {
      type: "drop_spawned",
      drop: { id: drop.id, x: drop.x, y: drop.y }
    });
  }

  /* ── server-side projectiles ─────────────────────────── */

  updateProjectiles(mapEntry, dt) {
    const projs = mapEntry.projectiles;
    let write = 0;
    for (let i = 0; i < projs.length; i++) {
      const proj = projs[i];

      // PVP projectiles target a player
      if (proj.targetPlayerId) {
        const target = this.players.get(proj.targetPlayerId);
        if (!target || target.dead || target.mapId !== mapEntry._mapId) continue;

        const dx = target.x - proj.x;
        const dy = target.y - proj.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const step = proj.speed * dt;
        const hitDist = 24 + 4;

        if (d <= hitDist || step >= d) {
          this._resolvePvpProjectileHit(proj, target, mapEntry);
          continue;
        }
        proj.x += (dx / d) * step;
        proj.y += (dy / d) * step;
        projs[write++] = proj;
        continue;
      }

      // PVE projectiles target an enemy
      const enemy = mapEntry.enemies.find(e => e.id === proj.targetEnemyId);

      // Enemy gone or dead — projectile fizzles
      if (!enemy || enemy.dead) continue;

      // Homing: direction toward enemy
      const dx = enemy.x - proj.x;
      const dy = enemy.y - proj.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const step = proj.speed * dt;

      // Hit check (before move) — threshold uses enemy radius
      const hitDist = (enemy.radius || 24) + 4;
      if (d <= hitDist || step >= d) {
        this._resolveProjectileHit(proj, enemy, mapEntry);
        continue;
      }

      // Move toward enemy
      proj.x += (dx / d) * step;
      proj.y += (dy / d) * step;
      projs[write++] = proj;
    }
    projs.length = write;
  }

  _resolveProjectileHit(proj, enemy, mapEntry) {
    const player = this.players.get(proj.playerId);

    // Compute damage at hit time using player's current stats
    let damage;
    const dmgMult = player ? this._getPlayerDamageMultiplier(player) : 1;
    const takenMult = this._getEnemyDamageTakenMult(enemy);
    if (proj.type === "attack") {
      const dmgStat = player ? player.damage : 10;
      damage = Math.max(2, Math.round((dmgStat + randInt(-2, 4)) * dmgMult * takenMult));
    } else {
      const skillDef = SKILLS[proj.skillId];
      const level = player ? player.level : 1;
      const baseDmg = (skillDef?.damage || 0) + (skillDef?.damagePerLevel || 0) * (level - 1);
      damage = Math.max(1, Math.round((baseDmg + randInt(-2, 4)) * dmgMult * takenMult));
    }
    enemy.hp -= damage;

    // Apply debuff if skill carried one
    let debuffApplied = null;
    if (proj.debuff) {
      const now = Date.now();
      if (!enemy.activeDebuffs) enemy.activeDebuffs = [];
      enemy.activeDebuffs = enemy.activeDebuffs.filter(d => d.id !== proj.debuff.id);
      const caster = this.players.get(proj.playerId);
      const debuffEntry = {
        ...proj.debuff,
        appliedAt: now,
        expiresAt: now + (proj.debuff.duration || 0) * 1000,
        casterId: proj.playerId,
        casterLevel: caster ? caster.level : 1
      };
      enemy.activeDebuffs.push(debuffEntry);
      debuffApplied = {
        id: proj.debuff.id, stat: proj.debuff.stat,
        modifier: proj.debuff.modifier, duration: proj.debuff.duration
      };
    }

    if (proj.type === "attack") {
      // Weapon attack projectile hit
      if (player) {
        this.send(player.ws, {
          type: "attack_result",
          enemyId: enemy.id,
          damage,
          enemyHp: enemy.hp,
          enemyMaxHp: enemy.maxHp
        });
      }
      // Broadcast hit to observers (projectileHit flag — don't spawn arrow)
      this.broadcastToMap(mapEntry._mapId, {
        type: "combat_visual",
        projectileHit: true,
        attackerId: proj.playerId,
        enemyId: enemy.id,
        ex: enemy.x, ey: enemy.y,
        damage,
        enemyHp: enemy.hp,
        enemyMaxHp: enemy.maxHp,
      }, proj.playerId);
    } else if (proj.type === "skill") {
      // Skill projectile hit
      if (player) {
        this.send(player.ws, {
          type: "projectile_hit",
          skillId: proj.skillId,
          enemyId: enemy.id,
          damage,
          enemyHp: enemy.hp,
          enemyMaxHp: enemy.maxHp,
          debuff: debuffApplied,
        });
      }
      // Broadcast hit to observers
      this.broadcastToMap(mapEntry._mapId, {
        type: "combat_visual",
        projectileHit: true,
        attackerId: proj.playerId,
        enemyId: enemy.id,
        ex: enemy.x, ey: enemy.y,
        damage,
        enemyHp: enemy.hp,
        enemyMaxHp: enemy.maxHp,
      }, proj.playerId);
    }

    if (enemy.hp <= 0) {
      enemy.hp = 0;
      if (player) this.killEnemy(enemy, player);
    }
  }

  _resolvePvpProjectileHit(proj, target, mapEntry) {
    const attacker = this.players.get(proj.playerId);
    const now = Date.now();

    // Compute damage
    let damage;
    const dmgMult = attacker ? this._getPlayerDamageMultiplier(attacker) : 1;
    if (proj.type === "pvp_attack") {
      const dmgStat = attacker ? attacker.damage : 10;
      damage = Math.max(2, Math.round((dmgStat + randInt(-2, 4)) * dmgMult));
    } else {
      // pvp_skill
      const skillDef = SKILLS[proj.skillId];
      const level = attacker ? attacker.level : 1;
      const baseDmg = (skillDef?.damage || 0) + (skillDef?.damagePerLevel || 0) * (level - 1);
      damage = Math.max(1, Math.round((baseDmg + randInt(-2, 4)) * dmgMult));
    }
    target.hp -= damage;

    // Notify attacker
    if (attacker) {
      this.send(attacker.ws, {
        type: "pvp_attack_result",
        targetId: target.id,
        targetName: target.name,
        damage, targetHp: target.hp, targetMaxHp: target.maxHp,
        projectileHit: true
      });
    }
    // Notify victim
    this.send(target.ws, {
      type: "player_damaged",
      attackerId: proj.playerId,
      attackerName: attacker?.name || "Unknown",
      damage, hp: target.hp, maxHp: target.maxHp,
      isPvp: true
    });
    // Broadcast visual
    const skillDef = proj.skillId ? SKILLS[proj.skillId] : null;
    this.broadcastToMap(mapEntry._mapId, {
      type: "pvp_combat_visual",
      projectileHit: true,
      attackerId: proj.playerId,
      targetId: target.id,
      tx: target.x, ty: target.y,
      skillId: proj.skillId || null,
      hitParticle: proj.hitParticle || skillDef?.hitParticle || "hit_spark",
      hitSfx: proj.hitSfx || skillDef?.sfx || "sword_hit",
      damage, targetHp: target.hp, targetMaxHp: target.maxHp,
    });

    if (attacker) {
      this._setPvpCombatTimer(attacker, "attack", now);
    }
    if (target.hp <= 0) {
      target.hp = 0;
      if (attacker) this._onPvpDeath(target, attacker, now);
    }
  }

  /* ── tick loop ──────────────────────────────────────── */

  tick() {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    this.tickCount++;

    // Process each map independently
    for (const [mapId, mapEntry] of this.maps) {
      this.updateProjectiles(mapEntry, dt);
      this.updateEnemyAi(mapEntry, dt, now);
      this.updateEnemyRespawns(mapEntry, now);
      this.updateDropPickups(mapEntry, mapId, now);
      this.updateResourceNodeRespawns(mapEntry);
    }
    this.updatePlayerDeaths(now);
    this.updatePlayerRegen(dt);
    this.updatePlayerCasts(now);
    this.updateBuffsAndDebuffs(now);
    this.updateTileModifiers(now);
    this.broadcastWorldState();

    // Periodic auto-save every 60 seconds
    if (!this._lastAutoSave) this._lastAutoSave = now;
    if (now - this._lastAutoSave > 60000) {
      this._lastAutoSave = now;
      this._autoSaveAll();
    }
  }

  _autoSaveAll() {
    for (const [, p] of this.players) {
      this._savePlayer(p);
    }
  }

  /* ── friends system ─────────────────────────────────── */

  _findPlayerByUsername(username) {
    return this._usernameIndex.get(username) || null;
  }

  _buildFriendEntry(f) {
    // Enrich with online status + character info
    const online = this._findPlayerByUsername(f.friendUsername);
    return {
      username: f.friendUsername,
      status: f.status,
      direction: f.direction,
      online: !!online,
      charName: online ? online.name : null,
      charClass: online ? online.charClass : null,
      charLevel: online ? online.level : null
    };
  }

  handleFriendRequest(player, msg) {
    if (!player.username) return;
    const targetName = String(msg.target || "").trim();
    if (!targetName) return;

    const database = require("./database");
    const result = database.sendFriendRequest(player.username, targetName);

    if (result.error) {
      this.send(player.ws, { type: "friend_result", error: result.error });
      return;
    }

    if (result.autoAccepted) {
      // Notify both players
      this.send(player.ws, { type: "friend_result", ok: true, message: "Friend request accepted!" });
      this.handleFriendList(player);
      const targetPlayer = this._findPlayerByUsername(result.friendUsername);
      if (targetPlayer) this.handleFriendList(targetPlayer);
    } else {
      this.send(player.ws, { type: "friend_result", ok: true, message: `Friend request sent to ${targetName}.` });
      // Notify target if online
      const targetPlayer = this._findPlayerByUsername(result.friendUsername);
      if (targetPlayer) {
        this.send(targetPlayer.ws, {
          type: "friend_request_received",
          from: player.name,
          fromUsername: player.username
        });
        this.handleFriendList(targetPlayer);
      }
    }
  }

  handleFriendAccept(player, msg) {
    if (!player.username) return;
    const fromUsername = String(msg.fromUsername || "").trim();
    if (!fromUsername) return;

    const database = require("./database");
    const result = database.acceptFriendRequest(player.username, fromUsername);

    if (result.error) {
      this.send(player.ws, { type: "friend_result", error: result.error });
      return;
    }

    this.send(player.ws, { type: "friend_result", ok: true, message: "Friend request accepted!" });
    this.handleFriendList(player);

    // Notify the requester if online
    const requester = this._findPlayerByUsername(fromUsername);
    if (requester) {
      this.send(requester.ws, { type: "friend_result", ok: true, message: `${player.name} accepted your friend request!` });
      this.handleFriendList(requester);
    }
  }

  handleFriendReject(player, msg) {
    if (!player.username) return;
    const fromUsername = String(msg.fromUsername || "").trim();
    if (!fromUsername) return;

    const database = require("./database");
    const result = database.rejectFriendRequest(player.username, fromUsername);

    if (result.error) {
      this.send(player.ws, { type: "friend_result", error: result.error });
      return;
    }

    this.send(player.ws, { type: "friend_result", ok: true, message: "Friend request rejected." });
    this.handleFriendList(player);
  }

  handleFriendRemove(player, msg) {
    if (!player.username) return;
    const friendUsername = String(msg.friendUsername || "").trim();
    if (!friendUsername) return;

    const database = require("./database");
    const result = database.removeFriend(player.username, friendUsername);

    if (result.error) {
      this.send(player.ws, { type: "friend_result", error: result.error });
      return;
    }

    this.send(player.ws, { type: "friend_result", ok: true, message: "Friend removed." });
    this.handleFriendList(player);

    // Update the other player's list if online
    const other = this._findPlayerByUsername(friendUsername);
    if (other) this.handleFriendList(other);
  }

  handleFriendList(player) {
    if (!player.username) return;
    const database = require("./database");
    const friends = database.getFriendsList(player.username);
    const list = friends.map(f => this._buildFriendEntry(f));
    this.send(player.ws, { type: "friend_list", friends: list });
  }

  /* ── block handlers ───────────────────────────────── */

  handleBlockPlayer(player, msg) {
    if (!player.username) return;
    const targetName = String(msg.target || "").trim();
    if (!targetName) return;

    const database = require("./database");
    const result = database.blockPlayer(player.username, targetName);

    if (result.error) {
      this.send(player.ws, { type: "block_result", error: result.error });
      return;
    }

    this.send(player.ws, { type: "block_result", ok: true, message: `${targetName} has been blocked.` });
    // Refresh both lists since blocking removes friends
    this.handleFriendList(player);
    this.handleBlockList(player);

    // Update the other player's friend list if online (friend was removed)
    const other = this._findPlayerByUsername(result.blockedUsername);
    if (other) this.handleFriendList(other);
  }

  handleUnblockPlayer(player, msg) {
    if (!player.username) return;
    const blockedUsername = String(msg.blockedUsername || "").trim();
    if (!blockedUsername) return;

    const database = require("./database");
    const result = database.unblockPlayer(player.username, blockedUsername);

    if (result.error) {
      this.send(player.ws, { type: "block_result", error: result.error });
      return;
    }

    this.send(player.ws, { type: "block_result", ok: true, message: "Player unblocked." });
    this.handleBlockList(player);
  }

  handleBlockList(player) {
    if (!player.username) return;
    const database = require("./database");
    const blocked = database.getBlockedList(player.username);
    this.send(player.ws, { type: "block_list", blocked });
  }

  /* ── party system ─────────────────────────────────── */

  _findPlayerByName(name) {
    for (const [, p] of this.players) {
      if (p.name.toLowerCase() === name.toLowerCase()) return p;
    }
    return null;
  }

  _sendPartyUpdate(party) {
    const members = [];
    for (const memberId of party.members) {
      const m = this.players.get(memberId);
      if (m) {
        members.push({
          id: m.id,
          name: m.name,
          charClass: m.charClass,
          portrait: m.portrait,
          level: m.level,
          hp: m.hp,
          maxHp: m.maxHp,
          online: true,
          isLeader: memberId === party.leader
        });
      }
    }
    const pendingInvites = [];
    if (party.pendingInvites) {
      for (const [targetId, targetName] of party.pendingInvites) {
        pendingInvites.push({ targetId, targetName });
      }
    }
    for (const memberId of party.members) {
      const m = this.players.get(memberId);
      if (m) {
        this.send(m.ws, { type: "party_update", partyId: party.id, members, pendingInvites });
      }
    }
  }

  _removeFromParty(player) {
    const party = this.parties.get(player.partyId);
    if (!party) { player.partyId = null; return; }

    party.members.delete(player.id);
    player.partyId = null;

    if (party.members.size === 0) {
      // No one left, delete the party
      this.parties.delete(party.id);
    } else if (party.members.size === 1 && party.members.has(party.leader)) {
      // Only the leader remains — keep the party alive, just update UI
      this._sendPartyUpdate(party);
    } else if (party.members.size >= 1) {
      // If leader left, promote next member
      if (party.leader === player.id) {
        party.leader = party.members.values().next().value;
        const newLeader = this.players.get(party.leader);
        if (newLeader) {
          this.send(newLeader.ws, { type: "party_result", ok: true, message: "You are now the party leader." });
        }
      }
      this._sendPartyUpdate(party);
    }
  }

  handlePartyCreate(player) {
    if (player.partyId) {
      this.send(player.ws, { type: "party_result", error: "You are already in a party." });
      return;
    }

    const partyId = this._nextPartyId++;
    const party = { id: partyId, leader: player.id, members: new Set([player.id]), pendingInvites: new Map() };
    this.parties.set(partyId, party);
    player.partyId = partyId;

    this.send(player.ws, { type: "party_result", ok: true, message: "Party created." });
    this._sendPartyUpdate(party);
  }

  handlePartyInvite(player, msg) {
    const targetName = String(msg.target || "").trim();
    if (!targetName) return;

    // Must be in a party to invite
    if (!player.partyId) {
      this.send(player.ws, { type: "party_result", error: "You must create a party first." });
      return;
    }

    const party = this.parties.get(player.partyId);
    if (!party) {
      this.send(player.ws, { type: "party_result", error: "Party not found." });
      return;
    }

    // Only leader can invite
    if (party.leader !== player.id) {
      this.send(player.ws, { type: "party_result", error: "Only the party leader can invite." });
      return;
    }

    if (party.members.size >= 5) {
      this.send(player.ws, { type: "party_result", error: "Party is full (max 5)." });
      return;
    }

    const target = this._findPlayerByName(targetName);
    if (!target) {
      this.send(player.ws, { type: "party_result", error: `Player "${targetName}" not found.` });
      return;
    }

    if (target.id === player.id) {
      this.send(player.ws, { type: "party_result", error: "You can't invite yourself." });
      return;
    }

    // Auto-reject if target is already in a party
    if (target.partyId) {
      this.send(player.ws, { type: "party_result", error: `${target.name} is already in a party.` });
      return;
    }

    // Check for duplicate pending invite
    if (party.pendingInvites && party.pendingInvites.has(target.id)) {
      this.send(player.ws, { type: "party_result", error: `${target.name} already has a pending invite.` });
      return;
    }

    // Track pending invite
    if (!party.pendingInvites) party.pendingInvites = new Map();
    party.pendingInvites.set(target.id, target.name);

    // Send invite to target
    this.send(target.ws, {
      type: "party_invite_received",
      from: player.name,
      fromId: player.id
    });

    this.send(player.ws, { type: "party_result", ok: true, message: `Party invite sent to ${target.name}.` });
    this._sendPartyUpdate(party);
  }

  handlePartyAccept(player, msg) {
    const fromId = String(msg.fromId || "").trim();
    if (!fromId) return;

    const inviter = this.players.get(fromId);
    if (!inviter) {
      this.send(player.ws, { type: "party_result", error: "The inviting player is no longer online." });
      return;
    }

    if (player.partyId) {
      this.send(player.ws, { type: "party_result", error: "You are already in a party." });
      return;
    }

    if (!inviter.partyId) {
      this.send(player.ws, { type: "party_result", error: "That party no longer exists." });
      return;
    }

    const party = this.parties.get(inviter.partyId);
    if (!party) {
      this.send(player.ws, { type: "party_result", error: "That party no longer exists." });
      return;
    }
    if (party.members.size >= 5) {
      this.send(player.ws, { type: "party_result", error: "Party is full." });
      return;
    }

    // Remove from pending invites
    if (party.pendingInvites) party.pendingInvites.delete(player.id);

    // Add the accepting player
    party.members.add(player.id);
    player.partyId = party.id;

    // Notify all members
    for (const memberId of party.members) {
      const m = this.players.get(memberId);
      if (m) {
        this.send(m.ws, { type: "party_result", ok: true, message: `${player.name} has joined the party.` });
      }
    }

    this._sendPartyUpdate(party);
  }

  handlePartyDecline(player, msg) {
    const fromId = String(msg.fromId || "").trim();
    if (!fromId) return;
    const inviter = this.players.get(fromId);
    if (inviter) {
      this.send(inviter.ws, { type: "party_result", ok: true, message: `${player.name} declined your party invite.` });
      // Remove from pending invites
      if (inviter.partyId) {
        const party = this.parties.get(inviter.partyId);
        if (party && party.pendingInvites) {
          party.pendingInvites.delete(player.id);
          this._sendPartyUpdate(party);
        }
      }
    }
  }

  handlePartyLeave(player) {
    if (!player.partyId) {
      this.send(player.ws, { type: "party_result", error: "You are not in a party." });
      return;
    }

    const party = this.parties.get(player.partyId);
    this._removeFromParty(player);
    this.send(player.ws, { type: "party_disbanded" });

    if (party && party.members.size > 0) {
      for (const memberId of party.members) {
        const m = this.players.get(memberId);
        if (m) {
          this.send(m.ws, { type: "party_result", ok: true, message: `${player.name} has left the party.` });
        }
      }
    }
  }

  handlePartyKick(player, msg) {
    if (!player.partyId) return;
    const party = this.parties.get(player.partyId);
    if (!party || party.leader !== player.id) {
      this.send(player.ws, { type: "party_result", error: "Only the party leader can kick members." });
      return;
    }

    const targetId = String(msg.targetId || "").trim();
    if (!targetId || targetId === player.id) return;

    const target = this.players.get(targetId);
    if (!target || target.partyId !== party.id) {
      this.send(player.ws, { type: "party_result", error: "Player is not in your party." });
      return;
    }

    this._removeFromParty(target);
    this.send(target.ws, { type: "party_disbanded" });
    this.send(target.ws, { type: "party_result", ok: true, message: "You have been removed from the party." });

    for (const memberId of party.members) {
      const m = this.players.get(memberId);
      if (m) {
        this.send(m.ws, { type: "party_result", ok: true, message: `${target.name} has been removed from the party.` });
      }
    }
    this._sendPartyUpdate(party);
  }

  handlePartyRescind(player, msg) {
    if (!player.partyId) return;
    const party = this.parties.get(player.partyId);
    if (!party || party.leader !== player.id) {
      this.send(player.ws, { type: "party_result", error: "Only the party leader can rescind invites." });
      return;
    }

    const targetId = String(msg.targetId || "").trim();
    if (!targetId || !party.pendingInvites || !party.pendingInvites.has(targetId)) {
      this.send(player.ws, { type: "party_result", error: "No pending invite for that player." });
      return;
    }

    const targetName = party.pendingInvites.get(targetId);
    party.pendingInvites.delete(targetId);

    // Clear the invite on the target's client if they're online
    const target = this.players.get(targetId);
    if (target) {
      this.send(target.ws, { type: "party_invite_rescinded" });
    }

    this.send(player.ws, { type: "party_result", ok: true, message: `Invite to ${targetName} has been rescinded.` });
    this._sendPartyUpdate(party);
  }

  handlePartyList(player) {
    if (!player.partyId) {
      this.send(player.ws, { type: "party_update", partyId: null, members: [] });
      return;
    }
    const party = this.parties.get(player.partyId);
    if (!party) {
      player.partyId = null;
      this.send(player.ws, { type: "party_update", partyId: null, members: [] });
      return;
    }
    this._sendPartyUpdate(party);
  }

  _savePlayer(p) {
    if (!p || !p.charId) return;
    try {
      const database = require("./database");
      database.saveCharacterProgress(p.charId, {
        level: p.level,
        xp: p.xp || 0,
        gold: p.gold || 0,
        hp: p.hp,
        mana: p.mana,
        inventory: p.inventory || [],
        equipment: p.equipment || {},
        quests: p.quests || {},
        hearthstone: p.hearthstone || null,
        bank: p.bank || [],
        hotbar: p.hotbar || [],
        gatheringSkills: p.gatheringSkills || {},
        mapId: p.mapId,
        posX: p.x,
        posY: p.y,
        floor: p.floor || 0,
        pvpKills: p.pvpKills || 0,
        pvpDeaths: p.pvpDeaths || 0
      });
    } catch (err) {
      console.error(`[ServerWorld] Save failed for ${p.name}:`, err.message);
    }
  }

  updateEnemyAi(mapEntry, dt, now) {
    for (const enemy of mapEntry.enemies) {
      if (enemy.dead) continue;
      // Skip AI if stunned
      if (this._isEnemyStunned(enemy)) continue;

      // find nearest alive player on this map
      let closestPlayer = null;
      let closestDist = Infinity;

      const enemyFloor = enemy.floor || 0;
      for (const [, player] of this.players) {
        if (player.dead || player.mapId !== mapEntry._mapId) continue;
        if ((player.floor || 0) !== enemyFloor) continue;
        const d = dist(enemy.x, enemy.y, player.x, player.y);
        if (d < closestDist) {
          closestDist = d;
          closestPlayer = player;
        }
      }

      // aggro logic
      if (closestPlayer && closestDist < enemy.aggroRange && !mapEntry.collision.isSafeZone(closestPlayer.x, closestPlayer.y)) {
        enemy.targetPlayerId = closestPlayer.id;
      } else if (enemy.targetPlayerId) {
        const target = this.players.get(enemy.targetPlayerId);
        if (!target || target.dead || target.mapId !== mapEntry._mapId ||
            (target.floor || 0) !== enemyFloor ||
            dist(enemy.x, enemy.y, target.x, target.y) > enemy.aggroRange * 1.6 ||
            mapEntry.collision.isSafeZone(target.x, target.y)) {
          enemy.targetPlayerId = null;
        }
      }

      // chase + attack
      if (enemy.targetPlayerId) {
        const target = this.players.get(enemy.targetPlayerId);
        if (target && !target.dead) {
          const d = dist(enemy.x, enemy.y, target.x, target.y);

          if (d > enemy.attackRange) {
            const dir = normalize(target.x - enemy.x, target.y - enemy.y);
            const spdMult = this._getEnemySpeedMult(enemy);
            this._moveEnemy(enemy, dir.x * enemy.speed * spdMult, dir.y * enemy.speed * spdMult, dt, mapEntry.collision);
          } else if (now - enemy.lastAttackAt > enemy.attackCooldown * 1000) {
            // attack player
            enemy.lastAttackAt = now;
            const edmgMult = this._getEnemyDamageMult(enemy);
            let damage = Math.max(1, Math.round((enemy.damage + randInt(-2, 2)) * edmgMult));
            // Mana Shield absorption
            damage = this._applyManaShield(target, damage);
            target.hp -= damage;

            // Interrupt casts on damage (unless ignoreHits is set)
            if (target.casting && !target.casting.ignoreHits) {
              this._interruptCast(target, "damaged");
            }

            this.send(target.ws, {
              type: "player_damaged",
              damage,
              hp: target.hp,
              maxHp: target.maxHp,
              attackerName: enemy.name,
              attackerType: enemy.type
            });

            // Broadcast enemy-attacks-player visual to other players
            const enemyDef = ENEMY_TYPES[enemy.type] || {};
            this.broadcastToMap(mapEntry._mapId, {
              type: "combat_visual",
              attackerId: null,
              enemyAttackerId: enemy.id,
              ax: enemy.x,
              ay: enemy.y,
              targetPlayerId: target.id,
              tx: target.x,
              ty: target.y,
              hitParticle: enemyDef.hitParticle || "player_hit",
              hitSfx: enemyDef.hitSfx || "player_hit"
            }, target.id);

            if (target.hp <= 0) {
              target.hp = 0;
              this.onPlayerDeath(target, now);
            }
          }

          // leash check
          if (dist(enemy.x, enemy.y, enemy.spawnX, enemy.spawnY) > 300) {
            enemy.targetPlayerId = null;
          }
          continue;
        } else {
          enemy.targetPlayerId = null;
        }
      }

      // wander / return home
      const homeD = dist(enemy.x, enemy.y, enemy.spawnX, enemy.spawnY);
      if (homeD > 24) {
        const dir = normalize(enemy.spawnX - enemy.x, enemy.spawnY - enemy.y);
        this._moveEnemy(enemy, dir.x * enemy.speed * 0.5, dir.y * enemy.speed * 0.5, dt, mapEntry.collision);
      } else {
        enemy.wanderTimer -= dt;
        if (enemy.wanderTimer <= 0) {
          if (enemy.wanderIdle) {
            enemy.wanderIdle = false;
            enemy.wanderTimer = randRange(0.8, 1.6);
            enemy.wanderDir = normalize(randRange(-1, 1), randRange(-1, 1));
          } else {
            enemy.wanderIdle = true;
            enemy.wanderTimer = randRange(2.0, 4.5);
          }
        }
        if (!enemy.wanderIdle) {
          this._moveEnemy(enemy, enemy.wanderDir.x * enemy.speed * 0.35, enemy.wanderDir.y * enemy.speed * 0.35, dt, mapEntry.collision);
        }
      }
    }
  }

  _moveEnemy(enemy, vx, vy, dt, collision) {
    const floor = enemy.floor || 0;
    const nx = enemy.x + vx * dt;
    if (!collision.isBlocked(nx, enemy.y, enemy.radius, floor)) enemy.x = nx;
    const ny = enemy.y + vy * dt;
    if (!collision.isBlocked(enemy.x, ny, enemy.radius, floor)) enemy.y = ny;
  }

  /** Returns true if any tile the enemy occupies is in the given tile set. */
  _enemyOverlapsTiles(enemy, ts, tileSet) {
    const ets = enemy.tileSize || 1;
    if (ets <= 1) {
      return tileSet.has(tileKey(Math.floor(enemy.x / ts), Math.floor(enemy.y / ts)));
    }
    const halfPx = (ets * ts) / 2;
    const minTx = Math.floor((enemy.x - halfPx) / ts);
    const minTy = Math.floor((enemy.y - halfPx) / ts);
    const maxTx = Math.floor((enemy.x + halfPx - 1) / ts);
    const maxTy = Math.floor((enemy.y + halfPx - 1) / ts);
    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let ty = minTy; ty <= maxTy; ty++) {
        if (tileSet.has(tileKey(tx, ty))) return true;
      }
    }
    return false;
  }

  // ── buff / debuff stat helpers ─────────────────────────

  _getPlayerDamageMultiplier(player) {
    let mult = 1;
    if (player.activeBuffs) {
      for (const b of player.activeBuffs) {
        if (b.stat === 'damage') mult += b.modifier;
      }
    }
    return mult;
  }

  _getPlayerSpeedMult(player) {
    let mult = 1;
    if (player.activeBuffs) {
      for (const b of player.activeBuffs) {
        if (b.stat === 'moveSpeed') mult += b.modifier;
      }
    }
    return mult;
  }

  _getEffectiveMaxMana(player) {
    let maxMana = player.maxMana;
    if (player.activeBuffs) {
      for (const b of player.activeBuffs) {
        if (b.stat === 'maxMana') maxMana = Math.round(maxMana * (1 + b.modifier));
      }
    }
    return maxMana;
  }

  _getEnemyDamageTakenMult(enemy) {
    let mult = 1;
    if (enemy.activeDebuffs) {
      for (const d of enemy.activeDebuffs) {
        if (d.stat === 'damageTaken') mult += d.modifier;
      }
    }
    return mult;
  }

  _isEnemyStunned(enemy) {
    if (!enemy.activeDebuffs) return false;
    return enemy.activeDebuffs.some(d => d.stat === 'stunned');
  }

  _getEnemySpeedMult(enemy) {
    let mult = 1;
    if (enemy.activeDebuffs) {
      for (const d of enemy.activeDebuffs) {
        if (d.stat === 'moveSpeed') mult += d.modifier;
      }
    }
    return Math.max(0.1, mult);
  }

  _getEnemyDamageMult(enemy) {
    let mult = 1;
    if (enemy.activeDebuffs) {
      for (const d of enemy.activeDebuffs) {
        if (d.stat === 'damage') mult += d.modifier;
      }
    }
    return Math.max(0.1, mult);
  }

  _applyManaShield(player, damage) {
    if (!player.activeBuffs) return damage;
    const shield = player.activeBuffs.find(b => b.stat === 'manaShield');
    if (!shield || !shield.absorbRemaining || shield.absorbRemaining <= 0) return damage;
    const absorbed = Math.min(damage, shield.absorbRemaining, player.mana);
    shield.absorbRemaining -= absorbed;
    player.mana -= absorbed;
    damage -= absorbed;
    if (shield.absorbRemaining <= 0) {
      player.activeBuffs = player.activeBuffs.filter(b => b.stat !== 'manaShield');
    }
    return Math.max(0, damage);
  }

  updateEnemyRespawns(mapEntry, now) {
    for (const enemy of mapEntry.enemies) {
      if (!enemy.dead || now < enemy.deadUntil) continue;
      enemy.dead = false;
      enemy.hp = enemy.maxHp;
      // Try a random offset from spawn; fall back to exact spawn if blocked
      let rx = enemy.spawnX + randInt(-12, 12);
      let ry = enemy.spawnY + randInt(-12, 12);
      if (mapEntry.collision && mapEntry.collision.isBlocked(rx, ry, 16, 0)) {
        rx = enemy.spawnX;
        ry = enemy.spawnY;
      }
      enemy.x = rx;
      enemy.y = ry;
      enemy.targetPlayerId = null;
      enemy.wanderTimer = 0;
    }
  }

  onPlayerDeath(player, now) {
    player.dead = true;
    player.deathUntil = now + 4200;
    player.lootingDropId = null;

    // Cancel any active trade on death
    this._cancelTrade(player);
    this._clearTradePending(player);

    // M7: Death gold penalty (server-authoritative)
    const goldLost = Math.min(player.gold || 0, 10);
    player.gold = Math.max(0, (player.gold || 0) - goldLost);

    this.send(player.ws, {
      type: "you_died",
      goldLost
    });

    // all enemies targeting this player lose aggro (on their map)
    const mapEntry = this.maps.get(player.mapId);
    if (mapEntry) {
      for (const e of mapEntry.enemies) {
        if (e.targetPlayerId === player.id) {
          e.targetPlayerId = null;
        }
      }
    }
  }

  updatePlayerRegen(dt) {
    for (const [, player] of this.players) {
      if (player.dead) continue;
      const effMaxMana = this._getEffectiveMaxMana(player);
      player.mana = Math.min(effMaxMana, player.mana + 7 * dt);
      player.hp = Math.min(player.maxHp, player.hp + 1.8 * dt);
    }
  }

  updatePlayerCasts(now) {
    for (const [, player] of this.players) {
      if (!player.casting) continue;
      if (player.dead) { player.casting = null; continue; }
      // Concentration check — interrupt if player moved
      if (player.casting.concentration) {
        if (player.x !== player.casting.castX || player.y !== player.casting.castY) {
          this._interruptCast(player, "moved");
          continue;
        }
      }
      // Channel tick check
      if (player.casting.type === "channel" && player.casting.ticksRemaining > 0) {
        if (now - player.casting.lastTickAt >= player.casting.tickInterval) {
          this._channelTick(player, now);
          if (!player.casting) continue; // tick may have ended channel
        }
      }
      if (now - player.casting.startedAt >= player.casting.duration) {
        this._completeCast(player);
      }
    }
  }

  updatePlayerDeaths(now) {
    for (const [, player] of this.players) {
      if (!player.dead || now < player.deathUntil) continue;

      const mapEntry = this.maps.get(player.mapId);
      const spawn = mapEntry ? mapEntry.collision.spawnPoint : { x: 0, y: 0 };

      player.dead = false;
      player.hp = player.maxHp;
      player.mana = player.maxMana;
      player.x = spawn.x;
      player.y = spawn.y;
      player.floor = 0;

      this.send(player.ws, {
        type: "you_respawned",
        x: player.x,
        y: player.y,
        hp: player.hp,
        maxHp: player.maxHp,
        mana: player.mana,
        maxMana: player.maxMana
      });
    }
  }

  updateDropPickups(mapEntry, mapId, now) {
    mapEntry.drops = mapEntry.drops.filter((drop) => {
      if (now > drop.expiresAt) {
        // Close loot window for anyone looting this drop
        for (const [, player] of this.players) {
          if (player.lootingDropId === drop.id) {
            this.send(player.ws, { type: "loot_closed", dropId: drop.id });
            player.lootingDropId = null;
          }
        }
        return false;
      }
      return true;
    });
  }

  /* ── tile modifier zones (invisible map hazards / auras) ── */

  updateTileModifiers(now) {
    for (const [, player] of this.players) {
      if (player.dead) continue;
      const mapEntry = this.maps.get(player.mapId);
      if (!mapEntry) continue;

      const mods = mapEntry.collision.getTileModifiers(player.x, player.y, player.floor);
      if (!mods) continue;

      if (!player.activeBuffs) player.activeBuffs = [];

      for (const mod of mods) {
        // Buffs: apply / refresh with short grace duration so it lingers briefly after leaving
        if (mod.type === "buff") {
          const dur = (mod.duration || 2) * 1000;
          const existing = player.activeBuffs.find(b => b.id === mod.id);
          if (existing) {
            // Refresh expiry while standing on tile
            existing.expiresAt = now + dur;
          } else {
            const entry = {
              id: mod.id,
              stat: mod.stat,
              modifier: mod.modifier || 0,
              duration: mod.duration || 2,
              appliedAt: now,
              expiresAt: now + dur,
              _tileZone: true   // tag so we know this came from a zone
            };
            if (mod.absorbAmount !== undefined) {
              entry.absorbRemaining = (mod.absorbAmount || 0)
                + (mod.absorbPerLevel || 0) * (player.level - 1);
            }
            player.activeBuffs.push(entry);
          }
        }

        // Debuffs applied as negative buffs on the player
        if (mod.type === "debuff") {
          const dur = (mod.duration || 2) * 1000;
          const existing = player.activeBuffs.find(b => b.id === mod.id);
          if (existing) {
            existing.expiresAt = now + dur;
          } else {
            player.activeBuffs.push({
              id: mod.id,
              stat: mod.stat,
              modifier: mod.modifier || 0,
              duration: mod.duration || 2,
              appliedAt: now,
              expiresAt: now + dur,
              _tileZone: true
            });
          }
        }

        // Damage-over-time hazard (poison, fire, etc.)
        if (mod.type === "dot") {
          const interval = (mod.tickInterval || 2) * 1000;
          // Track per-player per-zone DoT timing
          if (!player._tileDoTs) player._tileDoTs = {};
          const dotKey = `${player.mapId}:${mod.id}`;
          const lastTick = player._tileDoTs[dotKey] || 0;
          if (now - lastTick >= interval) {
            player._tileDoTs[dotKey] = now;
            const dmg = mod.byPct
              ? Math.round(player.maxHp * (mod.perTick || 0.05))
              : (mod.perTick || 5);
            player.hp -= dmg;
            if (player.hp <= 0) {
              player.hp = 0;
              // Let the death system handle it
            }
          }
          // Also apply visual debuff indicator
          const dur = (mod.tickInterval || 2) * 1500; // persists slightly longer than interval
          const existing = player.activeBuffs.find(b => b.id === mod.id);
          if (existing) {
            existing.expiresAt = now + dur;
          } else {
            player.activeBuffs.push({
              id: mod.id,
              stat: "dot",
              modifier: 0,
              duration: dur / 1000,
              appliedAt: now,
              expiresAt: now + dur,
              _tileZone: true
            });
          }
        }

        // Heal-over-time zone
        if (mod.type === "hot") {
          const interval = (mod.tickInterval || 2) * 1000;
          if (!player._tileDoTs) player._tileDoTs = {};
          const hotKey = `${player.mapId}:${mod.id}`;
          const lastTick = player._tileDoTs[hotKey] || 0;
          if (now - lastTick >= interval) {
            player._tileDoTs[hotKey] = now;
            const heal = mod.byPct
              ? Math.round(player.maxHp * (mod.perTick || 0.05))
              : (mod.perTick || 10);
            player.hp = Math.min(player.maxHp, player.hp + heal);
          }
          // Visual buff indicator
          const dur = (mod.tickInterval || 2) * 1500;
          const existing = player.activeBuffs.find(b => b.id === mod.id);
          if (existing) {
            existing.expiresAt = now + dur;
          } else {
            player.activeBuffs.push({
              id: mod.id,
              stat: "hot",
              modifier: 0,
              duration: dur / 1000,
              appliedAt: now,
              expiresAt: now + dur,
              _tileZone: true
            });
          }
        }
      }
    }
  }

  /* ── buff & debuff expiry ──────────────────────────── */

  updateBuffsAndDebuffs(now) {
    // Tick player HoTs and expire player buffs
    for (const [, player] of this.players) {
      if (!player.activeBuffs) continue;
      for (const buff of player.activeBuffs) {
        if (buff.stat === "hot" && buff.tickHeal && buff.ticksRemaining > 0) {
          const interval = (buff.tickInterval || 1) * 1000;
          if (!buff._lastTickAt) buff._lastTickAt = buff.appliedAt;
          if (now - buff._lastTickAt >= interval) {
            buff._lastTickAt = now;
            buff.ticksRemaining--;
            const before = player.hp;
            player.hp = Math.min(player.maxHp, player.hp + buff.tickHeal);
            if (player.hp > before && buff.ticksRemaining <= 0) {
              buff.expiresAt = 0; // force expire on next filter
            }
          }
        }
      }
      player.activeBuffs = player.activeBuffs.filter(b => now < b.expiresAt);
    }

    // Expire enemy debuffs and tick DoTs
    for (const [, mapEntry] of this.maps) {
      for (const enemy of mapEntry.enemies) {
        if (enemy.dead || !enemy.activeDebuffs || enemy.activeDebuffs.length === 0) continue;
        // Tick DoT debuffs
        for (const debuff of enemy.activeDebuffs) {
          if (debuff.stat === "dot" && debuff.tickDamage) {
            const interval = (debuff.tickInterval || 2) * 1000;
            if (!debuff._lastTickAt) debuff._lastTickAt = debuff.appliedAt;
            if (now - debuff._lastTickAt >= interval) {
              debuff._lastTickAt = now;
              const dmg = debuff.tickDamage + (debuff.tickDamagePerLevel || 0) * ((debuff.casterLevel || 1) - 1);
              enemy.hp -= dmg;
              if (enemy.hp <= 0) {
                enemy.hp = 0;
                const caster = this.players.get(debuff.casterId);
                if (caster) this.killEnemy(enemy, caster);
              }
            }
          }
        }
        enemy.activeDebuffs = enemy.activeDebuffs.filter(d => now < d.expiresAt);
      }
    }
  }

  /* ── broadcasting ───────────────────────────────────── */

  broadcastWorldState() {
    // Cache per-map snapshots so we build each only once
    const enemyCache = new Map();   // mapId → enemy snapshot
    const playerCache = new Map();  // mapId → player snapshot
    const dropCache = new Map();    // mapId → drop snapshot
    const nodeCache = new Map();    // mapId → resource node snapshot

    for (const [, player] of this.players) {
      const mapId = player.mapId;

      if (!enemyCache.has(mapId)) {
        enemyCache.set(mapId, this.enemySnapshot(mapId));
        playerCache.set(mapId, this.playersOnMap(mapId));
        dropCache.set(mapId, this.dropsSnapshot(mapId));
        nodeCache.set(mapId, this.resourceNodeSnapshot(mapId));
      }

      this.send(player.ws, {
        type: "state",
        tick: this.tickCount,
        enemies: enemyCache.get(mapId),
        players: playerCache.get(mapId),
        drops: dropCache.get(mapId),
        resourceNodes: nodeCache.get(mapId),
        you: {
          id: player.id,
          hp: player.hp,
          maxHp: player.maxHp,
          mana: player.mana,
          maxMana: this._getEffectiveMaxMana(player),
          dead: player.dead,
          x: player.x,
          y: player.y,
          ackSeq: player.lastAckSeq || 0,
          gold: player.gold || 0,
          level: player.level,
          xp: player.xp || 0,
          xpToLevel: this._xpToLevelForLevel(player.level),
          damage: Math.round(player.damage * this._getPlayerDamageMultiplier(player)),
          buffs: (player.activeBuffs || []).map(b => ({
            id: b.id, stat: b.stat, modifier: b.modifier,
            remaining: Math.max(0, (b.expiresAt - Date.now()) / 1000),
            ...(b.absorbRemaining !== undefined ? { absorbRemaining: b.absorbRemaining } : {})
          }))
        }
      });
    }
  }

  enemySnapshot(mapId) {
    const mapEntry = this.maps.get(mapId);
    if (!mapEntry) return [];
    const now = Date.now();
    return mapEntry.enemies.map((e) => ({
      id: e.id,
      type: e.type,
      name: e.name,
      x: e.x,
      y: e.y,
      hp: e.hp,
      maxHp: e.maxHp,
      dead: e.dead,
      color: e.color,
      radius: e.radius,
      tileSize: e.tileSize || 1,
      level: e.level || 1,
      floor: e.floor || 0,
      debuffs: (e.activeDebuffs || []).map(d => ({
        id: d.id, stat: d.stat, modifier: d.modifier,
        remaining: Math.max(0, (d.expiresAt - now) / 1000)
      }))
    }));
  }

  dropsSnapshot(mapId) {
    const mapEntry = this.maps.get(mapId);
    if (!mapEntry) return [];
    return mapEntry.drops.map((d) => ({
      id: d.id,
      x: d.x,
      y: d.y
    }));
  }

  playersOnMap(mapId) {
    const out = [];
    for (const [, p] of this.players) {
      if (p.mapId === mapId) out.push(this.playerPublic(p));
    }
    return out;
  }

  playerPublic(p) {
    return {
      id: p.id,
      name: p.name,
      charClass: p.charClass,
      portrait: p.portrait,
      level: p.level,
      x: p.x,
      y: p.y,
      hp: p.hp,
      maxHp: p.maxHp,
      dead: p.dead,
      floor: p.floor || 0
    };
  }

  otherPlayersSnapshot(excludeId, mapId) {
    const out = [];
    for (const [id, p] of this.players) {
      if (id !== excludeId && p.mapId === mapId) out.push(this.playerPublic(p));
    }
    return out;
  }

  /* ── helpers ────────────────────────────────────────── */

  send(ws, data) {
    try {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(data));
      }
    } catch (_) {
      /* socket may have closed */
    }
  }

  broadcast(data) {
    const json = JSON.stringify(data);
    for (const [, player] of this.players) {
      try {
        if (player.ws.readyState === 1) {
          player.ws.send(json);
        }
      } catch (_) { /* ignore */ }
    }
  }

  broadcastToMap(mapId, data, excludeId) {
    const json = JSON.stringify(data);
    for (const [id, player] of this.players) {
      if (player.mapId !== mapId) continue;
      if (excludeId && id === excludeId) continue;
      try {
        if (player.ws.readyState === 1) {
          player.ws.send(json);
        }
      } catch (_) { /* ignore */ }
    }
  }

  /* ── gathering system ───────────────────────────────── */

  _createResourceNodesForMap(mapData, collision) {
    const nodes = [];
    const tileSize = collision.tileSize;
    const spawns = mapData.resourceNodes || [];

    for (const spawn of spawns) {
      const def = RESOURCE_NODE_DEFS[spawn.type];
      if (!def) {
        console.warn(`[ServerWorld] Unknown resource node type: ${spawn.type}`);
        continue;
      }
      nodes.push({
        id: `rn${resourceNodeIdCounter++}`,
        type: spawn.type,
        name: def.name,
        x: spawn.tx * tileSize + tileSize * 0.5,
        y: spawn.ty * tileSize + tileSize * 0.5,
        floor: spawn.floor || 0,
        active: true,
        harvestsLeft: def.maxHarvests,
        respawnAt: 0,   // tick count when it should respawn
        color: def.color
      });
    }

    return nodes;
  }

  resourceNodeSnapshot(mapId) {
    const mapEntry = this.maps.get(mapId);
    if (!mapEntry) return [];
    return mapEntry.resourceNodes.map(n => ({
      id: n.id,
      type: n.type,
      name: n.name,
      x: n.x,
      y: n.y,
      floor: n.floor,
      active: n.active,
      color: n.color
    }));
  }

  updateResourceNodeRespawns(mapEntry) {
    for (const node of mapEntry.resourceNodes) {
      if (node.active) continue;
      if (this.tickCount >= node.respawnAt) {
        const def = RESOURCE_NODE_DEFS[node.type];
        node.active = true;
        node.harvestsLeft = def ? def.maxHarvests : 3;
      }
    }
  }

  /** XP required to advance from `level` to `level+1` for a gathering skill. */
  _gatheringXpToLevel(level) {
    return Math.floor(50 * Math.pow(1.5, level - 1));
  }

  handleGather(player, msg) {
    if (player.dead) return;

    // Server-side gather cooldown (2.5s)
    const GATHER_COOLDOWN_MS = 2500;
    const now = Date.now();
    if (player.lastGatherTime && (now - player.lastGatherTime) < GATHER_COOLDOWN_MS) {
      return; // silently ignore — client timer should prevent this
    }

    const nodeId = String(msg.nodeId || "");
    const mapEntry = this.maps.get(player.mapId);
    if (!mapEntry) return;

    // Find the resource node
    const node = mapEntry.resourceNodes.find(n => n.id === nodeId);
    if (!node) {
      this.send(player.ws, { type: "gather_result", success: false, reason: "Node not found." });
      return;
    }

    // Check floor
    if ((node.floor || 0) !== (player.floor || 0)) {
      this.send(player.ws, { type: "gather_result", success: false, reason: "Too far away." });
      return;
    }

    // Check range
    if (dist(player.x, player.y, node.x, node.y) > 60) {
      this.send(player.ws, { type: "gather_result", success: false, reason: "Too far away." });
      return;
    }

    // Check active
    if (!node.active) {
      this.send(player.ws, { type: "gather_result", success: false, reason: "This resource is depleted." });
      return;
    }

    const def = RESOURCE_NODE_DEFS[node.type];
    if (!def) return;

    // Check gathering skill level
    const skillId = def.skill;
    const playerSkill = player.gatheringSkills[skillId];
    if (!playerSkill) return;

    if (playerSkill.level < def.requiredLevel) {
      this.send(player.ws, { type: "gather_result", success: false, reason: `Requires ${GATHERING_SKILLS[skillId]?.name || skillId} level ${def.requiredLevel}.` });
      return;
    }

    // Check tool in inventory
    const requiredToolType = def.requiredToolType;
    const requiredToolTier = def.requiredToolTier;
    let bestTool = null;

    for (const slot of player.inventory) {
      if (!slot || slot.type !== "tool") continue;
      const tpl = ITEMS[slot.id];
      if (!tpl || tpl.toolType !== requiredToolType) continue;
      if (tpl.toolTier >= requiredToolTier) {
        if (!bestTool || tpl.toolTier > bestTool.toolTier) bestTool = tpl;
      }
    }

    if (!bestTool) {
      const toolName = requiredToolType.replace(/_/g, " ");
      this.send(player.ws, { type: "gather_result", success: false, reason: `You need a ${toolName} (tier ${requiredToolTier}+) in your inventory.` });
      return;
    }

    // Check tool's gathering level requirement
    if (bestTool.gatheringLevelReq && playerSkill.level < bestTool.gatheringLevelReq) {
      this.send(player.ws, { type: "gather_result", success: false, reason: `You need ${GATHERING_SKILLS[skillId]?.name || skillId} level ${bestTool.gatheringLevelReq} to use that tool.` });
      return;
    }

    // Check inventory space
    const gatherItemTemplate = ITEMS[def.gatherItem];
    if (!gatherItemTemplate) return;

    const newItem = { id: gatherItemTemplate.id, name: gatherItemTemplate.name, type: gatherItemTemplate.type, icon: gatherItemTemplate.icon };
    const addIndex = this._addItemToSlots(player.inventory, newItem);
    if (addIndex < 0) {
      this.send(player.ws, { type: "gather_result", success: false, reason: "Inventory is full." });
      return;
    }

    // Grant gathering XP
    const xpGained = def.xpPerGather;
    playerSkill.xp += xpGained;
    let leveledUp = false;
    while (playerSkill.xp >= this._gatheringXpToLevel(playerSkill.level)) {
      playerSkill.xp -= this._gatheringXpToLevel(playerSkill.level);
      playerSkill.level++;
      leveledUp = true;
    }

    // Decrement node harvests
    node.harvestsLeft--;
    if (node.harvestsLeft <= 0) {
      node.active = false;
      node.respawnAt = this.tickCount + (def.respawnTicks || 1800);
    }

    // Record gather timestamp for cooldown
    player.lastGatherTime = Date.now();

    // Send result
    this.send(player.ws, {
      type: "gather_result",
      success: true,
      itemId: gatherItemTemplate.id,
      itemName: gatherItemTemplate.name,
      inventory: player.inventory,
      gatheringSkills: player.gatheringSkills,
      skillId,
      xpGained,
      leveledUp,
      newLevel: playerSkill.level
    });

    this._savePlayer(player);
  }

  handleCraft(player, msg) {
    if (player.dead) return;

    const recipeId = String(msg.recipeId || "");
    const recipe = RECIPES[recipeId];
    if (!recipe) {
      this.send(player.ws, { type: "craft_result", success: false, reason: "Unknown recipe." });
      return;
    }

    // Must be near a crafting_station NPC with matching craftingSkill
    const mapEntry = this.maps.get(player.mapId);
    if (!mapEntry) return;
    const tileSize = mapEntry.collision.tileSize || 48;
    const npcsOnMap = mapEntry.data.npcs || [];
    const nearStation = npcsOnMap.some(npcPlacement => {
      const npcDef = ServerWorld._NPC_DATA[npcPlacement.npcId];
      if (!npcDef || npcDef.type !== "crafting_station") return false;
      if (npcDef.craftingSkill !== recipe.skill) return false;
      const npcX = npcPlacement.tx * tileSize + tileSize / 2;
      const npcY = npcPlacement.ty * tileSize + tileSize / 2;
      return dist(player.x, player.y, npcX, npcY) < tileSize * 2;
    });
    if (!nearStation) {
      this.send(player.ws, { type: "craft_result", success: false, reason: "You need to be near a crafting station." });
      return;
    }

    // Check skill level
    const skillId = recipe.skill;
    const playerSkill = player.gatheringSkills[skillId];
    if (!playerSkill) return;
    if (playerSkill.level < recipe.requiredLevel) {
      this.send(player.ws, { type: "craft_result", success: false, reason: `Requires ${GATHERING_SKILLS[skillId]?.name || skillId} level ${recipe.requiredLevel}.` });
      return;
    }

    // Check player has required inputs
    const inputEntries = Object.entries(recipe.input);
    for (const [itemId, qtyNeeded] of inputEntries) {
      let have = 0;
      for (const slot of player.inventory) {
        if (slot && slot.id === itemId) have += (slot.qty || 1);
      }
      if (have < qtyNeeded) {
        const tpl = ITEMS[itemId];
        this.send(player.ws, { type: "craft_result", success: false, reason: `Not enough ${tpl?.name || itemId}. Need ${qtyNeeded}, have ${have}.` });
        return;
      }
    }

    // Consume inputs
    for (const [itemId, qtyNeeded] of inputEntries) {
      let remaining = qtyNeeded;
      for (let i = 0; i < player.inventory.length && remaining > 0; i++) {
        const slot = player.inventory[i];
        if (!slot || slot.id !== itemId) continue;
        const slotQty = slot.qty || 1;
        if (slotQty <= remaining) {
          remaining -= slotQty;
          player.inventory[i] = null;
        } else {
          slot.qty = slotQty - remaining;
          remaining = 0;
        }
      }
    }

    // Grant output
    const outTemplate = ITEMS[recipe.output.id];
    if (!outTemplate) return;
    const newItem = { id: outTemplate.id, name: outTemplate.name, type: outTemplate.type, icon: outTemplate.icon, qty: recipe.output.qty };
    const addIndex = this._addItemToSlots(player.inventory, newItem);
    if (addIndex < 0) {
      // Rollback: can't fit output — refund inputs
      for (const [itemId, qtyNeeded] of inputEntries) {
        const refundTpl = ITEMS[itemId];
        if (!refundTpl) continue;
        this._addItemToSlots(player.inventory, { id: refundTpl.id, name: refundTpl.name, type: refundTpl.type, icon: refundTpl.icon, qty: qtyNeeded });
      }
      this.send(player.ws, { type: "craft_result", success: false, reason: "Inventory is full." });
      return;
    }

    // Grant XP
    const xpGained = recipe.xp;
    playerSkill.xp += xpGained;
    let leveledUp = false;
    while (playerSkill.xp >= this._gatheringXpToLevel(playerSkill.level)) {
      playerSkill.xp -= this._gatheringXpToLevel(playerSkill.level);
      playerSkill.level++;
      leveledUp = true;
    }

    this.send(player.ws, {
      type: "craft_result",
      success: true,
      recipeId,
      itemId: outTemplate.id,
      itemName: outTemplate.name,
      inventory: player.inventory,
      gatheringSkills: player.gatheringSkills,
      skillId,
      xpGained,
      leveledUp,
      newLevel: playerSkill.level
    });

    this._savePlayer(player);
  }

  handleDismantleItem(player, msg) {
    if (player.dead) return;
    const index = Number(msg.index);
    if (!Number.isInteger(index) || index < 0 || index >= 20) return;

    const inventory = player.inventory;
    const item = inventory[index];
    if (!item) return;

    const template = ITEMS[item.id];
    if (!template || !template.dismantleable || !template.dismantleResult || template.dismantleResult.length === 0) {
      this.send(player.ws, { type: "dismantle_item_result", ok: false, reason: "This item cannot be dismantled." });
      return;
    }

    // Must be near a vendor NPC
    const mapEntry = this.maps.get(player.mapId);
    if (!mapEntry) return;
    const tileSize = mapEntry.collision.tileSize || 48;
    const npcsOnMap = mapEntry.data.npcs || [];
    const nearVendor = npcsOnMap.some(npcPlacement => {
      const npcDef = ServerWorld._NPC_DATA[npcPlacement.npcId];
      if (!npcDef || !npcDef.shop || npcDef.shop.length === 0) return false;
      const npcX = npcPlacement.tx * tileSize + tileSize / 2;
      const npcY = npcPlacement.ty * tileSize + tileSize / 2;
      return dist(player.x, player.y, npcX, npcY) < tileSize * 1.5;
    });
    if (!nearVendor) {
      this.send(player.ws, { type: "dismantle_item_result", ok: false, reason: "You must be near a vendor to dismantle items." });
      return;
    }

    // Check there is enough space for results (worst case: each result needs its own slot)
    const emptySlots = inventory.filter(s => s === null).length;
    // The item being dismantled frees 1 slot
    let slotsNeeded = 0;
    for (const res of template.dismantleResult) {
      const resTpl = ITEMS[res.id];
      if (!resTpl) continue;
      const maxStack = resTpl.stackSize || 1;
      // Check if this result can stack onto existing items
      let remaining = res.qty;
      for (const s of inventory) {
        if (s && s.id === res.id && maxStack > 1) {
          const room = maxStack - (s.qty || 1);
          remaining -= room;
        }
      }
      if (remaining > 0) slotsNeeded += Math.ceil(remaining / Math.max(1, maxStack));
    }
    if (slotsNeeded > emptySlots + 1) {
      this.send(player.ws, { type: "dismantle_item_result", ok: false, reason: "Not enough inventory space." });
      return;
    }

    // Remove the item (only 1 from a stack)
    const dismantledName = item.name;
    const qty = item.qty || 1;
    if (qty > 1) {
      item.qty = qty - 1;
    } else {
      inventory[index] = null;
    }

    // Grant dismantle results
    const gained = [];
    for (const res of template.dismantleResult) {
      const resTpl = ITEMS[res.id];
      if (!resTpl) continue;
      const newItem = { id: resTpl.id, name: resTpl.name, type: resTpl.type, icon: resTpl.icon, qty: res.qty };
      this._addItemToSlots(inventory, newItem);
      gained.push({ name: resTpl.name, qty: res.qty });
    }

    this.send(player.ws, {
      type: "dismantle_item_result",
      ok: true,
      index,
      inventory: player.inventory,
      dismantledName,
      gained
    });

    this._savePlayer(player);
  }
}

module.exports = { ServerWorld };
