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
| `type` | string | One of: `weapon`, `shield`, `quiver`, `armor`, `helmet`, `pants`, `boots`, `ring`, `amulet`, `consumable`, `tool`, `material`, `junk`, `hearthstone` |
| `icon` | string | Icon filename without `.png` (usually same as `id`) |
| `value` | number | Sell price in gold |
| `description` | string | Tooltip text |
| `stackSize` | number | *(optional)* Max stack size. Omit or leave absent for unstackable items (e.g. equipment). Junk items typically use `99`, consumables `20`. |

### Type-specific fields

**weapon:**
| Field | Type | Description |
|-------|------|-------------|
| `attackBonus` | number | Added to player base damage |
| `handed` | number | `1` = one-handed, `2` = two-handed |
| `weaponType` | string | `"sword"`, `"dagger"`, `"staff"`, `"bow"` — cosmetic/UI categorization |
| `requiresQuiver` | boolean | *(optional)* `true` for bows — requires a quiver in offHand to attack |
| `range` | number | *(optional)* Attack range in pixels. Omit for melee weapons (defaults to `playerBase.attackRange`). Bows use 200–250. |
| `hitParticle` | string | *(optional)* Particle preset emitted when attack lands (falls back to `playerBase.hitParticle`) |
| `hitSfx` | string | *(optional)* SFX played when attack lands (falls back to `playerBase.hitSfx`) |
| `swingSfx` | string | *(optional)* SFX played on swing (falls back to `playerBase.swingSfx`) |

**shield:**
| Field | Type | Description |
|-------|------|-------------|
| `hpBonus` | number | Added to player max HP |

**quiver:**
| Field | Type | Description |
|-------|------|-------------|
| `maxArrows` | number | Maximum arrow capacity (e.g. 50, 100) |

**armor / helmet / pants / boots:**
| Field | Type | Description |
|-------|------|-------------|
| `hpBonus` | number | Added to player max HP |

**ring / amulet:**
| Field | Type | Description |
|-------|------|-------------|
| `manaBonus` | number | Added to player max mana |

**consumable:**
| Field | Type | Description |
|-------|------|-------------|
| `effect` | string | `"healHp"`, `"healMana"`, or `"refillQuiver"` |
| `power` | number | Amount restored (HP/mana) or arrows added (refillQuiver) |
| `useParticle` | string | *(optional)* Particle preset emitted on use (e.g. `"heal"`, `"mana_restore"`) |
| `useSfx` | string | *(optional)* SFX played on use (e.g. `"potion_drink"`) |

**hearthstone:**
| Field | Type | Description |
|-------|------|-------------|
| `permanent` | boolean | `true` — cannot be dropped or sold |
| `castTime` | number | Seconds to channel |
| `cooldown` | number | Cooldown in seconds |

**tool:**
| Field | Type | Description |
|-------|------|-------------|
| `toolType` | string | `"pickaxe"`, `"hatchet"`, or `"fishing_rod"` |
| `toolTier` | number | Tier level (1, 2, or 3). Must meet or exceed the node’s `requiredToolTier`. |
| `gatheringLevelReq` | number | *(optional)* Minimum gathering skill level required to use this tool |

**material:**
Materials are gathered resources (ores, logs, fish). They have no type-specific fields beyond the common fields. Typically stackable (`stackSize: 99`).

