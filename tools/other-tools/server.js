
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 5127;
const TOOL_ROOT = __dirname;

const TILE_PALETTE_CANDIDATES = [
  path.resolve(__dirname, '../../public/data/tilePalette.json'),
  path.resolve(process.cwd(), '../../public/data/tilePalette.json'),
  path.resolve(process.cwd(), 'public/data/tilePalette.json'),
  path.resolve(process.cwd(), '../public/data/tilePalette.json'),
  path.resolve(process.cwd(), '../../wow2d/public/data/tilePalette.json'),
];
const ITEMS_CANDIDATES = [
  path.resolve(__dirname, '../../public/data/items.json'),
  path.resolve(process.cwd(), '../../public/data/items.json'),
  path.resolve(process.cwd(), 'public/data/items.json'),
  path.resolve(process.cwd(), '../public/data/items.json'),
  path.resolve(process.cwd(), '../../wow2d/public/data/items.json'),
];
const ENEMIES_CANDIDATES = [
  path.resolve(__dirname, '../../public/data/enemies.json'),
  path.resolve(process.cwd(), '../../public/data/enemies.json'),
  path.resolve(process.cwd(), 'public/data/enemies.json'),
  path.resolve(process.cwd(), '../public/data/enemies.json'),
  path.resolve(process.cwd(), '../../wow2d/public/data/enemies.json'),
];
const NPCS_CANDIDATES = [
  path.resolve(__dirname, '../../public/data/npcs.json'),
  path.resolve(process.cwd(), '../../public/data/npcs.json'),
  path.resolve(process.cwd(), 'public/data/npcs.json'),
  path.resolve(process.cwd(), '../public/data/npcs.json'),
  path.resolve(process.cwd(), '../../wow2d/public/data/npcs.json'),
];
const QUESTS_CANDIDATES = [
  path.resolve(__dirname, '../../public/data/quests.json'),
  path.resolve(process.cwd(), '../../public/data/quests.json'),
  path.resolve(process.cwd(), 'public/data/quests.json'),
  path.resolve(process.cwd(), '../public/data/quests.json'),
  path.resolve(process.cwd(), '../../wow2d/public/data/quests.json'),
];
const PARTICLES_CANDIDATES = [
  path.resolve(__dirname, '../../public/data/particles.json'),
  path.resolve(process.cwd(), '../../public/data/particles.json'),
  path.resolve(process.cwd(), 'public/data/particles.json'),
  path.resolve(process.cwd(), '../public/data/particles.json'),
  path.resolve(process.cwd(), '../../wow2d/public/data/particles.json'),
];
const SKILLS_CANDIDATES = [
  path.resolve(__dirname, '../../public/data/skills.json'),
  path.resolve(process.cwd(), '../../public/data/skills.json'),
  path.resolve(process.cwd(), 'public/data/skills.json'),
  path.resolve(process.cwd(), '../public/data/skills.json'),
  path.resolve(process.cwd(), '../../wow2d/public/data/skills.json'),
];
const STATUS_EFFECTS_CANDIDATES = [
  path.resolve(__dirname, '../../public/data/statusEffects.json'),
  path.resolve(process.cwd(), '../../public/data/statusEffects.json'),
  path.resolve(process.cwd(), 'public/data/statusEffects.json'),
  path.resolve(process.cwd(), '../public/data/statusEffects.json'),
  path.resolve(process.cwd(), '../../wow2d/public/data/statusEffects.json'),
];
// Status effect icons are served from the public root (icon field is a relative path)
const PUBLIC_ROOT_CANDIDATES = [
  path.resolve(__dirname, '../../public'),
  path.resolve(process.cwd(), '../../public'),
  path.resolve(process.cwd(), 'public'),
  path.resolve(process.cwd(), '../public'),
  path.resolve(process.cwd(), '../../wow2d/public'),
];
const PROPS_CANDIDATES = [
  path.resolve(__dirname, '../../public/data/props.json'),
  path.resolve(process.cwd(), '../../public/data/props.json'),
  path.resolve(process.cwd(), 'public/data/props.json'),
  path.resolve(process.cwd(), '../public/data/props.json'),
  path.resolve(process.cwd(), '../../wow2d/public/data/props.json'),
];
const PLAYER_BASE_CANDIDATES = [
  path.resolve(__dirname, '../../public/data/playerBase.json'),
  path.resolve(process.cwd(), '../../public/data/playerBase.json'),
  path.resolve(process.cwd(), 'public/data/playerBase.json'),
  path.resolve(process.cwd(), '../public/data/playerBase.json'),
  path.resolve(process.cwd(), '../../wow2d/public/data/playerBase.json'),
];
const PROP_SPRITE_DIR_CANDIDATES = [
  path.resolve(__dirname, '../../public/assets/sprites/props'),
  path.resolve(process.cwd(), '../../public/assets/sprites/props'),
  path.resolve(process.cwd(), 'public/assets/sprites/props'),
  path.resolve(process.cwd(), '../public/assets/sprites/props'),
  path.resolve(process.cwd(), '../../wow2d/public/assets/sprites/props'),
];
const TILE_SPRITE_DIR_CANDIDATES = [
  path.resolve(__dirname, '../../public/assets/sprites/tiles'),
  path.resolve(process.cwd(), '../../public/assets/sprites/tiles'),
  path.resolve(process.cwd(), 'public/assets/sprites/tiles'),
  path.resolve(process.cwd(), '../public/assets/sprites/tiles'),
  path.resolve(process.cwd(), '../../wow2d/public/assets/sprites/tiles'),
];
const ENTITY_SPRITE_DIR_CANDIDATES = [
  path.resolve(__dirname, '../../public/assets/sprites/entities'),
  path.resolve(process.cwd(), '../../public/assets/sprites/entities'),
  path.resolve(process.cwd(), 'public/assets/sprites/entities'),
  path.resolve(process.cwd(), '../public/assets/sprites/entities'),
  path.resolve(process.cwd(), '../../wow2d/public/assets/sprites/entities'),
];
const ITEM_ICON_DIR_CANDIDATES = [
  path.resolve(__dirname, '../../public/assets/sprites/icons'),
  path.resolve(process.cwd(), '../../public/assets/sprites/icons'),
  path.resolve(process.cwd(), 'public/assets/sprites/icons'),
  path.resolve(process.cwd(), '../public/assets/sprites/icons'),
  path.resolve(process.cwd(), '../../wow2d/public/assets/sprites/icons'),
];
const SKILL_ICON_DIR_CANDIDATES = [
  path.resolve(__dirname, '../../public/assets/sprites/skills'),
  path.resolve(process.cwd(), '../../public/assets/sprites/skills'),
  path.resolve(process.cwd(), 'public/assets/sprites/skills'),
  path.resolve(process.cwd(), '../public/assets/sprites/skills'),
  path.resolve(process.cwd(), '../../wow2d/public/assets/sprites/skills'),
];
const GATHERING_SPRITE_DIR_CANDIDATES = [
  path.resolve(__dirname, '../../public/assets/sprites/gathering'),
  path.resolve(process.cwd(), '../../public/assets/sprites/gathering'),
  path.resolve(process.cwd(), 'public/assets/sprites/gathering'),
  path.resolve(process.cwd(), '../public/assets/sprites/gathering'),
  path.resolve(process.cwd(), '../../wow2d/public/assets/sprites/gathering'),
];
const GATHERING_SKILLS_CANDIDATES = [
  path.resolve(__dirname, '../../public/data/gatheringSkills.json'),
  path.resolve(process.cwd(), '../../public/data/gatheringSkills.json'),
  path.resolve(process.cwd(), 'public/data/gatheringSkills.json'),
  path.resolve(process.cwd(), '../public/data/gatheringSkills.json'),
  path.resolve(process.cwd(), '../../wow2d/public/data/gatheringSkills.json'),
];
const RESOURCE_NODES_CANDIDATES = [
  path.resolve(__dirname, '../../public/data/resourceNodes.json'),
  path.resolve(process.cwd(), '../../public/data/resourceNodes.json'),
  path.resolve(process.cwd(), 'public/data/resourceNodes.json'),
  path.resolve(process.cwd(), '../public/data/resourceNodes.json'),
  path.resolve(process.cwd(), '../../wow2d/public/data/resourceNodes.json'),
];
const SFX_DIR_CANDIDATES = [
  path.resolve(__dirname, '../../public/assets/sfx'),
  path.resolve(process.cwd(), '../../public/assets/sfx'),
  path.resolve(process.cwd(), 'public/assets/sfx'),
  path.resolve(process.cwd(), '../public/assets/sfx'),
  path.resolve(process.cwd(), '../../wow2d/public/assets/sfx'),
];

