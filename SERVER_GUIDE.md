# Server & Admin API Guide

Reference for building a web-based admin GUI on top of the Azerfall server. Covers architecture, database access, live player state, the WebSocket protocol, and practical admin operations.

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────┐
│  server.js (Express + ws)                             │
│  ┌─────────────┐  ┌────────────────────────────────┐  │
│  │ HTTP Routes  │  │ WebSocket Server               │  │
│  │ /api/*       │  │ wss.on("connection")           │  │
│  └──────┬───────┘  └──────────┬─────────────────────┘  │
│         │                     │                        │
│         ▼                     ▼                        │
│  ┌─────────────┐  ┌────────────────────────────────┐  │
│  │ database.js  │  │ ServerWorld.js                  │  │
│  │ SQLite + WAL │  │ Game loop @ 20 Hz              │  │
│  │ (better-     │  │ Players / Enemies / Maps / AI  │  │
│  │  sqlite3)    │  └────────────────────────────────┘  │
│  └─────────────┘                                       │
└───────────────────────────────────────────────────────┘
```

- **server.js** — HTTP endpoints (auth, character CRUD) + WebSocket upgrade. Rate-limited auth routes (30 req/min per IP).
- **game/database.js** — SQLite via `better-sqlite3` (WAL mode). Exports prepared statements plus the raw `db` handle.
- **game/ServerWorld.js** — Authoritative game loop: player state, enemy AI, combat, loot, portals, casts, persistence.

---

## Database Schema

DB file: `data/azerfall.db` (SQLite, WAL mode, foreign keys ON)

### `accounts`

| Column | Type | Constraints |
|--------|------|-------------|
| `username` | TEXT | PRIMARY KEY |
| `hash` | TEXT | NOT NULL |
| `salt` | TEXT | NOT NULL |
| `created_at` | INTEGER | NOT NULL (epoch ms) |

### `characters`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | INTEGER | AUTOINCREMENT | PRIMARY KEY |
| `username` | TEXT | — | FK → accounts, CASCADE DELETE |
| `name` | TEXT | — | Display name (2–16 chars) |
| `char_class` | TEXT | — | `warrior`, `mage`, or `rogue` |
| `level` | INTEGER | 1 | |
| `xp` | INTEGER | 0 | |
| `gold` | INTEGER | 12 | |
| `hp` | INTEGER | 120 | |
| `mana` | INTEGER | 80 | |
| `inventory` | TEXT | `'[]'` | JSON: 20-slot array |
| `equipment` | TEXT | `'{}'` | JSON: `{ weapon, armor, trinket }` |
| `quests` | TEXT | `'{}'` | JSON: `{ questId: stateObj }` |
| `hearthstone` | TEXT | `'null'` | JSON: attunement object or null |
| `bank` | TEXT | `'[]'` | JSON: 48-slot array |
| `hotbar` | TEXT | `'[]'` | JSON: 10-slot array |
| `created_at` | INTEGER | epoch ms | |

### `sessions`

| Column | Type | Notes |
|--------|------|-------|
| `token` | TEXT | PRIMARY KEY (64-char hex) |
| `username` | TEXT | FK → accounts, CASCADE DELETE |
| `created_at` | INTEGER | epoch ms |
| `expires_at` | INTEGER | epoch ms (24h from creation) |

---

## Database Functions (game/database.js)

All functions are synchronous (better-sqlite3). The module exports these plus the raw `db` instance.

| Function | Signature | Description |
|----------|-----------|-------------|
| `register` | `(username, password)` | Create account. Returns `{ ok }` or `{ error }`. |
| `login` | `(username, password)` | Verify creds, create 24h session. Returns `{ ok, token, characters }` or `{ error }`. |
| `logout` | `(token)` | Delete session row. |
| `validateSession` | `(token)` | Returns `username` string or `null`. |
| `getCharacters` | `(token)` | Returns `{ characters }` or `{ error }`. |
| `createCharacter` | `(token, name, class)` | Max 5 per account. Returns `{ ok, characters }` or `{ error }`. |
| `deleteCharacter` | `(token, charId)` | Validates ownership. Returns `{ ok, characters }` or `{ error }`. |
| `loadCharacter` | `(charId, username)` | Full load with JSON parsing. Returns character object or `null`. |
| `saveCharacterProgress` | `(charId, data)` | Saves: level, xp, gold, hp, mana, inventory, equipment, quests, hearthstone, bank, hotbar. |
| `cleanExpiredSessions` | `()` | Deletes expired session rows. |

### Raw Prepared Statements

Available on the `stmts` object (not exported, but accessible if you modify database.js):

```js
stmts.getAccount          // SELECT * FROM accounts WHERE username = ?
stmts.insertAccount       // INSERT INTO accounts (username, hash, salt) VALUES (?, ?, ?)
stmts.getCharacters       // SELECT id, name, char_class AS charClass, level, created_at ... WHERE username = ?
stmts.countCharacters     // SELECT COUNT(*) AS cnt FROM characters WHERE username = ?
stmts.insertCharacter     // INSERT INTO characters (username, name, char_class) VALUES (?, ?, ?)
stmts.deleteCharacter     // DELETE FROM characters WHERE id = ? AND username = ?
stmts.getCharacterById    // SELECT id, name, ..., bank, hotbar ... WHERE id = ? AND username = ?
stmts.saveCharacter       // UPDATE characters SET level=?, xp=?, gold=?, hp=?, mana=?, inventory=?, equipment=?, quests=?, hearthstone=?, bank=?, hotbar=? WHERE id=?
stmts.insertSession       // INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)
stmts.getSession          // SELECT * FROM sessions WHERE token = ? AND expires_at > ?
stmts.deleteSession       // DELETE FROM sessions WHERE token = ?
stmts.deleteUserSessions  // DELETE FROM sessions WHERE username = ?
stmts.cleanExpiredSessions // DELETE FROM sessions WHERE expires_at <= ?
```

### Password Hashing

`PBKDF2` — 100,000 iterations, SHA-512, 64-byte output, per-account random salt.

---

## HTTP API

Base URL: `http://localhost:3000` (auto-increments port if busy)

### Auth Endpoints (rate-limited: 30/min per IP)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/register` | `{ username, password }` | `{ ok: true }` or `{ error: "..." }` |
| POST | `/api/login` | `{ username, password }` | `{ ok: true, token, characters }` or `{ error: "..." }` |

### Character Endpoints (token-authenticated)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/logout` | `{ token }` | `{ ok: true }` |
| POST | `/api/characters` | `{ token }` | `{ characters: [...] }` |
| POST | `/api/characters/create` | `{ token, charName, charClass }` | `{ ok, characters }` |
| POST | `/api/characters/delete` | `{ token, charId }` | `{ ok, characters }` |

---

## WebSocket Protocol

Connect to `ws://localhost:3000`. First message must authenticate:

```json
{ "type": "join", "token": "<session-token>", "charData": { "id": <charId> } }
```

Server responds with `welcome` (success) or `auth_error` (failure).

### Client → Server Messages

| type | Fields | Description |
|------|--------|-------------|
| `join` | `token, charData.id` | Authenticate and enter world |
| `move` | `x, y, floor` | Move to position (validated: max 80px/msg, collision checked) |
| `attack` | `enemyId` | Attack an enemy (range + cooldown validated) |
| `heal` | — | Use Minor Heal (22 mana, 5.3s cooldown) |
| `chat` | `text` | Send chat. `/w Name msg` for whisper. Max 200 chars |
| `map_change` | `portalIndex` | Enter a portal (proximity validated) |
| `use_item` | `index` | Use consumable at inventory index |
| `sell_item` | `index` | Sell item (must be near vendor NPC) |
| `buy_item` | `npcId, itemId` | Buy from vendor (proximity + gold validated) |
| `equip_item` | `index` | Equip item from inventory |
| `unequip_item` | `slot` | Unequip item from equipment slot (`weapon`, `armor`, or `trinket`) |
| `complete_quest` | `questId, npcId` | Turn in quest at NPC |
| `quest_state_update` | `questId, state` | Sync quest accept/progress (can't set "completed") |
| `use_hearthstone` | — | Begin hearthstone cast |
| `cancel_hearthstone` | — | Cancel active hearthstone cast |
| `attune_hearthstone` | `statueId` | Attune to a waystone (proximity validated) |
| `bank_deposit` | `invIndex` | Deposit item to bank (must be near banker) |
| `bank_withdraw` | `bankIndex` | Withdraw item from bank (must be near banker) |
| `hotbar_update` | `hotbar` (10-slot array) | Save hotbar layout |
| `swap_items` | `from, to, fromIndex, toIndex` | Swap/stack between `"inventory"` and/or `"bank"` |
| `respawn` | — | Signal ready to respawn (actual respawn is tick-driven) |

### Server → Client Messages

| type | When | Key Fields |
|------|------|------------|
| `auth_error` | Bad token | `error` |
| `kicked` | Duplicate login | `reason` |
| `welcome` | Join success | `playerId, tick, tickRate, enemies, players, drops, inventory, equipment, level, xp, xpToLevel, gold, quests, hearthstone, bank, hotbar, hp, maxHp, mana, maxMana` |
| `state` | Every tick (20 Hz) | `tick, enemies[], players[], drops[], you: { id, hp, maxHp, mana, maxMana, dead, x, y, gold, level, xp, damage }` |
| `player_joined` | Player enters map | `player: { id, name, charClass, level, x, y, hp, maxHp, dead }` |
| `player_left` | Player leaves map | `playerId` |
| `map_changed` | Portal transition | `mapId, enemies, players, drops` |
| `attack_result` | Attack resolves | `enemyId, damage, enemyHp, enemyMaxHp` |
| `heal_result` | Heal attempt | `ok, reason?, healAmount?, hp, maxHp, mana, maxMana` |
| `chat` | Chat message | `channel, from, to?, text` |
| `use_item_result` | Consumable used | `ok, index, remainingItem, effect, amount, hp, maxHp, mana, maxMana` |
| `sell_item_result` | Item sold | `ok, index, remainingItem, gold, soldName, sellPrice` |
| `buy_item_result` | Item bought | `ok, item, index, gold, buyPrice` |
| `equip_item_result` | Equip swap | `ok, index, slot, newItem, oldItem, hp, maxHp, mana, maxMana, damage` |
| `unequip_item_result` | Unequip | `ok, reason?, slot, item, index, hp, maxHp, mana, maxMana, damage` |
| `quest_complete_result` | Quest turned in | `ok, questId, xp, gold, items[], playerGold, playerXp, playerLevel, hp, maxHp, mana, maxMana` |
| `attune_result` | Waystone attune | `ok, reason?, hearthstone?` |
| `hearthstone_result` | Use HS validation fail | `ok: false, reason, remaining?` |
| `hearthstone_cast_start` | Cast begins | `castTime, destination` |
| `hearthstone_cast_cancelled` | Cast interrupted | `reason` |
| `hearthstone_teleport` | Teleport completes | `mapId, x, y, enemies?, players?, drops?, hearthstone` |
| `bank_result` | Bank action | `ok, reason?, action, invIndex, bankIndex, inventory, bank` |
| `hotbar_result` | Hotbar saved | `ok, hotbar` |
| `swap_result` | Item swap | `ok, reason?, inventory, bank` |
| `enemy_killed` | Kill confirmed | `enemyId, enemyType, xpReward` |
| `drop_spawned` | Loot appears | `drop: { id, x, y }` |
| `drop_removed` | Loot taken | `dropId` |
| `loot_pickup` | You looted | `dropId, gold, item, index, slotItem` |
| `player_damaged` | Enemy hits you | `damage, hp, maxHp, attackerName` |
| `you_died` | Death | `goldLost` |
| `you_respawned` | Auto-respawn | `x, y, hp, maxHp, mana, maxMana` |

---

## Live Player State (ServerWorld)

All online players are in `world.players` — a `Map<playerId, PlayerState>`.

### PlayerState Object

```js
{
  id: "p1",                    // Server-assigned ID
  ws: WebSocket,               // Live connection handle
  charId: 42,                  // Database character ID (for saving)
  name: "Elara",
  charClass: "warrior",        // "warrior" | "mage" | "rogue"
  mapId: "eldengrove",         // Current map ID
  x: 1200, y: 1500,           // World pixel position
  floor: 0,                    // 0 = ground, 1+ = upper floors
  level: 5,
  xp: 320,
  gold: 87,
  hp: 200, maxHp: 216,         // maxHp = base(120) + (level-1)*24 + armor.hpBonus
  mana: 120, maxMana: 144,     // maxMana = base(80) + (level-1)*16 + trinket.manaBonus
  baseDamage: 32,              // base(16) + (level-1)*4
  damage: 37,                  // baseDamage + weapon.attackBonus
  attackRange: 52,
  attackCooldown: 0.82,        // seconds
  lastAttackAt: 0,             // timestamp
  lastHealAt: 0,               // timestamp
  dead: false,
  deathUntil: 0,               // timestamp (respawn at)
  inventory: [null, {...}, ...], // 20 slots
  equipment: {
    weapon: null | itemObj,
    armor: null | itemObj,
    trinket: null | itemObj
  },
  quests: {                    // questId → state
    "wolf_cull": { status: "active", progress: { wolf: 3 } }
  },
  hearthstone: null | {
    statueId: "waystone_eldengrove",
    statueName: "Eldengrove Waystone",
    mapId: "eldengrove",
    tx: 32, ty: 33,            // Tile coordinates
    lastUsedAt: 1712345678000  // epoch ms
  },
  bank: [null, {...}, ...],    // 48 slots
  hotbar: [                    // 10 slots
    { type: "skill", skillId: "attack" },
    { type: "skill", skillId: "heal" },
    { type: "item", itemId: "minorHealingPotion" },
    null, null, null, null, null, null, null
  ],
  casting: null | {
    type: "hearthstone",
    startedAt: 1712345670000,
    duration: 8000             // ms
  }
}
```

---

## Map System

Maps loaded at startup: `eldengrove`, `darkwood`, `southmere`, `moonfall_cavern`

Stored in `world.maps` — a `Map<mapId, MapEntry>`:

```js
{
  _mapId: "eldengrove",
  data: { ... },       // Raw map JSON (terrain, portals, npcs, enemySpawns, etc.)
  collision: CollisionMap,
  enemies: [...],      // Live enemy instances
  drops: [...]         // Active loot drops
}
```

### CollisionMap

- `isBlocked(worldX, worldY, radius, floor)` — 9-point circle collision
- `isSafeZone(worldX, worldY)` — Returns true if inside a safe zone
- `spawnPoint` — `{ x, y }` world coordinates
- `tileSize` — usually 48

### Enemy Object

```js
{
  id: "e1",
  type: "wolf",           // Key into ENEMY_TYPES
  name: "Timber Wolf",
  x, y,                   // Current world position
  spawnX, spawnY,          // Home position (for leashing)
  hp, maxHp,
  damage, speed,
  dead: false,
  deadUntil: 0,            // Respawn timestamp
  respawnSeconds: 25,
  aggroRange: 210,
  attackRange: 34,
  attackCooldown: 1.35,
  lastAttackAt: 0,
  targetPlayerId: null,    // Currently chasing
  loot: [...]              // Drop table from enemy type
}
```

### Drop Object

```js
{
  id: "d1",
  x, y,
  gold: 5,
  item: { id: "wolfPelt", name: "Wolf Pelt", ... } | null,
  ownerId: "p1",          // Exclusive pickup for 10s
  ownerUntil: 1712345690000,
  expiresAt: 1712345705000 // Disappears after 25s
}
```

---

## Tick Loop (20 Hz)

Every 50ms the server runs:

| Step | Method | What It Does |
|------|--------|--------------|
| 1 | `updateEnemyAi` | Per-map: aggro, chase, attack, leash, wander |
| 2 | `updateEnemyRespawns` | Respawn dead enemies when timer expires |
| 3 | `updateDropPickups` | Auto-pickup loot within 42px; expire old drops |
| 4 | `updatePlayerDeaths` | Respawn dead players after 4.2s |
| 5 | `updatePlayerRegen` | Regen: +7 mana/s, +1.8 hp/s |
| 6 | `updatePlayerCasts` | Complete hearthstone casts when duration elapsed |
| 7 | `broadcastWorldState` | Send `"state"` message to all players |
| 8 | Auto-save (every 60s) | `_autoSaveAll()` → `database.saveCharacterProgress()` for each player |

---

## Persistence Model

### When Saves Happen

| Trigger | What Saves |
|---------|-----------|
| Player disconnect | Full character state → DB |
| Auto-save (every 60s) | All connected players → DB |

### What Gets Saved

`database.saveCharacterProgress(charId, data)` writes:

```
level, xp, gold, hp, mana,
inventory (JSON), equipment (JSON), quests (JSON),
hearthstone (JSON), bank (JSON), hotbar (JSON)
```

### What Does NOT Persist

- Enemy state (all enemies reset on server restart)
- Loot drops on the ground
- Active casts
- Player world position (respawns at map spawn point)

---

## Admin Operations Reference

Practical recipes for an admin GUI. All operations below use direct database access and/or the live `world` object.

### Get All Online Players

```js
const online = [];
for (const [id, p] of world.players) {
  online.push({
    id, charId: p.charId, name: p.name, mapId: p.mapId,
    x: p.x, y: p.y, floor: p.floor,
    level: p.level, hp: p.hp, maxHp: p.maxHp,
    dead: p.dead, gold: p.gold
  });
}
```

### Get All Registered Accounts (offline query)

```js
const accounts = db.prepare("SELECT username, created_at FROM accounts").all();
```

### Get All Characters For an Account

```js
const chars = db.prepare(
  "SELECT id, name, char_class, level, xp, gold, hp, mana FROM characters WHERE username = ?"
).all(username);
```

### Teleport / Unstick a Player

Move an online player to a safe position:

```js
function unstickPlayer(playerId, targetMapId, tileX, tileY) {
  const player = world.players.get(playerId);
  if (!player) return false;

  const mapEntry = world.maps.get(targetMapId);
  if (!mapEntry) return false;

  const ts = mapEntry.collision.tileSize || 48;
  const oldMap = player.mapId;
  player.x = tileX * ts;
  player.y = tileY * ts;
  player.floor = 0;

  if (oldMap !== targetMapId) {
    // Cross-map teleport
    player.mapId = targetMapId;
    world.broadcastToMap(oldMap, { type: "player_left", playerId: player.id });
    world.broadcastToMap(targetMapId, { type: "player_joined", player: world.playerPublic(player) }, player.id);
    world.send(player.ws, {
      type: "map_changed",
      mapId: targetMapId,
      enemies: world.enemySnapshot(targetMapId),
      players: world.otherPlayersSnapshot(player.id, targetMapId),
      drops: world.dropsSnapshot(targetMapId)
    });
  }
  // The next tick's broadcastWorldState will sync the new position
  return true;
}
```

### Change a Player's Hearthstone Location

```js
function setHearthstone(playerId, statueId, statueName, mapId, tileX, tileY) {
  const player = world.players.get(playerId);
  if (!player) return false;

  player.hearthstone = {
    statueId, statueName, mapId,
    tx: tileX, ty: tileY,
    lastUsedAt: player.hearthstone?.lastUsedAt || 0
  };

  world.send(player.ws, {
    type: "attune_result",
    ok: true,
    hearthstone: player.hearthstone
  });
  return true;
}
```

### Force-Save a Player to Database

```js
function savePlayer(playerId) {
  const p = world.players.get(playerId);
  if (!p || !p.charId) return false;

  database.saveCharacterProgress(p.charId, {
    level: p.level, xp: p.xp, gold: p.gold,
    hp: p.hp, mana: p.mana,
    inventory: p.inventory,
    equipment: p.equipment,
    quests: p.quests,
    hearthstone: p.hearthstone,
    bank: p.bank,
    hotbar: p.hotbar
  });
  return true;
}
```

### Force-Save All Players

```js
function saveAllPlayers() {
  for (const [id, p] of world.players) {
    if (p.charId) savePlayer(id);
  }
}
```

### Edit an Offline Character (direct DB)

```js
function editOfflineCharacter(charId, changes) {
  // Load current state
  const row = db.prepare(
    "SELECT inventory, equipment, quests, hearthstone, bank, hotbar, level, xp, gold, hp, mana FROM characters WHERE id = ?"
  ).get(charId);
  if (!row) return false;

  const data = {
    level: row.level, xp: row.xp, gold: row.gold,
    hp: row.hp, mana: row.mana,
    inventory: JSON.parse(row.inventory || "[]"),
    equipment: JSON.parse(row.equipment || "{}"),
    quests: JSON.parse(row.quests || "{}"),
    hearthstone: JSON.parse(row.hearthstone || "null"),
    bank: JSON.parse(row.bank || "[]"),
    hotbar: JSON.parse(row.hotbar || "[]")
  };

  // Apply changes (e.g. changes = { gold: 999, level: 10 })
  Object.assign(data, changes);
  database.saveCharacterProgress(charId, data);
  return true;
}
```

### Give an Item to a Player

```js
function giveItem(playerId, itemId) {
  const player = world.players.get(playerId);
  if (!player) return false;

  const template = ITEMS[itemId];
  if (!template) return false;

  const item = { ...template };
  if (template.stackSize) item.qty = 1;

  const idx = world._addItemToSlots(player.inventory, item);
  if (idx === -1) return false; // inventory full

  world.send(player.ws, {
    type: "loot_pickup",
    dropId: null, gold: 0,
    item: item, index: idx,
    slotItem: player.inventory[idx]
  });
  return true;
}
```

### Revive a Dead Player

```js
function revivePlayer(playerId) {
  const player = world.players.get(playerId);
  if (!player || !player.dead) return false;

  player.dead = false;
  player.deathUntil = 0;
  player.hp = player.maxHp;
  player.mana = player.maxMana;

  world.send(player.ws, {
    type: "you_respawned",
    x: player.x, y: player.y,
    hp: player.hp, maxHp: player.maxHp,
    mana: player.mana, maxMana: player.maxMana
  });
  return true;
}
```

### Adjust Gold / XP

```js
function setGold(playerId, amount) {
  const p = world.players.get(playerId);
  if (!p) return false;
  p.gold = Math.max(0, amount);
  return true; // Synced on next tick via broadcastWorldState
}

function grantXp(playerId, amount) {
  const p = world.players.get(playerId);
  if (!p) return false;
  world._grantXp(p, amount); // Handles level-ups automatically
  return true;
}
```

### Kick a Player

```js
function kickPlayer(playerId, reason) {
  const player = world.players.get(playerId);
  if (!player) return false;

  world.send(player.ws, { type: "kicked", reason: reason || "Kicked by admin." });
  player.ws.close();
  // Cleanup handled by ws.on("close") in server.js
  return true;
}
```

### Send System Message

```js
// To one player
world.send(player.ws, { type: "chat", channel: "system", text: "Admin: Server restarting in 5 minutes." });

// To all players
world.broadcast({ type: "chat", channel: "system", text: "Server maintenance in 5 minutes." });

// To all on a specific map
world.broadcastToMap("eldengrove", { type: "chat", channel: "system", text: "Event starting in Eldengrove!" });
```

### Respawn All Enemies on a Map

```js
function respawnAllEnemies(mapId) {
  const mapEntry = world.maps.get(mapId);
  if (!mapEntry) return false;

  for (const enemy of mapEntry.enemies) {
    if (enemy.dead) {
      enemy.dead = false;
      enemy.deadUntil = 0;
      enemy.hp = enemy.maxHp;
      enemy.x = enemy.spawnX + (Math.random() - 0.5) * 24;
      enemy.y = enemy.spawnY + (Math.random() - 0.5) * 24;
      enemy.targetPlayerId = null;
    }
  }
  return true;
}
```

### Query Active Sessions

```js
const activeSessions = db.prepare(
  "SELECT token, username, created_at, expires_at FROM sessions WHERE expires_at > ?"
).all(Date.now());
```

---

## Stat Formulas

| Stat | Formula |
|------|---------|
| Max HP | `120 + (level - 1) × 24 + armor.hpBonus` |
| Max Mana | `80 + (level - 1) × 16 + trinket.manaBonus` |
| Base Damage | `16 + (level - 1) × 4` |
| Total Damage | `baseDamage + weapon.attackBonus` |
| XP to Level | `160 × 1.28^(level - 1)` |
| Heal Amount | `34 + level × 6` (22 mana, 5.3s cooldown) |
| HP Regen | `1.8 / sec` |
| Mana Regen | `7 / sec` |
| Death Timer | `4.2 seconds` |
| Death Penalty | `10 gold` |
| HS Cooldown | `180 seconds` (from `items.json`) |
| HS Cast Time | `8 seconds` (from `items.json`) |

---

## Implementing an Admin GUI

### Recommended Approach

1. **Add admin routes to `server.js`** — New Express endpoints under `/admin/*` with a separate admin auth mechanism (e.g. environment variable secret, or a DB `is_admin` column).

2. **Access live state** — The `world` object and `database` module are already in `server.js` scope. Admin routes can directly call methods on them.

3. **Access DB for offline data** — `database.db` is the raw better-sqlite3 handle; use it for ad-hoc queries on offline characters.

4. **Serve admin UI** — Either a separate static folder (e.g. `admin/`) or a SPA framework. Keep it behind auth middleware.

### Admin Auth

```js
const ADMIN_SECRET = process.env.ADMIN_SECRET || "changeme";

function adminAuth(req, res, next) {
  if (req.headers["x-admin-key"] !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

app.get("/admin/players", adminAuth, (req, res) => {
  const online = [];
  for (const [id, p] of world.players) {
    online.push({
      id, charId: p.charId, name: p.name,
      mapId: p.mapId, x: p.x, y: p.y, floor: p.floor,
      level: p.level, hp: p.hp, maxHp: p.maxHp,
      mana: p.mana, maxMana: p.maxMana,
      gold: p.gold, dead: p.dead
    });
  }
  res.json({ players: online });
});

app.post("/admin/unstick", adminAuth, express.json(), (req, res) => {
  const { playerId, mapId, tileX, tileY } = req.body;
  // ... use unstickPlayer() from above
});

app.post("/admin/save-all", adminAuth, (req, res) => {
  world._autoSaveAll();
  res.json({ ok: true });
});

app.post("/admin/broadcast", adminAuth, express.json(), (req, res) => {
  world.broadcast({ type: "chat", channel: "system", text: req.body.message });
  res.json({ ok: true });
});
```

### Implemented Admin API Routes

The admin GUI (`admin/`) is fully implemented. All routes are behind `adminAuth` middleware and prefixed with `/admin/api/`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/api/stats` | Dashboard stats (online count, accounts, characters, active sessions, maps) |
| GET | `/admin/api/players` | All online players with position, HP, mana, gold, status |
| GET | `/admin/api/accounts` | All registered accounts |
| GET | `/admin/api/accounts/:username/characters` | Characters belonging to an account |
| GET | `/admin/api/characters` | All characters across all accounts |
| GET | `/admin/api/characters/:id` | Full character detail (stats, inventory, equipment, bank, quests, hearthstone) |
| POST | `/admin/api/characters/:id/edit` | Edit character stats (level, xp, hp, gold, mapId, tileX, tileY) |
| POST | `/admin/api/characters/:id/hearthstone` | Set attuned hearthstone waystone |
| POST | `/admin/api/characters/:id/inventory` | Replace inventory (20-slot array) |
| POST | `/admin/api/characters/:id/bank` | Replace bank (48-slot array) |
| GET | `/admin/api/items` | Full item catalog from items.json |
| GET | `/admin/api/waystones` | All waystones across all maps |
| POST | `/admin/api/players/:id/kick` | Kick an online player |
| POST | `/admin/api/players/:id/revive` | Revive a dead player to full HP/mana |
| POST | `/admin/api/players/:id/teleport` | Teleport player to a waystone |
| POST | `/admin/api/players/:id/grantxp` | Grant XP (handles level-ups) |
| POST | `/admin/api/players/:id/setgold` | Set gold amount |
| POST | `/admin/api/players/:id/whisper` | Send a private whisper from `[Admin]` |
| POST | `/admin/api/broadcast` | Broadcast system-wide chat message |
| POST | `/admin/api/save-all` | Force-save all online players to DB |
| POST | `/admin/api/maps/:mapId/respawn-enemies` | Respawn all dead enemies on a map |
| GET | `/admin/api/maps/:mapId/enemies` | List all enemies on a map |

### Server Console Commands

The server runs a readline interface for terminal commands:

| Command | Description |
|---------|-------------|
| `help` | List all commands |
| `listaccounts` | Show all accounts with creation dates |
| `listchars <username>` | List characters for an account |
| `findchar <name>` | Search characters by name (partial match) |
| `deletechar <charId>` | Delete a character by ID |
| `deleteaccount <username>` | Delete an account and all its characters |
| `changepassword <user> <pw>` | Change an account's password and invalidate sessions |

### Key Objects Available in server.js Scope

| Variable | Type | What It Is |
|----------|------|-----------|
| `world` | `ServerWorld` | Live game state (players, maps, enemies) |
| `database` | module | All DB functions + `database.db` raw handle |
| `database.db` | `better-sqlite3` | Direct SQL access |
| `activeAccounts` | `Map<username, playerId>` | Currently connected accounts |

### Useful Direct SQL Queries

```sql
-- All characters sorted by level
SELECT c.id, c.name, c.char_class, c.level, c.gold, a.username
FROM characters c JOIN accounts a ON c.username = a.username
ORDER BY c.level DESC;

-- Find character by name
SELECT * FROM characters WHERE name = ? COLLATE NOCASE;

-- Total gold in economy
SELECT SUM(gold) AS totalGold FROM characters;

-- Active sessions count
SELECT COUNT(*) FROM sessions WHERE expires_at > ?; -- pass Date.now()

-- Characters per class
SELECT char_class, COUNT(*) AS cnt FROM characters GROUP BY char_class;

-- Richest characters
SELECT name, level, gold FROM characters ORDER BY gold DESC LIMIT 10;
```

---

## Maps Reference

| Map ID | Size | Description |
|--------|------|-------------|
| `eldengrove` | 128×128 tiles | Starter zone, safe town, beginner enemies |
| `darkwood` | 80×80 tiles | Harder forest zone |
| `southmere` | 128×128 tiles | Additional overworld zone |
| `moonfall_cavern` | 96×96 tiles | Cave/dungeon zone |

Map JSON files: `public/data/maps/{mapId}.json`

Each map contains: `terrain`, `palette`, `portals`, `enemySpawns`, `npcs`, `safeZones`, `trees`, `buildings`, `statues`, `extraBlocked`

### Portal Format
```json
{ "tx": 5, "ty": 64, "targetMap": "darkwood", "targetTx": 75, "targetTy": 40 }
```

### NPC Placement Format
```json
{ "npcId": "elder_rowan", "tx": 25, "ty": 30, "floor": 0 }
```

### Waystone/Statue Format
```json
{ "id": "waystone_eldengrove", "name": "Eldengrove Waystone", "tx": 32, "ty": 33 }
```
