/**
 * Database – SQLite-backed persistent storage for Azerfall.
 * Uses better-sqlite3 (pure Node.js, no Python).
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "azerfall.db");
const PLAYER_PORTRAITS_DIR = path.join(__dirname, "..", "public", "assets", "sprites", "portraits", "player");
const LEGACY_PORTRAITS_DIR = path.join(__dirname, "..", "public", "assets", "sprites", "portraits");

/* Load class definitions for validation */
const PLAYER_BASE_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "data", "playerBase.json"), "utf8"));
const VALID_CLASSES = Object.keys(PLAYER_BASE_DATA.classes || {});

function getPlayerPortraitIds() {
  const readPortraitPngs = (dirPath) => {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath)
      .filter((name) => /\.png$/i.test(name))
      .map((name) => path.basename(name, ".png"))
      .filter((id) => id && id !== "enemies")
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  };

  const playerPortraits = readPortraitPngs(PLAYER_PORTRAITS_DIR);
  if (playerPortraits.length > 0) return playerPortraits;

  // Backward compatibility if portraits were not moved to /portraits/player yet.
  return readPortraitPngs(LEGACY_PORTRAITS_DIR);
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

/* ── pragmas for performance + safety ─────────────────── */
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* ── schema ───────────────────────────────────────────── */

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    username    TEXT PRIMARY KEY,
    hash        TEXT NOT NULL,
    salt        TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS characters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    char_class  TEXT NOT NULL,
    level       INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    username    TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    expires_at  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS friends (
    username        TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
    friend_username TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    PRIMARY KEY (username, friend_username)
  );

  CREATE TABLE IF NOT EXISTS blocked_players (
    username         TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
    blocked_username TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
    created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    PRIMARY KEY (username, blocked_username)
  );
`);

/* ── add progression columns if missing (safe migration) ──── */
{
  const cols = db.prepare("PRAGMA table_info(characters)").all().map(c => c.name);
  const alter = (name, def) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE characters ADD COLUMN ${name} ${def}`);
  };
  const runMigrations = db.transaction(() => {
    alter("xp", "INTEGER NOT NULL DEFAULT 0");
    alter("gold", "INTEGER NOT NULL DEFAULT 12");
    alter("hp", "INTEGER NOT NULL DEFAULT 120");
    alter("mana", "INTEGER NOT NULL DEFAULT 80");
    alter("inventory", "TEXT NOT NULL DEFAULT '[]'");
    alter("equipment", "TEXT NOT NULL DEFAULT '{}'");
    alter("quests", "TEXT NOT NULL DEFAULT '{}'");
    alter("hearthstone", "TEXT NOT NULL DEFAULT 'null'");
    alter("bank", "TEXT NOT NULL DEFAULT '[]'");
    alter("hotbar", "TEXT NOT NULL DEFAULT '[]'");
    alter("gathering_skills", "TEXT NOT NULL DEFAULT '{}'");
    alter("map_id", "TEXT NOT NULL DEFAULT 'eldengrove'");
    alter("pos_x", "REAL NOT NULL DEFAULT -1");
    alter("pos_y", "REAL NOT NULL DEFAULT -1");
    alter("floor", "INTEGER NOT NULL DEFAULT 0");
    alter("pvp_kills", "INTEGER NOT NULL DEFAULT 0");
    alter("pvp_deaths", "INTEGER NOT NULL DEFAULT 0");
    alter("portrait", "TEXT NOT NULL DEFAULT 'portrait_1'");
  });
  runMigrations();
}

/* ── add expires_at to sessions if missing ──── */
{
  const cols = db.prepare("PRAGMA table_info(sessions)").all().map(c => c.name);
  if (!cols.includes("expires_at")) {
    db.exec("ALTER TABLE sessions ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0");
    // Set existing sessions to expire in 24h
    db.exec(`UPDATE sessions SET expires_at = created_at + 86400000 WHERE expires_at = 0`);
  }
}

/* ── prepared statements ──────────────────────────────── */

