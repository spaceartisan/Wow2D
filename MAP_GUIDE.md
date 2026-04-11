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
  "enemySpawns": [ ... ],
  "npcs": [ ... ],
  "statues": [ ... ],
  "portals": [ ... ]
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
| `trees` | `array` | Tree positions (blocked + visual). |
| `props` | `array` | Decorative objects (no collision). |
| `extraBlocked` | `[tx, ty][]` | Additional blocked tile coordinates beyond palette-blocked tiles. |
| `enemySpawns` | `array` | Enemy spawn definitions. |
| `npcs` | `array` | NPC placements (references `npcs.json`). |
| `statues` | `array` | Waystone placements for hearthstone attunement. |
| `portals` | `array` | Transitions to other maps. |

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
  }
]
```

- `type` — Must match a key in `enemies.json`
- `positions` — Array of `[tx, ty]` spawn tile coordinates

Each position spawns one enemy. The server reads stats (HP, damage, speed, XP, loot table) from `enemies.json`. Enemies respawn at their original position after death.

## NPCs

NPC placements reference definitions in `public/data/npcs.json`.

```json
"npcs": [
  { "npcId": "elder_rowan", "tx": 26, "ty": 24, "floor": 0 },
  { "npcId": "blacksmith_kael", "tx": 30, "ty": 34, "floor": 0 }
]
```

- `npcId` — Must match a key in `npcs.json`
- `tx`, `ty` — Tile position
- `floor` — Which floor the NPC is on (`0` = ground, `1` = 2nd floor, etc.). NPCs are only visible and interactable when the player is on the same floor. Defaults to `0` if omitted.

The NPC's dialogue, quest assignments, shop inventory, and appearance are all defined in `npcs.json`, not in the map file.

## Statues (Waystones)

Waystones let players attune their hearthstone for teleport-to-town.

```json
"statues": [
  { "id": "swamplands_waystone", "name": "Swamplands Waystone", "tx": 10, "ty": 40 }
]
```

- `id` — Unique identifier (used by the hearthstone system)
- `name` — Display name
- `tx`, `ty` — Tile position

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

## Trees and Props

**Trees** block movement and are drawn as tree sprites:

```json
"trees": [
  { "tx": 79, "ty": 20, "tint": "#315937" }
]
```

Trees are automatically added to the blocked set. The `tint` controls the tree's color variation.

**Props** are decorative only (no collision):

```json
"props": [
  { "tx": 19, "ty": 15, "type": "rock" }
]
```

## Extra Blocked Tiles

For tiles that should block movement but aren't marked `blocked` in the palette (e.g., individual fence tiles, custom obstacles):

```json
"extraBlocked": [[4, 4], [5, 4], [6, 4]]
```

Each entry is `[tx, ty]`.

## Registering the Map on the Server

Open `game/ServerWorld.js` and add your map ID to the constructor's map list:

```javascript
constructor() {
  this.maps = new Map();
  for (const mapId of ["eldengrove", "darkwood", "swamplands"]) {  // ← add here
    const data = loadMap(mapId);
    const collision = new CollisionMap(data);
    const enemies = this._createEnemiesForMap(data, collision);
    this.maps.set(mapId, { _mapId: mapId, data, collision, enemies, drops: [] });
  }
}
```

That's it. The server will:
- Load the JSON file from `public/data/maps/swamplands.json`
- Build a collision map from the terrain palette and extraBlocked
- Spawn enemies from `enemySpawns`
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
9. **Test** — walk through the portal from an existing map, verify collision, enemies spawn, and you can return

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
  "trees": [],
  "props": [],
  "extraBlocked": [],
  "safeZones": []
}
```
