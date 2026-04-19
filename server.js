const express = require("express");
const path = require("path");
const readline = require("readline");
const { WebSocketServer } = require("ws");
const { ServerWorld } = require("./game/ServerWorld");
const database = require("./game/database");

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3000;

/* ── middleware ────────────────────────────────────────────── */

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ── rate limiting (in-memory, per-IP) ────────────────────── */
const rateLimitMap = new Map();
const RATE_WINDOW = 60000; // 1 minute
const RATE_MAX = 30; // max requests per window for auth endpoints

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    entry = { start: now, count: 1 };
    rateLimitMap.set(ip, entry);
  } else {
    entry.count++;
  }
  if (entry.count > RATE_MAX) {
    return res.status(429).json({ error: "Too many requests. Try again later." });
  }
  next();
}

// Clean rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.start > RATE_WINDOW) rateLimitMap.delete(ip);
  }
}, RATE_WINDOW);

/* ── auth API ─────────────────────────────────────────────── */

app.post("/api/register", rateLimit, (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const result = database.register(username, password);
  if (result.error) {
    return res.status(result.error.includes("already") ? 409 : 400).json(result);
  }
  res.json(result);
});

app.post("/api/login", rateLimit, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const result = database.login(username, password);
  if (result.error) {
    return res.status(401).json(result);
  }
  res.json(result);
});

app.post("/api/logout", (req, res) => {
  const { token } = req.body || {};
  if (token) database.logout(token);
  res.json({ ok: true });
});

/* ── character API (token-based auth) ─────────────────────── */

app.post("/api/characters", (req, res) => {
  const { token } = req.body || {};
  const result = database.getCharacters(token);
  if (result.error) return res.status(401).json(result);
  res.json(result);
});

app.post("/api/characters/create", (req, res) => {
  const { token, charName, charClass } = req.body || {};
  const result = database.createCharacter(token, charName, charClass);
  if (result.error) {
    const status = result.error.includes("Auth") ? 401 : 400;
    return res.status(status).json(result);
  }
  res.json(result);
});

app.post("/api/characters/delete", (req, res) => {
  const { token, charId } = req.body || {};
  const result = database.deleteCharacter(token, charId);
  if (result.error) {
    const status = result.error.includes("Auth") ? 401 : 400;
    return res.status(status).json(result);
  }
  res.json(result);
});