const stmts = {
  getAccount:     db.prepare("SELECT * FROM accounts WHERE username = ?"),
  insertAccount:  db.prepare("INSERT INTO accounts (username, hash, salt) VALUES (?, ?, ?)"),

  getCharacters:  db.prepare("SELECT id, name, char_class AS charClass, level, portrait, created_at AS createdAt FROM characters WHERE username = ? ORDER BY id"),
  countCharacters: db.prepare("SELECT COUNT(*) AS cnt FROM characters WHERE username = ?"),
  insertCharacter: db.prepare("INSERT INTO characters (username, name, char_class, portrait) VALUES (?, ?, ?, ?)"),
  deleteCharacter: db.prepare("DELETE FROM characters WHERE id = ? AND username = ?"),
  getCharacterById: db.prepare("SELECT id, name, char_class AS charClass, level, xp, gold, hp, mana, inventory, equipment, quests, hearthstone, bank, hotbar, gathering_skills AS gatheringSkills, map_id AS mapId, pos_x AS posX, pos_y AS posY, floor, pvp_kills AS pvpKills, pvp_deaths AS pvpDeaths, portrait, created_at AS createdAt FROM characters WHERE id = ? AND username = ?"),

  saveCharacter: db.prepare("UPDATE characters SET level = ?, xp = ?, gold = ?, hp = ?, mana = ?, inventory = ?, equipment = ?, quests = ?, hearthstone = ?, bank = ?, hotbar = ?, gathering_skills = ?, map_id = ?, pos_x = ?, pos_y = ?, floor = ?, pvp_kills = ?, pvp_deaths = ? WHERE id = ?"),

  insertSession:  db.prepare("INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)"),
  getSession:     db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > ?"),
  deleteSession:  db.prepare("DELETE FROM sessions WHERE token = ?"),
  deleteUserSessions: db.prepare("DELETE FROM sessions WHERE username = ?"),
  cleanExpiredSessions: db.prepare("DELETE FROM sessions WHERE expires_at <= ?"),

  /* friends */
  insertFriend:       db.prepare("INSERT OR IGNORE INTO friends (username, friend_username, status) VALUES (?, ?, ?)"),
  getFriend:          db.prepare("SELECT * FROM friends WHERE username = ? AND friend_username = ?"),
  updateFriendStatus: db.prepare("UPDATE friends SET status = ? WHERE username = ? AND friend_username = ?"),
  deleteFriend:       db.prepare("DELETE FROM friends WHERE username = ? AND friend_username = ?"),
  getFriendsList:     db.prepare("SELECT * FROM friends WHERE username = ? OR friend_username = ?"),
  findAccountByCharName: db.prepare("SELECT DISTINCT a.username FROM accounts a JOIN characters c ON c.username = a.username WHERE c.name = ? COLLATE NOCASE LIMIT 1"),

  /* blocked players */
  insertBlock:    db.prepare("INSERT OR IGNORE INTO blocked_players (username, blocked_username) VALUES (?, ?)"),
  deleteBlock:    db.prepare("DELETE FROM blocked_players WHERE username = ? AND blocked_username = ?"),
  getBlock:       db.prepare("SELECT * FROM blocked_players WHERE username = ? AND blocked_username = ?"),
  getBlockedList: db.prepare("SELECT * FROM blocked_players WHERE username = ?"),
};

/* ── helpers ──────────────────────────────────────────── */

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

/* ── public API ───────────────────────────────────────── */

function register(username, password) {
  const name = username.trim().toLowerCase();
  if (name.length < 3 || name.length > 20 || !/^[a-z0-9_]+$/.test(name)) {
    return { error: "Username must be 3-20 chars, letters/numbers/underscores only." };
  }
  if (password.length < 4 || password.length > 128) {
    return { error: "Password must be 4-128 characters." };
  }

  const existing = stmts.getAccount.get(name);
  if (existing) {
    return { error: "Account already exists." };
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  stmts.insertAccount.run(name, hash, salt);

  return { ok: true };
}

function login(username, password) {
  const name = username.trim().toLowerCase();
  const account = stmts.getAccount.get(name);

  if (!account || account.hash !== hashPassword(password, account.salt)) {
    return { error: "Invalid username or password." };
  }

  // Create session token (24h expiry)
  const token = generateToken();
  const expiresAt = Date.now() + 86400000;
  stmts.insertSession.run(token, name, expiresAt);

  const characters = stmts.getCharacters.all(name);
  return { ok: true, token, characters };
}

function logout(token) {
  stmts.deleteSession.run(token);
  return { ok: true };
}

function validateSession(token) {
  if (!token) return null;
  const session = stmts.getSession.get(token, Date.now());
  return session ? session.username : null;
}

function getCharacters(token) {
  const username = validateSession(token);
  if (!username) return { error: "Auth failed." };

  const characters = stmts.getCharacters.all(username);
  return { characters };
}

function createCharacter(token, charName, charClass, portrait) {
  const username = validateSession(token);
  if (!username) return { error: "Auth failed." };

  const trimmedName = (charName || "").trim();
  if (trimmedName.length < 2 || trimmedName.length > 16) {
    return { error: "Character name must be 2-16 characters." };
  }
  if (!/^[A-Za-z]+$/.test(trimmedName)) {
    return { error: "Character name must contain only letters." };
  }

  const { cnt } = stmts.countCharacters.get(username);
  if (cnt >= 5) {
    return { error: "Max 5 characters per account." };
  }

  const validClasses = VALID_CLASSES;
  const cls = (charClass || "warrior").toLowerCase();
  if (!validClasses.includes(cls)) {
    return { error: "Invalid class." };
  }

  const validPortraits = getPlayerPortraitIds();
  const defaultPortrait = validPortraits[0] || "portrait_1";
  const port = validPortraits.includes(portrait) ? portrait : defaultPortrait;

  const displayName = trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1).toLowerCase();
  try {
    stmts.insertCharacter.run(username, displayName, cls, port);
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE constraint failed")) {
      return { error: "Character name is already taken." };
    }
    throw err;
  }

  const characters = stmts.getCharacters.all(username);
  return { ok: true, characters };
}

