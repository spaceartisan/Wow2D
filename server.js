const express = require("express");
const path = require("path");
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

/* ── fallback ─────────────────────────────────────────────── */

app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
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

          playerId = world.addPlayer(ws, charRecord);
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