const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`Azerfall running at http://localhost:${port}`);

    /* ── WebSocket server ─────────────────────────────── */

    const world = new ServerWorld();
    world.start();

    // Track which accounts are currently in-game to prevent duplicate logins
    const activeAccounts = new Map(); // username → playerId

    const wss = new WebSocketServer({ server });

    wss.on("connection", (ws) => {
      let playerId = null;
      let playerUsername = null;

      ws.on("message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw);
        } catch (_) {
          return;
        }

        // first message must be "join" with token + charData
        if (!playerId) {
          if (msg.type !== "join") return;

          const token = msg.token;
          const username = database.validateSession(token);
          if (!username) {
            ws.send(JSON.stringify({ type: "auth_error", error: "Invalid or expired session." }));
            ws.close();
            return;
          }

          // prevent duplicate login — kick old connection
          if (activeAccounts.has(username)) {
            const oldPlayerId = activeAccounts.get(username);
            const oldPlayer = world.players.get(oldPlayerId);
            if (oldPlayer && oldPlayer.ws) {
              try {
                oldPlayer.ws.send(JSON.stringify({ type: "kicked", reason: "Logged in from another location." }));
                oldPlayer.ws.close();
              } catch (_) {}
            }
            world.removePlayer(oldPlayerId);
          }

          playerUsername = username;

          // H4: Load character from DB instead of trusting client charData
          const charId = Number(msg.charData?.id);
          let charRecord = null;
          if (Number.isInteger(charId) && charId > 0) {
            charRecord = database.loadCharacter(charId, username);
          }
          if (!charRecord) {
            // Fallback: use client charData but sanitize
            charRecord = msg.charData || {};
          }

          playerId = world.addPlayer(ws, charRecord, username);
          activeAccounts.set(username, playerId);
          return;
        }

        world.handleMessage(playerId, msg);
      });

      const cleanup = () => {
        if (playerId) {
          world.removePlayer(playerId);
          if (playerUsername && activeAccounts.get(playerUsername) === playerId) {
            activeAccounts.delete(playerUsername);
          }
          playerId = null;
          playerUsername = null;
        }
      };

      ws.on("close", cleanup);
      ws.on("error", cleanup);
    });

    // Heartbeat: detect dead connections
    const heartbeat = setInterval(() => {
      wss.clients.forEach((ws) => {
        if (ws._azerAlive === false) {
          ws.terminate();
          return;
        }
        ws._azerAlive = false;
        ws.ping();
      });
    }, 15000);

    wss.on("connection", (ws) => {
      ws._azerAlive = true;
      ws.on("pong", () => { ws._azerAlive = true; });
    });

    // Clean expired sessions every hour
    setInterval(() => database.cleanExpiredSessions(), 3600000);

    wss.on("close", () => clearInterval(heartbeat));

    /* ── admin GUI ────────────────────────────────────── */

    const ADMIN_SECRET = process.env.ADMIN_SECRET || "changeme";

    function adminAuth(req, res, next) {
      if (req.headers["x-admin-key"] !== ADMIN_SECRET) {
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    }

    // Serve admin static files
    app.use("/admin", express.static(path.join(__dirname, "admin")));

    // Dashboard stats
    app.get("/admin/api/stats", adminAuth, (req, res) => {
      const totalAccounts = database.db.prepare("SELECT COUNT(*) AS cnt FROM accounts").get().cnt;
      const totalCharacters = database.db.prepare("SELECT COUNT(*) AS cnt FROM characters").get().cnt;
      const activeSessions = database.db.prepare("SELECT COUNT(*) AS cnt FROM sessions WHERE expires_at > ?").get(Date.now()).cnt;
      const classCounts = database.db.prepare("SELECT char_class, COUNT(*) AS cnt FROM characters GROUP BY char_class").all();
      const totalGold = database.db.prepare("SELECT COALESCE(SUM(gold),0) AS total FROM characters").get().total;
      const mapPopulation = {};
      for (const [, p] of world.players) {
        mapPopulation[p.mapId] = (mapPopulation[p.mapId] || 0) + 1;
      }
      res.json({
        onlinePlayers: world.players.size,
        totalAccounts,
        totalCharacters,
        activeSessions,
        classCounts,
        totalGold,
        mapPopulation,
        maps: Array.from(world.maps.keys()),
        mapSpawns: Object.fromEntries(
          Array.from(world.maps.entries()).map(([id, m]) => {
            const sp = m.data.spawnPoint || [0, 0];
            return [id, { tx: sp[0], ty: sp[1] }];
          })
        )
      });
    });

    // Online players
    app.get("/admin/api/players", adminAuth, (req, res) => {
      const online = [];
      for (const [id, p] of world.players) {
        online.push({
          id, charId: p.charId, name: p.name, charClass: p.charClass,
          mapId: p.mapId, x: Math.round(p.x), y: Math.round(p.y), floor: p.floor,
          level: p.level, hp: p.hp, maxHp: p.maxHp,
          mana: p.mana, maxMana: p.maxMana,
          gold: p.gold, dead: p.dead
        });
      }
      res.json({ players: online });
    });

    // All accounts
    app.get("/admin/api/accounts", adminAuth, (req, res) => {
      const accounts = database.db.prepare(
        "SELECT username, created_at AS createdAt FROM accounts ORDER BY created_at DESC"
      ).all();
      res.json({ accounts });
    });

    // Characters for an account
    app.get("/admin/api/accounts/:username/characters", adminAuth, (req, res) => {
      const chars = database.db.prepare(
        "SELECT id, name, char_class AS charClass, level, xp, gold, hp, mana, created_at AS createdAt FROM characters WHERE username = ? ORDER BY id"
      ).all(req.params.username);
      res.json({ characters: chars });
    });

    // All characters
    app.get("/admin/api/characters", adminAuth, (req, res) => {
      const chars = database.db.prepare(
        "SELECT c.id, c.name, c.char_class AS charClass, c.level, c.xp, c.gold, c.hp, c.mana, c.username, c.created_at AS createdAt FROM characters c ORDER BY c.level DESC"
      ).all();
      res.json({ characters: chars });
    });

    // Character detail
    app.get("/admin/api/characters/:id", adminAuth, (req, res) => {
      const charId = Number(req.params.id);
      const row = database.db.prepare(
        "SELECT id, name, char_class AS charClass, level, xp, gold, hp, mana, inventory, equipment, quests, hearthstone, bank, hotbar, username, created_at AS createdAt FROM characters WHERE id = ?"
      ).get(charId);
      if (!row) return res.status(404).json({ error: "Character not found" });
      row.inventory = JSON.parse(row.inventory || "[]");
      row.equipment = JSON.parse(row.equipment || "{}");
      row.quests = JSON.parse(row.quests || "{}");
      row.hearthstone = JSON.parse(row.hearthstone || "null");
      row.bank = JSON.parse(row.bank || "[]");
      row.hotbar = JSON.parse(row.hotbar || "[]");
      // Override with live in-memory state for online players
      for (const [pid, p] of world.players) {
        if (p.charId === charId) {
          row.level = p.level; row.xp = p.xp; row.gold = p.gold;
          row.hp = p.hp; row.mana = p.mana;
          row.inventory = p.inventory || [];
          row.equipment = p.equipment || {};
          row.bank = p.bank || [];
          row.hotbar = p.hotbar || [];
          row.hearthstone = p.hearthstone || null;
          row.quests = p.quests || {};
          break;
        }
      }
      res.json({ character: row });
    });

    // Edit offline character
    app.post("/admin/api/characters/:id/edit", adminAuth, (req, res) => {
      const charId = Number(req.params.id);
      const changes = req.body;
      // Check if player is online
      for (const [pid, p] of world.players) {
        if (p.charId === charId) {
          // Apply changes to live player
          if (changes.gold !== undefined) p.gold = Math.max(0, Number(changes.gold));
          if (changes.level !== undefined) p.level = Math.max(1, Number(changes.level));
          if (changes.xp !== undefined) p.xp = Math.max(0, Number(changes.xp));
          if (changes.hp !== undefined) p.hp = Math.max(0, Number(changes.hp));
          if (changes.mana !== undefined) p.mana = Math.max(0, Number(changes.mana));
          return res.json({ ok: true, online: true });
        }
      }
      // Offline edit
      const row = database.db.prepare(
        "SELECT inventory, equipment, quests, hearthstone, bank, hotbar, level, xp, gold, hp, mana FROM characters WHERE id = ?"
      ).get(charId);
      if (!row) return res.status(404).json({ error: "Character not found" });
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
      if (changes.gold !== undefined) data.gold = Math.max(0, Number(changes.gold));
      if (changes.level !== undefined) data.level = Math.max(1, Number(changes.level));
      if (changes.xp !== undefined) data.xp = Math.max(0, Number(changes.xp));
      if (changes.hp !== undefined) data.hp = Math.max(0, Number(changes.hp));
      if (changes.mana !== undefined) data.mana = Math.max(0, Number(changes.mana));
      database.saveCharacterProgress(charId, data);
      res.json({ ok: true, online: false });
    });

    // Items catalog
    app.get("/admin/api/items", adminAuth, (req, res) => {
      const itemsPath = path.join(__dirname, "public", "data", "items.json");
      const items = JSON.parse(require("fs").readFileSync(itemsPath, "utf8"));
      res.json({ items });
    });

    // Waystones catalog (from all maps)
    app.get("/admin/api/waystones", adminAuth, (req, res) => {
      const waystones = [];
      for (const [mapId, mapEntry] of world.maps) {
        const statues = mapEntry.data.statues || [];
        for (const s of statues) {
          waystones.push({ statueId: s.id, statueName: s.name, mapId, tx: s.tx, ty: s.ty });
        }
      }
      res.json({ waystones });
    });

    // Set hearthstone for a character (online or offline)
    app.post("/admin/api/characters/:id/hearthstone", adminAuth, (req, res) => {
      const charId = Number(req.params.id);
      const hs = req.body.hearthstone; // null to clear, or { statueId, statueName, mapId, tx, ty }

      // Online player
      for (const [pid, p] of world.players) {
        if (p.charId === charId) {
          p.hearthstone = hs;
          if (hs) {
            world.send(p.ws, { type: "attune_result", ok: true, hearthstone: p.hearthstone });
          }
          return res.json({ ok: true, online: true });
        }
      }

      // Offline
      const row = database.db.prepare(
        "SELECT inventory, equipment, quests, hearthstone, bank, hotbar, level, xp, gold, hp, mana FROM characters WHERE id = ?"
      ).get(charId);
      if (!row) return res.status(404).json({ error: "Character not found" });
      const data = {
        level: row.level, xp: row.xp, gold: row.gold,
        hp: row.hp, mana: row.mana,
        inventory: JSON.parse(row.inventory || "[]"),
        equipment: JSON.parse(row.equipment || "{}"),
        quests: JSON.parse(row.quests || "{}"),
        hearthstone: hs,
        bank: JSON.parse(row.bank || "[]"),
        hotbar: JSON.parse(row.hotbar || "[]")
      };
      database.saveCharacterProgress(charId, data);
      res.json({ ok: true, online: false });
    });

    // Set inventory for a character (full replace)
    app.post("/admin/api/characters/:id/inventory", adminAuth, (req, res) => {
      const charId = Number(req.params.id);
      const inventory = req.body.inventory;
      if (!Array.isArray(inventory)) return res.status(400).json({ error: "inventory must be an array" });

      // Online player
      for (const [pid, p] of world.players) {
        if (p.charId === charId) {
          p.inventory = inventory;
          world.send(p.ws, { type: "swap_result", ok: true, inventory: p.inventory, bank: p.bank });
          return res.json({ ok: true, online: true });
        }
      }

      // Offline
      const row = database.db.prepare(
        "SELECT inventory, equipment, quests, hearthstone, bank, hotbar, level, xp, gold, hp, mana FROM characters WHERE id = ?"
      ).get(charId);
      if (!row) return res.status(404).json({ error: "Character not found" });
      const data = {
        level: row.level, xp: row.xp, gold: row.gold,
        hp: row.hp, mana: row.mana,
        inventory,
        equipment: JSON.parse(row.equipment || "{}"),
        quests: JSON.parse(row.quests || "{}"),
        hearthstone: JSON.parse(row.hearthstone || "null"),
        bank: JSON.parse(row.bank || "[]"),
        hotbar: JSON.parse(row.hotbar || "[]")
      };
      database.saveCharacterProgress(charId, data);
      res.json({ ok: true, online: false });
    });

    // Set bank for a character (full replace)
    app.post("/admin/api/characters/:id/bank", adminAuth, (req, res) => {
      const charId = Number(req.params.id);
      const bank = req.body.bank;
      if (!Array.isArray(bank)) return res.status(400).json({ error: "bank must be an array" });

      // Online player
      for (const [pid, p] of world.players) {
        if (p.charId === charId) {
          p.bank = bank;
          world.send(p.ws, { type: "swap_result", ok: true, inventory: p.inventory, bank: p.bank });
          return res.json({ ok: true, online: true });
        }
      }

      // Offline
      const row = database.db.prepare(
        "SELECT inventory, equipment, quests, hearthstone, bank, hotbar, level, xp, gold, hp, mana FROM characters WHERE id = ?"
      ).get(charId);
      if (!row) return res.status(404).json({ error: "Character not found" });
      const data = {
        level: row.level, xp: row.xp, gold: row.gold,
        hp: row.hp, mana: row.mana,
        inventory: JSON.parse(row.inventory || "[]"),
        equipment: JSON.parse(row.equipment || "{}"),
        quests: JSON.parse(row.quests || "{}"),
        hearthstone: JSON.parse(row.hearthstone || "null"),
        bank,
        hotbar: JSON.parse(row.hotbar || "[]")
      };
      database.saveCharacterProgress(charId, data);
      res.json({ ok: true, online: false });
    });

    // Kick player
    app.post("/admin/api/players/:id/kick", adminAuth, (req, res) => {
      const player = world.players.get(req.params.id);
      if (!player) return res.status(404).json({ error: "Player not online" });
      const reason = req.body.reason || "Kicked by admin.";
      world.send(player.ws, { type: "kicked", reason });
      player.ws.close();
      res.json({ ok: true });
    });

    // Revive player
    app.post("/admin/api/players/:id/revive", adminAuth, (req, res) => {
      const player = world.players.get(req.params.id);
      if (!player) return res.status(404).json({ error: "Player not online" });
      if (!player.dead) return res.json({ ok: true, message: "Player is not dead" });
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
      res.json({ ok: true });
    });

    // Teleport player
    app.post("/admin/api/players/:id/teleport", adminAuth, (req, res) => {
      const player = world.players.get(req.params.id);
      if (!player) return res.status(404).json({ error: "Player not online" });
      const { mapId, tileX, tileY } = req.body;
      const mapEntry = world.maps.get(mapId);
      if (!mapEntry) return res.status(400).json({ error: "Invalid map" });
      const ts = mapEntry.collision.tileSize || 48;
      const oldMap = player.mapId;
      player.x = tileX * ts;
      player.y = tileY * ts;
      player.floor = 0;
      if (oldMap !== mapId) {
        player.mapId = mapId;
        world.broadcastToMap(oldMap, { type: "player_left", playerId: player.id });
        world.broadcastToMap(mapId, { type: "player_joined", player: world.playerPublic(player) }, player.id);
        world.send(player.ws, {
          type: "map_changed",
          mapId,
          enemies: world.enemySnapshot(mapId),
          players: world.otherPlayersSnapshot(player.id, mapId),
          drops: world.dropsSnapshot(mapId)
        });
      }
      res.json({ ok: true });
    });

    // Grant XP
    app.post("/admin/api/players/:id/grantxp", adminAuth, (req, res) => {
      const player = world.players.get(req.params.id);
      if (!player) return res.status(404).json({ error: "Player not online" });
      const amount = Math.max(0, Number(req.body.amount) || 0);
      world._grantXp(player, amount);
      res.json({ ok: true, level: player.level, xp: player.xp });
    });

    // Set gold
    app.post("/admin/api/players/:id/setgold", adminAuth, (req, res) => {
      const player = world.players.get(req.params.id);
      if (!player) return res.status(404).json({ error: "Player not online" });
      player.gold = Math.max(0, Number(req.body.amount) || 0);
      res.json({ ok: true, gold: player.gold });
    });

    // Whisper to a specific player
    app.post("/admin/api/players/:id/whisper", adminAuth, (req, res) => {
      const player = world.players.get(req.params.id);
      if (!player) return res.status(404).json({ error: "Player not online" });
      const text = (req.body.message || "").slice(0, 500);
      if (!text) return res.status(400).json({ error: "Message required" });
      world.send(player.ws, { type: "chat", channel: "whisper", from: "[Admin]", text });
      res.json({ ok: true });
    });

    // Broadcast system message
    app.post("/admin/api/broadcast", adminAuth, (req, res) => {
      const text = (req.body.message || "").slice(0, 500);
      if (!text) return res.status(400).json({ error: "Message required" });
      world.broadcast({ type: "chat", channel: "system", text });
      res.json({ ok: true });
    });

    // Save all players
    app.post("/admin/api/save-all", adminAuth, (req, res) => {
      world._autoSaveAll();
      res.json({ ok: true });
    });

    // Respawn all enemies on a map
    app.post("/admin/api/maps/:mapId/respawn-enemies", adminAuth, (req, res) => {
      const mapEntry = world.maps.get(req.params.mapId);
      if (!mapEntry) return res.status(404).json({ error: "Map not found" });
      let count = 0;
      for (const enemy of mapEntry.enemies) {
        if (enemy.dead) {
          enemy.dead = false;
          enemy.deadUntil = 0;
          enemy.hp = enemy.maxHp;
          enemy.x = enemy.spawnX + (Math.random() - 0.5) * 24;
          enemy.y = enemy.spawnY + (Math.random() - 0.5) * 24;
          enemy.targetPlayerId = null;
          count++;
        }
      }
      res.json({ ok: true, respawned: count });
    });

    // Map enemy info
    app.get("/admin/api/maps/:mapId/enemies", adminAuth, (req, res) => {
      const mapEntry = world.maps.get(req.params.mapId);
      if (!mapEntry) return res.status(404).json({ error: "Map not found" });
      const enemies = mapEntry.enemies.map(e => ({
        id: e.id, type: e.type, name: e.name,
        hp: e.hp, maxHp: e.maxHp,
        dead: e.dead, x: Math.round(e.x), y: Math.round(e.y)
      }));
      res.json({ enemies });
    });

    // Fallback — serve game client for non-admin, non-API routes
    app.get("*", (req, res) => {
      if (req.path.startsWith("/admin")) {
        return res.sendFile(path.join(__dirname, "admin", "index.html"));
      }
      res.sendFile(path.join(__dirname, "public", "index.html"));
    });
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      const nextPort = port + 1;
      console.log(`Port ${port} busy, trying ${nextPort}...`);
      startServer(nextPort);
      return;
    }

    throw error;
  });
};

