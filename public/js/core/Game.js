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
import { clamp } from "../utils.js";

export class Game {
  constructor(canvas, charData, credentials) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.charData = charData || { name: "Adventurer", charClass: "warrior", level: 1 };
    this.credentials = credentials; // { username, token }
    this.onLogout = null; // callback set by main.js

    this.world = new WorldSystem();
    this.sprites = new SpriteManager();
    this.input = new InputSystem(canvas);
    this.camera = { x: 0, y: 0 };

    this.lastFrame = performance.now();
    this._destroyed = false;
    this._rafId = null;

    this.quests = null;
    this.entities = null;
    this.combat = null;
    this.ui = null;
    this.network = null;
    this.minimap = null;
    this.audio = new AudioManager();
  }

  async init() {
    this.resizeCanvas();
    this._resizeBound = () => this.resizeCanvas();
    window.addEventListener("resize", this._resizeBound);

    // Load all data-driven JSON files in parallel
    const [items, enemies, npcs, quests] = await Promise.all([
      fetch("/data/items.json").then(r => r.json()),
      fetch("/data/enemies.json").then(r => r.json()),
      fetch("/data/npcs.json").then(r => r.json()),
      fetch("/data/quests.json").then(r => r.json())
    ]);
    this.data = { items, enemies, npcs, quests };

    // Load the starting map
    await this.world.loadMap("eldengrove");

    // Preload all sprite PNGs
    await this.sprites.load(
      this.world.globalPalette,
      Object.keys(enemies),
      Object.keys(npcs),
      Object.keys(items)
    );

    this.quests = new QuestSystem(this);
    this.quests.init();
    this.entities = new EntitySystem(this);
    this.combat = new CombatSystem(this);
    this.ui = new UISystem(this);
    this.minimap = new MinimapSystem(this);

    // Init audio (needs user gesture — canvas click counts)
    this.audio.init();

    this.entities.recalculateDerivedStats();
    this.centerCameraOnPlayer();

    // connect to multiplayer server
    this.network = new NetworkSystem(this, {
      username: this.credentials.username,
      token: this.credentials.token,
      charData: this.charData
    });
    this.network.connect();

    this.ui.addMessage("Welcome to Azerfall, a frontier of old roads and deep woods.");
    this.ui.addMessage("WASD to move. Click an enemy to target. E to interact.");
    this.ui.addMessage("I inventory, C equipment, L quest log, P character, K skills.");
    this.ui.addMessage("1 attack, 2 heal. Enter to chat. Esc for menu.");

    this._rafId = requestAnimationFrame(this._boundLoop = (t) => this.loop(t));
  }

  destroy() {
    this._destroyed = true;
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
    this.handleHotkeys();

    this.input.mouse.worldX = this.camera.x + this.input.mouse.x;
    this.input.mouse.worldY = this.camera.y + this.input.mouse.y;

    if (this.input.mouse.leftClicked) {
      this.combat.handleWorldClick(this.input.mouse.worldX, this.input.mouse.worldY);
    }

    // Smooth remote entity positions toward latest server data at 60 fps
    if (this.network) {
      this.network.interpolate(dt);
    }

    this.entities.update(dt);
    this.combat.update(dt);
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

    if (this.input.wasPressed("m")) {
      this.minimap.toggle();
    }

    if (this.input.wasPressed("1")) {
      this.combat.useAttackAbility();
    }

    if (this.input.wasPressed("2")) {
      this.combat.useMinorHeal();
    }

    if (this.input.wasPressed("e")) {
      const npc = this.entities.getClosestNpcInRange();
      if (npc) {
        this.quests.interactWithNPC(npc);
      } else {
        const statue = this.entities.getClosestStatueInRange();
        if (statue) {
          this.interactWithStatue(statue);
        } else {
          this.ui.addMessage("No one nearby to interact with.");
        }
      }
    }

    if (this.input.wasPressed("enter")) {
      this.ui.focusChat();
    }

    if (this.input.wasPressed("escape")) {
      // Close any open panels first, otherwise toggle game menu
      if (this.ui.shopOpen) {
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
    const result = this.world.checkStairs(player.x, player.y, dt);
    if (result) {
      // Teleport player to the partner stairs on the destination floor
      if (result.teleport) {
        player.x = result.teleport.x;
        player.y = result.teleport.y;
      }
      if (result.floor === 0) {
        this.ui.addMessage(`Returned to ground floor of ${result.building}.`);
      } else {
        this.ui.addMessage(`${result.action === "up" ? "Climbed" : "Descended"} to floor ${result.floor + 1} of ${result.building}.`);
      }
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
      this.ui.addMessage(`Entered ${mapId}.`);
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

  updateCamera() {
    const player = this.entities.player;
    const targetX = player.x - this.canvas.width * 0.5;
    const targetY = player.y - this.canvas.height * 0.5;

    this.camera.x += (targetX - this.camera.x) * 0.11;
    this.camera.y += (targetY - this.camera.y) * 0.11;

    this.clampCamera();
  }

  clampCamera() {
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
    this.entities.draw(ctx, cam, this.sprites);
    this.drawInteractionPrompt();

    // Maps — minimap always, full map when toggled
    this.minimap.drawMinimap(ctx, this.canvas.width, this.canvas.height);
    this.minimap.drawFullMap(ctx, this.canvas.width, this.canvas.height);
  }

  drawInteractionPrompt() {
    const npc = this.entities.getClosestNpcInRange();
    const statue = !npc ? this.entities.getClosestStatueInRange() : null;
    const target = npc || statue;
    if (!target || this.entities.player.dead) {
      return;
    }

    const label = npc ? "Press E to interact" : "Press E to attune";
    const x = target.x - this.camera.x;
    const y = target.y - this.camera.y - 42;

    this.ctx.fillStyle = "rgba(10, 10, 10, 0.65)";
    this.ctx.fillRect(x - 62, y - 16, 124, 22);
    this.ctx.strokeStyle = "rgba(226, 194, 133, 0.9)";
    this.ctx.strokeRect(x - 62, y - 16, 124, 22);
    this.ctx.fillStyle = "#f0d8a6";
    this.ctx.font = "12px Trebuchet MS";
    this.ctx.textAlign = "center";
    this.ctx.fillText(label, x, y);
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
