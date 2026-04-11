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
  "speed": 85,
  "xp": 20,
  "goldMin": 3,
  "goldMax": 9,
  "respawnSeconds": 25,
  "color": "#8B8B7A",
  "radius": 14,
  "aggroRange": 160,
  "attackRange": 40,
  "attackCooldown": 1.6,
  "loot": [
    { "itemId": "wolfPelt", "chance": 0.52 },
    { "itemId": "wolfFang", "chance": 0.25 },
    { "itemId": "minorHealingPotion", "chance": 0.12 }
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
  "name": "Novice Blade",
  "type": "weapon",
  "icon": "noviceBlade",
  "attackBonus": 5,
  "value": 18,
  "description": "A basic but reliable short sword."
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
  "description": "Restores 40 hit points."
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

## playerbase.json

Single flat object defining starting player stats. Equipment bonuses stack on top of these.

| Field | Type | Description |
|-------|------|-------------|
| `moveSpeed` | number | Movement speed (pixels/sec) |
| `attackRange` | number | Melee range (pixels) |
| `attackCooldown` | number | Seconds between attacks |
| `maxHp` | number | Base max HP (armor `hpBonus` adds to this) |
| `maxMana` | number | Base max mana (trinket `manaBonus` adds to this) |
| `damage` | number | Base damage (weapon `attackBonus` adds to this) |

```json
{
  "moveSpeed": 205,
  "attackRange": 52,
  "attackCooldown": 0.82,
  "maxHp": 120,
  "maxMana": 80,
  "damage": 16
}
```

---

## Asset Checklist

When adding new content, ensure the matching sprite/icon exists:

| Data file | Asset path | Size |
|-----------|-----------|------|
| enemies.json | `public/assets/sprites/entities/{enemyId}.png` | 48×48 |
| npcs.json | `public/assets/sprites/entities/{npcId}.png` | 48×48 |
| items.json | `public/assets/sprites/icons/{itemId}.png` | 32×32 |
| tilePalette.json | `public/assets/sprites/tiles/{tileName}.png` | 48×48 |
