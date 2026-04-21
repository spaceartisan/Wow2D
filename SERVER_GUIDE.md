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
│  │ SQLite + WAL │  │ Game loop @ 60 Hz               │  │
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
| `equipment` | TEXT | `'{}'` | JSON: `{ mainHand, offHand, armor, helmet, pants, boots, ring1, ring2, amulet }` |
| `quests` | TEXT | `'{}'` | JSON: `{ questId: stateObj }` |
| `hearthstone` | TEXT | `'null'` | JSON: attunement object or null |
| `bank` | TEXT | `'[]'` | JSON: 48-slot array |
| `hotbar` | TEXT | `'[]'` | JSON: 10-slot array |
| `gathering_skills` | TEXT | `'{}'` | JSON: gathering skill levels and XP |
| `map_id` | TEXT | `'eldengrove'` | Last known map ID for position persistence |
| `pos_x` | REAL | `-1` | Last known X position (world pixels, -1 = use spawn) |
| `pos_y` | REAL | `-1` | Last known Y position (world pixels, -1 = use spawn) |
| `floor` | INTEGER | `0` | Last known floor (0 = ground, 1+ = upper floors) |
| `portrait` | TEXT | `'portrait_1'` | Character portrait ID (e.g. `portrait_1` through `portrait_6`) |
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
| `createCharacter` | `(token, name, class, portrait)` | Max 5 per account. Portrait must be one of `portrait_1`–`portrait_6` (defaults to `portrait_1`). Returns `{ ok, characters }` or `{ error }`. |
| `deleteCharacter` | `(token, charId)` | Validates ownership. Returns `{ ok, characters }` or `{ error }`. |
| `loadCharacter` | `(charId, username)` | Full load with JSON parsing. Returns character object or `null`. |
| `saveCharacterProgress` | `(charId, data)` | Saves: level, xp, gold, hp, mana, inventory, equipment, quests, hearthstone, bank, hotbar, gathering_skills, map_id, pos_x, pos_y, floor. |
| `cleanExpiredSessions` | `()` | Deletes expired session rows. |

### Raw Prepared Statements

Available on the `stmts` object (not exported, but accessible if you modify database.js):

