/**
 * Map Editor Server
 * Run: node tools/map-editor/server.js
 * Opens at: http://localhost:3001
 *
 * Provides a visual map editor for creating/editing Azerfall maps.
 * Reads tile palette, enemies, NPCs from public/data/ and
 * saves map JSON files to public/data/maps/.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(PROJECT_ROOT, "public", "data");
const MAPS_DIR = path.join(DATA_DIR, "maps");

app.use(express.json({ limit: "50mb" }));

// Serve editor static files
app.use(express.static(__dirname));

// Serve game assets (sprites, etc.)
app.use("/assets", express.static(path.join(PROJECT_ROOT, "public", "assets")));

// ── Data API ──────────────────────────────────────────

app.get("/api/palette", (_req, res) => {
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "tilePalette.json"), "utf8"));
  res.json(data);
});

app.get("/api/enemies", (_req, res) => {
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "enemies.json"), "utf8"));
  res.json(data);
});

app.get("/api/npcs", (_req, res) => {
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "npcs.json"), "utf8"));
  res.json(data);
});

app.get("/api/props", (_req, res) => {
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "props.json"), "utf8"));
  res.json(data);
});

app.get("/api/maps", (_req, res) => {
  if (!fs.existsSync(MAPS_DIR)) return res.json([]);
  const files = fs.readdirSync(MAPS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(".json", ""));
  res.json(files);
});

app.get("/api/maps/:id", (req, res) => {
  const id = path.basename(req.params.id); // prevent path traversal
  const filePath = path.join(MAPS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Map not found" });
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  res.json(data);
});

app.post("/api/maps/:id", (req, res) => {
  const id = path.basename(req.params.id); // prevent path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: "Invalid map ID. Use only letters, numbers, hyphens, underscores." });
  }
  const filePath = path.join(MAPS_DIR, `${id}.json`);
  fs.mkdirSync(MAPS_DIR, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
  res.json({ ok: true, path: filePath });
});

// ── Start ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  Map Editor running at http://localhost:${PORT}\n`);
  console.log(`  Data dir: ${DATA_DIR}`);
  console.log(`  Maps dir: ${MAPS_DIR}\n`);
});