**Examples:**
```json
"noviceBlade": {
  "id": "noviceBlade",
  "name": "Novice Ironblade",
  "type": "weapon",
  "icon": "noviceBlade",
  "attackBonus": 5,
  "handed": 1,
  "weaponType": "sword",
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
| `type` | string | `"quest_giver"`, `"vendor"`, `"banker"`, `"gathering"`, or `"crafting_station"` |
| `defaultDialog` | string | Greeting text when no quest/shop action |
| `questIds` | string[] | Quest IDs this NPC offers (quest_giver only) |
| `shop` | string[] | Item IDs this NPC sells (vendor only) |

**Banker NPCs** use `type: "banker"` and only need `id`, `name`, `color`, `type`, and `defaultDialog`. When the player interacts with a banker, a 48-slot bank panel opens for storage.

**Gathering NPCs** use `type: "gathering"` and include a `shop` array of gathering tool item IDs. They sell tools for mining, logging, and fishing.

**Crafting Station NPCs** use `type: "crafting_station"` and include a `craftingSkill` field indicating which processing profession they serve. When the player interacts, a crafting panel opens showing recipes for that skill. Requires `craftingSkill` field (one of `"smelting"`, `"milling"`, or `"cooking"`).

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
```json
"smelter_hilda": {
  "id": "smelter_hilda",
  "name": "Smelter Hilda",
  "color": "#e07030",
  "type": "crafting_station",
  "craftingSkill": "smelting",
  "defaultDialog": "The forge burns hot. Bring me your ores and I'll smelt them down.",
  "questIds": []
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
| `maxHp` | number | Base max HP (armor/shield/helmet/pants/boots `hpBonus` stacks on top) |
| `maxMana` | number | Base max mana (ring/amulet `manaBonus` adds to this) |
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

## skills.json

Top-level object keyed by skill ID. Defines all abilities players can learn and use. Skills are class-restricted and level-gated. The client loads this at startup and renders available skills in the Skills panel.

### Common fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Must match the object key |
| `name` | string | Display name |
| `description` | string | Tooltip text |
| `type` | string | One of: `attack`, `heal`, `buff`, `debuff`, `support` |
| `targeting` | string | One of: `enemy`, `self`, `aoe`, `aoe_ally` |
| `range` | number\|null | Effective range in pixels. `null` = melee (uses weapon/player range). `0` = self-only. |
| `cooldown` | number\|null | Seconds between uses. `null` = uses weapon attack cooldown (auto-attack). |
| `manaCost` | number | Mana consumed per use |
| `particle` | string\|null | Particle preset emitted on cast/self |
| `sfx` | string\|null | SFX played on effect (hit/heal) |
| `castSfx` | string\|null | *(optional)* SFX played on cast start |
| `classes` | array | List of class strings that can use this skill (e.g. `["warrior", "mage"]`) |
| `levelReq` | number | Minimum player level required |
| `icon` | string | Icon identifier for UI. Must match a sprite at `public/assets/sprites/skills/{icon}.png` (32×32 pixel-art). Used in the skills panel, hotbar, and drag ghost. |

### Type-specific fields

**attack / debuff:**
| Field | Type | Description |
|-------|------|-------------|
| `damage` | number | Base damage |
| `damagePerLevel` | number | *(optional)* Extra damage per player level above 1 |
| `damageType` | string | `physical`, `fire`, `frost`, `arcane`, `nature` |
| `projectileSpeed` | number | *(optional)* Projectile speed in px/sec (ranged skills only) |
| `hitParticle` | string | *(optional)* Particle emitted on target when hit |
| `hits` | number | *(optional)* Number of hits for multi-hit skills (e.g. Arcane Missiles) |
| `hitInterval` | number | *(optional)* Seconds between hits |
| `channeled` | boolean | *(optional)* Whether the skill is channeled (interrupted by movement) |
| `aoeRadius` | number | *(optional)* AoE radius for `targeting: "aoe"` |
| `debuff` | object | *(optional)* Debuff applied on hit (see Buff/Debuff below) |

**heal:**
| Field | Type | Description |
|-------|------|-------------|
| `healAmount` | number | Base HP healed |
| `healPerLevel` | number | *(optional)* Extra healing per player level above 1 |
| `healTicks` | number | *(optional)* Number of HoT ticks |
| `healInterval` | number | *(optional)* Seconds between HoT ticks |
| `channeled` | boolean | *(optional)* Whether the heal is channeled |

**buff / support:**
| Field | Type | Description |
|-------|------|-------------|
| `buff` | object | Buff object applied to self or allies |
| `aoeRadius` | number | *(optional)* Radius for `targeting: "aoe_ally"` |

### Buff / Debuff object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique buff/debuff identifier |
| `stat` | string | Stat affected: `damage`, `moveSpeed`, `maxMana`, `damageTaken`, `stunned`, `manaShield`, `dot` |
| `modifier` | number | Multiplier (positive = buff, negative = debuff, e.g. `0.2` = +20%) |
| `duration` | number | Duration in seconds |
| `absorbAmount` | number | *(manaShield only)* Base absorb amount |
| `absorbPerLevel` | number | *(manaShield only)* Extra absorb per player level |
| `tickDamage` | number | *(dot only)* Damage per tick |
| `tickDamagePerLevel` | number | *(dot only)* Extra tick damage per level |
| `tickInterval` | number | *(dot only)* Seconds between ticks |

**Example:**
```json
"fireball": {
  "id": "fireball",
  "name": "Fireball",
  "description": "Hurl a ball of fire at your target, dealing magic damage.",
  "type": "attack",
  "targeting": "enemy",
  "range": 220,
  "cooldown": 2.5,
  "manaCost": 18,
  "damage": 28,
  "damagePerLevel": 5,
  "damageType": "fire",
  "projectileSpeed": 320,
  "particle": "fire",
  "hitParticle": "fire",
  "sfx": "magic_hit",
  "castSfx": "staff_swing",
  "classes": ["mage"],
  "levelReq": 1,
  "icon": "fireball"
}
```

**To add a skill:**
1. Add the entry to `skills.json` with a unique key
2. Place a 32×32 icon at `public/assets/sprites/skills/{icon}.png`
3. Specify `classes` and `levelReq` for availability
4. The Skills panel and hotbar system will pick it up automatically
5. Server validates class, level, cooldown, mana, and range before executing

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

## statusEffects.json

Top-level object keyed by status effect ID. Defines the display metadata (name, description, icon) for buffs and debuffs shown in the player's status bar. Both skill-applied effects and tile-zone effects reference entries in this file.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name shown on tooltip |
| `description` | string | Tooltip description |
| `type` | string | `"buff"` or `"debuff"` — determines icon row placement (buffs top, debuffs bottom) |
| `icon` | string | Path to a 32×32 icon sprite (relative to `public/`), e.g. `"assets/sprites/status/chilled.png"` |

### Skill-applied effects

| ID | Name | Type | Icon |
|----|------|------|------|
| `battleShout` | Battle Shout | buff | battleShout.png |
| `arcaneIntellect` | Arcane Intellect | buff | arcaneIntellect.png |
| `evasion` | Evasion | buff | evasion.png |
| `inspired` | Inspired | buff | inspired.png |
| `manaShield` | Mana Shield | buff | manaShield.png |
| `sprinting` | Sprint | buff | sprinting.png |
| `chilled` | Chilled | debuff | chilled.png |
| `stunned` | Stunned | debuff | stunned.png |
| `sundered` | Sundered | debuff | sundered.png |
| `weakened` | Weakened | debuff | weakened.png |
| `poisoned` | Poisoned | debuff | poisoned.png |

### Tile-zone effects

Used by the `tileModifiers` system in map JSON files (see MAP_GUIDE.md):

| ID | Name | Type | Icon | Typical use |
|----|------|------|------|-------------|
| `zoneSlow` | Bogged Down | debuff | chilled.png | Speed reduction on swamp/mud tiles |
| `zonePoison` | Toxic Fumes | debuff | poisoned.png | Poison DoT on toxic terrain |
| `zoneBurning` | Scorched | debuff | poisoned.png | Fire DoT on lava/scorched tiles |
| `zoneHealing` | Sacred Ground | buff | evasion.png | HoT near waystones or shrines |
| `zoneCourage` | Emboldened | buff | battleShout.png | Damage buff on hallowed ground |
| `zoneWeakness` | Enfeebled | debuff | weakened.png | Damage debuff on cursed ground |

**Example:**
```json
"zonePoison": {
  "name": "Toxic Fumes",
  "description": "Taking poison damage from noxious terrain.",
  "type": "debuff",
  "icon": "assets/sprites/status/poisoned.png"
}
```

**To add a status effect:**
1. Add the entry to `statusEffects.json` with a unique key
2. Place a 32×32 icon at `public/assets/sprites/status/{name}.png` (or reuse an existing icon path)
3. Reference the effect ID in a skill's `buff`/`debuff` object, or in map `tileModifiers`
4. The client will automatically display the icon when the effect is active on the player

---

## gatheringSkills.json

Top-level object keyed by skill ID. Defines gathering and processing professions. The client loads this at startup for the Professions panel (G key). Skills with `category: "processing"` are processing professions used for crafting at crafting stations, not for gathering resource nodes.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Must match the object key |
| `name` | string | Display name in the professions panel |
| `description` | string | Tooltip/description text |
| `icon` | string | Icon identifier (currently unused by sprites — text-based display) |
| `toolType` | string | *(gathering only)* The `toolType` value required in items.json tools for this profession |
| `category` | string | *(optional)* `"processing"` for crafting professions. Omit for gathering professions. |

### Gathering professions

| ID | Name | Tool Type |
|----|------|-----------|
| `mining` | Mining | `pickaxe` |
| `logging` | Logging | `hatchet` |
| `fishing` | Fishing | `fishing_rod` |

### Processing professions

| ID | Name | Category |
|----|------|----------|
| `smelting` | Smelting | processing |
| `milling` | Milling | processing |
| `cooking` | Cooking | processing |

**Examples:**
```json
"mining": {
  "id": "mining",
  "name": "Mining",
  "description": "Extract ores and minerals from rock veins.",
  "icon": "mining",
  "toolType": "pickaxe"
}
```
```json
"smelting": {
  "id": "smelting",
  "name": "Smelting",
  "description": "Smelt raw ores into refined metal bars.",
  "icon": "smelting",
  "category": "processing"
}
```

---

## recipes.json

Top-level object keyed by recipe ID. Defines crafting recipes for processing professions. Players craft at crafting station NPCs that match the recipe's skill. The server loads this at startup.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Must match the object key |
| `name` | string | Display name of the crafted item |
| `skill` | string | Processing skill required (`"smelting"`, `"milling"`, or `"cooking"`) |
| `requiredLevel` | number | Minimum skill level required |
| `xp` | number | Skill XP awarded on successful craft |
| `input` | object | Map of `itemId → quantity` for required materials |
| `output` | object | `{ id: string, qty: number }` — the item produced |
| `craftTime` | number | Seconds to complete the craft |

### Current recipes

| Recipe ID | Name | Skill | Level | Input | Output | Time |
|-----------|------|-------|-------|-------|--------|------|
| `smelt_copper` | Copper Bar | Smelting | 1 | 2× Copper Ore | 1× Copper Bar | 2.0s |
| `smelt_tin` | Tin Bar | Smelting | 10 | 2× Tin Ore | 1× Tin Bar | 2.5s |
| `smelt_iron` | Iron Bar | Smelting | 20 | 3× Iron Ore | 1× Iron Bar | 3.0s |
| `mill_oak` | Oak Plank | Milling | 1 | 2× Oak Log | 1× Oak Plank | 2.0s |
| `mill_maple` | Maple Plank | Milling | 10 | 2× Maple Log | 1× Maple Plank | 2.5s |
| `mill_yew` | Yew Plank | Milling | 20 | 3× Yew Log | 1× Yew Plank | 3.0s |
| `cook_trout` | Grilled Trout | Cooking | 1 | 1× Raw Trout | 1× Grilled Trout | 1.5s |
| `cook_salmon` | Baked Salmon | Cooking | 10 | 1× Raw Salmon | 1× Baked Salmon | 2.0s |
| `cook_lobster` | Roasted Lobster | Cooking | 20 | 1× Raw Lobster | 1× Roasted Lobster | 2.5s |

**Example:**
```json
"smelt_copper": {
  "id": "smelt_copper",
  "name": "Copper Bar",
  "skill": "smelting",
  "requiredLevel": 1,
  "xp": 12,
  "input": { "copperOre": 2 },
  "output": { "id": "copperBar", "qty": 1 },
  "craftTime": 2.0
}
```

**To add a recipe:**
1. Add the entry to `recipes.json` with a unique key
2. Ensure the `skill` matches a processing profession in `gatheringSkills.json`
3. Ensure all `input` item IDs and the `output.id` exist in `items.json`
4. Place the player near a crafting station NPC with matching `craftingSkill` to craft

---

## resourceNodes.json

Top-level object keyed by node type ID. Defines harvestable resource nodes placed on maps. Each node type needs a sprite at `public/assets/sprites/gathering/{nodeType}.png` (48×48).

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name shown when hovering/interacting |
| `skill` | string | Gathering skill required (`mining`, `logging`, or `fishing`) |
| `requiredLevel` | number | Minimum gathering skill level to harvest |
| `requiredToolType` | string | Tool type needed in inventory (`pickaxe`, `hatchet`, `fishing_rod`) |
| `requiredToolTier` | number | Minimum tool tier required (1, 2, or 3) |
| `xpPerGather` | number | Gathering XP awarded per successful harvest |
| `gatherItem` | string | Item ID given on harvest (must exist in `items.json`) |
| `maxHarvests` | number | Times the node can be harvested before depletion |
| `respawnTicks` | number | Server ticks until respawn after depletion (60 ticks/sec) |
| `color` | [r,g,b] | RGB fallback color if no sprite exists |

**Current resource nodes:**

| ID | Name | Skill | Level | Tier | XP | Item | Harvests |
|----|------|-------|-------|------|----|------|----------|
| `copper_vein` | Copper Vein | mining | 1 | 1 | 10 | copperOre | 3 |
| `tin_vein` | Tin Vein | mining | 10 | 2 | 25 | tinOre | 3 |
| `iron_deposit` | Iron Deposit | mining | 20 | 3 | 50 | ironOre | 3 |
| `oak_tree` | Oak Tree | logging | 1 | 1 | 10 | oakLog | 3 |
| `maple_tree` | Maple Tree | logging | 10 | 2 | 25 | mapleLog | 3 |
| `yew_tree` | Yew Tree | logging | 20 | 3 | 50 | yewLog | 3 |
| `trout_spot` | Trout School | fishing | 1 | 1 | 10 | rawTrout | 5 |
| `salmon_spot` | Salmon Run | fishing | 10 | 2 | 25 | rawSalmon | 5 |
| `lobster_spot` | Lobster Trap | fishing | 20 | 3 | 50 | rawLobster | 4 |

**Example:**
```json
"copper_vein": {
  "name": "Copper Vein",
  "skill": "mining",
  "requiredLevel": 1,
  "requiredToolType": "pickaxe",
  "requiredToolTier": 1,
  "xpPerGather": 10,
  "gatherItem": "copperOre",
  "maxHarvests": 3,
  "respawnTicks": 1800,
  "color": [184, 115, 51]
}
```

**To add a resource node:**
1. Add the entry to `resourceNodes.json` with a unique key
2. Place a 48×48 sprite at `public/assets/sprites/gathering/{nodeType}.png`
3. Ensure the `gatherItem` exists in `items.json` (type `material`)
4. Ensure a tool with the matching `toolType` and sufficient `toolTier` exists in `items.json`
5. Place the node on maps in the map JSON's `resourceNodes` array (see MAP_GUIDE.md)

---

## Asset Checklist

When adding new content, ensure the matching sprite/icon exists:

| Data file | Asset path | Size |
|-----------|-----------|------|
| enemies.json | `public/assets/sprites/entities/{enemyId}.png` | 48×48 |
| npcs.json | `public/assets/sprites/entities/{npcId}.png` | 48×48 |
| items.json | `public/assets/sprites/icons/{itemId}.png` | 32×32 |
| skills.json | `public/assets/sprites/skills/{icon}.png` | 32×32 |
| statusEffects.json | `public/assets/sprites/status/{name}.png` | 32×32 |
| resourceNodes.json | `public/assets/sprites/gathering/{nodeType}.png` | 48×48 |
| tilePalette.json | `public/assets/sprites/tiles/{tileName}.png` | 48×48 |
| props.json | `public/assets/sprites/props/{propType}.png` | varies |
| particles.json | *(no sprites — drawn procedurally)* | — |
