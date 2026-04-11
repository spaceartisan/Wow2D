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
    name        TEXT NOT NULL,
    char_class  TEXT NOT NULL CHECK(char_class IN ('warrior','mage','rogue')),
    level       INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    username    TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    expires_at  INTEGER NOT NULL DEFAULT 0
  );
`);

/* ── add progression columns if missing (safe migration) ──── */
{
  const cols = db.prepare("PRAGMA table_info(characters)").all().map(c => c.name);
  const alter = (name, def) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE characters ADD COLUMN ${name} ${def}`);
  };
  alter("xp", "INTEGER NOT NULL DEFAULT 0");
  alter("gold", "INTEGER NOT NULL DEFAULT 12");
  alter("hp", "INTEGER NOT NULL DEFAULT 120");
  alter("mana", "INTEGER NOT NULL DEFAULT 80");
  alter("inventory", "TEXT NOT NULL DEFAULT '[]'");
  alter("equipment", "TEXT NOT NULL DEFAULT '{}'");
  alter("quests", "TEXT NOT NULL DEFAULT '{}'");
  alter("hearthstone", "TEXT NOT NULL DEFAULT 'null'");
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

  getCharacters:  db.prepare("SELECT id, name, char_class AS charClass, level, created_at AS createdAt FROM characters WHERE username = ? ORDER BY id"),
  countCharacters: db.prepare("SELECT COUNT(*) AS cnt FROM characters WHERE username = ?"),
  insertCharacter: db.prepare("INSERT INTO characters (username, name, char_class) VALUES (?, ?, ?)"),
  deleteCharacter: db.prepare("DELETE FROM characters WHERE id = ? AND username = ?"),
  getCharacterById: db.prepare("SELECT id, name, char_class AS charClass, level, xp, gold, hp, mana, inventory, equipment, quests, hearthstone, created_at AS createdAt FROM characters WHERE id = ? AND username = ?"),

  saveCharacter: db.prepare("UPDATE characters SET level = ?, xp = ?, gold = ?, hp = ?, mana = ?, inventory = ?, equipment = ?, quests = ?, hearthstone = ? WHERE id = ?"),

  insertSession:  db.prepare("INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)"),
  getSession:     db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > ?"),
  deleteSession:  db.prepare("DELETE FROM sessions WHERE token = ?"),
  deleteUserSessions: db.prepare("DELETE FROM sessions WHERE username = ?"),
  cleanExpiredSessions: db.prepare("DELETE FROM sessions WHERE expires_at <= ?"),
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

function createCharacter(token, charName, charClass) {
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

  const validClasses = ["warrior", "mage", "rogue"];
  const cls = (charClass || "warrior").toLowerCase();
  if (!validClasses.includes(cls)) {
    return { error: "Invalid class." };
  }

  const displayName = trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1).toLowerCase();
  stmts.insertCharacter.run(username, displayName, cls);

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
  const char = stmts.getCharacterById.get(charId, username);
  if (!char) return null;
  // Parse JSON fields
  try { char.inventory = JSON.parse(char.inventory || "[]"); } catch (_) { char.inventory = []; }
  try { char.equipment = JSON.parse(char.equipment || "{}"); } catch (_) { char.equipment = {}; }
  try { char.quests = JSON.parse(char.quests || "{}"); } catch (_) { char.quests = {}; }
  try { char.hearthstone = JSON.parse(char.hearthstone || "null"); } catch (_) { char.hearthstone = null; }
  return char;
}

function saveCharacterProgress(charId, data) {
  const inv = JSON.stringify(data.inventory || []);
  const equip = JSON.stringify(data.equipment || {});
  const quests = JSON.stringify(data.quests || {});
  const hearthstone = JSON.stringify(data.hearthstone ?? null);
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
    charId
  );
}

function cleanExpiredSessions() {
  stmts.cleanExpiredSessions.run(Date.now());
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
  cleanExpiredSessions
};
