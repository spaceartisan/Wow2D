/**
 * ServerWorld – authoritative server-side game state.
 * Manages enemies (AI, respawn), combat resolution, loot drops,
 * and connected players. Broadcasts state at a fixed tick rate.
 */

const fs = require("fs");
const path = require("path");

/* ── load data from JSON files ─────────────────────────── */

const dataDir = path.join(__dirname, "..", "public", "data");

const ITEMS = JSON.parse(fs.readFileSync(path.join(dataDir, "items.json"), "utf8"));
const ENEMY_TYPES = JSON.parse(fs.readFileSync(path.join(dataDir, "enemies.json"), "utf8"));
const QUEST_DEFS = JSON.parse(fs.readFileSync(path.join(dataDir, "quests.json"), "utf8"));
const SKILLS = JSON.parse(fs.readFileSync(path.join(dataDir, "skills.json"), "utf8"));
const GLOBAL_PALETTE = JSON.parse(fs.readFileSync(path.join(dataDir, "tilePalette.json"), "utf8"));
const PROP_DEFS = JSON.parse(fs.readFileSync(path.join(dataDir, "props.json"), "utf8"));
const RESOURCE_NODE_DEFS = JSON.parse(fs.readFileSync(path.join(dataDir, "resourceNodes.json"), "utf8"));
const GATHERING_SKILLS = JSON.parse(fs.readFileSync(path.join(dataDir, "gatheringSkills.json"), "utf8"));
const RECIPES = JSON.parse(fs.readFileSync(path.join(dataDir, "recipes.json"), "utf8"));

/* Shared player base stats — single source of truth for client + server */
const PLAYER_BASE_DATA = JSON.parse(fs.readFileSync(path.join(dataDir, "playerBase.json"), "utf8"));
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

/* ═══════════════════════════════════════════════════════════
   COLLISION MAP (built from map JSON data)
   ═══════════════════════════════════════════════════════════ */

class CollisionMap {
  constructor(mapData) {
    this.blocked = new Set();
    this.tileSize = mapData.tileSize || 48;
    this.mapWidth = mapData.width;
    this.mapHeight = mapData.height;

    // Spawn point (tile coords → world coords)
    const sp = mapData.spawnPoint || [0, 0];
    this.spawnPoint = { x: sp[0] * this.tileSize + this.tileSize / 2, y: sp[1] * this.tileSize + this.tileSize / 2 };

    // Safe zones from map data
    this.safeZones = (mapData.safeZones || []).map(sz => ({
      x1: sz.x * this.tileSize,
      y1: sz.y * this.tileSize,
      x2: (sz.x + sz.w) * this.tileSize,
      y2: (sz.y + sz.h) * this.tileSize
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

    this.defaultMapId = "eldengrove";
    this.players = new Map();   // playerId → PlayerState
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

  addPlayer(ws, charData) {
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
      mapId,
      charId: charData.id || null,
      name: String(charData.name || "Unknown").slice(0, 16),
      charClass,
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
      })()
    };

    this.players.set(id, state);

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
      floor: state.floor || 0
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

    // Save character progression to DB
    if (p && p.charId) {
      this._savePlayer(p);
    }

    this.players.delete(id);
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
      default:
        break;
    }
  }

  handleMove(player, msg) {
    if (player.dead) return;

    const x = Number(msg.x);
    const y = Number(msg.y);
    const floor = Math.max(0, Math.min(10, Number(msg.floor) || 0));

    // Track sequence for client-side prediction reconciliation
    if (msg.seq !== undefined) player.lastAckSeq = msg.seq;

    // basic validation: don't teleport too far per tick
    // Allow larger jump when floor changes (stair teleport to partner stairs)
    const spdMult = this._getPlayerSpeedMult(player);
    const maxDist = (floor !== player.floor) ? 300 : Math.ceil(80 * spdMult);
    const d = dist(player.x, player.y, x, y);
    if (d > maxDist) return;

    // Don't allow moving into blocked tiles (use player's current map)
    const mapEntry = this.maps.get(player.mapId);
    if (mapEntry && !mapEntry.collision.isBlocked(x, y, 16, floor)) {
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
      const portalCenterX = (portal.x + portal.w / 2) * tileSize;
      const portalCenterY = (portal.y + portal.h / 2) * tileSize;
      return dist(player.x, player.y, portalCenterX, portalCenterY) < tileSize * 5;
    });
    if (!nearPortal) return;

    // Notify old map players that this player left
    this.broadcastToMap(oldMapId, { type: "player_left", playerId: player.id }, player.id);

