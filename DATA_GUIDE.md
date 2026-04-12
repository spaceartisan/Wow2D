# Data Files Guide

All game data lives in `public/data/` as JSON files. The server and client both read these at startup.

---

## enemies.json

Top-level object keyed by enemy ID. Each enemy needs a matching sprite at `public/assets/sprites/entities/{enemyId}.png`.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name |
| `maxHp` | number | Hit points |
| `damage` | number | Attack damage |
| `speed` | number | Movement speed (pixels/sec) |
| `xp` | number | XP awarded on kill |
| `goldMin` | number | Minimum gold drop |
| `goldMax` | number | Maximum gold drop |
| `respawnSeconds` | number | Seconds until respawn |
| `color` | string | Hex color fallback (e.g. `"#8B4513"`) |
| `radius` | number | Collision radius in pixels |
| `aggroRange` | number | Detection range in pixels |
| `attackRange` | number | Melee/ranged attack distance |
| `attackCooldown` | number | Seconds between attacks |
| `hitParticle` | string | *(optional)* Particle preset emitted when this enemy hits the player (default `"player_hit"`) |
| `hitSfx` | string | *(optional)* SFX played when this enemy hits the player (default `"player_hit"`) |
| `loot` | array | Drop table (see below) |

**Loot entries:**

| Field | Type | Description |
|-------|------|-------------|
| `itemId` | string | References an item in `items.json` |
| `chance` | number | Drop probability, 0–1 (e.g. `0.52` = 52%) |

**Example:**
```json
"wolf": {
  "name": "Timber Wolf",
  "maxHp": 60,
  "damage": 9,
  "speed": 105,
  "xp": 20,
  "goldMin": 2,
  "goldMax": 5,
  "respawnSeconds": 9,
  "color": "#9c8a74",
  "radius": 15,
  "aggroRange": 210,
  "attackRange": 34,
  "attackCooldown": 1.35,
  "hitParticle": "bite",
  "hitSfx": "bite_hit",
  "loot": [
    { "itemId": "wolfPelt", "chance": 0.52 },
    { "itemId": "wolfFang", "chance": 0.30 },
    { "itemId": "minorHealingPotion", "chance": 0.10 }
  ]
}
```

**To add an enemy:**
1. Add the entry to `enemies.json` with a unique key
2. Place a sprite at `public/assets/sprites/entities/{enemyId}.png`
3. Reference the enemy ID in map spawn configs (see map JSON `enemySpawns`)

---

## items.json

Top-level object keyed by item ID. Each item needs an icon at `public/assets/sprites/icons/{itemId}.png`.

### Common fields (all types)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Must match the object key |
| `name` | string | Display name |
| `type` | string | One of: `weapon`, `armor`, `trinket`, `consumable`, `junk`, `hearthstone` |
| `icon` | string | Icon filename without `.png` (usually same as `id`) |
| `value` | number | Sell price in gold |
| `description` | string | Tooltip text |
| `stackSize` | number | *(optional)* Max stack size. Omit or leave absent for unstackable items (e.g. equipment). Junk items typically use `99`, consumables `20`. |

### Type-specific fields

**weapon:**
| Field | Type | Description |
|-------|------|-------------|
| `attackBonus` | number | Added to player base damage |
| `hitParticle` | string | *(optional)* Particle preset emitted when attack lands (falls back to `playerBase.hitParticle`) |
| `hitSfx` | string | *(optional)* SFX played when attack lands (falls back to `playerBase.hitSfx`) |
| `swingSfx` | string | *(optional)* SFX played on swing (falls back to `playerBase.swingSfx`) |

**armor:**
| Field | Type | Description |
|-------|------|-------------|
| `hpBonus` | number | Added to player max HP |

**trinket:**
| Field | Type | Description |
|-------|------|-------------|
| `manaBonus` | number | Added to player max mana |

**consumable:**
| Field | Type | Description |
|-------|------|-------------|
| `effect` | string | `"healHp"` or `"healMana"` |
| `power` | number | Amount restored |
| `useParticle` | string | *(optional)* Particle preset emitted on use (e.g. `"heal"`, `"mana_restore"`) |
| `useSfx` | string | *(optional)* SFX played on use (e.g. `"potion_drink"`) |

**hearthstone:**
| Field | Type | Description |
|-------|------|-------------|
| `permanent` | boolean | `true` — cannot be dropped or sold |
| `castTime` | number | Seconds to channel |
| `cooldown` | number | Cooldown in seconds |