function firstExisting(candidates) {
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  return candidates[0];
}
function resolveExistingTilePalettePath() { return firstExisting(TILE_PALETTE_CANDIDATES); }
function resolveExistingItemsPath() { return firstExisting(ITEMS_CANDIDATES); }
function resolveExistingEnemiesPath() { return firstExisting(ENEMIES_CANDIDATES); }
function resolveExistingNpcsPath() { return firstExisting(NPCS_CANDIDATES); }
function resolveExistingQuestsPath() { return firstExisting(QUESTS_CANDIDATES); }
function resolveExistingParticlesPath() { return firstExisting(PARTICLES_CANDIDATES); }
function resolveExistingSkillsPath() { return firstExisting(SKILLS_CANDIDATES); }
function resolveExistingStatusEffectsPath() { return firstExisting(STATUS_EFFECTS_CANDIDATES); }
function resolvePublicRoot() { return firstExisting(PUBLIC_ROOT_CANDIDATES); }
function resolveExistingPropsPath() { return firstExisting(PROPS_CANDIDATES); }
function resolveExistingPropSpriteDir() { return firstExisting(PROP_SPRITE_DIR_CANDIDATES); }
function resolveExistingPlayerBasePath() { return firstExisting(PLAYER_BASE_CANDIDATES); }
function resolveExistingTileSpriteDir() { return firstExisting(TILE_SPRITE_DIR_CANDIDATES); }
function resolveExistingEntitySpriteDir() { return firstExisting(ENTITY_SPRITE_DIR_CANDIDATES); }
function resolveExistingItemIconDir() { return firstExisting(ITEM_ICON_DIR_CANDIDATES); }
function resolveExistingSkillIconDir() { return firstExisting(SKILL_ICON_DIR_CANDIDATES); }
function resolveExistingGatheringSpriteDir() { return firstExisting(GATHERING_SPRITE_DIR_CANDIDATES); }
function resolveExistingGatheringSkillsPath() { return firstExisting(GATHERING_SKILLS_CANDIDATES); }
function resolveExistingResourceNodesPath() { return firstExisting(RESOURCE_NODES_CANDIDATES); }
function resolveExistingSfxDir() { return firstExisting(SFX_DIR_CANDIDATES); }

