# Azerfall Tools

This package is intended to live under:

```text
tools/other-tools
```

The first tab is a **Tile Palette Editor** for:

```text
public/data/tilePalette.json
```

## Included files

- `index.html` - main UI shell
- `styles.css` - editor styling
- `app.js` - frontend logic
- `server.js` - lightweight local Node server
- `start-other-tools.bat` - Windows launcher

## Expected project-relative paths

This tool assumes the following layout relative to `tools/other-tools`:

```text
../../public/data/tilePalette.json
../../public/assets/
```

The current tab directly loads and saves:

```text
../../public/data/tilePalette.json
```

## Start

On Windows, double-click:

```text
start-other-tools.bat
```

Or run manually:

```bash
node server.js
```

Then open:

```text
http://localhost:5127
```

## Current features

- Load `tilePalette.json`
- Save changes back to disk
- Search tile ids
- Add, duplicate, and delete entries
- Rename tile ids
- Edit `blocked`
- Edit RGB channels and color picker
- Validation panel
- Dirty-state warning before closing

## Notes

- Port used: `5127`
- No external npm packages are required
- More tabs can be added later without changing the overall shell

New in this build:
- Items tab for public/data/items.json
- Icon previews resolved from public/assets/sprites/icons/<icon>.png
- Validation for common and type-specific item fields
- Enemies editor for `public/data/enemies.json`
- NPC editor for `public/data/npcs.json`
- Quests editor for `public/data/quests.json`

UI overhaul in this build:
- Switched to DM Sans + DM Mono for sharper, more readable typography
- Amber/gold accent color system to match the game's fantasy aesthetic
- Improved input ergonomics: hover states, focus rings, better padding
- Cleaner sidebar list items with ellipsis overflow on long IDs
- Stat boxes now show larger numerals for quick scanning
- Tighter, more consistent spacing throughout all panels
- Amber-tinted active tab and selected list item for clear context
- Badge dot indicators with color-coded status
- Improved diagnostics panel with left-border severity indicators
- Better modal with backdrop blur
- Refined scrollbars, select arrows, and checkbox accent colors

New in this build:
- Player Base tab for `public/data/playerBase.json`
- Edit all six base stats: maxHp, maxMana, damage, moveSpeed, attackRange, attackCooldown
- JSON preview, validation, reload from disk
- Dirty-state badge and beforeunload warning included
