# Azerfall (WoW2D Prototype)

A browser-based top-down 2D fantasy RPG prototype inspired by early MMORPG starter-zone design. Features real-time multiplayer, persistent characters, data-driven world maps, and a classic quest/combat loop.

## Tech Stack

- **Client:** HTML5 Canvas (world rendering), JavaScript ES modules (game systems), CSS (HUD/layout)
- **Server:** Node.js + Express (HTTP & static files), `ws` (WebSocket multiplayer at 60 Hz), `better-sqlite3` (SQLite with WAL mode)
- **Data-driven:** All maps, enemies, items, NPCs, quests, particles, and tiles are defined in JSON files under `public/data/`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Generate maps and assets (first time only, or after editing generators):

```bash
npm run generate
```

3. Start the server:

```bash
npm start
```

4. Open in your browser:

```
http://localhost:3000
```

## Controls

| Key | Action |
|---|---|
| `WASD` / Arrow keys | Move (8 directions) |
| Left-click enemy | Select target (does not attack) |
| Left-click player | Select target (friendly) |
| Right-click enemy | Select target and engage auto-attack |
| Click inventory item | Use consumable / equip gear |
| Click equipment slot | Unequip item back to inventory |
| `1` – `9`, `0` | Activate hotbar slots 1–10 (customizable: skills or items) |
| `E` | Interact with nearby NPC or waystone |
| `I` | Toggle inventory |
| `C` | Toggle equipment panel |
| `L` | Toggle quest log |
| `P` | Toggle character sheet |
| `K` | Toggle skills panel |
| `M` | Toggle full world map |
| `Enter` | Focus chat input |
| `Escape` | Close panels / game menu |

### Chat Commands

- `/w PlayerName message` — whisper to a player

## Features

### World & Exploration
- Four interconnected maps: Eldengrove (128×128), Darkwood Forest (80×80), Southmere, and Moonfall Cavern
- Portal system for seamless map transitions with server-side proximity validation
- Tile-based terrain with palette-driven rendering (grass, dirt, water, cliffs, roads, etc.)
- Buildings with tile-by-tile layouts and multi-floor interiors (stairs to go up/down)
- Props (trees, rocks, flowers, etc.) with data-driven blocking via `props.json`
- Safe zones
- Waystone system — attune your hearthstone to teleport back to town
- Procedural map generation via `generate-maps.js`

### Minimap & World Map
- Corner minimap (bottom-right) shows nearby terrain, enemies (red), other players (cyan), and your position (white)
- Full world map (M key) displays the entire map with:
  - Player position (blinking white dot)
  - Portals (blue diamonds with labels)
  - Waystones (green diamonds)
  - Quest NPCs: available quests (!), in-progress (…), ready to turn in (?)
  - Safe zone outlines and legend

### Combat & Progression
- Target-then-engage combat: left-click to select a target, right-click or hotbar attack to engage auto-attack with chase
- Server-authoritative hit resolution
- Multiple enemy types with aggro range, chase AI, leashing, and wander behavior
- XP and leveling with stat scaling (HP, mana, damage per level)
- Data-driven loot tables with gold and item drops
- Data-driven combat effects: weapons, enemies, and consumables define their own particle effects and SFX via JSON
- Death with gold penalty and shrine respawn

### Multiplayer
- Real-time WebSocket multiplayer with entity smoothing (exponential convergence)
- Server-authoritative combat, loot, and position validation
- Multi-map support: each map independently tracks enemies, drops, and players
- Per-map broadcasting — players only see entities on their current map
- Chat system with world chat and whisper support
- Duplicate login detection (kicks old session)
- Heartbeat-based dead connection cleanup

### Persistence
- SQLite database for accounts, characters, and sessions
- Character progression saved on disconnect (level, XP, gold, HP, mana, inventory, equipment, bank, hotbar)
- Session tokens with 24-hour expiry and periodic cleanup
- PBKDF2 password hashing with per-account salts
- Rate-limited auth endpoints

### UI
- Fantasy-themed HUD with health/mana bars, XP bar, minimap
- Target panel with HP bar (different style for friendly vs enemy targets)
- 10-slot hotbar (keys 1–9, 0) — drag skills or items from their panels to assign, reorder by dragging between slots, right-click to clear
- Hotbar lock options in game menu: lock slot assignments and/or lock hotbar position
- Inventory (20 slots) with click-to-use/equip, drag-and-drop (via DragManager), and item stacking (configurable per-item `stackSize`)
- Bank system — 48-slot storage accessed via Banker NPC, with drag-and-drop deposit/withdraw
- Equipment panel with weapon/armor/trinket slots (click to unequip)
- Quest tracker, quest log, character sheet, and skills panel
- NPC dialog system with quest accept/turn-in flow
- Floor indicator when inside multi-story buildings

## Project Structure

```
server.js                    Express + WebSocket server entry point
generate-maps.js             Procedural map generator
generate-icons.js            Item icon generator
generate-sfx.js              Sound effect generator
MAP_GUIDE.md                 Guide for creating new maps
game/
  ServerWorld.js              Server-authoritative game state (multi-map)
  database.js                 SQLite schema, auth, character persistence
public/
  index.html                  Canvas + HUD markup
  styles.css                  Fantasy-themed UI styling
  data/
    tilePalette.json           Global tile definitions (23 tile types)
    props.json                 Prop type definitions (blocking, color fallback)
    playerBase.json            Shared player base stats (client + server)
    particles.json             Particle effect presets
    enemies.json               Enemy type definitions
    items.json                 Item definitions
    npcs.json                  NPC definitions
    quests.json                Quest definitions
    maps/                      Generated map JSON files
  js/
    config.js                  Client config (loads playerBase.json)
    utils.js                   Shared utility functions
    main.js                    Entry point / login flow
    core/
      Game.js                  Game loop, camera, map transitions
      InputSystem.js            Keyboard + mouse input
    screens/
      ScreenManager.js          Login / character select screens
    systems/
      AudioManager.js           Background music + SFX
      CombatSystem.js           Client-side targeting + ability use
      DragManager.js            Panel window dragging + item/skill drag-and-drop with lock support
      EntitySystem.js           Player, NPC, enemy, and drop management
      MinimapSystem.js          Corner minimap + full world map overlay
      NetworkSystem.js           WebSocket client + entity smoothing
      ParticleSystem.js          Data-driven particle emitter & renderer
      QuestSystem.js            Quest state machine + NPC interaction
      UISystem.js               All HUD panels and UI rendering
      WorldSystem.js            Tile map loading, rendering, collision, portals, stairs
      SpriteManager.js          Data-driven sprite preloading from palettes/props.json
  assets/
    bgm/                       Background music files
    icons/                     Item icon images
    sfx/                       Sound effect files
```

## npm Scripts

| Script | Description |
|---|---|
| `npm start` | Start the game server |
| `npm run generate` | Regenerate all maps, icons, and SFX |
| `npm run generate:maps` | Regenerate map JSON files only |
| `npm run generate:icons` | Regenerate item icons only |
| `npm run generate:sfx` | Regenerate sound effects only |