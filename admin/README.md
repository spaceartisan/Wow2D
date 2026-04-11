# Azerfall Server Admin Panel

A web-based administration GUI for managing the Azerfall game server.

## Getting Started

1. Start the game server: `node server.js`
2. Open `http://localhost:3000/admin/` in your browser
3. Enter the admin password (default: `changeme`)

## Changing the Admin Password

Set the `ADMIN_SECRET` environment variable before starting the server:

```bash
# Linux / macOS
ADMIN_SECRET=my-secure-password node server.js

# Windows (Command Prompt)
set ADMIN_SECRET=my-secure-password && node server.js

# Windows (PowerShell)
$env:ADMIN_SECRET="my-secure-password"; node server.js
```

> **Important:** Change the default password before exposing the server to any network.

## Features

### Dashboard
Live overview of server stats: online players, total accounts, total characters, and loaded maps with enemy/waystone counts.

### Online Players
View all connected players with their map, level, HP, XP, and gold. Actions per player:
- **Revive** – Restore full HP
- **Teleport** – Move to any waystone
- **XP** – Grant experience points
- **Gold** – Set gold amount
- **Whisper** – Send a private message (appears as `[Admin]` whisper in-game)
- **Kick** – Disconnect the player

### Accounts
Browse all registered accounts with creation date and last login. Actions:
- **Delete** – Permanently remove an account and all its characters

### Characters
Browse all characters across all accounts. Click any character to open a detailed editor:
- **Stats** – Edit level, XP, HP, map, and tile position
- **Hearthstone** – Set attuned waystone from a dropdown
- **Inventory & Bank** – View item slot grids, click to edit quantity or remove, add new items from the catalog

### Maps
View loaded maps with tile dimensions, spawn points, and enemy rosters. Actions:
- **Respawn All** – Reset all enemies on a map to full HP

### Tools
- **Broadcast Message** – Send a system-wide chat message to all players
- **Save All Players** – Force-save every online player's progress to the database

## Server Console Commands

The server also supports these commands typed directly into the terminal:

| Command | Description |
|---|---|
| `help` | List all commands |
| `listaccounts` | Show all accounts |
| `listchars <username>` | Show characters for an account |
| `findchar <name>` | Search characters by name |
| `deletechar <charId>` | Delete a character by ID |
| `deleteaccount <username>` | Delete an account and its characters |
| `changepassword <user> <pw>` | Change an account's password |

## Security Notes

- All admin API routes require the `x-admin-key` header to match `ADMIN_SECRET`.
- The admin panel stores the key in `sessionStorage` (cleared when the browser tab closes).
- Passwords are hashed with PBKDF2 (100k iterations, SHA-512). The admin API never exposes raw passwords.
