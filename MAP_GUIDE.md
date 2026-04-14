# Creating a New Map

This guide explains how to create a new map JSON file and connect it to the Azerfall world.

## Overview

Maps are JSON files in `public/data/maps/`. Both the client and server load them by ID — a map with ID `swamplands` lives at `public/data/maps/swamplands.json`. Adding a new map requires:

1. Create the map JSON file
2. Register it on the server
3. Connect it to existing maps via portals

## Map JSON Structure

```jsonc
{
  "id": "swamplands",
  "name": "The Swamplands",
  "width": 80,
  "height": 80,
  "tileSize": 48,
  "bgm": "swamp_ambient",
  "spawnPoint": [5, 40],
  "palette": [ ... ],
  "terrain": [ ... ],
  "safeZones": [ ... ],
  "buildings": [ ... ],
  "trees": [ ... ],
  "props": [ ... ],
  "extraBlocked": [ ... ],
  "particles": [ ... ],
  "enemySpawns": [ ... ],
  "npcs": [ ... ],
  "statues": [ ... ],
  "portals": [ ... ],
  "tileModifiers": [ ... ],
  "resourceNodes": [ ... ]
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique map identifier. Must match the filename (without `.json`). |
| `name` | `string` | Display name shown in the UI. |
| `width` | `number` | Map width in tiles. |
| `height` | `number` | Map height in tiles. |
| `tileSize` | `number` | Pixel size of each tile. Use `48` for consistency. |
| `spawnPoint` | `[tx, ty]` | Default spawn position in tile coordinates. Players appear here when no other target is specified. |
| `palette` | `string[]` | Array of tile type names referencing entries in `tilePalette.json`. Terrain values are indices into this array. |
| `terrain` | `number[][]` | 2D grid (`height` rows × `width` columns) of palette indices. |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `bgm` | `string` | Background music track ID. |
| `safeZones` | `array` | Areas where PvP damage is disabled. |
| `buildings` | `array` | Interior spaces, optionally multi-story. |
| `props` | `array` | World objects (trees, rocks, flowers, etc.). Blocking behavior defined in `props.json`. |
| `extraBlocked` | `[tx, ty][]` | Additional blocked tile coordinates beyond palette-blocked and prop-blocked tiles. |
| `particles` | `array` | Map-placed particle emitters (campfires, torches, poison clouds, etc.). References presets in `particles.json`. |
| `enemySpawns` | `array` | Enemy spawn definitions. |
| `npcs` | `array` | NPC placements (references `npcs.json`). |
| `statues` | `array` | Waystone placements for hearthstone attunement. |
| `portals` | `array` | Transitions to other maps. |
| `tileModifiers` | `array` | Invisible tile zones that apply buffs, debuffs, DoTs, or HoTs to players standing on them. |
| `resourceNodes` | `array` | Gatherable resource node placements (references `resourceNodes.json`). |

## Tile Palette

Tiles are defined globally in `public/data/tilePalette.json`. Each entry has:

```json
{
  "meadow": { "color": [76, 116, 63], "blocked": false },
  "water":  { "color": [32, 79, 114], "blocked": true },
  "houseWall": { "color": [102, 82, 52], "blocked": true }
}
```

- `color` — RGB fallback if no sprite image exists at `assets/tiles/{name}.png`
- `blocked` — Whether the tile blocks player movement

Your map's `palette` array picks which tile types this map uses. The `terrain` grid stores indices into that palette.

**Example:** If your palette is `["darkGrass", "water", "forestDense"]`, then terrain value `0` = darkGrass, `1` = water, `2` = forestDense.

To add a new tile type, add it to `tilePalette.json` and optionally create a sprite at `public/assets/tiles/{name}.png`.

## Terrain Grid

The terrain is a 2D array where `terrain[y][x]` is a palette index:

```json
"terrain": [
  [0, 0, 0, 1, 1],
  [0, 2, 2, 1, 1],
  [0, 2, 2, 0, 0]
]
```

This represents a 5×3 map. For an 80×80 map you need 80 rows of 80 values each.

## Portals

Portals are rectangular zones that transport the player to another map when stepped on.

```json
"portals": [
  {
    "x": 0,
    "y": 38,
    "w": 2,
    "h": 4,
    "targetMap": "eldengrove",
    "targetTx": 114,
    "targetTy": 26,
    "label": "To Eldengrove"
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `x`, `y` | `number` | Top-left tile of the portal zone. |
| `w`, `h` | `number` | Width and height in tiles. |
| `targetMap` | `string` | ID of the destination map. |
| `targetTx`, `targetTy` | `number` | Tile coordinates where the player arrives on the destination map. |
| `label` | `string` | Text shown on the world map. |

**Important:** The arrival position on the destination map must NOT overlap the destination map's portal zone, or the player will loop back immediately. Leave at least 3–4 tiles of clearance.

### Two-Way Portals

Portals are one-way — to make a round trip, both maps need a portal pointing at each other. For example:

**eldengrove.json:**
```json
{ "x": 117, "y": 24, "w": 4, "h": 4, "targetMap": "darkwood", "targetTx": 5, "targetTy": 25 }
```

**darkwood.json:**
```json
{ "x": 3, "y": 24, "w": 2, "h": 4, "targetMap": "eldengrove", "targetTx": 114, "targetTy": 26 }
```

Note how Darkwood's arrival (114, 26) is several tiles away from Eldengrove's portal zone (117–120, 24–27).

## Enemy Spawns

Enemy spawns reference types defined in `public/data/enemies.json`.

```json
"enemySpawns": [
  {
    "type": "wolf",
    "positions": [[14, 20], [18, 30], [28, 18]]
  },
  {
    "type": "bandit",
    "positions": [[45, 42], [50, 50]]
  },
  {
    "type": "skeleton",
    "positions": [[8, 12], [10, 14]],
    "floor": 1
  }
]
```

- `type` — Must match a key in `enemies.json`
- `positions` — Array of `[tx, ty]` spawn tile coordinates
- `floor` — *(optional)* Floor level for this spawn group. `0` = ground (default), `1` = 2nd floor, etc. Enemies spawned on a given floor only aggro players on the same floor and use floor-aware collision.

Each position spawns one enemy. The server reads stats (HP, damage, speed, XP, loot table) from `enemies.json`. Enemies respawn at their original position after death.

## NPCs

NPC placements reference definitions in `public/data/npcs.json`.

```json
"npcs": [
  { "npcId": "elder_rowan", "tx": 26, "ty": 24, "floor": 0 },
  { "npcId": "blacksmith_kael", "tx": 30, "ty": 34, "floor": 0 },
  { "npcId": "smelter_hilda", "tx": 32, "ty": 28, "floor": 0 }
]
```

- `npcId` — Must match a key in `npcs.json`
- `tx`, `ty` — Tile position
- `floor` — Which floor the NPC is on (`0` = ground, `1` = 2nd floor, etc.). NPCs are only visible and interactable when the player is on the same floor. Defaults to `0` if omitted.

NPC types include `quest_giver`, `vendor`, and `crafting_station`. Crafting station NPCs (e.g. `smelter_hilda`, `sawyer_brom`, `cook_marta`) have a `craftingSkill` field in `npcs.json` that determines which recipes the player can craft at that station. The NPC's dialogue, quest assignments, shop inventory, crafting skill, and appearance are all defined in `npcs.json`, not in the map file.

## Statues (Waystones)

Waystones let players attune their hearthstone for teleport-to-town.

```json
"statues": [
  { "id": "swamplands_waystone", "name": "Swamplands Waystone", "tx": 10, "ty": 40 },
  { "id": "inn_upper_waystone", "name": "Inn Upper Waystone", "tx": 19, "ty": 30, "floor": 1 }
]
```

- `id` — Unique identifier (used by the hearthstone system)
- `name` — Display name
- `tx`, `ty` — Tile position
- `floor` — *(optional)* Floor level. `0` = ground (default), `1` = 2nd floor, etc. Waystones are only visible and interactable when the player is on the same floor.

## Buildings

Buildings define enclosed interior spaces. The terrain grid already contains the wall/floor tiles; the building metadata enables labels, floor indicators, and multi-story support.

```json
"buildings": [
  {
    "x": 19, "y": 18,
    "w": 5, "h": 4,
    "name": "Small Cottage"
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `x`, `y` | `number` | Top-left tile of the building footprint. |
| `w`, `h` | `number` | Width and height in tiles. |
| `name` | `string` | Display name shown above the building. |
| `floors` | `number` | Total floors (default `1`). Set to `2` or more for multi-story. |
| `upperFloors` | `array` | Array of 2D grids for floors above ground. |

### Multi-Story Buildings

To make a building multi-story:

1. Set `floors` to 2 (or more).
2. Place a `stairs` tile (goes **up**) inside the building on the ground-floor terrain grid.
3. Add an `upperFloors` array with one 2D grid per additional floor.
4. On each upper floor, place `stairsDown` at the **same local position** as the `stairs` tile on the floor below (this is where the player arrives).
5. If the upper floor also has stairs going further up, place a `stairs` tile at a **different** local position. The next floor above must have `stairsDown` at that position.

**Stair tiles are directional:**
- `stairs` — Goes **up** one floor only. Sprite: upward-pointing arrows.
- `stairsDown` — Goes **down** one floor only. Sprite: downward-pointing arrows.

When the player uses stairs, they are teleported to the partner stairs on the destination floor (the matching `stairsDown` when going up, or the matching `stairs` when going down).

**Example: 3-floor Inn**

```json
{
  "x": 17, "y": 28, "w": 5, "h": 5,
  "name": "Inn",
  "floors": 3,
  "upperFloors": [
    [
      [8, 8, 8, 8, 8],
      [8, 11, 10, 14, 8],
      [8, 12, 13, 10, 8],
      [8, 12, 13, 10, 8],
      [8, 8, 8, 8, 8]
    ],
    [
      [8, 8, 8, 8, 8],
      [8, 14, 10, 10, 8],
      [8, 10, 10, 10, 8],
      [8, 10, 12, 13, 8],
      [8, 8, 8, 8, 8]
    ]
  ]
}
```

Stair chain for this example:
- **Ground floor:** `stairs` at local(3,1) → player goes up to Floor 2
- **Floor 2:** `stairsDown` at local(3,1) (partner of ground stairs) + `stairs` at local(1,1) → player can go down or further up
- **Floor 3:** `stairsDown` at local(1,1) (partner of Floor 2 stairs up) → player can only go down

Common palette indices: `8` = houseWall, `10` = houseFloor, `11` = stairs (up), `12` = bedHead, `13` = bedFoot, `14` = stairsDown.

**Server collision:** The server validates movement on upper floors using the `upperFloors` grids — blocked/unblocked tiles work the same as on the ground floor. The client sends the current floor with every move message.

## Safe Zones

Areas where players cannot deal or receive PvP damage.

```json
"safeZones": [
  { "x1": 14, "y1": 14, "x2": 40, "y2": 37 }
]
```

All coordinates are in tiles. The zone spans from (x1, y1) to (x2, y2) inclusive.

## Prop Palette (`props.json`)

All prop types (including trees) are defined globally in `public/data/props.json`. This works like `tilePalette.json` but for world objects placed in the `props` array.

```json
{
  "tree":     { "blocked": true,  "color": [44, 79, 47] },
  "rock":     { "blocked": true,  "color": [128, 128, 128] },
  "flower":   { "blocked": false, "color": [220, 140, 180] },
  "mushroom": { "blocked": false, "color": [160, 100, 60] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `blocked` | `boolean` | `true` = tile is impassable. Both client and server read this. |
| `color` | `[r,g,b]` | RGB fallback if no sprite exists. |

To add a new prop type, add it to `props.json`, place a sprite at `public/assets/sprites/props/{type}.png`, and use the type name in map `props` arrays. No code changes are needed — `SpriteManager` automatically loads sprites for every key in `props.json`.

## Props

All world objects — trees, rocks, flowers, mushrooms, etc. — live in a single `props` array. Each entry’s `type` must match a key in `props.json`, which controls whether the tile blocks movement.

```json
"props": [
  { "tx": 79, "ty": 20, "type": "tree" },
  { "tx": 19, "ty": 15, "type": "rock" },
  { "tx": 22, "ty": 18, "type": "flower" },
  { "tx": 10, "ty": 5, "type": "tree", "floor": 1 }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `tx`, `ty` | `number` | Tile position. |
| `type` | `string` | Must match a key in `props.json`. |
| `floor` | `number` | Floor level the prop appears on. `0` = ground (default), `1` = 2nd floor, etc. Omit for ground-floor props. Props are only rendered when the player is on the same floor. Non-ground-floor props do not block movement on the ground floor. |

## Extra Blocked Tiles

For tiles that should block movement but aren't covered by palette tiles, trees, or props (e.g., invisible barriers, fence tiles):

```json
"extraBlocked": [[4, 4], [5, 4], [6, 4]]
```

Each entry is `[tx, ty]`.

## Particles

Map-placed particle emitters create ambient effects like campfire flames, torch flickers, poison clouds, etc. Each entry references a preset from `public/data/particles.json`.

```json
"particles": [
  { "tx": 26, "ty": 24, "preset": "campfire" },
  { "tx": 30, "ty": 34, "preset": "torch" },
  { "tx": 12, "ty": 8, "preset": "poison_cloud", "floor": 1 }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `tx`, `ty` | `number` | Tile position (emitter spawns centered on the tile). |
| `preset` | `string` | Must match a key in `particles.json`. Use presets with `"continuous": true` and `"emitInterval"` (e.g. `campfire`, `torch`, `poison_cloud`, `frost_aura`, `embers`). |
| `floor` | `number` | Floor level. `0` = ground (default). Emitters only run when the player is on the same floor. |

Particle emitters are automatically started when the map loads and when the player changes floors via stairs. They are cleared on map transitions.

## Tile Modifier Zones

Invisible tile-based zones that apply status effects to players standing on them. Works like `extraBlocked` — defined per-tile in the map JSON — but instead of blocking movement, they apply buffs, debuffs, damage-over-time (DoT), or healing-over-time (HoT).

```json
"tileModifiers": [
  {
    "x": 40, "y": 35,
    "modifiers": [
      { "type": "dot", "id": "zonePoison", "stat": "dot", "modifier": 0, "duration": 4, "perTick": 8, "tickInterval": 2 }
    ]
  },
  {
    "x": 55, "y": 40,
    "modifiers": [
      { "type": "debuff", "id": "zoneSlow", "stat": "speed", "modifier": -50, "duration": 3, "byPct": true }
    ]
  },
  {
    "x": 25, "y": 27,
    "modifiers": [
      { "type": "hot", "id": "zoneHealing", "stat": "hot", "modifier": 0, "duration": 4, "perTick": 12, "tickInterval": 2 }
    ]
  }
]
```

### Tile fields

| Field | Type | Description |
|-------|------|-------------|
| `x`, `y` | `number` | Tile coordinates (same scale as terrain grid). |
| `floor` | `number` | *(optional)* Floor number. Default `0`. |
| `modifiers` | `array` | One or more effects applied to players on this tile. |

### Modifier fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | One of: `buff`, `debuff`, `dot`, `hot`. |
| `id` | `string` | Status effect ID — must match an entry in `statusEffects.json` for client icon display. |
| `stat` | `string` | Stat key affected: `speed`, `damage`, `defense`, `dot`, `hot`, etc. |
| `modifier` | `number` | Flat or percentage value. For DoT/HoT, typically `0` (the `perTick` field controls effect strength). |
| `duration` | `number` | Effect duration in seconds. Refreshes while standing on the tile; expires ~2s after leaving. |
| `perTick` | `number` | *(DoT/HoT only)* Damage or healing applied per tick. |
| `tickInterval` | `number` | *(DoT/HoT only)* Seconds between ticks (default 2). |
| `byPct` | `boolean` | *(optional)* If `true`, `modifier` is a percentage (e.g., `-50` = −50% speed). |

### Modifier types

| Type | Effect | Example |
|------|--------|---------|
| `buff` | Positive stat modifier (added to `activeBuffs[]`) | +15% damage via `zoneCourage` |
| `debuff` | Negative stat modifier (added to `activeBuffs[]`) | −50% speed via `zoneSlow` |
| `dot` | Periodic damage while standing on tile | 8 dmg / 2s via `zonePoison` |
| `hot` | Periodic healing while standing on tile | 12 hp / 2s via `zoneHealing` |

### Available zone status effects

These are pre-defined in `statusEffects.json` and ready to use:

| ID | Display Name | Icon |
|----|-------------|------|
| `zoneSlow` | Bogged Down | chilled.png |
| `zonePoison` | Toxic Fumes | poisoned.png |
| `zoneBurning` | Scorched | poisoned.png |
| `zoneHealing` | Sacred Ground | evasion.png |
| `zoneCourage` | Emboldened | battleShout.png |
| `zoneWeakness` | Enfeebled | weakened.png |

To add a new zone effect, add a new entry to `statusEffects.json` with a matching icon path, then reference its `id` in your tile modifier.

**Tips:**
- Place modifiers in clusters (e.g., 3×2 grids) for area coverage — each tile is a single point.
- Combine with particle emitters for visual cues (e.g., a `poison_cloud` emitter on the same tiles as a `zonePoison` DoT).
- Effects auto-expire ~2 seconds after the player steps off the tile.

## Resource Nodes

Gatherable resource nodes (ore veins, trees, fish spots) that players can harvest using the gathering system. Node types are defined in `public/data/resourceNodes.json`.

```json
"resourceNodes": [
  { "type": "copper_vein", "tx": 45, "ty": 22, "floor": 0 },
  { "type": "oak_tree", "tx": 60, "ty": 35, "floor": 0 },
  { "type": "trout_spot", "tx": 12, "ty": 50, "floor": 0 }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Must match a key in `resourceNodes.json`. |
| `tx`, `ty` | `number` | Tile position. |
| `floor` | `number` | Floor level. `0` = ground (default). Nodes are only visible and interactable on the same floor. |

Each node renders using a sprite from `public/assets/sprites/gathering/{type}.png`. When depleted (all harvests consumed), the node becomes inactive and respawns after `respawnTicks` server ticks.

Players interact by pressing `E` near a node. The server validates:
- Player has the required gathering skill level
- Player has the correct tool type and tier in inventory
- Node is active (not depleted) and within range

## Registering the Map on the Server

Open `game/ServerWorld.js` and add your map ID to the constructor's map list:

```javascript
constructor() {
  this.maps = new Map();
  for (const mapId of ["eldengrove", "darkwood", "southmere", "moonfall_cavern", "swamplands"]) {  // ← add here
    const data = loadMap(mapId);
    const collision = new CollisionMap(data);
    const enemies = this._createEnemiesForMap(data, collision);
    this.maps.set(mapId, { _mapId: mapId, data, collision, enemies, drops: [] });
  }
}
```
- Load the JSON file from `public/data/maps/swamplands.json`
- Build a collision map from the terrain palette, `props.json` definitions, trees, props, and `extraBlocked`
- Spawn enemies from `enemySpawns`
- Spawn resource nodes from `resourceNodes`
- Accept portal transitions to/from this map

## Checklist for a New Map

1. **Create** `public/data/maps/{mapId}.json` with all required fields
2. **Design terrain** — fill the `terrain` grid with palette indices
3. **Add portals** — at least one portal connecting to an existing map
4. **Add a return portal** — in the existing map pointing back to yours
5. **Place enemies** — add `enemySpawns` referencing types in `enemies.json`
6. **Place NPCs** — add entries to both the map's `npcs` array and `npcs.json`
7. **Add a waystone** — so players can bind their hearthstone
8. **Register on server** — add the map ID to the array in `ServerWorld.js`
9. **Add new prop types** — if your map uses new props, add them to `props.json` and place matching sprites (sprite loading is automatic)
10. **Add particle emitters** — place ambient effects (campfires, torches) in the `particles` array using presets from `particles.json`
11. **Add tile modifier zones** *(optional)* — place hazards, healing zones, or stat-altering areas in the `tileModifiers` array. Reference status effect IDs from `statusEffects.json`
12. **Add resource nodes** *(optional)* — place gatherable nodes (ores, trees, fish spots) in the `resourceNodes` array. Reference node types from `resourceNodes.json`
13. **Test** — walk through the portal from an existing map, verify collision, enemies spawn, and you can return

## Example: Minimal Map

```json
{
  "id": "testzone",
  "name": "Test Zone",
  "width": 20,
  "height": 20,
  "tileSize": 48,
  "spawnPoint": [10, 10],
  "palette": ["meadow", "road", "water", "forest"],
  "terrain": [
    [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3]
  ],
  "portals": [
    { "x": 1, "y": 9, "w": 1, "h": 2, "targetMap": "eldengrove", "targetTx": 114, "targetTy": 26, "label": "To Eldengrove" }
  ],
  "enemySpawns": [
    { "type": "wolf", "positions": [[14, 5], [15, 14]] }
  ],
  "statues": [
    { "id": "testzone_waystone", "name": "Test Waystone", "tx": 10, "ty": 10 }
  ],
  "npcs": [],
  "buildings": [],
  "props": [],
  "extraBlocked": [],
  "particles": [],
  "safeZones": [],
  "tileModifiers": []
}
```