```js
stmts.getAccount          // SELECT * FROM accounts WHERE username = ?
stmts.insertAccount       // INSERT INTO accounts (username, hash, salt) VALUES (?, ?, ?)
stmts.getCharacters       // SELECT id, name, char_class AS charClass, level, portrait, created_at ... WHERE username = ?
stmts.countCharacters     // SELECT COUNT(*) AS cnt FROM characters WHERE username = ?
stmts.insertCharacter     // INSERT INTO characters (username, name, char_class, portrait) VALUES (?, ?, ?, ?)
stmts.deleteCharacter     // DELETE FROM characters WHERE id = ? AND username = ?
stmts.getCharacterById    // SELECT id, name, ..., bank, hotbar, gathering_skills, map_id, pos_x, pos_y, floor, portrait ... WHERE id = ? AND username = ?
stmts.saveCharacter       // UPDATE characters SET level=?, xp=?, ..., gathering_skills=?, map_id=?, pos_x=?, pos_y=?, floor=? WHERE id=?
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
| POST | `/api/characters/create` | `{ token, charName, charClass, portrait }` | `{ ok, characters }` |
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
| `chat` | `text` | Send chat. `/w Name msg` for whisper, `/p msg` for party chat. Max 200 chars |
| `map_change` | `mapId, x, y` | Enter a portal (proximity validated) |
| `party_create` | — | Create a new party (you become leader) |
| `party_invite` | `targetName` | Invite a player to your party (leader only) |
| `party_accept` | `fromId` | Accept a pending party invite |
| `party_decline` | `fromId` | Decline a pending party invite |
| `party_leave` | — | Leave your current party |
| `party_kick` | `targetId` | Kick a member from the party (leader only) |
| `party_rescind` | `targetId` | Cancel a pending outgoing invite (leader only) |
| `party_list` | — | Request current party member list |
| `friend_request` | `targetName` | Send a friend request |
| `friend_accept` | `fromName` | Accept a friend request |
| `friend_reject` | `fromName` | Reject a friend request |
| `friend_remove` | `targetName` | Remove a friend |
| `friend_list` | — | Request current friends/blocked list |
| `block_player` | `targetName` | Block a player |
| `unblock_player` | `targetName` | Unblock a player |
| `block_list` | — | Request current block list |
| `use_item` | `index` | Use consumable at inventory index |
| `sell_item` | `index` | Sell item (must be near vendor NPC) |
| `buy_item` | `npcId, itemId` | Buy from vendor (proximity + gold validated) |
| `equip_item` | `index` | Equip item from inventory |
| `unequip_item` | `slot` | Unequip item from equipment slot (`mainHand`, `offHand`, `armor`, `helmet`, `pants`, `boots`, `ring1`, `ring2`, or `amulet`) |
| `drop_item` | `index` | Destroy an inventory item (permanent items like hearthstone are protected) |
| `use_skill` | `skillId, enemyId?` | Use a skill (class, level, mana, range, cooldown validated) |
| `complete_quest` | `questId, npcId` | Turn in quest at NPC |
| `quest_state_update` | `questId, state` | Sync quest accept/progress (can't set "completed") |
| `use_hearthstone` | — | Begin hearthstone cast |
| `cancel_hearthstone` | — | Cancel active hearthstone cast |
| `cancel_cast` | — | Cancel any active cast (generic) |
| `attune_hearthstone` | `statueId` | Attune to a waystone (proximity validated) |
| `bank_deposit` | `invIndex` | Deposit item to bank (must be near banker) |
| `bank_withdraw` | `bankIndex` | Withdraw item from bank (must be near banker) |
| `hotbar_update` | `hotbar` (10-slot array) | Save hotbar layout |
| `swap_items` | `from, to, fromIndex, toIndex` | Swap/stack between `"inventory"` and/or `"bank"` |
| `split_stack` | `container, index, qty` | Split a stack in `"inventory"` or `"bank"` into an empty slot |
| `loot_open` | `dropId` | Open a loot drop (proximity validated, ownership checked) |
| `loot_take` | `dropId, what` | Take from an open drop (`"gold"`, `"item"`, or `"all"`) |
| `gather` | `nodeId` | Harvest a resource node (range, tool, skill level, cooldown validated) |
| `craft` | `recipeId` | Craft an item at a crafting station (proximity, skill level, materials validated) |
| `dismantle_item` | `index` | Dismantle an equipment item into materials (must be near vendor NPC) |
| `respawn` | — | Signal ready to respawn (actual respawn is tick-driven) |
| `trade_request` | `targetId` | Send a trade request to another player (proximity + block validated) |
| `trade_accept` | `fromId` | Accept a pending trade request |
| `trade_decline` | `fromId` | Decline a pending trade request |
| `trade_offer_update` | `gold, items[]` | Update your trade offer (gold amount + up to 10 item indices) |
| `trade_confirm` | — | Confirm your side of the trade |
| `trade_cancel` | — | Cancel the active trade |

### Server → Client Messages

| type | When | Key Fields |
|------|------|------------|
| `auth_error` | Bad token | `error` |
| `kicked` | Duplicate login | `reason` |
| `welcome` | Join success | `playerId, mapId, tick, tickRate, enemies, players, drops, inventory, equipment, level, xp, xpToLevel, gold, quests, hearthstone, bank, hotbar, hp, maxHp, mana, maxMana, gatheringSkills, resourceNodes, x, y, floor, portrait` |
| `state` | Every tick (60 Hz) | `tick, enemies[], players[], drops[], resourceNodes[], you: { id, hp, maxHp, mana, maxMana, dead, x, y, ackSeq, gold, level, xp, xpToLevel, damage, buffs[] }` — enemies and players include `floor` field |
| `player_joined` | Player enters map | `player: { id, name, charClass, portrait, level, x, y, hp, maxHp, dead, floor }` |
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
| `drop_item_result` | Item dropped | `ok, inventory[], message` |
| `skill_result` | Skill used | `ok, skillId, damage?, enemyHp?, mana, maxMana, buff?, debuff?` |
| `projectile_hit` | Ranged hit | `skillId, enemyId, damage, enemyHp, enemyMaxHp, debuff?` |
| `quest_complete_result` | Quest turned in | `ok, questId, xp, gold, items[], playerGold, playerXp, playerLevel, hp, maxHp, mana, maxMana` |
| `attune_result` | Waystone attune | `ok, reason?, hearthstone?` |
| `hearthstone_result` | Use HS validation fail | `ok: false, reason, remaining?` |
| `hearthstone_cast_start` | Cast begins | `castTime, destination` |
| `hearthstone_cast_cancelled` | Cast interrupted | `reason` |
| `hearthstone_teleport` | Teleport completes | `mapId, x, y, enemies?, players?, drops?, hearthstone` |
| `bank_result` | Bank action | `ok, reason?, action, invIndex, bankIndex, inventory, bank` |
| `hotbar_result` | Hotbar saved | `ok, hotbar` |
| `swap_result` | Item swap | `ok, reason?, inventory, bank` |
| `split_stack_result` | Stack split | `ok, reason?, inventory, bank` |
| `loot_open_result` | Loot window | `ok, reason?, dropId, gold, item` |
| `loot_take_result` | Loot taken | `ok, reason?, dropId, takenGold, takenItem, lootIndex, slotItem, remainingGold, remainingItem, dropEmpty, inventory` |
| `gather_result` | Gather attempt | `success, reason?, itemId?, itemName?, inventory?, gatheringSkills?, skillId?, xpGained?, leveledUp?, newLevel?` |
| `craft_result` | Craft attempt | `success, reason?, recipeId?, outputItem?, inventory?, gatheringSkills?, xpGained?, leveledUp?, newLevel?` |
| `dismantle_item_result` | Dismantle attempt | `ok, reason?, inventory?, dismantledName?, gained?` |
| `enemy_killed` | Kill confirmed | `enemyId, enemyType, xpReward` |
| `drop_spawned` | Loot appears | `drop: { id, x, y }` |
| `drop_removed` | Loot taken | `dropId` |
| `loot_pickup` | You looted | `dropId, gold, item, index, slotItem` |
| `player_damaged` | Enemy hits you | `damage, hp, maxHp, attackerName` |
| `you_died` | Death | `goldLost` |
| `you_respawned` | Auto-respawn | `x, y, hp, maxHp, mana, maxMana` |
| `combat_visual` | Combat effect | Polymorphic: melee/skill hit, self-target, enemy attack, projectile hit (broadcast to map, excludes source) |
| `projectile_spawn` | Ranged launch | `attackerId, sx, sy, targetEnemyId, speed, weaponId?, skillId?, damageType?` (broadcast) |
| `trade_request_received` | Trade incoming | `fromId, fromName` |
| `trade_result` | Trade action result | `ok, error?` |
| `trade_opened` | Trade window opens | `partnerId, partnerName` |
| `trade_partner_offer` | Partner offer update | `gold, items[]` |
| `trade_offer_accepted` | Offer acknowledged | `ok` |
| `trade_confirm_update` | Confirm state | `confirmed, partnerConfirmed` |
| `trade_completed` | Trade executed | `inventory[], gold` |
| `trade_cancelled` | Trade ended | `reason` |
| `party_result` | Party action result | `ok?, error?, message?` |
| `party_invite_received` | Incoming invite | `fromId, from` (inviter's name) |
| `party_update` | Party state changed | `partyId, leader, members[{ id, name, charClass, portrait, level, hp, maxHp, online, isLeader }], pendingInvites[]` |
| `party_disbanded` | Party dissolved | — |
| `party_invite_rescinded` | Invite cancelled | `fromId` |
| `quest_kill_credit` | Party quest share | `enemyType` (increment kill objective progress) |
| `friend_list` | Friends data | `friends[], pendingReceived[], pendingSent[], blocked[]` |
| `friend_update` | Friend list changed | Same fields as `friend_list` |
| `friend_request_received` | Incoming request | `from` (sender name) |
| `block_list` | Block list data | `blocked[]` |

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
  charClass: "warrior",        // class ID from playerBase.json ("warrior" | "mage" | "rogue" | …)
  portrait: "portrait_1",       // Character portrait ID (portrait_1 through portrait_6)
  mapId: "eldengrove",         // Current map ID
  x: 1200, y: 1500,           // World pixel position
  floor: 0,                    // 0 = ground, 1+ = upper floors
  level: 5,
  xp: 320,
  gold: 87,
  hp: 200, maxHp: 262,         // maxHp = class.maxHp + (level-1)*class.hpPerLevel + sum(equipped stats.maxHp)
  mana: 80, maxMana: 108,      // maxMana = class.maxMana + (level-1)*class.manaPerLevel + sum(equipped stats.maxMana)
  baseDamage: 38,              // class.damage + (level-1)*class.damagePerLevel
  damage: 43,                  // baseDamage + sum(all equipped stats.attack)
  partyId: null | 1,           // Party ID (null if not in a party)
  attackRange: 52,
  attackCooldown: 0.82,        // seconds
  lastAttackAt: 0,             // timestamp
  lastHealAt: 0,               // timestamp
  dead: false,
  deathUntil: 0,               // timestamp (respawn at)
  inventory: [null, {...}, ...], // 20 slots
  equipment: {
    mainHand: null | itemObj,   // weapon (1H or 2H)
    offHand: null | itemObj,    // shield or quiver
    armor: null | itemObj,
    helmet: null | itemObj,
    pants: null | itemObj,
    boots: null | itemObj,
    ring1: null | itemObj,
    ring2: null | itemObj,
    amulet: null | itemObj
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
  },
  lootingDropId: null | "d1",   // Currently open loot drop ID
  activeBuffs: [                // Active buff/debuff effects
    { id: "battleShout", stat: "damage", modifier: 0.2, byPct: true, expiresAt: 1712345700000 }
  ],
  _tileDoTs: {                  // Internal: per-zone DoT/HoT tick tracking
    "zonePoison": { lastTickAt: 1712345690000 }
  },
  gatheringSkills: {             // Gathering & processing profession levels
    mining: { level: 1, xp: 0 },
    logging: { level: 1, xp: 0 },
    fishing: { level: 1, xp: 0 },
    smelting: { level: 1, xp: 0 },
    milling: { level: 1, xp: 0 },
    cooking: { level: 1, xp: 0 }
  },
  lastGatherTick: 0,             // Tick of last successful gather (cooldown)
  _tradePendingFrom: null,       // Incoming trade request sender ID
  _tradePendingTo: null,         // Outgoing trade request target ID
  _tradePartner: null,           // Active trade partner ID
  _tradeOffer: null,             // { gold, items[] } — this player's current offer
  _tradeConfirmed: false         // Whether this player has confirmed their offer
}
```