    // Move player to new map
    player.mapId = targetMapId;
    player.x = targetX;
    player.y = targetY;
    player.floor = 0;

    // Send fresh state for new map
    this.send(player.ws, {
      type: "map_changed",
      mapId: targetMapId,
      enemies: this.enemySnapshot(targetMapId),
      players: this.otherPlayersSnapshot(player.id, targetMapId),
      drops: this.dropsSnapshot(targetMapId)
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

    const skillId = String(msg.skillId || "");
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
    if (skillDef.targeting === "enemy" || skillDef.targeting === "aoe") {
      const mapEntry = this.maps.get(player.mapId);
      if (!mapEntry) return;
      enemy = mapEntry.enemies.find(e => e.id === msg.enemyId);
      if (!enemy || enemy.dead) return;

      const d = dist(player.x, player.y, enemy.x, enemy.y);
      const skillRange = skillDef.range || player.attackRange;
      if (d > skillRange + 30) return;
    }

    // Consume mana & record cooldown
    player.mana -= manaCost;
    player.skillCooldowns[skillId] = now;

    // Resolve skill effects by type
    if (skillDef.type === "attack" || skillDef.type === "debuff") {
      if (!enemy) return;
      // ── Ranged skill — create server-side projectile, defer damage ──
      if (skillDef.projectileSpeed > 0) {
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
        // Confirm mana/cooldown to attacker (no damage yet)
        this.send(player.ws, {
          type: "skill_result", ok: true, skillId,
          mana: player.mana, maxMana: player.maxMana,
        });
        // Broadcast projectile spawn to all clients
        this.broadcastToMap(player.mapId, {
          type: "projectile_spawn",
          attackerId: player.id,
          sx: player.x, sy: player.y,
          targetEnemyId: enemy.id,
          speed: skillDef.projectileSpeed,
          skillId,
          damageType: skillDef.damageType || "physical",
        });
        return;
      }

      // ── Instant skill — apply damage immediately ──
      let baseDmg = (skillDef.damage || 0) + (skillDef.damagePerLevel || 0) * (player.level - 1);
      // Physical melee skills scale with weapon/base damage
      if (!skillDef.range && skillDef.damageType === 'physical') baseDmg += player.damage;
      const dmgMult = this._getPlayerDamageMultiplier(player);
      const takenMult = this._getEnemyDamageTakenMult(enemy);
      const damage = Math.max(1, Math.round((baseDmg + randInt(-2, 4)) * dmgMult * takenMult));
      enemy.hp -= damage;

      // Apply debuff to enemy if skill has one
      let debuffApplied = null;
      if (skillDef.debuff) {
        if (!enemy.activeDebuffs) enemy.activeDebuffs = [];
        // Replace existing debuff of same id
        enemy.activeDebuffs = enemy.activeDebuffs.filter(d => d.id !== skillDef.debuff.id);
        const debuffEntry = {
          ...skillDef.debuff,
          appliedAt: now,
          expiresAt: now + (skillDef.debuff.duration || 0) * 1000,
          casterId: player.id
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

      // Broadcast visual effect to all OTHER players on this map
      this.broadcastToMap(player.mapId, {
        type: "combat_visual",
        attackerId: player.id,
        ax: player.x,
        ay: player.y,
        enemyId: enemy.id,
        ex: enemy.x,
        ey: enemy.y,
        skillId,
        hitParticle: skillDef.hitParticle || skillDef.particle || null,
        hitSfx: skillDef.sfx || null,
        projectileSpeed: 0,
        damageType: skillDef.damageType || "physical",
        damage,
        enemyHp: enemy.hp,
        enemyMaxHp: enemy.maxHp
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
        // Replace existing buff of same id
        player.activeBuffs = player.activeBuffs.filter(b => b.id !== skillDef.buff.id);
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

      this.send(player.ws, {
        type: "skill_result",
        ok: true,
        skillId,
        mana: player.mana,
        maxMana: player.maxMana,
        buff: buffApplied
      });

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
      // Only allow non-completed states to be synced from client
      const existing = player.quests[questId];
      if (existing && existing.state === "completed") continue;
      if (state.state === "completed") continue; // client can't force completion
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
        // Validate item exists in items DB
        if (ITEMS[s.itemId]) {
          player.hotbar[i] = { type: "item", itemId: s.itemId.slice(0, 64) };
        }
      }
    }

    this.send(player.ws, { type: "hotbar_result", ok: true, hotbar: player.hotbar });
  }

  /* ── inventory swap/move ────────────────────────────── */

  handleSplitStack(player, msg) {
    if (player.dead) return;
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
    this.send(player.ws, {
      type: "drop_item_result", ok: true, index,
      inventory: [...player.inventory]
    });
  }

  _completeCast(player) {
    if (!player.casting || player.casting.type !== "hearthstone") return;

    const hs = player.hearthstone;
    player.casting = null;
    player.hearthstone.lastUsedAt = Date.now();

    // Teleport
    const targetMapId = hs.mapId;
    const mapEntry = this.maps.get(targetMapId);
    if (!mapEntry) return;

    const tileSize = mapEntry.collision.tileSize || 48;
    const targetX = hs.tx * tileSize + tileSize / 2;
    const targetY = hs.ty * tileSize + tileSize / 2;

    if (player.mapId !== targetMapId) {
      // Cross-map teleport
      player.mapId = targetMapId;
      player.x = targetX;
      player.y = targetY;
      player.floor = 0;

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
      player.floor = 0;

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
    player.casting = null;
    this.send(player.ws, { type: "hearthstone_cast_cancelled", reason: reason || "interrupted" });
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
    let xpToLevel = 160;
    for (let i = 1; i < level; i++) xpToLevel = Math.round(xpToLevel * 1.28);
    return xpToLevel;
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
        const e = this.makeEnemy(type, tx * tileSize + tileSize / 2, ty * tileSize + tileSize / 2, floor);
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
      radius: t.radius || 15,
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

    // Grant XP server-side
    this._grantXp(killerPlayer, enemy.xpReward);

    // tell killer about kill
    this.send(killerPlayer.ws, {
      type: "enemy_killed",
      enemyId: enemy.id,
      enemyType: enemy.type,
      xpReward: enemy.xpReward
    });

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
      const enemy = mapEntry.enemies.find(e => e.id === proj.targetEnemyId);

      // Enemy gone or dead — projectile fizzles
      if (!enemy || enemy.dead) continue;

      // Homing: direction toward enemy
      const dx = enemy.x - proj.x;
      const dy = enemy.y - proj.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const step = proj.speed * dt;

      // Hit check (before move) — threshold slightly larger than client
      if (d <= 16 || step >= d) {
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
      const debuffEntry = {
        ...proj.debuff,
        appliedAt: now,
        expiresAt: now + (proj.debuff.duration || 0) * 1000,
        casterId: proj.playerId
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
        floor: p.floor || 0
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

            // Interrupt casts on damage
            if (target.casting) {
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
      enemy.x = enemy.spawnX + randInt(-12, 12);
      enemy.y = enemy.spawnY + randInt(-12, 12);
      enemy.targetPlayerId = null;
      enemy.wanderTimer = 0;
    }
  }

  onPlayerDeath(player, now) {
    player.dead = true;
    player.deathUntil = now + 4200;

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
      if (now > drop.expiresAt) return false;

      for (const [, player] of this.players) {
        if (player.dead || player.mapId !== mapId) continue;
        if (dist(player.x, player.y, drop.x, drop.y) > 42) continue;

        if (now < drop.ownerUntil && player.id !== drop.ownerId) continue;

        // Add gold to server state
        if (drop.gold > 0) {
          player.gold = (player.gold || 0) + drop.gold;
        }

        // Add item to server-side inventory (with stacking)
        let lootIndex = -1;
        if (drop.item) {
          const lootItem = { ...drop.item, qty: drop.item.qty || 1 };
          lootIndex = this._addItemToSlots(player.inventory, lootItem);
          if (lootIndex === -1) {
            // Item can't fit; only pick up gold, leave drop for item
            if (drop.gold > 0) {
              this.send(player.ws, {
                type: "loot_pickup",
                dropId: drop.id,
                gold: drop.gold,
                item: null,
                index: -1
              });
              drop.gold = 0;
            }
            return true; // keep drop alive for item
          }
        }

        this.send(player.ws, {
          type: "loot_pickup",
          dropId: drop.id,
          gold: drop.gold,
          item: drop.item,
          index: lootIndex,
          slotItem: lootIndex >= 0 ? player.inventory[lootIndex] : null
        });

        this.broadcastToMap(mapId, { type: "drop_removed", dropId: drop.id });
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
              const dmg = debuff.tickDamage + (debuff.tickDamagePerLevel || 0);
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

    // Server-side gather cooldown (2.5s = 150 ticks at 60Hz)
    const GATHER_COOLDOWN_TICKS = 150;
    if (player.lastGatherTick && (this.tickCount - player.lastGatherTick) < GATHER_COOLDOWN_TICKS) {
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
    player.lastGatherTick = this.tickCount;

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