function deleteCharacter(token, charId) {
  const username = validateSession(token);
  if (!username) return { error: "Auth failed." };

  const charIdNum = Number(charId);
  if (!Number.isInteger(charIdNum) || charIdNum < 1) {
    return { error: "Invalid character." };
  }

  const char = stmts.getCharacterById.get(charIdNum, username);
  if (!char) {
    return { error: "Character not found." };
  }

  stmts.deleteCharacter.run(charIdNum, username);
  const characters = stmts.getCharacters.all(username);
  return { ok: true, characters };
}

function loadCharacter(charId, username) {
  let char;
  try {
    char = stmts.getCharacterById.get(charId, username);
  } catch (err) {
    console.error(`[DB] loadCharacter query failed for charId=${charId}:`, err.message);
    return null;
  }
  if (!char) return null;
  // Parse JSON fields
  try { char.inventory = JSON.parse(char.inventory || "[]"); } catch (_) { char.inventory = []; }
  try { char.equipment = JSON.parse(char.equipment || "{}"); } catch (_) { char.equipment = {}; }
  try { char.quests = JSON.parse(char.quests || "{}"); } catch (_) { char.quests = {}; }
  try { char.hearthstone = JSON.parse(char.hearthstone || "null"); } catch (_) { char.hearthstone = null; }
  try { char.bank = JSON.parse(char.bank || "[]"); } catch (_) { char.bank = []; }
  try { char.hotbar = JSON.parse(char.hotbar || "[]"); } catch (_) { char.hotbar = []; }
  try { char.gatheringSkills = JSON.parse(char.gatheringSkills || "{}"); } catch (_) { char.gatheringSkills = {}; }
  // Validate mapId has a value; fall back to default if empty/null
  if (!char.mapId || typeof char.mapId !== "string") {
    char.mapId = "eldengrove";
  }
  return char;
}

function saveCharacterProgress(charId, data) {
  const inv = JSON.stringify(data.inventory || []);
  const equip = JSON.stringify(data.equipment || {});
  const quests = JSON.stringify(data.quests || {});
  const hearthstone = JSON.stringify(data.hearthstone ?? null);
  const bank = JSON.stringify(data.bank || []);
  const hotbar = JSON.stringify(data.hotbar || []);
  const gatheringSkills = JSON.stringify(data.gatheringSkills || {});
  try {
  stmts.saveCharacter.run(
    data.level || 1,
    data.xp || 0,
    data.gold || 0,
    Math.max(1, data.hp ?? 120),
    data.mana ?? 80,
    inv,
    equip,
    quests,
    hearthstone,
    bank,
    hotbar,
    gatheringSkills,
    (data.mapId && typeof data.mapId === "string") ? data.mapId : "eldengrove",
    data.posX ?? -1,
    data.posY ?? -1,
    data.floor ?? 0,
    data.pvpKills ?? 0,
    data.pvpDeaths ?? 0,
    charId
  );
  } catch (err) {
    console.error(`[DB] saveCharacterProgress failed for charId=${charId}:`, err.message);
  }
}

function cleanExpiredSessions() {
  stmts.cleanExpiredSessions.run(Date.now());
}

/* ── friends API ──────────────────────────────────────── */

const _sendFriendRequestTxn = db.transaction((username, friendUsername) => {
  // Check if either party has blocked the other
  if (stmts.getBlock.get(username, friendUsername)) return { error: "You have blocked that player." };
  if (stmts.getBlock.get(friendUsername, username)) return { error: "Unable to send friend request." };

  // Check if any relationship already exists (in either direction)
  const existing = stmts.getFriend.get(username, friendUsername);
  const reverse = stmts.getFriend.get(friendUsername, username);
  if (existing || reverse) {
    if ((existing && existing.status === "accepted") || (reverse && reverse.status === "accepted")) {
      return { error: "Already friends." };
    }
    if (existing && existing.status === "pending") {
      return { error: "Friend request already sent." };
    }
    if (reverse && reverse.status === "pending") {
      // They already sent us a request — auto-accept
      stmts.updateFriendStatus.run("accepted", friendUsername, username);
      return { ok: true, autoAccepted: true, friendUsername };
    }
  }

  stmts.insertFriend.run(username, friendUsername, "pending");
  return { ok: true, friendUsername };
});

