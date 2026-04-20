import { InputSystem } from "./InputSystem.js";
import { AudioManager } from "../systems/AudioManager.js";
import { CombatSystem } from "../systems/CombatSystem.js";
import { EntitySystem } from "../systems/EntitySystem.js";
import { NetworkSystem } from "../systems/NetworkSystem.js";
import { QuestSystem } from "../systems/QuestSystem.js";
import { SpriteManager } from "../systems/SpriteManager.js";
import { UISystem } from "../systems/UISystem.js";
import { WorldSystem } from "../systems/WorldSystem.js";
import { MinimapSystem } from "../systems/MinimapSystem.js";
import { ParticleSystem } from "../systems/ParticleSystem.js";
import { ProjectileSystem } from "../systems/ProjectileSystem.js";
import { clamp } from "../utils.js";
import { THEME } from "../config.js";

const DEFAULT_MAP = THEME.defaultMap || "eldengrove";

export class Game {
  constructor(canvas, charData, credentials) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.charData = charData || { name: "Adventurer", charClass: "warrior", level: 1 };
    this.credentials = credentials; // { username, token }
    this.onLogout = null; // callback set by main.js

    this.world = new WorldSystem();
    this.world.game = this;
    this.sprites = new SpriteManager();
    this.input = new InputSystem(canvas);
    this.camera = { x: 0, y: 0 };

    this.lastFrame = performance.now();
    this._destroyed = false;
    this._rafId = null;
    this._changingMap = false;

    this.quests = null;
    this.entities = null;
    this.combat = null;
    this.ui = null;
    this.network = null;
    this.minimap = null;
    this.audio = new AudioManager();
    this.projectiles = new ProjectileSystem(this);

    // Auto-gathering state
    this.gathering = { active: false, nodeId: null, timer: 0, cooldown: 2.5 };
    this.crafting = { active: false, recipeId: null, timer: 0, duration: 0, continuous: false };

    // Map particle emitter IDs for floor-synced emitters
    this._mapEmitterIds = [];