**Examples:**
```json
"noviceBlade": {
  "id": "noviceBlade",
  "name": "Novice Ironblade",
  "type": "weapon",
  "icon": "noviceBlade",
  "attackBonus": 5,
  "value": 20,
  "description": "A sturdy blade forged for new adventurers.",
  "hitParticle": "hit_spark",
  "hitSfx": "sword_hit",
  "swingSfx": "sword_swing"
}
```
```json
"minorHealingPotion": {
  "id": "minorHealingPotion",
  "name": "Minor Healing Potion",
  "type": "consumable",
  "icon": "minorHealingPotion",
  "effect": "healHp",
  "power": 40,
  "value": 8,
  "stackSize": 20,
  "description": "Restores 40 HP when used.",
  "useParticle": "heal",
  "useSfx": "potion_drink"
}
```

**To add an item:**
1. Add the entry to `items.json` with a unique key matching the `id` field
2. Place a 32×32 icon at `public/assets/sprites/icons/{itemId}.png`
3. Reference the item ID in enemy `loot` tables, NPC `shop` arrays, or quest `rewards.items`

---

## npcs.json

Top-level object keyed by NPC ID. Each NPC needs a sprite at `public/assets/sprites/entities/{npcId}.png`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Must match the object key |
| `name` | string | Display name shown above head |
| `color` | string | Hex color fallback |
| `type` | string | `"quest_giver"`, `"vendor"`, or `"banker"` |
| `defaultDialog` | string | Greeting text when no quest/shop action |
| `questIds` | string[] | Quest IDs this NPC offers (quest_giver only) |
| `shop` | string[] | Item IDs this NPC sells (vendor only) |

**Banker NPCs** use `type: "banker"` and only need `id`, `name`, `color`, `type`, and `defaultDialog`. When the player interacts with a banker, a 48-slot bank panel opens for storage.

**Examples:**
```json
"elder_rowan": {
  "id": "elder_rowan",
  "name": "Elder Rowan",
  "color": "#C8B060",
  "type": "quest_giver",
  "defaultDialog": "The forest stirs with danger, traveler.",
  "questIds": ["wolf_cull", "boar_menace"]
}
```
```json
"innkeeper_lora": {
  "id": "innkeeper_lora",
  "name": "Innkeeper Lora",
  "color": "#D4A56A",
  "type": "vendor",
  "defaultDialog": "Welcome! Rest your bones and browse my wares.",
  "shop": ["minorHealingPotion", "healingPotion", "minorManaPotion", "manaPotion"]
}
```
```json
"banker_tomas": {
  "id": "banker_tomas",
  "name": "Banker Tomas",
  "color": "#C8A820",
  "type": "banker",
  "defaultDialog": "Need to store something? I'll keep it safe."
}
```

**To add an NPC:**
1. Add the entry to `npcs.json` with a unique key
2. Place a sprite at `public/assets/sprites/entities/{npcId}.png`
3. Place the NPC on a map by adding to the map JSON's `npcs` array:
   ```json
   { "id": "npcId", "tx": 25, "ty": 30, "floor": 0 }
   ```
   - `tx`/`ty` are tile coordinates
   - `floor` is optional (default 0 for ground floor, 1+ for upper floors)

---

## quests.json

Top-level object keyed by quest ID. Quests are offered by NPCs listed in their `questIds`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Must match the object key |
| `name` | string | Display name in quest log |
| `giver` | string | NPC ID that offers this quest |
| `description` | string | Quest log description |
| `level` | number | Recommended level |
| `prerequisiteQuests` | string[] | Quest IDs that must be completed first (empty array for none) |
| `objectives` | array | What the player must do (see below) |
| `rewards` | object | What the player receives (see below) |
| `dialog` | object | Conversation text for each quest state (see below) |