---

## Map System

Maps loaded at startup: `eldengrove`, `darkwood`, `moonfall_cavern`, `southmere`, `stonegate`, `titanreach`, `magical_tower`

Stored in `world.maps` — a `Map<mapId, MapEntry>`:

```js
{
  _mapId: "eldengrove",
  data: { ... },       // Raw map JSON (terrain, portals, npcs, enemySpawns, etc.)
  collision: CollisionMap,
  enemies: [...],      // Live enemy instances
  drops: [],           // Active loot drops
  projectiles: [],     // Active server-side projectiles
  resourceNodes: [...]  // Gatherable resource nodes (mining, logging, fishing, etc.)
}
```

### CollisionMap

- `isBlocked(worldX, worldY, radius, floor)` — 9-point circle collision
- `isSafeZone(worldX, worldY)` — Returns true if inside a safe zone
- `getTileModifiers(worldX, worldY, floor)` — Returns array of tile modifiers at position, or `null`. Used by `updateTileModifiers()` for zone effects.
- `spawnPoint` — `{ x, y }` world coordinates
- `tileSize` — usually 48

### Enemy Object

```js
{
  id: "e1",
  type: "wolf",           // Key into ENEMY_TYPES
  name: "Timber Wolf",
  portrait: "wolf",        // Portrait image key (defaults to type). Sprite at portraits/enemies/{portrait}.png
  x, y,                   // Current world position
  spawnX, spawnY,          // Home position (for leashing)
  floor: 0,                // 0 = ground, 1+ = upper floors
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
  activeDebuffs: [...]       // Active debuffs (DoTs, slows, etc.)
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

## Tick Loop (60 Hz)

Every ~16.67ms the server runs:

| Step | Method | What It Does |
|------|--------|--------------|
| 1 | `updateProjectiles` | Per-map: move server projectiles, resolve hits |
| 2 | `updateEnemyAi` | Per-map: aggro, chase, attack, leash, wander |
| 3 | `updateEnemyRespawns` | Respawn dead enemies when timer expires |
| 4 | `updateDropPickups` | Auto-pickup loot within 42px; expire old drops |
| 5 | `updateResourceNodeRespawns` | Per-map: respawn depleted resource nodes when timer expires |
| 6 | `updatePlayerDeaths` | Respawn dead players after 4.2s |
| 7 | `updatePlayerRegen` | Regen: +7 mana/s, +1.8 hp/s |
| 8 | `updatePlayerCasts` | Complete hearthstone casts when duration elapsed |
| 9 | `updateBuffsAndDebuffs` | Expire buffs/debuffs; tick DoTs on enemies |
| 10 | `updateTileModifiers` | Apply zone buffs/debuffs/DoTs/HoTs to players on modifier tiles |
| 11 | `broadcastWorldState` | Send `"state"` message to all players |
| 12 | Auto-save (every 60s) | `_autoSaveAll()` → `database.saveCharacterProgress()` for each player |

---

## Persistence Model

### When Saves Happen

| Trigger | What Saves |
|---------|-----------|
| Player disconnect | Full character state → DB |
| Auto-save (every 60s) | All connected players → DB |
| XP gained (enemy kills, level-ups) | Character state → DB |
| Quest completed | Character state → DB |
| Gathering success | Character state → DB |
| Crafting success | Character state → DB |

All save operations use the `_savePlayer(p)` helper method, which calls `database.saveCharacterProgress()` with the player's full state including position (mapId, x, y, floor).

### What Gets Saved

`database.saveCharacterProgress(charId, data)` writes:

```
level, xp, gold, hp, mana,
inventory (JSON), equipment (JSON), quests (JSON),
hearthstone (JSON), bank (JSON), hotbar (JSON),
gathering_skills (JSON),
map_id, pos_x, pos_y, floor
```

### What Does NOT Persist

- Enemy state (all enemies reset on server restart)
- Loot drops on the ground
- Active casts
- Party state (parties are in-memory only)
- Friend requests (friends list is persisted, pending requests are in-memory)

---

## Party System

Parties are managed entirely in-memory on the server via `world.parties` — a `Map<partyId, Party>`.

### Party Object

```js
{
  id: 1,                                  // Auto-incrementing party ID
  leader: "p1",                           // Player ID of the leader
  members: Set(["p1", "p2"]),             // Player IDs of all members (including leader)
  pendingInvites: Map([                    // Outstanding invites (target → name)
    ["p3", "Kael"]
  ])
}
```

### Party Lifecycle

1. **Create** — A player sends `party_create`. A solo party is created with them as leader. Must not already be in a party.
2. **Invite** — The leader sends `party_invite` with a target player name. The target must not already be in a party. The invite is tracked in `party.pendingInvites` and the leader's UI updates to show pending invites.
3. **Accept** — Target sends `party_accept`. They join the existing party, are removed from `pendingInvites`, and all members receive a `party_update`.
4. **Decline** — Target sends `party_decline`. The invite is removed from `pendingInvites` and the leader is notified.
5. **Rescind** — Leader sends `party_rescind` to cancel an outgoing invite. The target receives `party_invite_rescinded`.
6. **Leave** — A member sends `party_leave`. They are removed. If only the leader remains, the party stays active (leader can still invite). If no one remains, the party is deleted. If the leader leaves, the next member is promoted.
7. **Kick** — Leader sends `party_kick` to remove a member.

### Party XP Sharing

Configured via `public/data/party.json` → `xpShare`:

```json
{
  "enabled": true,
  "rangeTiles": 50,
  "levelDiff": 4,
  "splitMode": "equal"
}
```

When a party member kills an enemy, `_grantPartyXp()` finds eligible members:
- **Same map** as the killer
- **Within range** (`rangeTiles × 16` pixels)
- **Within level difference** (`±levelDiff` levels of the killer)

XP is split equally among all eligible members (minimum 1 XP each). Non-killers receive a system chat notification.

### Party Quest Kill Sharing

Configured via `public/data/party.json` → `questShareKills`:

```json
{
  "enabled": true,
  "rangeTiles": 50,
  "levelDiff": 4
}
```

When a party member kills an enemy, `_shareQuestKillCredit()` checks all other eligible members (same criteria as XP sharing). If a member has an active quest with a `kill` objective matching the enemy type, they receive a `quest_kill_credit` message and their client increments the quest counter.

**Only `kill` objectives are shared.** All other quest types (collect, talk, craft) must be completed individually. Quest completion XP is never shared.

---

## Social / Friends System

Friends are persisted in the database. Online status is tracked in-memory.

### Friend-Related Messages

| Direction | type | Fields | Description |
|-----------|------|--------|-------------|
| C→S | `friend_request` | `targetName` | Send friend request |
| C→S | `friend_accept` | `fromName` | Accept pending request |
| C→S | `friend_reject` | `fromName` | Reject pending request |
| C→S | `friend_remove` | `targetName` | Remove a friend |
| C→S | `friend_list` | — | Request friends list |
| C→S | `block_player` | `targetName` | Block a player (auto-removes from friends) |
| C→S | `unblock_player` | `targetName` | Unblock a player |
| C→S | `block_list` | — | Request block list |
| S→C | `friend_list` | `friends[], pendingReceived[], pendingSent[], blocked[]` | Full list on login |
| S→C | `friend_update` | Same as above | After any change |
| S→C | `friend_request_received` | `from` | Incoming friend request notification |

### Right-Click Context Menu

Right-clicking another player in the game world opens a context menu with:
- **Whisper** — Start a `/w` whisper to the player
- **Invite to Party** — Send a party invite (only when you are in a party as leader)
- **Add Friend** — Send a friend request
- **Block** — Block the player
- **Trade** — Send a trade request (must be within 300 px)

---

## Trading System

Player-to-player trading is fully server-authoritative. All trade state is in-memory on the player objects.

### Trade-Related Messages

| Direction | type | Fields | Description |
|-----------|------|--------|-------------|
| C→S | `trade_request` | `targetId` | Initiate trade (distance ≤ 300 px, block check, no existing trade) |
| C→S | `trade_accept` | `fromId` | Accept pending trade request |
| C→S | `trade_decline` | `fromId` | Decline pending trade request |
| C→S | `trade_offer_update` | `gold`, `items[]` | Update offer (max 10 items); resets both confirmations |
| C→S | `trade_confirm` | — | Confirm current offer |
| C→S | `trade_cancel` | — | Cancel trade |
| S→C | `trade_request_received` | `fromId`, `fromName` | Incoming trade request popup |
| S→C | `trade_result` | `ok`, `error?` | Result of trade_request/accept/decline |
| S→C | `trade_opened` | `partnerId`, `partnerName` | Trade window should open |
| S→C | `trade_partner_offer` | `gold`, `items[]` | Partner's updated offer |
| S→C | `trade_offer_accepted` | `ok` | Server acknowledged your offer update |
| S→C | `trade_confirm_update` | `confirmed`, `partnerConfirmed` | Confirmation state for both sides |
| S→C | `trade_completed` | `inventory[]`, `gold` | Trade executed — updated inventory and gold |
| S→C | `trade_cancelled` | `reason` | Trade ended (cancel, disconnect, death, map change) |

### Trade Lifecycle

| Step | Client → Server | Server Logic | Server → Client |
|------|----------------|--------------|----------------|
| Request | `trade_request` (targetId) | Validates: same map, distance ≤ 300px, not blocked, no existing trade | `trade_request_received` to target |
| Accept | `trade_accept` (fromId) | Sets `_tradePartner` on both, clears pending | `trade_opened` to both |
| Decline | `trade_decline` (fromId) | Clears pending | `trade_result` to requester |
| Update offer | `trade_offer_update` (gold, items[]) | Stores offer, resets both confirmations | `trade_partner_offer` to partner, `trade_offer_accepted` to sender, `trade_confirm_update` to both |
| Confirm | `trade_confirm` | Sets `_tradeConfirmed`; if both confirmed → `_executeTrade()` | `trade_confirm_update` to both; on success: `trade_completed` to both |
| Cancel | `trade_cancel` | Clears all trade state | `trade_cancelled` to partner |

### Auto-Cancel

Trades auto-cancel (with `trade_cancelled` sent to the other party) when:
- Player disconnects (`removePlayer`)
- Player dies (PvE or PvP death)
- Player changes map (`handleMapChange`)

### Trade Execution Validation

Before swapping items, `_executeTrade()` clones both inventories, removes offered items, then attempts to add received items. If either player lacks inventory space, both receive `trade_cancelled` with reason `"Not enough inventory space"`. On success, both players' inventories and gold are updated atomically and saved to the database.

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
  player.x = tileX * ts + ts / 2;
  player.y = tileY * ts + ts / 2;
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
    hotbar: p.hotbar,
    gatheringSkills: p.gatheringSkills,
    mapId: p.mapId,
    posX: p.x,
    posY: p.y,
    floor: p.floor || 0
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
| Max HP | `120 + (level - 1) × 24 + sum(all equipped stats.maxHp)` |
| Max Mana | `80 + (level - 1) × 16 + sum(all equipped stats.maxMana)` |
| Base Damage | `16 + (level - 1) × 4` |
| Total Damage | `baseDamage + sum(all equipped stats.attack)` |
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
| GET | `/admin/api/stats` | Dashboard stats (online count, accounts, characters, active sessions, maps, mapSpawns, totalGold, classCounts) |
| GET | `/admin/api/players` | All online players with position, HP, mana, gold, status |
| GET | `/admin/api/accounts` | All registered accounts |
| GET | `/admin/api/accounts/:username/characters` | Characters belonging to an account |
| GET | `/admin/api/characters` | All characters across all accounts |
| GET | `/admin/api/characters/:id` | Full character detail (stats, inventory, equipment, bank, quests, hearthstone). Returns live in-memory state for online players. |
| POST | `/admin/api/characters/:id/edit` | Edit character stats (level, xp, hp, gold, mapId, tileX, tileY) |
| POST | `/admin/api/characters/:id/hearthstone` | Set attuned hearthstone waystone |
| POST | `/admin/api/characters/:id/inventory` | Replace inventory (20-slot array). If online, updates RAM and sends `swap_result` to client. |
| POST | `/admin/api/characters/:id/bank` | Replace bank (48-slot array). If online, updates RAM and sends `swap_result` to client. |
| GET | `/admin/api/items` | Full item catalog from items.json |
| GET | `/admin/api/waystones` | All waystones across all maps |
| POST | `/admin/api/players/:id/kick` | Kick an online player |
| POST | `/admin/api/players/:id/revive` | Revive a dead player to full HP/mana |
| POST | `/admin/api/players/:id/teleport` | Teleport player to any map + tile coordinates |
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
| `stonegate` | 128×128 tiles | Overworld zone |
| `titanreach` | 500×500 tiles | Large overworld zone |
| `magical_tower` | 80×80 tiles | Tower/dungeon zone |

Map JSON files: `public/data/maps/{mapId}.json`

Each map contains: `terrain`, `palette`, `portals`, `enemySpawns`, `npcs`, `safeZones`, `trees`, `buildings`, `statues`, `extraBlocked`, `particles`, `tileModifiers`, `resourceNodes`

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