    // Label visibility toggles (all off by default)
    this.labelToggles = {
      players: false,
      npcs: false,
      resourceNodes: false,
      waystones: false,
      portals: false,
      buildings: false,
      floorIndicator: false,
      hoverNames: true
    };
  }

  async init() {
    this.resizeCanvas();
    this._resizeBound = () => this.resizeCanvas();
    window.addEventListener("resize", this._resizeBound);

    // Load all data-driven JSON files in parallel
    const [items, enemies, npcs, quests, skills, statusEffects, gatheringSkills, resourceNodeDefs, recipes, aoePatterns, rarities] = await Promise.all([
      fetch("/data/items.json").then(r => r.json()),
      fetch("/data/enemies.json").then(r => r.json()),
      fetch("/data/npcs.json").then(r => r.json()),
      fetch("/data/quests.json").then(r => r.json()),
      fetch("/data/skills.json").then(r => r.json()),
      fetch("/data/statusEffects.json").then(r => r.json()),
      fetch("/data/gatheringSkills.json").then(r => r.json()),
      fetch("/data/resourceNodes.json").then(r => r.json()),
      fetch("/data/recipes.json").then(r => r.json()),
      fetch("/data/aoePatterns.json").then(r => r.json()),
      fetch("/data/rarities.json").then(r => r.json())
    ]);
    this.data = { items, enemies, npcs, quests, skills, statusEffects, gatheringSkills, resourceNodeDefs, recipes, aoePatterns, rarities };

    // Load the starting map
    await this.world.loadMap(DEFAULT_MAP);

    // Preload all sprite PNGs
    await this.sprites.load(
      this.world.globalPalette,
      Object.keys(enemies),
      Object.keys(npcs),
      Object.keys(items),
      this.world.propDefs,
      skills,
      resourceNodeDefs
    );

    this.quests = new QuestSystem(this);
    this.quests.init();
    this.entities = new EntitySystem(this);
    this.combat = new CombatSystem(this);
    this.ui = new UISystem(this);
    this.minimap = new MinimapSystem(this);

    this.particles = new ParticleSystem(this);
    await this.particles.load();

    // Init audio (needs user gesture — canvas click counts)
    try {
      this.audio.init();
    } catch (e) {
      console.warn("AudioManager init failed:", e);
    }

    // Play initial map BGM (loadMap ran before audio.init)
    if (this.world.mapData && this.world.mapData.bgm) {
      this.audio.playBgm(this.world.mapData.bgm);
    }

    this.entities.recalculateDerivedStats();
    this.centerCameraOnPlayer();

    // connect to multiplayer server
    this.network = new NetworkSystem(this, {
      username: this.credentials.username,
      token: this.credentials.token,
      charData: this.charData
    });
    this.network.connect();

    this.ui.addMessage(THEME.welcomeMessage || "Welcome!");
    this.ui.addMessage("WASD to move. Click an enemy to target. E to interact.");
    this.ui.addMessage("I inventory, C equipment, L quest log, P character, K skills, G professions.");
    this.ui.addMessage("1 attack, 2 heal, 3-0 hotbar. Drag items to hotbar/bank. Enter to chat.");

    // Start map-placed particle emitters for the starting floor
    this._syncMapParticles();

    this._rafId = requestAnimationFrame(this._boundLoop = (t) => this.loop(t));
  }

  destroy() {
    this._destroyed = true;
    if (this.audio) this.audio.stopBgm();
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this.network) {
      this.network.disconnect();
    }
    if (this.input) {
      this.input.destroy();
    }
    if (this.ui) {
      this.ui.destroy();
    }
    window.removeEventListener("resize", this._resizeBound);
  }

  logout() {
    this.destroy();
    if (this.onLogout) this.onLogout();
  }

  logoutFull() {
    this.destroy();
    if (this.onLogoutFull) this.onLogoutFull();
  }

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(640, Math.floor(rect.width));
    const height = Math.max(360, Math.floor(rect.height));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      if (this.entities) {
        this.updateCamera();
      }
    }
  }

  loop(timestamp) {
    if (this._destroyed) return;

    const dt = Math.min(0.05, (timestamp - this.lastFrame) / 1000);
    this.lastFrame = timestamp;

    this.update(dt);
    this.render();

    this._rafId = requestAnimationFrame(this._boundLoop);
  }

  update(dt) {
    this._lastDt = dt;
    this.handleHotkeys();

    this.input.mouse.worldX = this.camera.x + this.input.mouse.x;
    this.input.mouse.worldY = this.camera.y + this.input.mouse.y;

    if (this.input.mouse.leftClicked) {
      this.combat.handleWorldClick(this.input.mouse.worldX, this.input.mouse.worldY);
    }
    if (this.input.mouse.rightClicked) {
      this.combat.handleWorldRightClick(this.input.mouse.worldX, this.input.mouse.worldY);
    }

    // Close loot window on movement
    if (this.ui?._lootDropId &&
        (this.input.isDown("w","arrowup") || this.input.isDown("a","arrowleft") ||
         this.input.isDown("s","arrowdown") || this.input.isDown("d","arrowright"))) {
      this.ui.closeLootWindow();
    }

    // Smooth remote entity positions toward latest server data at 60 fps
    if (this.network) {
      this.network.interpolate(dt);
    }

    this.updateGathering(dt);
    this.updateCrafting(dt);
    this.entities.update(dt);
    this.combat.update(dt);
    this.projectiles.update(dt);
    this.particles.update(dt);
    this.checkPortals();
    this.checkStairs(dt);

    this.updateCamera();
    this.ui.update();

    this.input.endFrame();
  }

  handleHotkeys() {
    if (this.input.wasPressed("i")) {
      this.ui.toggleInventory();
    }

    if (this.input.wasPressed("c")) {
      this.ui.toggleEquipment();
    }

    if (this.input.wasPressed("l")) {
      this.ui.toggleQuestLog();
    }

    if (this.input.wasPressed("p")) {
      this.ui.toggleCharSheet();
    }

    if (this.input.wasPressed("k")) {
      this.ui.toggleSkills();
    }

    if (this.input.wasPressed("g")) {
      this.ui.toggleProfessions();
    }

    if (this.input.wasPressed("o")) {
      this.ui.toggleSocial();
    }

    if (this.input.wasPressed("m")) {
      this.minimap.toggle();
    }

    for (let i = 0; i < 10; i++) {
      if (this.input.wasPressed(String(i === 9 ? 0 : i + 1))) {
        this.ui.activateHotbarSlot(i);
      }
    }

    if (this.input.wasPressed("e")) {
      // If already gathering, cancel
      if (this.gathering.active) {
        this.stopGathering();
      } else {
        const npc = this.entities.getClosestNpcInRange();
        if (npc) {
          this.quests.interactWithNPC(npc);
        } else {
          const statue = this.entities.getClosestStatueInRange();
          if (statue) {
            this.interactWithStatue(statue);
          } else {
            const node = this.entities.getClosestResourceNodeInRange();
            if (node && node.active && this.network) {
              this.startGathering(node.id);
            }
          }
        }
      }
    }

    if (this.input.wasPressed("enter")) {
      this.ui.focusChat();
    }

    if (this.input.wasPressed("escape")) {
      // Cancel AoE targeting first
      if (this.combat.aoeTargeting) {
        this.combat.cancelAoeTargeting();
      // Cancel gathering first if active
      } else if (this.gathering.active) {
        this.stopGathering();
      // Close any open panels first, otherwise toggle game menu
      } else if (this.ui.bankOpen) {
        this.ui.closeBank();
      } else if (this.ui.shopOpen) {
        this.ui.closeShop();
      } else if (this.ui.npcDialogOpen) {
        this.ui.closeNpcDialog();
      } else if (this.ui.inventoryOpen) {
        this.ui.toggleInventory();
      } else if (this.ui.equipmentOpen) {
        this.ui.toggleEquipment();
      } else if (this.ui.questLogOpen) {
        this.ui.toggleQuestLog();
      } else if (this.ui.charSheetOpen) {
        this.ui.toggleCharSheet();
      } else if (this.ui.skillsOpen) {
        this.ui.toggleSkills();
      } else if (this.ui.professionsOpen) {
        this.ui.toggleProfessions();
      } else {
        this.ui.el.gameMenuPanel.classList.toggle("hidden");
      }
    }
  }

  checkPortals() {
    if (this._changingMap) return;
    // Don't check portals when on an upper floor
    if (this.world.currentFloor > 0) return;
    const player = this.entities.player;
    const portal = this.world.getPortalAt(player.x, player.y);
    if (portal) {
      this.changeMap(portal.targetMap, portal.targetTx, portal.targetTy);
    }
  }

  checkStairs(dt) {
    const player = this.entities.player;
    const prevFloor = this.world.currentFloor;
    const result = this.world.checkStairs(player.x, player.y, dt);
    if (result && this.world.currentFloor !== prevFloor) {
      // Snap player to the center of the stair tile on the new floor
      player.x = result.snapX;
      player.y = result.snapY;
      this._syncMapParticles();
      this.minimap.invalidate();
    }
  }

  async changeMap(mapId, targetTx, targetTy) {
    if (this._changingMap) return;
    this._changingMap = true;

    try {
      await this.world.loadMap(mapId);
      this.minimap.invalidate();

      // Reposition player
      const ts = this.world.tileSize;
      this.entities.player.x = targetTx * ts;
      this.entities.player.y = targetTy * ts;

      // Rebuild NPCs and statues for the new map
      this.entities.npcs = this.entities.createNpcs();
      this.entities.statues = this.entities.createStatues();

      // Clear combat target (enemies are server-managed)
      this.combat.targetEnemyId = null;
      this.projectiles.clear();
      this.particles.clear();

      // Start map-placed particle emitters for the new map
      this._syncMapParticles();

      // Tell server about the map transition
      if (this.network) {
        this.network.send({
          type: "map_change",
          mapId,
          x: this.entities.player.x,
          y: this.entities.player.y
        });
      }

      this.centerCameraOnPlayer();
      const mapName = this.world.mapData?.name || mapId;
      this.ui.addMessage(`Entered ${mapName}.`);
    } catch (err) {
      console.error("Map transition failed:", err);
      this.ui.addMessage("Failed to enter the new area.");
    } finally {
      this._changingMap = false;
    }
  }

  centerCameraOnPlayer() {
    const player = this.entities.player;
    this.camera.x = player.x - this.canvas.width * 0.5;
    this.camera.y = player.y - this.canvas.height * 0.5;
    this.clampCamera();
  }

  /**
   * Start/stop map-placed particle emitters so only the current floor's
   * emitters are active.
   */
  _syncMapParticles() {
    // Stop all existing map emitters
    for (const id of this._mapEmitterIds) {
      this.particles.stopContinuous(id);
    }
    this._mapEmitterIds = [];

    const floor = this.world.currentFloor;
    for (let i = 0; i < this.world.mapParticles.length; i++) {
      const mp = this.world.mapParticles[i];
      if (mp.floor !== floor) continue;
      const id = `map_particle_${i}`;
      this.particles.emitContinuous(id, mp.preset, mp.x, mp.y);
      this._mapEmitterIds.push(id);
    }
  }

  updateCamera() {
    const player = this.entities.player;
    const targetX = player.x - this.canvas.width * 0.5;
    const targetY = player.y - this.canvas.height * 0.5;

    this.camera.x += (targetX - this.camera.x) * 0.11;
    this.camera.y += (targetY - this.camera.y) * 0.11;

    this.clampCamera();
  }

  clampCamera() {
    if (!this.world.width || !this.world.height) return;
    const maxX = this.world.getWorldWidth() - this.canvas.width;
    const maxY = this.world.getWorldHeight() - this.canvas.height;

    this.camera.x = clamp(this.camera.x, 0, Math.max(0, maxX));
    this.camera.y = clamp(this.camera.y, 0, Math.max(0, maxY));
  }

  render() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Snap camera to integer pixels to prevent sub-pixel shimmer on
    // all drawn entities.  The raw floats stay in this.camera for
    // smooth lerp accumulation; we only round for the draw pass.
    const cam = { x: Math.round(this.camera.x), y: Math.round(this.camera.y) };

    this.world.drawTerrain(ctx, cam, this.canvas, this.sprites);
    this.world.drawObjects(ctx, cam, this.canvas, this.sprites);
    this.combat.drawAoeIndicator(ctx, cam);
    this.entities.draw(ctx, cam, this.sprites);
    this.projectiles.draw(ctx, cam);
    this.particles.draw(ctx, cam);
    this.drawInteractionPrompt();

    // Maps — minimap always, full map when toggled
    this.minimap.drawMinimap(ctx, this.canvas.width, this.canvas.height);
    this.minimap.drawFullMap(ctx, this.canvas.width, this.canvas.height);
  }

  drawInteractionPrompt() {
    const npc = this.entities.getClosestNpcInRange();
    const statue = !npc ? this.entities.getClosestStatueInRange() : null;
    const node = (!npc && !statue) ? this.entities.getClosestResourceNodeInRange() : null;
    const target = npc || statue || node;
    if (!target || this.entities.player.dead) {
      return;
    }

    let label;
    if (npc) label = "Press E to interact";
    else if (statue) label = "Press E to attune";
    else if (node && node.active && this.gathering.active && this.gathering.nodeId === node.id) label = "Gathering... (E to stop)";
    else if (node && node.active) label = "Press E to gather";
    else if (node && !node.active) label = "Depleted";
    else return;

    const x = target.x - this.camera.x;
    const y = target.y - this.camera.y - 42;

    this.ctx.fillStyle = "rgba(10, 10, 10, 0.65)";
    this.ctx.fillRect(x - 62, y - 16, 124, 22);
    this.ctx.strokeStyle = "rgba(226, 194, 133, 0.9)";
    this.ctx.strokeRect(x - 62, y - 16, 124, 22);
    this.ctx.fillStyle = (node && !node.active) ? "#888" : "#f0d8a6";
    this.ctx.font = "12px Trebuchet MS";
    this.ctx.textAlign = "center";
    this.ctx.fillText(label, x, y);
  }

  /* ── Auto-gathering ────────────────────────────────── */

  startGathering(nodeId) {
    // Pre-check: does the player have the required tool?
    const node = this.entities.resourceNodes.find(n => n.id === nodeId);
    if (!node) return;
    const def = this.data.resourceNodeDefs?.[node.type];
    if (def) {
      const reqType = def.requiredToolType;
      const reqTier = def.requiredToolTier;
      const slots = this.entities.player.inventorySlots;
      const items = this.data.items;
      let hasTool = false;
      for (const slot of slots) {
        if (!slot || slot.type !== "tool") continue;
        const tpl = items[slot.id];
        if (tpl && tpl.toolType === reqType && tpl.toolTier >= reqTier) { hasTool = true; break; }
      }
      if (!hasTool) {
        const toolName = reqType.replace(/_/g, " ");
        this.ui.addMessage(`You need a ${toolName} (tier ${reqTier}+) to gather this.`);
        return;
      }
    }

    this.gathering.active = true;
    this.gathering.nodeId = nodeId;
    this.gathering.timer = 0;
    this.ui.showGatherBar(this.gathering.cooldown, "Gathering...");
  }

  stopGathering() {
    if (this.gathering.active) {
      this.gathering.active = false;
      this.gathering.nodeId = null;
      this.gathering.timer = 0;
      this.ui.hideGatherBar();
    }
  }

  updateGathering(dt) {
    if (!this.gathering.active) return;

    const player = this.entities.player;
    if (player.dead) { this.stopGathering(); return; }

    // Cancel if player is moving (WASD)
    const inp = this.input;
    if (inp.isDown("w","arrowup") || inp.isDown("a","arrowleft") ||
        inp.isDown("s","arrowdown") || inp.isDown("d","arrowright")) {
      this.stopGathering();
      return;
    }

    // Check node still exists, is active, and in range
    const node = this.entities.resourceNodes.find(n => n.id === this.gathering.nodeId);
    if (!node || !node.active) { this.stopGathering(); return; }
    const dx = player.x - node.x, dy = player.y - node.y;
    if (Math.sqrt(dx * dx + dy * dy) > 60) { this.stopGathering(); return; }

    // Progress timer — send gather when bar fills
    this.gathering.timer += dt;
    if (this.gathering.timer >= this.gathering.cooldown) {
      this.network.sendGather(this.gathering.nodeId);
      this.gathering.timer = 0; // reset for next cycle
    }
  }

  /* ── Crafting with progress ─────────────────────────── */

  startCrafting(recipeId) {
    const recipe = this.data.recipes?.[recipeId];
    if (!recipe) return;
    this.crafting.active = true;
    this.crafting.recipeId = recipeId;
    this.crafting.duration = recipe.craftTime;
    this.crafting.timer = 0;
    this.ui.showCraftingBar(recipe.craftTime, `Crafting ${recipe.name}...`);
  }

  stopCrafting() {
    if (this.crafting.active) {
      this.crafting.active = false;
      this.crafting.recipeId = null;
      this.crafting.timer = 0;
      this.crafting.duration = 0;
      this.ui.hideCraftingBar();
    }
  }

  updateCrafting(dt) {
    if (!this.crafting.active) return;

    const player = this.entities.player;
    if (player.dead) { this.stopCrafting(); return; }

    // Cancel if player moves
    const inp = this.input;
    if (inp.isDown("w","arrowup") || inp.isDown("a","arrowleft") ||
        inp.isDown("s","arrowdown") || inp.isDown("d","arrowright")) {
      this.stopCrafting();
      return;
    }

    this.crafting.timer += dt;
    if (this.crafting.timer >= this.crafting.duration) {
      // Timer done — send craft to server
      this.network.sendCraft(this.crafting.recipeId);
      this.crafting.active = false;
      this.crafting.timer = 0;
      this.ui.hideCraftingBar();
    }
  }

  interactWithStatue(statue) {
    const player = this.entities.player;
    const hs = player.hearthstone;

    if (hs && hs.statueId === statue.id) {
      this.ui.addMessage("Already attuned to this waystone.");
      return;
    }

    if (this.network) {
      this.network.sendAttuneHearthstone(statue.id);
    }
  }
}