function listTileSpriteIds() {
  const dir = resolveExistingTileSpriteDir();
  if (!fs.existsSync(dir)) throw new Error(`Tile sprite directory not found: ${dir}`);
  const ids = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && path.extname(e.name).toLowerCase() === '.png').map(e => path.basename(e.name, '.png')).filter(Boolean).sort((a,b)=>a.localeCompare(b));
  return { dir, ids };
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function sendJson(res, statusCode, payload) { res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(payload, null, 2)); }
function sendText(res, statusCode, text) { res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); }
function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return sendText(res, 404, 'Not found');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 5 * 1024 * 1024) { reject(new Error('Request body too large')); req.destroy(); } });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}
function validateTilePalette(tilePalette) {
  if (!tilePalette || typeof tilePalette !== 'object' || Array.isArray(tilePalette)) return 'tilePalette must be an object keyed by tile id.';
  for (const [key, entry] of Object.entries(tilePalette)) {
    if (!key.trim()) return 'Tile ids cannot be blank.';
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `Entry for "${key}" must be an object.`;
    if (!Array.isArray(entry.color) || entry.color.length !== 3) return `Entry for "${key}" must contain color: [r, g, b].`;
    for (const channel of entry.color) if (!Number.isInteger(channel) || channel < 0 || channel > 255) return `Entry for "${key}" has a color channel outside 0-255.`;
    if (typeof entry.blocked !== 'boolean') return `Entry for "${key}" must contain blocked: boolean.`;
  }
  return null;
}
function validateEnemies(enemies) {
  if (!enemies || typeof enemies !== 'object' || Array.isArray(enemies)) return 'enemies must be an object keyed by enemy id.';
  for (const [key, entry] of Object.entries(enemies)) {
    if (!key.trim()) return 'Enemy ids cannot be blank.';
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `Entry for "${key}" must be an object.`;
    for (const field of ['name','color']) if (typeof entry[field] !== 'string') return `Entry for "${key}" must contain ${field}: string.`;
    for (const field of ['maxHp','damage','speed','xp','goldMin','goldMax','respawnSeconds','radius','aggroRange','attackRange','attackCooldown']) if (typeof entry[field] !== 'number' || Number.isNaN(entry[field])) return `Entry for "${key}" must contain ${field}: number.`;
    if (!Array.isArray(entry.loot)) return `Entry for "${key}" must contain loot: array.`;
    for (const lootEntry of entry.loot) {
      if (!lootEntry || typeof lootEntry !== 'object' || Array.isArray(lootEntry)) return `Entry for "${key}" has invalid loot entry.`;
      if (typeof lootEntry.itemId !== 'string') return `Entry for "${key}" loot.itemId must be a string.`;
      if (typeof lootEntry.chance !== 'number' || Number.isNaN(lootEntry.chance)) return `Entry for "${key}" loot.chance must be a number.`;
    }
  }
  return null;
}
function validateItems(items) {
  const validTypes = new Set(['weapon','armor','trinket','consumable','junk','hearthstone']);
  if (!items || typeof items !== 'object' || Array.isArray(items)) return 'items must be an object keyed by item id.';
  for (const [key, entry] of Object.entries(items)) {
    if (!key.trim()) return 'Item ids cannot be blank.';
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `Entry for "${key}" must be an object.`;
    for (const field of ['id','name','type','icon','description']) {
      if (typeof entry[field] !== 'string') return `Entry for "${key}" must contain ${field}: string.`;
    }
    if (!validTypes.has(entry.type)) return `Entry for "${key}" has invalid type "${entry.type}".`;
    if (typeof entry.value !== 'number' || Number.isNaN(entry.value)) return `Entry for "${key}" must contain value: number.`;
  }
  return null;
}
function validateNpcs(npcs) {
  const validTypes = new Set(['quest_giver','vendor','banker']);
  if (!npcs || typeof npcs !== 'object' || Array.isArray(npcs)) return 'npcs must be an object keyed by npc id.';
  for (const [key, entry] of Object.entries(npcs)) {
    if (!key.trim()) return 'NPC ids cannot be blank.';
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `Entry for "${key}" must be an object.`;
    for (const field of ['id','name','color','type','defaultDialog']) if (typeof entry[field] !== 'string') return `Entry for "${key}" must contain ${field}: string.`;
    if (!validTypes.has(entry.type)) return `Entry for "${key}" has invalid type "${entry.type}".`;
    if (entry.type === 'quest_giver' && entry.questIds && !Array.isArray(entry.questIds)) return `Entry for "${key}" questIds must be an array.`;
    if (entry.type === 'vendor' && entry.shop && !Array.isArray(entry.shop)) return `Entry for "${key}" shop must be an array.`;
  }
  return null;
}


function validateQuests(quests) {
  if (!quests || typeof quests !== 'object' || Array.isArray(quests)) return 'quests must be an object keyed by quest id.';
  for (const [key, entry] of Object.entries(quests)) {
    if (!key.trim()) return 'Quest ids cannot be blank.';
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `Entry for "${key}" must be an object.`;
    for (const field of ['id','name','giver','description']) if (typeof entry[field] !== 'string') return `Entry for "${key}" must contain ${field}: string.`;
    if (typeof entry.level !== 'number' || Number.isNaN(entry.level)) return `Entry for "${key}" must contain level: number.`;
    if (!Array.isArray(entry.prerequisiteQuests)) return `Entry for "${key}" prerequisiteQuests must be an array.`;
    if (!Array.isArray(entry.objectives)) return `Entry for "${key}" objectives must be an array.`;
    for (const obj of entry.objectives) {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return `Entry for "${key}" has invalid objective.`;
      for (const field of ['type','target','label']) if (typeof obj[field] !== 'string') return `Entry for "${key}" objective must contain ${field}: string.`;
      if (typeof obj.count !== 'number' || Number.isNaN(obj.count)) return `Entry for "${key}" objective.count must be a number.`;
    }
    if (!entry.rewards || typeof entry.rewards !== 'object' || Array.isArray(entry.rewards)) return `Entry for "${key}" rewards must be an object.`;
    for (const field of ['xp','gold']) if (typeof entry.rewards[field] !== 'number' || Number.isNaN(entry.rewards[field])) return `Entry for "${key}" rewards.${field} must be a number.`;
    if (!Array.isArray(entry.rewards.items)) return `Entry for "${key}" rewards.items must be an array.`;
    if (!entry.dialog || typeof entry.dialog !== 'object' || Array.isArray(entry.dialog)) return `Entry for "${key}" dialog must be an object.`;
    for (const state of ['not_started','active','ready_to_turn_in','completed']) {
      const d = entry.dialog[state];
      if (!d || typeof d !== 'object' || Array.isArray(d)) return `Entry for "${key}" dialog.${state} must be an object.`;
      if (typeof d.text !== 'string') return `Entry for "${key}" dialog.${state}.text must be a string.`;
      if (!Array.isArray(d.options)) return `Entry for "${key}" dialog.${state}.options must be an array.`;
    }
  }
  return null;
}