**Objectives:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"kill"` |
| `target` | string | Enemy ID to kill |
| `count` | number | How many to kill |
| `label` | string | Display text (e.g. `"Slay 5 Timber Wolves"`) |

**Rewards:**

| Field | Type | Description |
|-------|------|-------------|
| `xp` | number | Experience points |
| `gold` | number | Gold awarded |
| `items` | string[] | Item IDs given to player |

**Dialog — four states required:**

| State | When shown |
|-------|-----------|
| `not_started` | Player hasn't accepted yet |
| `active` | Quest in progress — use `{progress}` for current kill count |
| `ready_to_turn_in` | All objectives met, waiting to turn in |
| `completed` | Already turned in |

Each dialog state has `text` (string) and `options` (array of `{ "label": string, "action": string }`).

Valid actions: `"accept"`, `"complete"`, `"close"`

**Example:**
```json
"wolf_cull": {
  "id": "wolf_cull",
  "name": "The Wolf Cull",
  "giver": "elder_rowan",
  "description": "Elder Rowan needs help thinning the wolf population.",
  "level": 1,
  "prerequisiteQuests": [],
  "objectives": [
    { "type": "kill", "target": "wolf", "count": 5, "label": "Slay 5 Timber Wolves" }
  ],
  "rewards": {
    "xp": 150,
    "gold": 38,
    "items": ["noviceBlade", "minorHealingPotion"]
  },
  "dialog": {
    "not_started": {
      "text": "Wolves have been...",
      "options": [
        { "label": "I'll handle it.", "action": "accept" },
        { "label": "Not now.", "action": "close" }
      ]
    },
    "active": {
      "text": "How goes the hunt? ({progress})",
      "options": [
        { "label": "Still working on it.", "action": "close" }
      ]
    },
    "ready_to_turn_in": {
      "text": "The wolves are thinned! Thank you.",
      "options": [
        { "label": "Glad to help.", "action": "complete" }
      ]
    },
    "completed": {
      "text": "The village is safer thanks to you.",
      "options": []
    }
  }
}
```

**To add a quest:**
1. Add the entry to `quests.json` with a unique key
2. Add the quest ID to the giving NPC's `questIds` array in `npcs.json`
3. Ensure referenced enemy IDs exist in `enemies.json`
4. Ensure reward item IDs exist in `items.json`

---

## tilePalette.json

Top-level object keyed by tile name. Each tile needs a sprite at `public/assets/sprites/tiles/{tileName}.png`. Tiles are referenced by name in map JSON `palette` arrays.

| Field | Type | Description |
|-------|------|-------------|
| `color` | [r,g,b] | RGB fallback color (0–255 each) |
| `blocked` | boolean | `true` = impassable to players and NPCs |

**Example:**
```json
"houseWall": { "color": [102, 82, 52], "blocked": true },
"houseFloor": { "color": [140, 110, 70], "blocked": false },
"water": { "color": [32, 79, 114], "blocked": true },
"meadow": { "color": [76, 116, 63], "blocked": false }
```

**Special tile names (functional):**
- `stairs` — triggers going UP one floor when walked on
- `stairsDown` — triggers going DOWN one floor when walked on
- `bedHead` / `bedFoot` — decorative blocked tiles

**To add a tile:**
1. Add the entry to `tilePalette.json`
2. Place a 48×48 sprite at `public/assets/sprites/tiles/{tileName}.png`
3. Add the tile name to a map's `palette` array to use it in that map's terrain grid

---

## props.json

Top-level object keyed by prop type. Defines blocking behavior and fallback colors for world objects placed in map `props` arrays (trees are `type: "tree"` props). Both the client and server load this file. `SpriteManager` automatically loads a sprite for every key in this file — place sprites at `public/assets/sprites/props/{propType}.png`.

| Field | Type | Description |
|-------|------|-------------|
| `blocked` | boolean | `true` = tile is impassable. Applied to both trees and props of this type. |
| `color` | [r,g,b] | RGB fallback color if no sprite exists. |

**Example:**
```json
{
  "tree":     { "blocked": true,  "color": [44, 79, 47] },
  "rock":     { "blocked": true,  "color": [128, 128, 128] },
  "flower":   { "blocked": false, "color": [220, 140, 180] },
  "mushroom": { "blocked": false, "color": [160, 100, 60] }
}
```

**To add a prop type (no code changes needed):**
1. Add the entry to `props.json` with a unique key
2. Place a sprite at `public/assets/sprites/props/{propType}.png`
3. Use the prop type name in map JSON `props` arrays (e.g. `{ "tx": 10, "ty": 5, "type": "rock" }`)

`SpriteManager` reads all keys from `props.json` at startup and preloads matching sprites automatically.

---

## playerBase.json

Single flat object defining starting player stats. Equipment bonuses stack on top of these.

| Field | Type | Description |
|-------|------|-------------|
| `moveSpeed` | number | Movement speed (pixels/sec) |
| `attackRange` | number | Melee range (pixels) |
| `attackCooldown` | number | Seconds between attacks |
| `maxHp` | number | Base max HP (armor `hpBonus` adds to this) |
| `maxMana` | number | Base max mana (trinket `manaBonus` adds to this) |
| `damage` | number | Base damage (weapon `attackBonus` adds to this) |
| `hitParticle` | string | Default particle preset when unarmed attack lands |
| `hitSfx` | string | Default SFX when unarmed attack lands |
| `swingSfx` | string | Default SFX on unarmed swing |

```json
{
  "moveSpeed": 205,
  "attackRange": 52,
  "attackCooldown": 0.82,
  "maxHp": 120,
  "maxMana": 80,
  "damage": 16,
  "hitParticle": "punch",
  "hitSfx": "punch_hit",
  "swingSfx": "punch_swing"
}
```

---

## particles.json

Top-level object keyed by preset name. Defines particle burst effects used by `ParticleSystem`. No sprites needed — particles are drawn as colored rectangles with optional additive blending.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `count` | [min, max] | Number of particles to spawn (random integer in range) |
| `lifetime` | [min, max] | Seconds each particle lives (random float in range) |
| `speed` | [min, max] | Initial velocity in pixels/sec (random float in range) |
| `angle` | [min, max] | Emission angle in degrees. `[0, 360]` = all directions, `[250, 290]` ≈ upward |
| `size` | [min, max] | Starting size in pixels (random float in range) |
| `sizeEnd` | number | Size at end of life. Interpolates linearly from `size` → `sizeEnd`. `0` = shrink to nothing |
| `color` | string[] | Array of hex colors. Each particle picks one at random |
| `gravity` | number | Vertical acceleration in px/sec². Negative = float up, positive = fall down |
| `friction` | number | Velocity multiplier per frame (0–1). `0.95` = gradual slowdown, `1` = no friction |
| `fadeOut` | boolean | `true` = alpha fades from 1→0 over lifetime |
| `blendMode` | string | Canvas composite operation. `"lighter"` = additive glow, `"source-over"` = normal |

### Built-in presets

| Preset | Trigger | Description |
|--------|---------|-------------|
| `hit_spark` | Sword/dagger/bow attack lands | White/gold sparks burst outward |
| `arcane_hit` | Staff attack lands | Purple/white magic burst |
| `bite` | Wolf/boar hits player | Red claw/fang scratch |
| `punch` | Unarmed attack lands (default) | White impact flash |
| `heal` | Heal cast or HP potion used | Green particles float upward |
| `mana_restore` | Mana potion used | Blue particles float upward |
| `levelup` | Player levels up | Gold starburst in all directions |
| `death` | Enemy or player dies | Dark red particles with gravity |
| `player_hit` | Enemy hits player (fallback) | Red blood-splatter burst |
| `casting` | Channeling hearthstone | Purple arcane swirl (repeating) |
| `loot_sparkle` | *(available)* | Gold sparkles rise |
| `portal` | *(available)* | Purple swirl particles |
| `fire` | *(available)* | Orange/yellow flames rise |
| `ice` | *(available)* | Blue/white crystals drift |

### Example

```json
"hit_spark": {
  "count": [6, 10],
  "lifetime": [0.15, 0.35],
  "speed": [80, 180],
  "angle": [0, 360],
  "size": [2, 5],
  "sizeEnd": 0,
  "color": ["#fff", "#ffe066", "#ff9933"],
  "gravity": 0,
  "friction": 0.92,
  "fadeOut": true,
  "blendMode": "lighter"
}
```

### Angle reference

| Direction | Angle range |
|-----------|------------|
| Right | `[350, 10]` or `[0, 0]` |
| Down | `[80, 100]` |
| Left | `[170, 190]` |
| Up | `[250, 290]` |
| All directions | `[0, 360]` |

**To add a preset:**
1. Add a new key to `particles.json` with all fields above
2. Emit it from code: `this.game.particles.emit("myPreset", worldX, worldY)`
3. Optional: pass per-call overrides as 4th argument: `emit("fire", x, y, { count: [1, 3] })`

---

## Asset Checklist

When adding new content, ensure the matching sprite/icon exists:

| Data file | Asset path | Size |
|-----------|-----------|------|
| enemies.json | `public/assets/sprites/entities/{enemyId}.png` | 48×48 |
| npcs.json | `public/assets/sprites/entities/{npcId}.png` | 48×48 |
| items.json | `public/assets/sprites/icons/{itemId}.png` | 32×32 |
| tilePalette.json | `public/assets/sprites/tiles/{tileName}.png` | 48×48 |
| props.json | `public/assets/sprites/props/{propType}.png` | varies |
| particles.json | *(no sprites — drawn procedurally)* | — |