startServer(DEFAULT_PORT);

/* ── server console commands ──────────────────────────────── */

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt() {
  rl.question("> ", (line) => {
    const parts = line.trim().split(/\s+/);
    const cmd = (parts[0] || "").toLowerCase();

    switch (cmd) {
      case "help":
        console.log([
          "  help                              - Show this help",
          "  deletechar <charId>               - Delete a character by ID",
          "  deleteaccount <username>           - Delete an account and all its characters",
          "  changepassword <username> <newpw>  - Change an account's password",
          "  listaccounts                       - List all accounts",
          "  listchars <username>               - List characters for an account",
          "  findchar <name>                    - Find a character by name"
        ].join("\n"));
        break;

      case "deletechar": {
        const charId = Number(parts[1]);
        if (!Number.isInteger(charId) || charId < 1) {
          console.log("Usage: deletechar <charId>");
          break;
        }
        const row = database.db.prepare("SELECT id, name, username FROM characters WHERE id = ?").get(charId);
        if (!row) {
          console.log(`Character ${charId} not found.`);
          break;
        }
        database.db.prepare("DELETE FROM characters WHERE id = ?").run(charId);
        console.log(`Deleted character "${row.name}" (id=${charId}, account=${row.username}).`);
        break;
      }

      case "deleteaccount": {
        const username = (parts[1] || "").trim().toLowerCase();
        if (!username) {
          console.log("Usage: deleteaccount <username>");
          break;
        }
        const acct = database.db.prepare("SELECT username FROM accounts WHERE username = ?").get(username);
        if (!acct) {
          console.log(`Account "${username}" not found.`);
          break;
        }
        // Foreign keys with CASCADE will delete characters and sessions
        database.db.prepare("DELETE FROM accounts WHERE username = ?").run(username);
        console.log(`Deleted account "${username}" and all associated characters/sessions.`);
        break;
      }

      case "changepassword": {
        const username = (parts[1] || "").trim().toLowerCase();
        const newPw = parts.slice(2).join(" ");
        if (!username || !newPw) {
          console.log("Usage: changepassword <username> <newpassword>");
          break;
        }
        if (newPw.length < 4 || newPw.length > 128) {
          console.log("Password must be 4-128 characters.");
          break;
        }
        const acct = database.db.prepare("SELECT username FROM accounts WHERE username = ?").get(username);
        if (!acct) {
          console.log(`Account "${username}" not found.`);
          break;
        }
        const crypto = require("crypto");
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = crypto.pbkdf2Sync(newPw, salt, 100000, 64, "sha512").toString("hex");
        database.db.prepare("UPDATE accounts SET hash = ?, salt = ? WHERE username = ?").run(hash, salt, username);
        // Invalidate all sessions so they must log in again
        database.db.prepare("DELETE FROM sessions WHERE username = ?").run(username);
        console.log(`Password changed for "${username}". All sessions invalidated.`);
        break;
      }

      case "listaccounts": {
        const rows = database.db.prepare("SELECT username, created_at FROM accounts ORDER BY username").all();
        if (rows.length === 0) {
          console.log("No accounts.");
        } else {
          console.log(`${rows.length} account(s):`);
          for (const r of rows) {
            console.log(`  ${r.username}  (created ${new Date(r.created_at).toLocaleDateString()})`);
          }
        }
        break;
      }

      case "listchars": {
        const username = (parts[1] || "").trim().toLowerCase();
        if (!username) {
          console.log("Usage: listchars <username>");
          break;
        }
        const chars = database.db.prepare(
          "SELECT id, name, char_class, level, gold FROM characters WHERE username = ? ORDER BY id"
        ).all(username);
        if (chars.length === 0) {
          console.log(`No characters for "${username}".`);
        } else {
          console.log(`${chars.length} character(s) for "${username}":`);
          for (const c of chars) {
            console.log(`  [${c.id}] ${c.name} - ${c.char_class} lv${c.level} (${c.gold}g)`);
          }
        }
        break;
      }

      case "findchar": {
        const name = parts.slice(1).join(" ");
        if (!name) {
          console.log("Usage: findchar <name>");
          break;
        }
        const chars = database.db.prepare(
          "SELECT id, name, char_class, level, gold, username FROM characters WHERE name LIKE ? COLLATE NOCASE"
        ).all(`%${name}%`);
        if (chars.length === 0) {
          console.log("No characters found.");
        } else {
          for (const c of chars) {
            console.log(`  [${c.id}] ${c.name} - ${c.char_class} lv${c.level} (${c.gold}g) account=${c.username}`);
          }
        }
        break;
      }

      case "":
        break;

      default:
        console.log(`Unknown command: ${cmd}. Type "help" for commands.`);
    }

    prompt();
  });
}

prompt();