function validateGatheringSkills(gs) {
  if (!gs || typeof gs !== 'object' || Array.isArray(gs)) return 'gatheringSkills must be an object keyed by skill id.';
  for (const [key, entry] of Object.entries(gs)) {
    if (!key.trim()) return 'Gathering skill ids cannot be blank.';
    if (!entry || typeof entry !== 'object') return `Entry for "${key}" must be an object.`;
    for (const field of ['id','name','description','toolType']) if (typeof entry[field] !== 'string') return `Entry for "${key}" must contain ${field}: string.`;
    if (entry.id !== key) return `Entry for "${key}": id must match the object key.`;
  }
  return null;
}
function validateResourceNodes(rn) {
  if (!rn || typeof rn !== 'object' || Array.isArray(rn)) return 'resourceNodes must be an object keyed by node type id.';
  for (const [key, entry] of Object.entries(rn)) {
    if (!key.trim()) return 'Node type ids cannot be blank.';
    if (!entry || typeof entry !== 'object') return `Entry for "${key}" must be an object.`;
    for (const field of ['name','skill','requiredToolType','gatherItem']) if (typeof entry[field] !== 'string') return `Entry for "${key}" must contain ${field}: string.`;
    for (const field of ['requiredLevel','requiredToolTier','xpPerGather','maxHarvests','respawnTicks']) if (typeof entry[field] !== 'number') return `Entry for "${key}" must contain ${field}: number.`;
    if (!Array.isArray(entry.color) || entry.color.length !== 3) return `Entry for "${key}" must contain color: [r,g,b].`;
  }
  return null;
}
function validateStatusEffects(statusEffects) {
  if (!statusEffects || typeof statusEffects !== 'object' || Array.isArray(statusEffects)) return 'statusEffects must be an object keyed by effect id.';
  for (const [key, entry] of Object.entries(statusEffects)) {
    if (!key.trim()) return 'Effect ids cannot be blank.';
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `Entry for "${key}" must be an object.`;
    if (typeof entry.name !== 'string') return `Entry for "${key}" must contain name: string.`;
    if (!['buff','debuff'].includes(entry.type)) return `Entry for "${key}" type must be "buff" or "debuff".`;
  }
  return null;
}

function validateSkills(skills) {
  const VALID_TYPES = new Set(['attack','heal','buff','debuff','support']);
  const VALID_TARGETING = new Set(['enemy','self','aoe','aoe_ally']);
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) return 'skills must be an object keyed by skill id.';
  for (const [key, entry] of Object.entries(skills)) {
    if (!key.trim()) return 'Skill ids cannot be blank.';
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `Entry for "${key}" must be an object.`;
    for (const field of ['id','name','description','icon']) if (typeof entry[field] !== 'string') return `Entry for "${key}" must contain ${field}: string.`;
    if (!VALID_TYPES.has(entry.type)) return `Entry for "${key}" has invalid type "${entry.type}".`;
    if (!VALID_TARGETING.has(entry.targeting)) return `Entry for "${key}" has invalid targeting "${entry.targeting}".`;
    if (typeof entry.manaCost !== 'number') return `Entry for "${key}" must contain manaCost: number.`;
    if (typeof entry.levelReq !== 'number') return `Entry for "${key}" must contain levelReq: number.`;
    if (!Array.isArray(entry.classes) || !entry.classes.length) return `Entry for "${key}" classes must be a non-empty array.`;
  }
  return null;
}

function validateParticles(particles) {
  if (!particles || typeof particles !== 'object' || Array.isArray(particles)) return 'particles must be an object keyed by preset name.';
  const BLEND_MODES = new Set(['lighter', 'source-over', 'multiply', 'screen', 'overlay']);
  for (const [key, entry] of Object.entries(particles)) {
    if (!key.trim()) return 'Preset names cannot be blank.';
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `Entry for "${key}" must be an object.`;
    for (const field of ['count', 'lifetime', 'speed', 'angle', 'size']) {
      if (!Array.isArray(entry[field]) || entry[field].length !== 2) return `Entry for "${key}": ${field} must be [min, max].`;
      if (typeof entry[field][0] !== 'number' || typeof entry[field][1] !== 'number') return `Entry for "${key}": ${field} values must be numbers.`;
    }
    if (typeof entry.sizeEnd !== 'number') return `Entry for "${key}": sizeEnd must be a number.`;
    if (!Array.isArray(entry.color) || !entry.color.length) return `Entry for "${key}": color must be a non-empty array of hex strings.`;
    if (typeof entry.gravity !== 'number') return `Entry for "${key}": gravity must be a number.`;
    if (typeof entry.friction !== 'number') return `Entry for "${key}": friction must be a number.`;
    if (typeof entry.fadeOut !== 'boolean') return `Entry for "${key}": fadeOut must be a boolean.`;
    if (typeof entry.blendMode !== 'string') return `Entry for "${key}": blendMode must be a string.`;
  }
  return null;
}