function sendFriendRequest(username, targetCharName) {
  // Look up account by character name
  const row = stmts.findAccountByCharName.get(targetCharName);
  if (!row) return { error: "Player not found." };
  const friendUsername = row.username;
  if (friendUsername === username) return { error: "You cannot add yourself." };

  return _sendFriendRequestTxn(username, friendUsername);
}

function acceptFriendRequest(username, fromUsername) {
  const row = stmts.getFriend.get(fromUsername, username);
  if (!row || row.status !== "pending") return { error: "No pending request from that player." };
  stmts.updateFriendStatus.run("accepted", fromUsername, username);
  return { ok: true };
}

function rejectFriendRequest(username, fromUsername) {
  const row = stmts.getFriend.get(fromUsername, username);
  if (!row || row.status !== "pending") return { error: "No pending request from that player." };
  stmts.deleteFriend.run(fromUsername, username);
  return { ok: true };
}

function removeFriend(username, friendUsername) {
  // Could be stored in either direction
  const a = stmts.getFriend.get(username, friendUsername);
  const b = stmts.getFriend.get(friendUsername, username);
  if (a) stmts.deleteFriend.run(username, friendUsername);
  if (b) stmts.deleteFriend.run(friendUsername, username);
  if (!a && !b) return { error: "Not on your friends list." };
  return { ok: true };
}

function getFriendsList(username) {
  const rows = stmts.getFriendsList.all(username, username);
  // Normalize: return each relationship from the perspective of `username`
  return rows.map(r => {
    const isRequester = r.username === username;
    return {
      friendUsername: isRequester ? r.friend_username : r.username,
      status: r.status,
      direction: isRequester ? "sent" : "received"
    };
  });
}

/* ── blocked players API ─────────────────────────────── */

function blockPlayer(username, targetCharName) {
  const row = stmts.findAccountByCharName.get(targetCharName);
  if (!row) return { error: "Player not found." };
  const blockedUsername = row.username;
  if (blockedUsername === username) return { error: "You cannot block yourself." };

  const existing = stmts.getBlock.get(username, blockedUsername);
  if (existing) return { error: "Player already blocked." };

  // Remove any friend relationship in either direction
  stmts.deleteFriend.run(username, blockedUsername);
  stmts.deleteFriend.run(blockedUsername, username);

  stmts.insertBlock.run(username, blockedUsername);
  return { ok: true, blockedUsername };
}

function unblockPlayer(username, blockedUsername) {
  const existing = stmts.getBlock.get(username, blockedUsername);
  if (!existing) return { error: "Player is not blocked." };
  stmts.deleteBlock.run(username, blockedUsername);
  return { ok: true };
}

function isBlocked(username, byUsername) {
  return !!stmts.getBlock.get(byUsername, username);
}

function getBlockedList(username) {
  return stmts.getBlockedList.all(username).map(r => ({
    blockedUsername: r.blocked_username,
    createdAt: r.created_at
  }));
}

function getCharactersByUsername(username) {
  return stmts.getCharacters.all(username);
}

/* ── migration: import old accounts.json if it exists ─── */

function migrateFromJson() {
  const jsonPath = path.join(DATA_DIR, "accounts.json");
  if (!fs.existsSync(jsonPath)) return;

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const insertAcc = db.prepare("INSERT OR IGNORE INTO accounts (username, hash, salt, created_at) VALUES (?, ?, ?, ?)");
    const insertChar = db.prepare("INSERT INTO characters (username, name, char_class, level, created_at) VALUES (?, ?, ?, ?, ?)");

    const migrate = db.transaction(() => {
      for (const [username, account] of Object.entries(data)) {
        insertAcc.run(username, account.hash, account.salt, account.createdAt || Date.now());
        if (account.characters) {
          for (const char of account.characters) {
            insertChar.run(username, char.name, char.charClass, char.level || 1, char.createdAt || Date.now());
          }
        }
      }
    });

    migrate();
    // Rename old file so we don't re-import
    fs.renameSync(jsonPath, jsonPath + ".migrated");
    console.log("[Database] Migrated accounts.json to SQLite.");
  } catch (err) {
    console.error("[Database] Migration failed:", err.message);
  }
}

// Run migration on first load
migrateFromJson();

module.exports = {
  db,
  register,
  login,
  logout,
  validateSession,
  getCharacters,
  createCharacter,
  deleteCharacter,
  loadCharacter,
  saveCharacterProgress,
  cleanExpiredSessions,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  getFriendsList,
  getCharactersByUsername,
  blockPlayer,
  unblockPlayer,
  isBlocked,
  getBlockedList,
  getPlayerPortraitIds
};