function validateProps(props) {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return 'props must be an object keyed by prop type.';
  for (const [key, entry] of Object.entries(props)) {
    if (!key.trim()) return 'Prop type keys cannot be blank.';
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `Entry for "${key}" must be an object.`;
    if (!Array.isArray(entry.color) || entry.color.length !== 3) return `Entry for "${key}" must contain color: [r, g, b].`;
    for (const channel of entry.color) if (!Number.isInteger(channel) || channel < 0 || channel > 255) return `Entry for "${key}" has a color channel outside 0-255.`;
    if (typeof entry.blocked !== 'boolean') return `Entry for "${key}" must contain blocked: boolean.`;
  }
  return null;
}
function listPropSpriteIds() {
  const IGNORED = new Set(['portal']);
  const dir = resolveExistingPropSpriteDir();
  if (!fs.existsSync(dir)) throw new Error(`Prop sprite directory not found: ${dir}`);
  const ids = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && path.extname(e.name).toLowerCase() === '.png')
    .map(e => path.basename(e.name, '.png'))
    .filter(id => id && !IGNORED.has(id))
    .sort((a, b) => a.localeCompare(b));
  return { dir, ids };
}

function validatePlayerBase(pb) {
  if (!pb || typeof pb !== 'object' || Array.isArray(pb)) return 'playerBase must be a flat object.';
  for (const field of ['moveSpeed','attackRange','attackCooldown','maxHp','maxMana','damage']) {
    if (typeof pb[field] !== 'number' || Number.isNaN(pb[field])) return `playerBase must contain ${field}: number.`;
  }
  return null;
}

function safeAssetPath(root, basename) {
  const filePath = path.join(root, `${basename}.png`);
  const normalized = path.normalize(filePath);
  const normalizedRoot = path.normalize(root);
  if (!normalized.startsWith(normalizedRoot)) return null;
  return normalized;
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname || '/');

  if (pathname === '/health') return sendJson(res, 200, { ok:true, tilePalettePath: resolveExistingTilePalettePath(), itemsPath: resolveExistingItemsPath(), enemiesPath: resolveExistingEnemiesPath(), npcsPath: resolveExistingNpcsPath(), questsPath: resolveExistingQuestsPath(), propsPath: resolveExistingPropsPath(), particlesPath: resolveExistingParticlesPath(), skillsPath: resolveExistingSkillsPath(), statusEffectsPath: resolveExistingStatusEffectsPath(), gatheringSkillsPath: resolveExistingGatheringSkillsPath(), resourceNodesPath: resolveExistingResourceNodesPath(), playerBasePath: resolveExistingPlayerBasePath(), port: PORT });

  // Serve status effect icons by their relative path (e.g. assets/sprites/status/stunned.png)
  if (pathname.startsWith('/api/status-sprite/') && req.method === 'GET') {
    try {
      const relPath = decodeURIComponent(pathname.replace('/api/status-sprite/', '')).trim();
      if (!relPath) return sendText(res, 400, 'Missing path');
      const publicRoot = resolvePublicRoot();
      const filePath = path.normalize(path.join(publicRoot, relPath));
      if (!filePath.startsWith(path.normalize(publicRoot))) return sendText(res, 403, 'Forbidden');
      if (!fs.existsSync(filePath)) return sendText(res, 404, 'Not found');
      const ext = path.extname(filePath).toLowerCase();
      const mime = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp' };
      const data = await fs.promises.readFile(filePath);
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      return res.end(data);
    } catch (error) { return sendText(res, 500, error.message); }
  }

  // Serve skill icons — same folder as item icons (public/assets/sprites/icons/)
  if (pathname.startsWith('/api/skill-icon/') && req.method === 'GET') {
    try {
      const iconId = pathname.replace('/api/skill-icon/', '').trim();
      if (!iconId) return sendText(res, 400, 'Missing icon id');
      const iconPath = safeAssetPath(resolveExistingSkillIconDir(), iconId);
      if (!iconPath) return sendText(res, 403, 'Forbidden');
      return serveFile(res, iconPath);
    } catch (error) { return sendText(res, 500, error.message); }
  }
  if (pathname.startsWith('/api/gathering-sprite/') && req.method === 'GET') {
    try {
      const nodeId = pathname.replace('/api/gathering-sprite/', '').trim();
      if (!nodeId) return sendText(res, 400, 'Missing node id');
      const spritePath = safeAssetPath(resolveExistingGatheringSpriteDir(), nodeId);
      if (!spritePath) return sendText(res, 403, 'Forbidden');
      return serveFile(res, spritePath);
    } catch (error) { return sendText(res, 500, error.message); }
  }
  if (pathname === '/api/gathering-skills' && req.method === 'GET') {
    try { return sendJson(res, 200, { gatheringSkills: JSON.parse(await fs.promises.readFile(resolveExistingGatheringSkillsPath(), 'utf8')), path: resolveExistingGatheringSkillsPath() }); }
    catch (error) { return sendJson(res, 500, { error: error.message, path: resolveExistingGatheringSkillsPath() }); }
  }
  if (pathname === '/api/gathering-skills' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const validationError = validateGatheringSkills(body.gatheringSkills);
      if (validationError) return sendJson(res, 400, { error: validationError });
      const p = resolveExistingGatheringSkillsPath();
      await fs.promises.writeFile(p, JSON.stringify(body.gatheringSkills, null, 2) + '\n', 'utf8');
      return sendJson(res, 200, { ok:true, path:p });
    } catch (error) { return sendJson(res, 500, { error:error.message, path: resolveExistingGatheringSkillsPath() }); }
  }
  if (pathname === '/api/resource-nodes' && req.method === 'GET') {
    try { return sendJson(res, 200, { resourceNodes: JSON.parse(await fs.promises.readFile(resolveExistingResourceNodesPath(), 'utf8')), path: resolveExistingResourceNodesPath() }); }
    catch (error) { return sendJson(res, 500, { error: error.message, path: resolveExistingResourceNodesPath() }); }
  }
  if (pathname === '/api/resource-nodes' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const validationError = validateResourceNodes(body.resourceNodes);
      if (validationError) return sendJson(res, 400, { error: validationError });
      const p = resolveExistingResourceNodesPath();
      await fs.promises.writeFile(p, JSON.stringify(body.resourceNodes, null, 2) + '\n', 'utf8');
      return sendJson(res, 200, { ok:true, path:p });
    } catch (error) { return sendJson(res, 500, { error:error.message, path: resolveExistingResourceNodesPath() }); }
  }

  if (pathname === '/api/status-effects' && req.method === 'GET') {
    try { return sendJson(res, 200, { statusEffects: JSON.parse(await fs.promises.readFile(resolveExistingStatusEffectsPath(), 'utf8')), path: resolveExistingStatusEffectsPath() }); }
    catch (error) { return sendJson(res, 500, { error: error.message, path: resolveExistingStatusEffectsPath() }); }
  }
  if (pathname === '/api/status-effects' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const validationError = validateStatusEffects(body.statusEffects);
      if (validationError) return sendJson(res, 400, { error: validationError });
      const p = resolveExistingStatusEffectsPath();
      await fs.promises.writeFile(p, JSON.stringify(body.statusEffects, null, 2) + '\n', 'utf8');
      return sendJson(res, 200, { ok:true, path:p });
    } catch (error) { return sendJson(res, 500, { error:error.message, path: resolveExistingStatusEffectsPath() }); }
  }

  if (pathname === '/api/skills' && req.method === 'GET') {
    try { return sendJson(res, 200, { skills: JSON.parse(await fs.promises.readFile(resolveExistingSkillsPath(), 'utf8')), path: resolveExistingSkillsPath() }); }
    catch (error) { return sendJson(res, 500, { error: error.message, path: resolveExistingSkillsPath() }); }
  }
  if (pathname === '/api/skills' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const validationError = validateSkills(body.skills);
      if (validationError) return sendJson(res, 400, { error: validationError });
      const p = resolveExistingSkillsPath();
      await fs.promises.writeFile(p, JSON.stringify(body.skills, null, 2) + '\n', 'utf8');
      return sendJson(res, 200, { ok:true, path:p });
    } catch (error) { return sendJson(res, 500, { error:error.message, path: resolveExistingSkillsPath() }); }
  }

  if (pathname.startsWith('/api/sfx/') && req.method === 'GET') {
    try {
      const sfxKey = pathname.replace('/api/sfx/', '').trim();
      if (!sfxKey) return sendText(res, 400, 'Missing sfx key');
      const sfxDir = resolveExistingSfxDir();
      const AUDIO_EXTS = ['.ogg', '.mp3', '.wav'];
      const AUDIO_MIME = { '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
      for (const ext of AUDIO_EXTS) {
        const candidate = path.join(sfxDir, sfxKey.replace(/\.[^.]+$/, '') + ext);
        const normalizedDir = path.normalize(sfxDir);
        const normalizedFile = path.normalize(candidate);
        if (!normalizedFile.startsWith(normalizedDir)) return sendText(res, 403, 'Forbidden');
        if (fs.existsSync(candidate)) {
          const data = await fs.promises.readFile(candidate);
          res.writeHead(200, { 'Content-Type': AUDIO_MIME[ext], 'Content-Length': data.length });
          return res.end(data);
        }
      }
      return sendText(res, 404, `SFX "${sfxKey}" not found (tried ${AUDIO_EXTS.join(', ')})`);
    } catch (error) { return sendText(res, 500, error.message); }
  }
  if (pathname === '/api/particles' && req.method === 'GET') {
    try { return sendJson(res, 200, { particles: JSON.parse(await fs.promises.readFile(resolveExistingParticlesPath(), 'utf8')), path: resolveExistingParticlesPath() }); }
    catch (error) { return sendJson(res, 500, { error: error.message, path: resolveExistingParticlesPath() }); }
  }
  if (pathname === '/api/particles' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const validationError = validateParticles(body.particles);
      if (validationError) return sendJson(res, 400, { error: validationError });
      const p = resolveExistingParticlesPath();
      await fs.promises.writeFile(p, JSON.stringify(body.particles, null, 2) + '\n', 'utf8');
      return sendJson(res, 200, { ok:true, path:p });
    } catch (error) { return sendJson(res, 500, { error:error.message, path: resolveExistingParticlesPath() }); }
  }

  if (pathname === '/api/props' && req.method === 'GET') {
    try { return sendJson(res, 200, { props: JSON.parse(await fs.promises.readFile(resolveExistingPropsPath(), 'utf8')), path: resolveExistingPropsPath() }); }
    catch (error) { return sendJson(res, 500, { error: error.message, path: resolveExistingPropsPath() }); }
  }
  if (pathname === '/api/props' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const validationError = validateProps(body.props);
      if (validationError) return sendJson(res, 400, { error: validationError });
      const p = resolveExistingPropsPath();
      await fs.promises.writeFile(p, JSON.stringify(body.props, null, 2) + '\n', 'utf8');
      return sendJson(res, 200, { ok:true, path:p });
    } catch (error) { return sendJson(res, 500, { error:error.message, path: resolveExistingPropsPath() }); }
  }
  if (pathname.startsWith('/api/prop-sprite/') && req.method === 'GET') {
    try {
      const propId = pathname.replace('/api/prop-sprite/', '').trim(); if (!propId) return sendText(res, 400, 'Missing prop id');
      const spritePath = safeAssetPath(resolveExistingPropSpriteDir(), propId); if (!spritePath) return sendText(res, 403, 'Forbidden');
      return serveFile(res, spritePath);
    } catch (error) { return sendText(res, 500, error.message); }
  }
  if (pathname === '/api/prop-sprites/scan' && req.method === 'GET') {
    try {
      const { dir, ids } = listPropSpriteIds();
      let props = {};
      const propsPath = resolveExistingPropsPath();
      if (fs.existsSync(propsPath)) props = JSON.parse(await fs.promises.readFile(propsPath, 'utf8'));
      const existingIds = new Set(Object.keys(props || {}));
      return sendJson(res, 200, { spriteDir: dir, propsPath, totalSprites: ids.length, totalPropEntries: existingIds.size, newIds: ids.filter(id => !existingIds.has(id)), existingSpriteIds: ids.filter(id => existingIds.has(id)) });
    } catch (error) { return sendJson(res, 500, { error: error.message, spriteDir: resolveExistingPropSpriteDir() }); }
  }

  if (pathname === '/api/player-base' && req.method === 'GET') {
    try { return sendJson(res, 200, { playerBase: JSON.parse(await fs.promises.readFile(resolveExistingPlayerBasePath(), 'utf8')), path: resolveExistingPlayerBasePath() }); }
    catch (error) { return sendJson(res, 500, { error: error.message, path: resolveExistingPlayerBasePath() }); }
  }
  if (pathname === '/api/player-base' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const validationError = validatePlayerBase(body.playerBase);
      if (validationError) return sendJson(res, 400, { error: validationError });
      const p = resolveExistingPlayerBasePath();
      await fs.promises.writeFile(p, JSON.stringify(body.playerBase, null, 2) + '\n', 'utf8');
      return sendJson(res, 200, { ok:true, path:p });
    } catch (error) { return sendJson(res, 500, { error:error.message, path: resolveExistingPlayerBasePath() }); }
  }

  if (pathname === '/api/tile-palette' && req.method === 'GET') {
    try { return sendJson(res, 200, { tilePalette: JSON.parse(await fs.promises.readFile(resolveExistingTilePalettePath(), 'utf8')), path: resolveExistingTilePalettePath() }); }
    catch (error) { return sendJson(res, 500, { error: error.message, path: resolveExistingTilePalettePath() }); }
  }
  if (pathname === '/api/items' && req.method === 'GET') {
    try { return sendJson(res, 200, { items: JSON.parse(await fs.promises.readFile(resolveExistingItemsPath(), 'utf8')), path: resolveExistingItemsPath() }); }
    catch (error) { return sendJson(res, 500, { error: error.message, path: resolveExistingItemsPath() }); }
  }
  if (pathname === '/api/enemies' && req.method === 'GET') {
    try { return sendJson(res, 200, { enemies: JSON.parse(await fs.promises.readFile(resolveExistingEnemiesPath(), 'utf8')), path: resolveExistingEnemiesPath() }); }
    catch (error) { return sendJson(res, 500, { error: error.message, path: resolveExistingEnemiesPath() }); }
  }
  if (pathname === '/api/npcs' && req.method === 'GET') {
    try { return sendJson(res, 200, { npcs: JSON.parse(await fs.promises.readFile(resolveExistingNpcsPath(), 'utf8')), path: resolveExistingNpcsPath() }); }
    catch (error) { return sendJson(res, 500, { error: error.message, path: resolveExistingNpcsPath() }); }
  }
  if (pathname === '/api/quests' && req.method === 'GET') {
    try { return sendJson(res, 200, { quests: JSON.parse(await fs.promises.readFile(resolveExistingQuestsPath(), 'utf8')), path: resolveExistingQuestsPath() }); }
    catch (error) { return sendJson(res, 500, { error: error.message, path: resolveExistingQuestsPath() }); }
  }
  if (pathname.startsWith('/api/tile-sprite/') && req.method === 'GET') {
    try {
      const tileId = pathname.replace('/api/tile-sprite/', '').trim(); if (!tileId) return sendText(res, 400, 'Missing tile id');
      const spritePath = safeAssetPath(resolveExistingTileSpriteDir(), tileId); if (!spritePath) return sendText(res, 403, 'Forbidden');
      return serveFile(res, spritePath);
    } catch (error) { return sendText(res, 500, error.message); }
  }
  if (pathname.startsWith('/api/entity-sprite/') && req.method === 'GET') {
    try {
      const entityId = pathname.replace('/api/entity-sprite/', '').trim(); if (!entityId) return sendText(res, 400, 'Missing entity id');
      const entityPath = safeAssetPath(resolveExistingEntitySpriteDir(), entityId); if (!entityPath) return sendText(res, 403, 'Forbidden');
      return serveFile(res, entityPath);
    } catch (error) { return sendText(res, 500, error.message); }
  }
  if (pathname.startsWith('/api/item-icon/') && req.method === 'GET') {
    try {
      const iconId = pathname.replace('/api/item-icon/', '').trim(); if (!iconId) return sendText(res, 400, 'Missing icon id');
      const iconPath = safeAssetPath(resolveExistingItemIconDir(), iconId); if (!iconPath) return sendText(res, 403, 'Forbidden');
      return serveFile(res, iconPath);
    } catch (error) { return sendText(res, 500, error.message); }
  }
  if (pathname === '/api/tile-sprites/scan' && req.method === 'GET') {
    try {
      const { dir, ids } = listTileSpriteIds();
      let tilePalette = {};
      const tilePalettePath = resolveExistingTilePalettePath();
      if (fs.existsSync(tilePalettePath)) tilePalette = JSON.parse(await fs.promises.readFile(tilePalettePath, 'utf8'));
      const existingIds = new Set(Object.keys(tilePalette || {}));
      return sendJson(res, 200, { spriteDir: dir, tilePalettePath, totalSprites: ids.length, totalPaletteEntries: existingIds.size, newIds: ids.filter(id => !existingIds.has(id)), existingSpriteIds: ids.filter(id => existingIds.has(id)) });
    } catch (error) { return sendJson(res, 500, { error: error.message, spriteDir: resolveExistingTileSpriteDir() }); }
  }
  if (pathname === '/api/tile-palette' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const validationError = validateTilePalette(body.tilePalette);
      if (validationError) return sendJson(res, 400, { error: validationError });
      const p = resolveExistingTilePalettePath();
      await fs.promises.writeFile(p, JSON.stringify(body.tilePalette, null, 2) + '\n', 'utf8');
      return sendJson(res, 200, { ok:true, path:p });
    } catch (error) { return sendJson(res, 500, { error:error.message, path: resolveExistingTilePalettePath() }); }
  }
  if (pathname === '/api/items' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const validationError = validateItems(body.items);
      if (validationError) return sendJson(res, 400, { error: validationError });
      const p = resolveExistingItemsPath();
      await fs.promises.writeFile(p, JSON.stringify(body.items, null, 2) + '\n', 'utf8');
      return sendJson(res, 200, { ok:true, path:p });
    } catch (error) { return sendJson(res, 500, { error:error.message, path: resolveExistingItemsPath() }); }
  }
  if (pathname === '/api/enemies' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const validationError = validateEnemies(body.enemies);
      if (validationError) return sendJson(res, 400, { error: validationError });
      const p = resolveExistingEnemiesPath();
      await fs.promises.writeFile(p, JSON.stringify(body.enemies, null, 2) + '\n', 'utf8');
      return sendJson(res, 200, { ok:true, path:p });
    } catch (error) { return sendJson(res, 500, { error:error.message, path: resolveExistingEnemiesPath() }); }
  }
  if (pathname === '/api/npcs' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const validationError = validateNpcs(body.npcs);
      if (validationError) return sendJson(res, 400, { error: validationError });
      const p = resolveExistingNpcsPath();
      await fs.promises.writeFile(p, JSON.stringify(body.npcs, null, 2) + '\n', 'utf8');
      return sendJson(res, 200, { ok:true, path:p });
    } catch (error) { return sendJson(res, 500, { error:error.message, path: resolveExistingNpcsPath() }); }
  }
  if (pathname === '/api/quests' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const validationError = validateQuests(body.quests);
      if (validationError) return sendJson(res, 400, { error: validationError });
      const p = resolveExistingQuestsPath();
      await fs.promises.writeFile(p, JSON.stringify(body.quests, null, 2) + '\n', 'utf8');
      return sendJson(res, 200, { ok:true, path:p });
    } catch (error) { return sendJson(res, 500, { error:error.message, path: resolveExistingQuestsPath() }); }
  }

  let filePath = path.join(TOOL_ROOT, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
  filePath = path.normalize(filePath);
  if (!filePath.startsWith(TOOL_ROOT)) return sendText(res, 403, 'Forbidden');
  fs.stat(filePath, (err, stat) => { if (!err && stat.isFile()) return serveFile(res, filePath); sendText(res, 404, 'Not found'); });
});

server.listen(PORT, () => {
  console.log(`Azerfall Tools server running at http://localhost:${PORT}`);
  console.log(`Tile palette target: ${resolveExistingTilePalettePath()}`);
  console.log(`Items target: ${resolveExistingItemsPath()}`);
  console.log(`Enemies target: ${resolveExistingEnemiesPath()}`);
  console.log(`NPCs target: ${resolveExistingNpcsPath()}`);
  console.log(`Quests target: ${resolveExistingQuestsPath()}`);
  console.log(`Props target: ${resolveExistingPropsPath()}`);
  console.log(`Prop sprite dir: ${resolveExistingPropSpriteDir()}`);
  console.log(`Particles target: ${resolveExistingParticlesPath()}`);
  console.log(`Skills target:    ${resolveExistingSkillsPath()}`);
  console.log(`Status effects:   ${resolveExistingStatusEffectsPath()}`);
  console.log(`Gathering skills: ${resolveExistingGatheringSkillsPath()}`);
  console.log(`Resource nodes:   ${resolveExistingResourceNodesPath()}`);
  console.log(`Skill icon dir:   ${resolveExistingSkillIconDir()}`);
  console.log(`Gathering dir:    ${resolveExistingGatheringSpriteDir()}`);
  console.log(`Player base target: ${resolveExistingPlayerBasePath()}`);
  console.log(`Tile sprite dir: ${resolveExistingTileSpriteDir()}`);
  console.log(`Entity sprite dir: ${resolveExistingEntitySpriteDir()}`);
  console.log(`Item icon dir: ${resolveExistingItemIconDir()}`);
  console.log(`SFX dir:       ${resolveExistingSfxDir()}`);
});
