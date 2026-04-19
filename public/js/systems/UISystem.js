import { DragManager } from "./DragManager.js";
import { CLASSES } from "../config.js";

export class UISystem {
  constructor(game) {
    this.game = game;

    this.el = {
      hpFill: document.getElementById("hp-fill"),
      hpText: document.getElementById("hp-text"),
      manaFill: document.getElementById("mana-fill"),
      manaText: document.getElementById("mana-text"),
      xpFill: document.getElementById("xp-fill"),
      playerName: document.getElementById("player-name"),
      playerLevel: document.getElementById("player-level"),
      playerPortrait: document.getElementById("player-portrait"),
      questTracker: document.getElementById("quest-tracker"),
      inventoryPanel: document.getElementById("inventory-panel"),
      equipmentPanel: document.getElementById("equipment-panel"),
      inventoryGrid: document.getElementById("inventory-grid"),
      equipmentSlots: document.getElementById("equipment-slots"),
      goldValue: document.getElementById("gold-value"),
      messages: document.getElementById("messages"),
      deathOverlay: document.getElementById("death-overlay"),
      targetPanel: document.getElementById("target-panel"),
      targetName: document.getElementById("target-name"),
      targetHpFill: document.getElementById("target-hp-fill"),
      targetHpText: document.getElementById("target-hp-text"),
      targetLevel: document.getElementById("target-level"),
      npcDialogPanel: document.getElementById("npc-dialog-panel"),
      npcDialogName: document.getElementById("npc-dialog-name"),
      npcDialogBody: document.getElementById("npc-dialog-body"),
      npcDialogActions: document.getElementById("npc-dialog-actions"),
      gameMenuPanel: document.getElementById("game-menu-panel"),
      questLogPanel: document.getElementById("quest-log-panel"),
      questLogBody: document.getElementById("quest-log-body"),
      charSheetPanel: document.getElementById("char-sheet-panel"),
      charSheetBody: document.getElementById("char-sheet-body"),
      skillsPanel: document.getElementById("skills-panel"),
      skillsBody: document.getElementById("skills-body"),
      professionsPanel: document.getElementById("professions-panel"),
      professionsBody: document.getElementById("professions-body"),
      socialPanel: document.getElementById("social-panel"),
      socialBody: document.getElementById("social-body"),
      bankPanel: document.getElementById("bank-panel"),
      bankGrid: document.getElementById("bank-grid"),
      actionBar: document.getElementById("action-bar"),
      playerBuffs: document.getElementById("player-buffs"),
      targetDebuffs: document.getElementById("target-debuffs")
    };

    this.inventoryOpen = false;
    this.equipmentOpen = false;
    this.npcDialogOpen = false;
    this.questLogOpen = false;
    this.charSheetOpen = false;
    this.skillsOpen = false;
    this.professionsOpen = false;
    this.socialOpen = false;
    this._socialTab = "friends";
    this._blockedList = [];
    this.shopOpen = false;
    this.bankOpen = false;
    this.craftingOpen = false;
    this._craftingSkill = null;
    this._craftContinuous = false;
    this._shopNpcId = null;
    this._shopItems = [];
    this._interactNpc = null;
    this._inventoryDirty = true;
    this._equipmentDirty = true;
    this._hotbarDirty = true;
    this._bankDirty = true;

    /* ── Drag state ────────────────────────────────────── */
    this._drag = null; // { container, index, item, skillId, ghost }
    this.hotbarLocked = false;

    /* ── Context menu state ─────────────────────────────── */
    this._ctxMenu = null; // DOM element for the active context menu


    /* ── Chat state ────────────────────────────────────── */
    this.chatMessages = [];     // { channel, text, timestamp }
    this.activeChannel = "all"; // "all" | "world" | "whisper" | "system"
    this.maxChatMessages = 100;

    /* ── Loot window state ── */
    this._lootDropId = null;
    this._lootGold = 0;
    this._lootItem = null;

    /* ── Friends state ── */
    this._friendsList = [];
    this._friendsDirty = false;

    /* ── DOM listener tracking (cleaned up in destroy()) ── */
    this._domHandlers = [];

    this.initPlayerDisplay();
    this.bindButtons();
    this.bindPanelCloses();
    this.bindChat();
    this.bindChatTabs();
    this.bindGameMenu();
    this.initDraggable();
    this.initDragDrop();
    this.initInventoryContextMenu();
    this.renderHotbar();
  }

  /** Track a DOM listener so destroy() can remove it. */
  _on(el, evt, fn) {
    if (!el) return;
    el.addEventListener(evt, fn);
    this._domHandlers.push({ el, evt, fn });
  }

  destroy() {
    // Close all visible panels before removing listeners
    this.closeAllPanels();
    this._closeContextMenu();
    // Remove ALL tracked DOM listeners so they don't stack on re-enter
    for (const { el, evt, fn } of this._domHandlers) {
      el.removeEventListener(evt, fn);
    }
    this._domHandlers = [];
    if (this._onCtxDismiss) document.removeEventListener("mousedown", this._onCtxDismiss);
    if (this._onCtxEsc) document.removeEventListener("keydown", this._onCtxEsc);
    if (this.dragManager) {
      this.dragManager.destroy();
      this.dragManager = null;
    }
    this._destroyDragDrop();
  }

  closeAllPanels() {
    if (this.inventoryOpen) this.toggleInventory();
    if (this.equipmentOpen) this.toggleEquipment();
    if (this.npcDialogOpen) this.closeNpcDialog();
    if (this.shopOpen) this.closeShop();
    if (this.bankOpen) this.closeBank();
    if (this.craftingOpen) this.closeCraftingStation();
    if (this.questLogOpen) this.toggleQuestLog();
    if (this.charSheetOpen) this.toggleCharSheet();
    if (this.skillsOpen) this.toggleSkills();
    if (this.professionsOpen) this.toggleProfessions();
    if (this.socialOpen) this.toggleSocial();
    this.closeLootWindow();
    this.el.gameMenuPanel.classList.add("hidden");
    this.el.targetPanel.classList.add("hidden");
  }

  initDraggable() {
    const hud = document.getElementById("hud");
    this.dragManager = new DragManager(hud);

    // Panels with .panel-header handles
    const headerPanels = [
      "inventory-panel",
      "equipment-panel",
      "quest-log-panel",
      "char-sheet-panel",
      "skills-panel",
      "professions-panel",
      "social-panel",
      "npc-dialog-panel",
      "bank-panel"
    ];
    for (const id of headerPanels) {
      const panel = document.getElementById(id);
      if (panel) this.dragManager.makeDraggable(panel);
    }

    // Player panel — drag by itself (no header)
    const playerPanel = document.getElementById("player-panel");
    if (playerPanel) this.dragManager.makeDraggable(playerPanel, playerPanel);

    // Target panel — drag by itself
    const targetPanel = document.getElementById("target-panel");
    if (targetPanel) this.dragManager.makeDraggable(targetPanel, targetPanel);

    // Quest tracker (inside top-right-stack, pull it out to be independently draggable)
    const questPanel = document.getElementById("quest-panel");
    if (questPanel) this.dragManager.makeDraggable(questPanel);

    // Chat / message panel — drag by the tab bar
    const messagePanel = document.getElementById("message-panel");
    if (messagePanel) this.dragManager.makeDraggable(messagePanel);

    // Bottom bar — drag by XP bar area
    const bottomBar = document.getElementById("bottom-bar");
    if (bottomBar) this.dragManager.makeDraggable(bottomBar);

    // Game menu panel
    const gameMenu = document.getElementById("game-menu-panel");
    if (gameMenu) this.dragManager.makeDraggable(gameMenu);
  }

  initPlayerDisplay() {
    const charData = this.game.charData;
    this.el.playerName.textContent = charData.name;

    const classInitials = {};
    for (const [id, cls] of Object.entries(CLASSES)) classInitials[id] = cls.name.charAt(0);
    this.el.playerPortrait.textContent = classInitials[charData.charClass] || "A";
  }

  bindButtons() {
    // Hotbar slot clicks
    document.querySelectorAll("#action-bar .hotbar-slot").forEach((slot) => {
      this._on(slot, "click", () => {
        const idx = parseInt(slot.dataset.slot, 10);
        this.activateHotbarSlot(idx);
      });
      // Right-click to clear a hotbar slot
      this._on(slot, "contextmenu", (e) => {
        e.preventDefault();
        if (this.hotbarLocked) return;
        const idx = parseInt(slot.dataset.slot, 10);
        const p = this.game.entities.player;
        if (p.hotbar[idx]) {
          p.hotbar[idx] = null;
          this._hotbarDirty = true;
          this.game.network?.sendHotbarUpdate(p.hotbar);
        }
      });
    });

    // Utility bar buttons (bag, gear, quests, char, skills)
    const utilBtns = document.querySelectorAll("#utility-bar .utility-btn");
    utilBtns.forEach((button) => {
      this._on(button, "click", () => {
        this.game.audio.play("ui_click");
        const action = button.dataset.action;
        if (action === "inventory") {
          this.toggleInventory();
        } else if (action === "equipment") {
          this.toggleEquipment();
        } else if (action === "questlog") {
          this.toggleQuestLog();
        } else if (action === "charsheet") {
          this.toggleCharSheet();
        } else if (action === "skills") {
          this.toggleSkills();
        } else if (action === "professions") {
          this.toggleProfessions();
        } else if (action === "social") {
          this.toggleSocial();
        }
      });
    });
  }

  bindPanelCloses() {
    document.querySelectorAll(".panel-close").forEach((btn) => {
      this._on(btn, "click", () => {
        const target = btn.dataset.close;
        if (target === "inventory") this.toggleInventory();
        if (target === "equipment") this.toggleEquipment();
        if (target === "npc-dialog") this.closeNpcDialog();
        if (target === "quest-log") this.toggleQuestLog();
        if (target === "char-sheet") this.toggleCharSheet();
        if (target === "skills") this.toggleSkills();
        if (target === "professions") this.toggleProfessions();
        if (target === "social") this.toggleSocial();
        if (target === "bank") this.closeBank();
      });
    });
  }

  /* ── Chat system ────────────────────────────────────── */

  bindChat() {
    this.chatInput = document.getElementById("chat-input");
    if (!this.chatInput) return;

    this._on(this.chatInput, "keydown", (e) => {
      e.stopPropagation(); // prevent game hotkeys while typing

      if (e.key === "Enter") {
        const text = this.chatInput.value.trim();
        if (text && this.game.network) {
          this.game.network.sendChat(text);
        }
        this.chatInput.value = "";
        this.chatInput.blur();
      }

      if (e.key === "Escape") {
        this.chatInput.value = "";
        this.chatInput.blur();
      }
    });

    // prevent all key events from reaching the game while chat is focused
    this._on(this.chatInput, "keyup", (e) => e.stopPropagation());
    this._on(this.chatInput, "keypress", (e) => e.stopPropagation());
  }

  bindChatTabs() {
    const tabs = document.querySelectorAll(".chat-tab");
    tabs.forEach((tab) => {
      this._on(tab, "click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this.activeChannel = tab.dataset.channel;
        this.renderChatMessages();
      });
    });
  }

  focusChat() {
    if (this.chatInput) {
      this.chatInput.focus();
    }
  }

  /**
   * Add a message to the chat system with channel routing.
   * @param {"world"|"whisper"|"system"|"combat"} channel
   * @param {string} text
   */
  addChatMessage(channel, text) {
    this.chatMessages.push({ channel, text, timestamp: Date.now() });
    if (this.chatMessages.length > this.maxChatMessages) {
      this.chatMessages.shift();
    }
    this.renderChatMessages();

    // Play subtle ping for incoming whisper or world chat
    if (channel === "whisper" || channel === "world") {
      this.game.audio.play("chat_msg");
    }
  }

  /**
   * Legacy addMessage — routes to "system" channel for combat log and system messages.
   */
  addMessage(text) {
    this.addChatMessage("system", text);
  }

  renderChatMessages() {
    const container = this.el.messages;
    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 20;

    container.textContent = "";

    const filtered = this.activeChannel === "all"
      ? this.chatMessages
      : this.chatMessages.filter((m) => m.channel === this.activeChannel);

    // Show last N messages
    const toShow = filtered.slice(-50);

    for (const msg of toShow) {
      const line = document.createElement("div");
      line.className = `message-line msg-${msg.channel}`;
      line.textContent = msg.text;
      container.appendChild(line);
    }

    // Auto-scroll to bottom if user was already at bottom
    if (wasAtBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }

  /* ── NPC Dialog (separate from chat) ────────────────── */

  showNpcDialog(npcName, bodyText, actions) {
    this.npcDialogOpen = true;
    this.el.npcDialogPanel.classList.remove("hidden");
    this.el.npcDialogName.textContent = npcName;
    this.el.npcDialogBody.textContent = bodyText;

    this.el.npcDialogActions.textContent = "";
    if (actions && actions.length > 0) {
      for (const action of actions) {
        const btn = document.createElement("button");
        btn.className = "btn-primary npc-action-btn";
        btn.textContent = action.label;
        btn.addEventListener("click", () => {
          action.callback();
          if (action.closesDialog !== false) {
            this.closeNpcDialog();
          }
        });
        this.el.npcDialogActions.appendChild(btn);
      }
    }
  }

  closeNpcDialog() {
    this.npcDialogOpen = false;
    this.el.npcDialogPanel.classList.add("hidden");
    if (!this.shopOpen && !this.bankOpen && !this.craftingOpen) this._interactNpc = null;
  }

  /* ── Game Menu ──────────────────────────────────────── */

  bindGameMenu() {
    const menuBtn = document.getElementById("btn-game-menu");
    const logoutBtn = document.getElementById("btn-game-logout");
    const charSelectBtn = document.getElementById("btn-game-charselect");

    this._on(menuBtn, "click", () => {
      this.el.gameMenuPanel.classList.toggle("hidden");
      this.game.audio.play("ui_click");
    });

    this._on(charSelectBtn, "click", () => {
      this.el.gameMenuPanel.classList.add("hidden");
      this.game.logout();
    });

    this._on(logoutBtn, "click", () => {
      this.el.gameMenuPanel.classList.add("hidden");
      this.game.logoutFull();
    });

    // Sound controls
    const sfxSlider = document.getElementById("slider-sfx");
    const bgmSlider = document.getElementById("slider-bgm");
    const sfxLabel = document.getElementById("sfx-vol-label");
    const bgmLabel = document.getElementById("bgm-vol-label");
    const muteBtn = document.getElementById("btn-mute-toggle");

    this._on(sfxSlider, "input", () => {
      const v = parseInt(sfxSlider.value, 10);
      sfxLabel.textContent = v;
      this.game.audio.setSfxVolume(v / 100);
    });

    this._on(bgmSlider, "input", () => {
      const v = parseInt(bgmSlider.value, 10);
      bgmLabel.textContent = v;
      this.game.audio.setBgmVolume(v / 100);
    });

    this._on(muteBtn, "click", () => {
      const muted = this.game.audio.toggleMute();
      muteBtn.textContent = muted ? "Unmute" : "Mute";
    });

    // Lock hotbar toggle
    const lockBtn = document.getElementById("btn-lock-hotbar");
    this._on(lockBtn, "click", () => {
      this.hotbarLocked = !this.hotbarLocked;
      lockBtn.textContent = this.hotbarLocked ? "Locked" : "Unlocked";
      this.game.audio.play("ui_click");
    });

    // Lock hotbar position toggle
    const lockPosBtn = document.getElementById("btn-lock-hotbar-pos");
    this._on(lockPosBtn, "click", () => {
      this._hotbarPosLocked = !this._hotbarPosLocked;
      lockPosBtn.textContent = this._hotbarPosLocked ? "Locked" : "Unlocked";
      const bottomBar = document.getElementById("bottom-bar");
      if (bottomBar && this.dragManager) {
        if (this._hotbarPosLocked) {
          this.dragManager.lockPanel(bottomBar);
        } else {
          this.dragManager.unlockPanel(bottomBar);
        }
      }
      this.game.audio.play("ui_click");
    });

    // Label visibility toggles
    const labelKeys = ["players", "npcs", "resourceNodes", "waystones", "portals", "buildings", "floorIndicator", "hoverNames"];
    for (const key of labelKeys) {
      const btn = document.getElementById(`btn-label-${key}`);
      if (!btn) continue;
      this._on(btn, "click", () => {
        const toggles = this.game.labelToggles;
        toggles[key] = !toggles[key];
        btn.textContent = toggles[key] ? "On" : "Off";
        btn.classList.toggle("label-toggle-on", toggles[key]);
        btn.classList.toggle("label-toggle-off", !toggles[key]);
        this.game.audio.play("ui_click");
      });
    }
  }

  /* ── Panels ─────────────────────────────────────────── */

  toggleInventory() {
    this.inventoryOpen = !this.inventoryOpen;
    this.el.inventoryPanel.classList.toggle("hidden", !this.inventoryOpen);
    if (this.inventoryOpen) {
      this._inventoryDirty = true;
      this.renderInventory();
    } else {
      this._closeContextMenu();
    }
  }

  toggleEquipment() {
    this.equipmentOpen = !this.equipmentOpen;
    this.el.equipmentPanel.classList.toggle("hidden", !this.equipmentOpen);
    if (this.equipmentOpen) {
      this._equipmentDirty = true;
      this.renderEquipment();
    }
  }

  update() {
    const player = this.game.entities.player;

    // Auto-close NPC panels when player walks too far from the NPC
    if (this._interactNpc && (this.npcDialogOpen || this.shopOpen || this.bankOpen || this.craftingOpen)) {
      const dx = player.x - this._interactNpc.x;
      const dy = player.y - this._interactNpc.y;
      if (Math.sqrt(dx * dx + dy * dy) > 120) {
        if (this.npcDialogOpen) this.closeNpcDialog();
        if (this.shopOpen) this.closeShop();
        if (this.bankOpen) this.closeBank();
        if (this.craftingOpen) this.closeCraftingStation();
        this._interactNpc = null;
      }
    }

    this.el.playerLevel.textContent = `Level ${player.level}`;

    const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 0;
    const manaRatio = player.maxMana > 0 ? player.mana / player.maxMana : 0;
    const xpRatio = player.xpToLevel > 0 ? player.xp / player.xpToLevel : 0;

    this.el.hpFill.style.width = `${Math.max(0, hpRatio) * 100}%`;
    this.el.manaFill.style.width = `${Math.max(0, manaRatio) * 100}%`;
    this.el.xpFill.style.width = `${Math.max(0, xpRatio) * 100}%`;

    this.el.hpText.textContent = `${Math.round(player.hp)} / ${player.maxHp}`;
    this.el.manaText.textContent = `${Math.round(player.mana)} / ${player.maxMana}`;
    this.el.goldValue.textContent = player.gold;

    this.el.questTracker.textContent = this.game.quests.getTrackerText();
    const qp = document.getElementById("quest-panel");
    if (qp) qp.classList.toggle("hidden", !this.game.quests.showTracker);
    this.el.deathOverlay.classList.toggle("hidden", !player.dead);

    // Floor indicator
    const floorEl = document.getElementById("floor-indicator");
    if (floorEl) {
      const world = this.game.world;
      if (this.game.labelToggles.floorIndicator && world.currentFloor > 0 && world.insideBuilding) {
        floorEl.textContent = `${world.insideBuilding.name} — Floor ${world.currentFloor + 1}`;
        floorEl.classList.remove("hidden");
      } else {
        floorEl.classList.add("hidden");
      }
    }

    this.updateTargetPanel();
    this.updateCastBar();
    this.updateCraftingBar();
    this.updateGatherBar();

    // Render player buff icons
    this._renderBuffStrip(this.el.playerBuffs, player.activeBuffs || [], true);

    // Only re-render inventory/equipment when dirty to avoid DOM thrashing
    if (this.inventoryOpen && this._inventoryDirty) {
      this.renderInventory();
      this._inventoryDirty = false;
    }
    if (this.equipmentOpen && this._equipmentDirty) {
      this.renderEquipment();
      this._equipmentDirty = false;
    }
    if (this._hotbarDirty) {
      this.renderHotbar();
      this._hotbarDirty = false;
    }
    this.updateHotbarCooldowns();
    if (this.bankOpen && this._bankDirty) {
      this.renderBank();
      this._bankDirty = false;
    }
  }

  updateTargetPanel() {
    const combat = this.game.combat;
    const hpBar = this.el.targetHpFill?.parentElement;

    // Enemy target
    if (combat.targetEnemyId) {
      const target = this.game.entities.getEnemyById(combat.targetEnemyId);
      if (!target || target.dead) {
        this.el.targetPanel.classList.add("hidden");
        if (hpBar) hpBar.classList.remove("friendly");
        this._renderBuffStrip(this.el.targetDebuffs, [], false);
        return;
      }
      const ratio = target.hp / target.maxHp;
      this.el.targetPanel.classList.remove("hidden");
      this.el.targetName.textContent = target.name;
      this.el.targetHpFill.style.width = `${ratio * 100}%`;
      this.el.targetHpText.textContent = `${Math.round(target.hp)} / ${target.maxHp}`;
      if (this.el.targetLevel) this.el.targetLevel.textContent = target.level ? `Lv ${target.level}` : "";
      if (hpBar) hpBar.classList.remove("friendly");
      this._renderBuffStrip(this.el.targetDebuffs, target.debuffs || [], false);
      return;
    }

    // Player target
    if (combat.targetPlayerId) {
      const rp = this.game.entities.remotePlayers.find((p) => p.id === combat.targetPlayerId);
      if (!rp || rp.dead) {
        this.el.targetPanel.classList.add("hidden");
        if (hpBar) hpBar.classList.remove("friendly");
        this._renderBuffStrip(this.el.targetDebuffs, [], false);
        return;
      }
      const ratio = rp.maxHp > 0 ? rp.hp / rp.maxHp : 1;
      this.el.targetPanel.classList.remove("hidden");
      this.el.targetName.textContent = rp.name;
      this.el.targetHpFill.style.width = `${ratio * 100}%`;
      this.el.targetHpText.textContent = `${Math.round(rp.hp)} / ${rp.maxHp}`;
      if (this.el.targetLevel) this.el.targetLevel.textContent = rp.level ? `Lv ${rp.level}` : "";
      if (hpBar) hpBar.classList.add("friendly");
      this._renderBuffStrip(this.el.targetDebuffs, [], false);
      return;
    }

    this.el.targetPanel.classList.add("hidden");
    if (hpBar) hpBar.classList.remove("friendly");
    this._renderBuffStrip(this.el.targetDebuffs, [], false);
  }

  /* ── buff / debuff icon rendering ─────────────────── */

  _renderBuffStrip(container, entries, isBuff) {
    if (!container) return;
    const cls = isBuff ? "is-buff" : "is-debuff";
    const statusDefs = this.game.data?.statusEffects || {};

    // Fast path: if count matches, just update timers
    const existing = container.children;
    if (existing.length === entries.length) {
      let match = true;
      for (let i = 0; i < entries.length; i++) {
        if (existing[i].dataset.bid !== entries[i].id) { match = false; break; }
      }
      if (match) {
        for (let i = 0; i < entries.length; i++) {
          const timer = existing[i].querySelector(".buff-timer");
          if (timer) timer.textContent = Math.ceil(entries[i].remaining) + "s";
        }
        return;
      }
    }

    container.textContent = "";
    for (const entry of entries) {
      const def = statusDefs[entry.id];
      const el = document.createElement("div");
      el.className = `buff-icon ${cls}`;
      el.dataset.bid = entry.id;
      el.title = def?.name || entry.id;

      if (def?.icon) {
        const img = document.createElement("img");
        img.src = def.icon;
        img.alt = def.name || entry.id;
        img.className = "buff-img";
        img.draggable = false;
        el.appendChild(img);
      }

      const timer = document.createElement("span");
      timer.className = "buff-timer";
      timer.textContent = Math.ceil(entry.remaining) + "s";
      el.appendChild(timer);
      container.appendChild(el);
    }
  }

  renderInventory() {
    const slots = this.game.entities.player.inventorySlots;
    const sprites = this.game.sprites;
    this.el.inventoryGrid.textContent = "";

    slots.forEach((item, index) => {
      const slot = document.createElement("div");
      slot.className = "inventory-item";
      slot.dataset.container = "inventory";
      slot.dataset.index = index;

      if (!item) {
        slot.textContent = "";
        this.el.inventoryGrid.append(slot);
        return;
      }

      slot.classList.add("has-item");

      // Rarity color outline
      this._applyRarity(slot, item.rarity || this.game.data?.items?.[item.id]?.rarity);

      // Icon
      const icon = sprites && sprites.get(`icons/${item.icon || item.id}`);
      if (icon) {
        const img = document.createElement("img");
        img.src = icon.src;
        img.className = "item-icon";
        img.width = 28;
        img.height = 28;
        slot.append(img);
      }

      // Stack quantity badge
      if (item.qty && item.qty > 1) {
        const qtySpan = document.createElement("span");
        qtySpan.className = "stack-qty";
        qtySpan.textContent = item.qty;
        slot.append(qtySpan);
      }

      // Tooltip (always show since name is not displayed)
      slot.title = this._itemTooltipText(item);

      // Action buttons
      const btnRow = document.createElement("div");
      btnRow.className = "item-btn-row";

      // Sell button (only when shop/vendor is open, not for permanent items)
      if (this.shopOpen && !this.game.data?.items?.[item.id]?.permanent) {
        const sellButton = document.createElement("button");
        const sellPrice = Math.max(1, Math.floor((item.value || 0) / 2));
        sellButton.textContent = `Sell (${sellPrice}g)`;
        sellButton.className = "btn-sell";
        sellButton.addEventListener("click", () => {
          if (this.game.network) this.game.network.sendSellItem(index);
        });
        btnRow.append(sellButton);
      }

      // Deposit button (only when bank is open, not for permanent items)
      if (this.bankOpen && !this.game.data?.items?.[item.id]?.permanent) {
        const depositBtn = document.createElement("button");
        depositBtn.textContent = "Deposit";
        depositBtn.addEventListener("click", () => {
          if (this.game.network) this.game.network.sendBankDeposit(index);
        });
        btnRow.append(depositBtn);
      }

      slot.append(btnRow);
      this.el.inventoryGrid.append(slot);
    });
  }

  _skillTooltipText(skillDef) {
    let tip = skillDef.name;
    if (skillDef.type) tip += `  [${skillDef.type}]`;
    if (skillDef.manaCost) tip += `\nMana: ${skillDef.manaCost}`;
    if (skillDef.cooldown) tip += `\nCooldown: ${skillDef.cooldown}s`;
    if (skillDef.damage) tip += `\nDamage: ${skillDef.damage}`;
    if (skillDef.healAmount) tip += `\nHeals: ${skillDef.healAmount}`;
    if (skillDef.range) tip += `\nRange: ${skillDef.range}`;
    if (skillDef.description) tip += `\n${skillDef.description}`;
    return tip;
  }

  _applyRarity(el, rarity) {
    if (!rarity || rarity === "common") return;
    const def = this.game.data?.rarities?.[rarity];
    if (!def) return;
    el.dataset.rarity = rarity;
    el.style.setProperty("--rarity-color", def.color);
    el.style.setProperty("--rarity-glow", def.glow);
  }

  _itemTooltipText(item) {
    const STAT_LABELS = { attack: "Attack", maxHp: "HP", maxMana: "Mana", defense: "Defense" };
    let tip = item.name;
    if (item.rarity && item.rarity !== "common") {
      tip += ` (${item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)})`;
    }
    // Dynamic stat display from stats object
    if (item.stats) {
      for (const [key, val] of Object.entries(item.stats)) {
        if (val) tip += `\n${STAT_LABELS[key] || key} +${val}`;
      }
    } else {
      // Backward compat for old item format
      if (item.attackBonus) tip += `\nAttack +${item.attackBonus}`;
      if (item.hpBonus) tip += `\nHP +${item.hpBonus}`;
      if (item.manaBonus) tip += `\nMana +${item.manaBonus}`;
    }
    if (item.type === "weapon") {
      const def = this.game.data?.items?.[item.id];
      if (def?.handed) tip += ` (${def.handed === 2 ? "Two-Hand" : "One-Hand"})`;
      if (def?.requiresQuiver) tip += " [Requires Quiver]";
    }
    if (item.type === "quiver") {
      const maxArr = this.game.data?.items?.[item.id]?.maxArrows || item.maxArrows || 50;
      tip += `\nArrows: ${item.arrows ?? maxArr}/${maxArr}`;
    }
    if (item.type === "consumable") {
      const effects = item.effects || (item.effect ? [{ type: item.effect, power: item.power }] : []);
      for (const fx of effects) {
        if (fx.type === "healHp") tip += `\nRestores ${fx.power} HP`;
        else if (fx.type === "healMana") tip += `\nRestores ${fx.power} Mana`;
        else if (fx.type === "refillQuiver") tip += `\nAdds ${fx.power} arrows to quiver`;
        else if (fx.type === "buff") tip += `\n+${Math.round((fx.modifier || 0) * 100)}% ${fx.stat || fx.id} (${fx.duration}s)`;
        else if (fx.type === "debuff") tip += `\n${Math.round((fx.modifier || 0) * 100)}% ${fx.stat || fx.id} (${fx.duration}s)`;
        else if (fx.type === "hot") tip += `\nHeals ${fx.tickHeal}/tick for ${fx.duration}s`;
        else if (fx.type === "dot") tip += `\n${fx.tickDamage} dmg/tick for ${fx.duration}s`;
        else if (fx.type === "cleanse") tip += `\nCleanses negative effects`;
      }
    }
    if (item.description) tip += `\n${item.description}`;
    if (item.value) tip += `\nValue: ${item.value}g`;
    return tip;
  }

  renderEquipment() {
    const equipment = this.game.entities.player.equipment;
    const sprites = this.game.sprites;
    this.el.equipmentSlots.textContent = "";

    const rows = [
      ["Main Hand", "mainHand", equipment.mainHand],
      ["Off Hand",  "offHand",  equipment.offHand],
      ["Helmet",    "helmet",   equipment.helmet],
      ["Armor",     "armor",    equipment.armor],
      ["Pants",     "pants",    equipment.pants],
      ["Boots",     "boots",    equipment.boots],
      ["Ring 1",    "ring1",    equipment.ring1],
      ["Ring 2",    "ring2",    equipment.ring2],
      ["Amulet",    "amulet",   equipment.amulet]
    ];

    rows.forEach(([label, slot, item]) => {
      const row = document.createElement("div");
      row.className = "equip-slot";

      const labelEl = document.createElement("span");
      labelEl.className = "equip-slot-label";
      labelEl.textContent = label;

      if (item) {
        // Rarity color outline
        this._applyRarity(row, item.rarity || this.game.data?.items?.[item.id]?.rarity);

        const icon = sprites && sprites.get(`icons/${item.icon || item.id}`);
        if (icon) {
          const img = document.createElement("img");
          img.src = icon.src;
          img.className = "item-icon";
          img.width = 24;
          img.height = 24;
          row.append(img);
        }
        row.classList.add("has-equip");
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          if (this.game.network) this.game.network.sendUnequipItem(slot);
        });
      }

      const valueEl = document.createElement("span");
      valueEl.className = "equip-slot-value" + (item ? "" : " empty");
      let displayName = item ? item.name : "Empty";
      // Show arrow count for quivers
      if (item && item.type === "quiver") {
        const maxArr = this.game.data?.items?.[item.id]?.maxArrows || item.maxArrows || 50;
        displayName += ` (${item.arrows ?? maxArr}/${maxArr})`;
      }
      valueEl.textContent = displayName;

      if (item) {
        row.title = this._itemTooltipText(item) + "\nClick to unequip";
      }

      row.append(labelEl, valueEl);
      this.el.equipmentSlots.append(row);
    });
  }

  /* ── Shop UI ────────────────────────────────────────── */

  openShop(npcId, shopItemIds) {
    this._shopNpcId = npcId;
    const itemDefs = this.game.data?.items || {};
    this._shopItems = shopItemIds
      .map(id => itemDefs[id])
      .filter(Boolean);

    this.shopOpen = true;
    this._inventoryDirty = true; // re-render inventory to show sell buttons

    // Create shop panel if it doesn't exist
    let panel = document.getElementById("shop-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "shop-panel";
      panel.className = "hud-card";
      panel.innerHTML = `
        <div class="panel-header">
          <span id="shop-title">Shop</span>
          <button class="panel-close" id="shop-close-btn">X</button>
        </div>
        <div id="shop-gold-display" class="shop-gold"></div>
        <div id="shop-grid" class="shop-grid"></div>
      `;
      document.getElementById("hud").appendChild(panel);
      document.getElementById("shop-close-btn").addEventListener("click", () => this.closeShop());
      if (this.dragManager) this.dragManager.makeDraggable(panel);
    }
    panel.classList.remove("hidden");

    const npcDef = this.game.data?.npcs?.[npcId];
    document.getElementById("shop-title").textContent = npcDef ? `${npcDef.name}'s Shop` : "Shop";

    this.renderShop();
  }

  renderShop() {
    const grid = document.getElementById("shop-grid");
    if (!grid) return;

    const goldDisplay = document.getElementById("shop-gold-display");
    if (goldDisplay) {
      goldDisplay.textContent = `Your gold: ${this.game.entities.player.gold}`;
    }

    grid.textContent = "";
    const sprites = this.game.sprites;

    for (const item of this._shopItems) {
      const row = document.createElement("div");
      row.className = "shop-item";

      // Icon
      const icon = sprites && sprites.get(`icons/${item.icon || item.id}`);
      if (icon) {
        const img = document.createElement("img");
        img.src = icon.src;
        img.className = "item-icon";
        img.width = 28;
        img.height = 28;
        row.append(img);
      }

      const info = document.createElement("div");
      info.className = "shop-item-info";

      const name = document.createElement("span");
      name.className = "shop-item-name";
      name.textContent = item.name;

      const desc = document.createElement("span");
      desc.className = "shop-item-desc";
      if (item.stats && Object.keys(item.stats).length > 0) {
        const STAT_LABELS = { attack: "Attack", maxHp: "HP", maxMana: "Mana", defense: "Defense" };
        desc.textContent = Object.entries(item.stats)
          .filter(([, v]) => v)
          .map(([k, v]) => `${STAT_LABELS[k] || k} +${v}`)
          .join(", ");
      } else if (item.type === "weapon") desc.textContent = `Attack +${item.attackBonus}`;
      else if (item.type === "armor") desc.textContent = `HP +${item.hpBonus}`;
      else if (item.type === "trinket") desc.textContent = `Mana +${item.manaBonus}`;
      else if (item.type === "consumable") {
        const effects = item.effects || (item.effect ? [{ type: item.effect, power: item.power }] : []);
        const parts = effects.map(fx => {
          if (fx.type === "healHp") return `Restores ${fx.power} HP`;
          if (fx.type === "healMana") return `Restores ${fx.power} Mana`;
          if (fx.type === "refillQuiver") return `+${fx.power} arrows`;
          if (fx.type === "buff") return `+${Math.round((fx.modifier||0)*100)}% ${fx.stat||fx.id}`;
          if (fx.type === "hot") return `Heals ${fx.tickHeal}/tick`;
          if (fx.type === "cleanse") return "Cleanses";
          return fx.type;
        });
        desc.textContent = parts.join(", ");
      }

      info.append(name, desc);
      row.append(info);

      const price = document.createElement("span");
      price.className = "shop-item-price";
      price.textContent = `${item.value}g`;
      row.append(price);

      const buyBtn = document.createElement("button");
      buyBtn.textContent = "Buy";
      buyBtn.className = "btn-buy";
      const playerGold = this.game.entities.player.gold;
      if (playerGold < item.value) {
        buyBtn.disabled = true;
        buyBtn.classList.add("disabled");
      }
      buyBtn.addEventListener("click", () => {
        if (this.game.network) {
          this.game.network.sendBuyItem(item.id, this._shopNpcId);
        }
      });
      row.append(buyBtn);

      if (item.description) {
        row.title = this._itemTooltipText(item);
      }

      grid.append(row);
    }
  }

  /** Lightweight update: refresh gold text + buy button states without rebuilding DOM */
  refreshShopGold() {
    const goldDisplay = document.getElementById("shop-gold-display");
    if (goldDisplay) {
      goldDisplay.textContent = `Your gold: ${this.game.entities.player.gold}`;
    }
    const playerGold = this.game.entities.player.gold;
    const buttons = document.querySelectorAll("#shop-grid .btn-buy");
    buttons.forEach((btn, i) => {
      const item = this._shopItems[i];
      if (!item) return;
      const canAfford = playerGold >= item.value;
      btn.disabled = !canAfford;
      btn.classList.toggle("disabled", !canAfford);
    });
  }

  closeShop() {
    this.shopOpen = false;
    this._shopNpcId = null;
    this._shopItems = [];
    const panel = document.getElementById("shop-panel");
    if (panel) panel.classList.add("hidden");
    this._inventoryDirty = true; // re-render inventory to hide sell buttons
    if (!this.npcDialogOpen && !this.bankOpen && !this.craftingOpen) this._interactNpc = null;
  }

  /* ── Bank UI ────────────────────────────────────────── */

  openBank() {
    this.bankOpen = true;
    this._bankDirty = true;
    this._inventoryDirty = true; // show deposit buttons
    this.el.bankPanel.classList.remove("hidden");
    // Also open inventory if not already open
    if (!this.inventoryOpen) this.toggleInventory();
    this.renderBank();
  }

  closeBank() {
    this.bankOpen = false;
    this.el.bankPanel.classList.add("hidden");
    this._inventoryDirty = true; // hide deposit buttons
    if (!this.npcDialogOpen && !this.shopOpen && !this.craftingOpen) this._interactNpc = null;
  }

  renderBank() {
    const slots = this.game.entities.player.bank;
    const sprites = this.game.sprites;
    this.el.bankGrid.textContent = "";

    slots.forEach((item, index) => {
      const slot = document.createElement("div");
      slot.className = "bank-item";
      slot.dataset.container = "bank";
      slot.dataset.index = index;

      if (!item) {
        this.el.bankGrid.append(slot);
        return;
      }

      slot.classList.add("has-item");

      // Rarity color outline
      this._applyRarity(slot, item.rarity || this.game.data?.items?.[item.id]?.rarity);

      const icon = sprites && sprites.get(`icons/${item.icon || item.id}`);
      if (icon) {
        const img = document.createElement("img");
        img.src = icon.src;
        img.className = "item-icon";
        img.width = 28;
        img.height = 28;
        slot.append(img);
      }

      const nameSpan = document.createElement("span");
      nameSpan.className = "item-name";
      nameSpan.textContent = item.name;
      slot.append(nameSpan);

      // Stack quantity badge
      if (item.qty && item.qty > 1) {
        const qtySpan = document.createElement("span");
        qtySpan.className = "stack-qty";
        qtySpan.textContent = item.qty;
        slot.append(qtySpan);
      }

      if (item.description) {
        slot.title = this._itemTooltipText(item);
      }

      const btnRow = document.createElement("div");
      btnRow.className = "item-btn-row";
      const withdrawBtn = document.createElement("button");
      withdrawBtn.textContent = "Withdraw";
      withdrawBtn.addEventListener("click", () => {
        if (this.game.network) this.game.network.sendBankWithdraw(index);
      });
      btnRow.append(withdrawBtn);
      slot.append(btnRow);

      this.el.bankGrid.append(slot);
    });
  }

  /* ── Loot Window ──────────────────────────────────────── */

  openLootWindow(dropId, gold, item) {
    this._lootDropId = dropId;
    this._lootGold = gold || 0;
    this._lootItem = item || null;

    let panel = document.getElementById("loot-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "loot-panel";
      panel.className = "hud-card";
      panel.innerHTML = `
        <div class="panel-header">
          <span>Loot</span>
          <button class="panel-close" id="loot-close-btn">X</button>
        </div>
        <div id="loot-contents"></div>
        <button id="loot-all-btn" class="loot-all-btn">Loot All</button>
      `;
      document.getElementById("hud").appendChild(panel);
      document.getElementById("loot-close-btn").addEventListener("click", () => this.closeLootWindow());
      document.getElementById("loot-all-btn").addEventListener("click", () => {
        if (this._lootDropId && this.game.network) {
          this.game.network.sendLootTake(this._lootDropId, "all");
        }
      });
      if (this.dragManager) this.dragManager.makeDraggable(panel);
    }
    panel.classList.remove("hidden");
    this.renderLootWindow();
  }

  closeLootWindow() {
    this._lootDropId = null;
    this._lootGold = 0;
    this._lootItem = null;
    const panel = document.getElementById("loot-panel");
    if (panel) panel.classList.add("hidden");
  }

  updateLootWindow(dropId, gold, item) {
    if (this._lootDropId !== dropId) return;
    this._lootGold = gold || 0;
    this._lootItem = item || null;
    this.renderLootWindow();
  }

  renderLootWindow() {
    const contents = document.getElementById("loot-contents");
    if (!contents) return;
    contents.textContent = "";
    const sprites = this.game.sprites;

    if (this._lootGold > 0) {
      const goldRow = document.createElement("div");
      goldRow.className = "loot-slot loot-gold-slot";
      goldRow.innerHTML = `<span class="loot-gold-icon">&#x1FA99;</span> <span>${this._lootGold} Gold</span>`;
      goldRow.style.cursor = "pointer";
      goldRow.title = `Click to take ${this._lootGold} gold`;
      goldRow.addEventListener("click", () => {
        if (this._lootDropId && this.game.network) {
          this.game.network.sendLootTake(this._lootDropId, "gold");
        }
      });
      contents.append(goldRow);
    }

    if (this._lootItem) {
      const item = this._lootItem;
      const itemRow = document.createElement("div");
      itemRow.className = "loot-slot";

      this._applyRarity(itemRow, item.rarity);

      const icon = sprites && sprites.get(`icons/${item.icon || item.id}`);
      if (icon) {
        const img = document.createElement("img");
        img.src = icon.src;
        img.className = "item-icon";
        img.width = 28;
        img.height = 28;
        itemRow.append(img);
      }

      const nameSpan = document.createElement("span");
      nameSpan.className = "loot-item-name";
      nameSpan.textContent = item.name + (item.qty > 1 ? ` (x${item.qty})` : "");
      itemRow.append(nameSpan);

      itemRow.style.cursor = "pointer";
      itemRow.title = this._itemTooltipText(item) + "\nClick to take";
      itemRow.addEventListener("click", () => {
        if (this._lootDropId && this.game.network) {
          this.game.network.sendLootTake(this._lootDropId, "item");
        }
      });
      contents.append(itemRow);
    }

    if (!this._lootGold && !this._lootItem) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "loot-empty";
      emptyMsg.textContent = "Empty";
      contents.append(emptyMsg);
    }
  }

  /* ── Hotbar ─────────────────────────────────────────── */

  renderHotbar() {
    const p = this.game.entities?.player;
    if (!p) return;
    const hotbar = p.hotbar;
    const sprites = this.game.sprites;
    const itemDefs = this.game.data?.items || {};
    const skillDefs = this.game.data?.skills || {};

    const slotEls = document.querySelectorAll("#action-bar .hotbar-slot");
    slotEls.forEach((el, i) => {
      const entry = hotbar[i];
      // Clear old content except the key label
      const keySpan = el.querySelector(".hotbar-key");
      el.textContent = "";
      if (keySpan) el.append(keySpan);

      el.classList.remove("has-content");
      el.classList.remove("hotbar-unavailable");
      el.title = "";

      if (!entry) return;

      el.classList.add("has-content");

      if (entry.type === "skill") {
        const skillDef = skillDefs[entry.skillId];
        const iconName = skillDef?.icon || entry.skillId;
        const icon = sprites && sprites.get(`skills/${iconName}`);
        if (icon) {
          const img = document.createElement("img");
          img.src = icon.src;
          img.className = "hotbar-icon";
          el.insertBefore(img, keySpan);
        }
        const label = document.createElement("span");
        label.className = "hotbar-label";
        label.textContent = skillDef?.name || entry.skillId;
        el.insertBefore(label, keySpan);

        if (skillDef) el.title = this._skillTooltipText(skillDef);
      } else if (entry.type === "item") {
        const def = itemDefs[entry.itemId];
        if (def) {
          const icon = sprites && sprites.get(`icons/${def.icon || entry.itemId}`);
          if (icon) {
            const img = document.createElement("img");
            img.src = icon.src;
            img.className = "hotbar-icon";
            el.insertBefore(img, keySpan);
          }
          const label = document.createElement("span");
          label.className = "hotbar-label";
          label.textContent = def.name;
          el.insertBefore(label, keySpan);

          el.title = this._itemTooltipText(def);

          // Show qty from inventory (0 = grayed out)
          const invSlot = p.inventorySlots.find(s => s && s.id === entry.itemId);
          const totalQty = invSlot ? (invSlot.qty || 1) : 0;
          if (totalQty === 0) {
            el.classList.add("hotbar-unavailable");
            const qty = document.createElement("span");
            qty.className = "stack-qty";
            qty.textContent = "0";
            el.append(qty);
          } else {
            el.classList.remove("hotbar-unavailable");
            if (totalQty > 1) {
              const qty = document.createElement("span");
              qty.className = "stack-qty";
              qty.textContent = totalQty;
              el.append(qty);
            }
          }
        }
      }
    });
  }

  updateHotbarCooldowns() {
    const p = this.game.entities?.player;
    if (!p) return;
    const hotbar = p.hotbar;
    const skillDefs = this.game.data?.skills || {};
    const cooldowns = this.game.combat?._skillCooldowns || {};
    const now = performance.now();

    const slotEls = document.querySelectorAll("#action-bar .hotbar-slot");
    slotEls.forEach((el, i) => {
      const entry = hotbar[i];
      if (!entry) {
        el.classList.remove("hotbar-cooldown");
        const cdEl = el.querySelector(".hotbar-cd-text");
        if (cdEl) cdEl.remove();
        return;
      }

      let remaining = 0;
      if (entry.type === "skill") {
        const skillDef = skillDefs[entry.skillId];
        const cooldownMs = (skillDef?.cooldown || 0) * 1000;
        const lastUsed = cooldowns[entry.skillId] || 0;
        remaining = cooldownMs - (now - lastUsed);
      } else if (entry.type === "item" && entry.itemId === "hearthstone") {
        const start = this._hearthstoneCooldownStart || 0;
        const cdMs = this._hearthstoneCooldownMs || 0;
        remaining = cdMs - (now - start);
      }

      if (remaining > 0) {
        el.classList.add("hotbar-cooldown");
        let cdEl = el.querySelector(".hotbar-cd-text");
        if (!cdEl) {
          cdEl = document.createElement("span");
          cdEl.className = "hotbar-cd-text";
          el.appendChild(cdEl);
        }
        cdEl.textContent = Math.ceil(remaining / 1000);
      } else {
        el.classList.remove("hotbar-cooldown");
        const cdEl = el.querySelector(".hotbar-cd-text");
        if (cdEl) cdEl.remove();
      }
    });
  }

  activateHotbarSlot(index) {
    const p = this.game.entities.player;
    const entry = p.hotbar[index];
    if (!entry) return;

    if (entry.type === "skill") {
      this.game.combat.useSkill(entry.skillId);
    } else if (entry.type === "item") {
      // Find the item in inventory and use it
      const invIndex = p.inventorySlots.findIndex(s => s && s.id === entry.itemId);
      if (invIndex === -1) {
        this.addMessage("You don't have that item.");
        return;
      }
      const item = p.inventorySlots[invIndex];
      if (item.type === "consumable") {
        this.game.network?.sendUseItem(invIndex);
      } else if (item.type === "hearthstone") {
        this.game.network?.sendUseHearthstone();
      }
    }
  }

  /* ── Drag & Drop (items between inventory, bank, hotbar) ── */

  initDragDrop() {
    this._onDragMouseDown = (e) => this._handleDragStart(e);
    this._onDragMouseMove = (e) => this._handleDragMove(e);
    this._onDragMouseUp = (e) => this._handleDragEnd(e);

    document.addEventListener("mousedown", this._onDragMouseDown);
    document.addEventListener("mousemove", this._onDragMouseMove);
    document.addEventListener("mouseup", this._onDragMouseUp);
  }

  _destroyDragDrop() {
    if (this._onDragMouseDown) {
      document.removeEventListener("mousedown", this._onDragMouseDown);
      document.removeEventListener("mousemove", this._onDragMouseMove);
      document.removeEventListener("mouseup", this._onDragMouseUp);
    }
    this._cancelDrag();
  }

  _handleDragStart(e) {
    if (e.button !== 0) return;

    const p = this.game.entities.player;

    // --- Skill card ---
    const skillCard = e.target.closest("[data-drag-skill]");
    if (skillCard) {
      if (this.hotbarLocked) return;
      e.preventDefault();
      this._dragPending = { startX: e.clientX, startY: e.clientY, source: "skill", skillId: skillCard.dataset.dragSkill };
      return;
    }

    // --- Hotbar slot ---
    const hotbarEl = e.target.closest(".hotbar-slot");
    if (hotbarEl) {
      if (this.hotbarLocked) return;
      const slotIdx = parseInt(hotbarEl.dataset.slot, 10);
      const entry = p.hotbar[slotIdx];
      if (!entry) return;
      e.preventDefault();
      this._dragPending = { startX: e.clientX, startY: e.clientY, source: "hotbar", slotIdx, entry };
      return;
    }

    // --- Inventory / bank item slot ---
    const target = e.target.closest("[data-container][data-index]");
    if (!target) return;
    const container = target.dataset.container;
    const index = parseInt(target.dataset.index, 10);

    let item = null;
    if (container === "inventory") item = p.inventorySlots[index];
    else if (container === "bank") item = p.bank[index];

    if (!item) return;

    e.preventDefault();
    this._dragPending = { startX: e.clientX, startY: e.clientY, source: "item", container, index, item };
  }

  /** Promote a pending drag into an active drag with ghost element */
  _promoteDrag(e) {
    const pd = this._dragPending;
    if (!pd) return;
    const sprites = this.game.sprites;
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";

    if (pd.source === "skill") {
      const skillDef = this.game.data?.skills?.[pd.skillId];
      const iconName = skillDef?.icon || pd.skillId;
      const icon = sprites && sprites.get(`skills/${iconName}`);
      if (icon) { const img = document.createElement("img"); img.src = icon.src; ghost.append(img); }
      else { const span = document.createElement("span"); span.className = "drag-ghost-name"; span.textContent = skillDef?.name || pd.skillId; ghost.append(span); }
      ghost.style.left = `${e.clientX - 20}px`;
      ghost.style.top = `${e.clientY - 20}px`;
      document.body.append(ghost);
      this._drag = { container: "skill", index: -1, item: null, skillId: pd.skillId, ghost };
    } else if (pd.source === "hotbar") {
      if (pd.entry.type === "skill") {
        const skillDef = this.game.data?.skills?.[pd.entry.skillId];
        const iconName = skillDef?.icon || pd.entry.skillId;
        const icon = sprites && sprites.get(`skills/${iconName}`);
        if (icon) { const img = document.createElement("img"); img.src = icon.src; ghost.append(img); }
      } else if (pd.entry.type === "item") {
        const def = this.game.data?.items?.[pd.entry.itemId];
        const icon = def && sprites && sprites.get(`icons/${def.icon || pd.entry.itemId}`);
        if (icon) { const img = document.createElement("img"); img.src = icon.src; ghost.append(img); }
      }
      ghost.style.left = `${e.clientX - 20}px`;
      ghost.style.top = `${e.clientY - 20}px`;
      document.body.append(ghost);
      this._drag = { container: "hotbar", index: pd.slotIdx, item: null, skillId: null, hotbarEntry: pd.entry, ghost };
    } else if (pd.source === "item") {
      const icon = sprites && sprites.get(`icons/${pd.item.icon || pd.item.id}`);
      if (icon) { const img = document.createElement("img"); img.src = icon.src; ghost.append(img); }
      else { const span = document.createElement("span"); span.className = "drag-ghost-name"; span.textContent = pd.item.name; ghost.append(span); }
      ghost.style.left = `${e.clientX - 20}px`;
      ghost.style.top = `${e.clientY - 20}px`;
      document.body.append(ghost);
      this._drag = { container: pd.container, index: pd.index, item: pd.item, skillId: null, ghost };
    }

    this._dragPending = null;
  }

  _handleDragMove(e) {
    // Promote pending drag after 5px movement
    if (this._dragPending && !this._drag) {
      const dx = e.clientX - this._dragPending.startX;
      const dy = e.clientY - this._dragPending.startY;
      if (dx * dx + dy * dy >= 25) {
        this._promoteDrag(e);
      }
      return;
    }
    if (!this._drag) return;
    this._drag.ghost.style.left = `${e.clientX - 20}px`;
    this._drag.ghost.style.top = `${e.clientY - 20}px`;

    // Highlight drop targets
    document.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
    const dropTarget = this._getDropTarget(e);
    if (dropTarget) dropTarget.classList.add("drop-target");
  }

  _handleDragEnd(e) {
    // Click without drag – no longer auto-equips; context menu handles actions
    if (this._dragPending && !this._drag) {
      this._dragPending = null;
      return;
    }

    if (!this._drag) return;

    document.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));

    const dropTarget = this._getDropTarget(e);

    if (dropTarget) {
      const toContainer = dropTarget.dataset.container;
      const toIndex = parseInt(dropTarget.dataset.index, 10);
      const fromContainer = this._drag.container;
      const fromIndex = this._drag.index;
      const p = this.game.entities.player;

      // Handle drop on hotbar
      if (dropTarget.classList.contains("hotbar-slot") && !this.hotbarLocked) {
        const slotIdx = parseInt(dropTarget.dataset.slot, 10);

        // Skill dragged from skills panel
        if (fromContainer === "skill" && this._drag.skillId) {
          p.hotbar[slotIdx] = { type: "skill", skillId: this._drag.skillId };
          this._hotbarDirty = true;
          this.game.network?.sendHotbarUpdate(p.hotbar);
        }
        // Hotbar slot dragged to another hotbar slot (swap)
        else if (fromContainer === "hotbar") {
          const temp = p.hotbar[slotIdx];
          p.hotbar[slotIdx] = p.hotbar[fromIndex];
          p.hotbar[fromIndex] = temp;
          this._hotbarDirty = true;
          this.game.network?.sendHotbarUpdate(p.hotbar);
        }
        // Item dragged from inventory/bank
        else if (this._drag.item) {
          const item = this._drag.item;
          if (item.type === "consumable" || item.type === "hearthstone") {
            p.hotbar[slotIdx] = { type: "item", itemId: item.id };
            this._hotbarDirty = true;
            this.game.network?.sendHotbarUpdate(p.hotbar);
          }
        }
      }
      // Handle cross-container drops (inventory ↔ bank)
      else if (toContainer && fromContainer !== toContainer && fromContainer !== "skill" && fromContainer !== "hotbar") {
        this.game.network?.sendSwapItems(fromIndex, toIndex, fromContainer, toContainer);
      }
      // Handle same-container reorder (inventory ↔ inventory or bank ↔ bank)
      else if (toContainer && fromContainer === toContainer && fromIndex !== toIndex && fromContainer !== "skill" && fromContainer !== "hotbar") {
        this.game.network?.sendSwapItems(fromIndex, toIndex, fromContainer, toContainer);
      }
    }

    this._cancelDrag();
  }

  _getDropTarget(e) {
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    for (const el of elements) {
      if (el === this._drag?.ghost) continue;
      // Check hotbar slot
      if (el.classList.contains("hotbar-slot")) return el;
      // Check inventory/bank slot
      const slotEl = el.closest("[data-container][data-index]");
      if (slotEl && slotEl !== this._drag?.ghost) return slotEl;
    }
    return null;
  }

  _cancelDrag() {
    if (this._drag) {
      this._drag.ghost.remove();
      this._drag = null;
    }
    this._dragPending = null;
  }

  /* ── Inventory Context Menu ──────────────────────────── */

  initInventoryContextMenu() {
    // Close context menu on any left-click or Escape
    this._onCtxDismiss = (e) => {
      if (this._ctxMenu && !this._ctxMenu.contains(e.target)) this._closeContextMenu();
    };
    this._onCtxEsc = (e) => {
      if (e.key === "Escape") this._closeContextMenu();
    };
    document.addEventListener("mousedown", this._onCtxDismiss);
    document.addEventListener("keydown", this._onCtxEsc);

    // Right-click on inventory grid
    this._on(this.el.inventoryGrid, "contextmenu", (e) => {
      e.preventDefault();
      const slotEl = e.target.closest("[data-container='inventory'][data-index]");
      if (!slotEl) return;
      const index = parseInt(slotEl.dataset.index, 10);
      const item = this.game.entities.player.inventorySlots[index];
      if (!item) return;
      this._showItemContextMenu(e.clientX, e.clientY, index, item, "inventory");
    });

    // Right-click on bank grid
    this._on(this.el.bankGrid, "contextmenu", (e) => {
      e.preventDefault();
      const slotEl = e.target.closest("[data-container='bank'][data-index]");
      if (!slotEl) return;
      const index = parseInt(slotEl.dataset.index, 10);
      const item = this.game.entities.player.bank[index];
      if (!item) return;
      this._showItemContextMenu(e.clientX, e.clientY, index, item, "bank");
    });
  }

  _showItemContextMenu(x, y, index, item, container = "inventory") {
    this._closeContextMenu();

    const isInventory = container === "inventory";
    const EQUIPPABLE = new Set(["weapon","shield","quiver","armor","helmet","pants","boots","ring","amulet"]);
    const itemDef = this.game.data?.items?.[item.id];
    const isPermanent = itemDef?.permanent;

    const menu = document.createElement("div");
    menu.className = "item-context-menu";

    const addOption = (label, callback, cls) => {
      const opt = document.createElement("div");
      opt.className = "item-ctx-option" + (cls ? " " + cls : "");
      opt.textContent = label;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeContextMenu();
        callback();
      });
      menu.append(opt);
    };

    // Use option — consumables and hearthstone (inventory only)
    if (isInventory && item.type === "consumable") {
      addOption("Use", () => {
        if (this.game.network) this.game.network.sendUseItem(index);
      });
    } else if (isInventory && item.type === "hearthstone") {
      addOption("Use", () => {
        if (this.game.network) this.game.network.sendUseHearthstone();
      });
    }

    // Equip option — equippable gear (inventory only)
    if (isInventory && EQUIPPABLE.has(item.type)) {
      addOption("Equip", () => {
        this.game.entities.equipItemAtIndex(index);
        if (this.game.network) this.game.network.sendEquipItem(index);
        this._inventoryDirty = true;
        this._equipmentDirty = true;
      });
    }

    // Dismantle option — dismantleable items at a vendor (inventory only)
    if (isInventory && this.shopOpen && itemDef?.dismantleable) {
      addOption("Dismantle", () => {
        if (this.game.network) this.game.network.sendDismantleItem(index);
      });
    }

    // Split stack option — only for stacked items with qty > 1
    const qty = item.qty || 1;
    if (qty > 1) {
      addOption("Split Stack", () => {
        this._showSplitPopup(container, index, item);
      });
    }

    // Sell All option — when shop is open and item is stacked & sellable (inventory only)
    if (isInventory && this.shopOpen && !isPermanent && qty > 1) {
      const unitPrice = Math.max(1, Math.floor((item.value || 0) / 2));
      const totalPrice = unitPrice * qty;
      addOption(`Sell All (${totalPrice}g)`, () => {
        if (this.game.network) this.game.network.sendSellItem(index, true);
      }, "ctx-sell");
    }

    // Drop option — everything except permanent items (inventory only)
    if (isInventory && !isPermanent) {
      addOption("Drop", () => {
        if (this.game.network) this.game.network.sendDropItem(index);
      }, "ctx-danger");
    }

    // Position the menu
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    document.body.append(menu);

    // Clamp to viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;

    this._ctxMenu = menu;
  }

  _closeContextMenu() {
    if (this._ctxMenu) {
      this._ctxMenu.remove();
      this._ctxMenu = null;
    }
  }

  _showSplitPopup(container, index, item) {
    this._closeSplitPopup();
    const maxQty = (item.qty || 1) - 1; // can split off 1..qty-1
    if (maxQty < 1) return;

    const popup = document.createElement("div");
    popup.className = "split-popup";

    const title = document.createElement("div");
    title.className = "split-popup-title";
    title.textContent = `Split ${item.name}`;
    popup.append(title);

    const row = document.createElement("div");
    row.className = "split-popup-row";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = 1;
    slider.max = maxQty;
    slider.value = Math.floor(maxQty / 2) || 1;
    slider.className = "split-slider";

    const numInput = document.createElement("input");
    numInput.type = "number";
    numInput.min = 1;
    numInput.max = maxQty;
    numInput.value = slider.value;
    numInput.className = "split-num";

    slider.addEventListener("input", () => { numInput.value = slider.value; });
    numInput.addEventListener("input", () => {
      let v = parseInt(numInput.value, 10);
      if (isNaN(v) || v < 1) v = 1;
      if (v > maxQty) v = maxQty;
      slider.value = v;
    });

    row.append(slider, numInput);
    popup.append(row);

    const btnRow = document.createElement("div");
    btnRow.className = "split-popup-btns";

    const okBtn = document.createElement("button");
    okBtn.textContent = "Split";
    okBtn.className = "split-btn-ok";
    okBtn.addEventListener("click", () => {
      let v = parseInt(numInput.value, 10);
      if (isNaN(v) || v < 1) v = 1;
      if (v > maxQty) v = maxQty;
      if (this.game.network) this.game.network.sendSplitStack(container, index, v);
      this._closeSplitPopup();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "split-btn-cancel";
    cancelBtn.addEventListener("click", () => this._closeSplitPopup());

    btnRow.append(okBtn, cancelBtn);
    popup.append(btnRow);

    document.body.append(popup);
    this._splitPopup = popup;

    // Close on Escape
    this._splitEscHandler = (e) => {
      if (e.key === "Escape") this._closeSplitPopup();
    };
    document.addEventListener("keydown", this._splitEscHandler);
  }

  _closeSplitPopup() {
    if (this._splitPopup) {
      this._splitPopup.remove();
      this._splitPopup = null;
    }
    if (this._splitEscHandler) {
      document.removeEventListener("keydown", this._splitEscHandler);
      this._splitEscHandler = null;
    }
  }

  /* ── Quest Log ──────────────────────────────────────── */

  toggleQuestLog() {
    this.questLogOpen = !this.questLogOpen;
    this.el.questLogPanel.classList.toggle("hidden", !this.questLogOpen);
    if (this.questLogOpen) {
      this._questLogTab = this._questLogTab || "active";
      this.renderQuestLog();
    }
  }

  renderQuestLog() {
    const body = this.el.questLogBody;
    body.textContent = "";

    const quests = this.game.quests.quests;
    const tab = this._questLogTab || "active";

    /* ── tab bar ── */
    const tabBar = document.createElement("div");
    tabBar.className = "quest-log-tabs";

    const activeCount = Object.values(quests).filter(q => q.state !== "completed").length;
    const completedCount = Object.values(quests).filter(q => q.state === "completed").length;

    for (const [key, label, count] of [["active", "Active", activeCount], ["completed", "Completed", completedCount]]) {
      const btn = document.createElement("button");
      btn.className = `quest-log-tab${tab === key ? " quest-log-tab-active" : ""}`;
      btn.textContent = `${label} (${count})`;
      btn.addEventListener("click", () => {
        this._questLogTab = key;
        this.renderQuestLog();
      });
      tabBar.append(btn);
    }
    body.append(tabBar);

    // Show Tracker checkbox
    const trackerToggle = document.createElement("label");
    trackerToggle.className = "quest-log-tracker-toggle";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = this.game.quests.showTracker;
    cb.addEventListener("change", () => {
      this.game.quests.showTracker = cb.checked;
    });
    trackerToggle.append(cb, " Show Quest Tracker");
    body.append(trackerToggle);

    /* ── filter quests by tab ── */
    const filtered = Object.entries(quests).filter(([, q]) =>
      tab === "completed" ? q.state === "completed" : q.state !== "completed"
    );

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "quest-log-empty";
      empty.textContent = tab === "completed"
        ? "No completed quests yet."
        : "No active quests. Talk to NPCs to find work.";
      body.append(empty);
      return;
    }

    for (const [key, q] of filtered) {
      const entry = document.createElement("div");
      entry.className = "quest-log-entry";

      const title = document.createElement("div");
      title.className = "quest-log-title";

      const stateLabel = { not_started: "Available", active: "In Progress", ready_to_turn_in: "Complete", completed: "Done" };
      const stateClass = { not_started: "quest-available", active: "quest-active", ready_to_turn_in: "quest-ready", completed: "quest-done" };

      const nameSpan = document.createElement("span");
      nameSpan.className = "quest-name";
      nameSpan.textContent = q.name;

      const stateSpan = document.createElement("span");
      stateSpan.className = `quest-state ${stateClass[q.state] || ""}`;
      stateSpan.textContent = stateLabel[q.state] || q.state;

      title.append(nameSpan, document.createTextNode(" "), stateSpan);
      entry.append(title);

      // Track checkbox (active tab only)
      if (tab === "active") {
        const trackLabel = document.createElement("label");
        trackLabel.className = "quest-track-label";
        const trackCb = document.createElement("input");
        trackCb.type = "checkbox";
        trackCb.checked = q.tracked;
        trackCb.addEventListener("change", () => {
          q.tracked = trackCb.checked;
        });
        trackLabel.append(trackCb, " Track");
        entry.append(trackLabel);
      }

      const desc = document.createElement("div");
      desc.className = "quest-log-desc";
      desc.textContent = q.description;
      entry.append(desc);

      if (q.state === "active") {
        const def = this.game.quests.questDefs[key];
        if (def && def.objectives) {
          for (let i = 0; i < def.objectives.length; i++) {
            const obj = def.objectives[i];
            const current = q.progress?.[i] || 0;
            const progress = document.createElement("div");
            progress.className = "quest-log-progress";
            progress.textContent = `${obj.label}: ${current}/${obj.count}`;
            entry.append(progress);
          }
        }
      }

      if (q.state === "ready_to_turn_in") {
        const def = this.game.quests.questDefs[key];
        const giverNpc = this.game.data?.npcs?.[def?.giver];
        const giverName = giverNpc?.name || q.giver || "the quest giver";
        const hint = document.createElement("div");
        hint.className = "quest-log-progress";
        hint.textContent = `Return to ${giverName} for your reward.`;
        entry.append(hint);
      }

      // Show rewards on completed tab
      if (tab === "completed") {
        const def = this.game.quests.questDefs[key];
        const rewards = def?.rewards;
        if (rewards) {
          const rewardEl = document.createElement("div");
          rewardEl.className = "quest-log-progress";
          const parts = [];
          if (rewards.xp) parts.push(`${rewards.xp} XP`);
          if (rewards.gold) parts.push(`${rewards.gold} gold`);
          for (const itemId of (rewards.items || [])) {
            const t = this.game.data?.items?.[itemId];
            if (t) parts.push(t.name);
          }
          rewardEl.textContent = `Rewards: ${parts.join(", ")}`;
          entry.append(rewardEl);
        }
      }

      body.append(entry);
    }
  }

  /* ── Cast Bar ───────────────────────────────────────── */

  showCastBar(durationSec, label, isChannel = false) {
    let container = document.getElementById("cast-bar-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "cast-bar-container";
      container.className = "cast-bar-container";
      container.innerHTML = `
        <div class="cast-bar-label" id="cast-bar-label"></div>
        <div class="cast-bar-track">
          <div class="cast-bar-fill" id="cast-bar-fill"></div>
        </div>
      `;
      document.getElementById("hud")?.append(container);
    }

    container.classList.remove("hidden");
    container.classList.toggle("channeling", !!isChannel);
    document.getElementById("cast-bar-label").textContent = label;
    const fill = document.getElementById("cast-bar-fill");
    fill.style.width = isChannel ? "100%" : "0%";

    this._castStart = performance.now();
    this._castDuration = durationSec * 1000;
    this._castActive = true;
    this._castChannel = !!isChannel;

    // Cancel button: clicking the cast bar cancels current cast
    container.onclick = () => {
      if (this.game.network) this.game.network.sendCancelCast();
    };
  }

  hideCastBar() {
    this._castActive = false;
    this._castChannel = false;
    const container = document.getElementById("cast-bar-container");
    if (container) {
      container.classList.add("hidden");
      container.classList.remove("channeling");
    }
  }

  updateCastBar() {
    if (!this._castActive) return;
    const elapsed = performance.now() - this._castStart;
    let pct;
    if (this._castChannel) {
      pct = Math.max(0, 100 - (elapsed / this._castDuration) * 100);
    } else {
      pct = Math.min(100, (elapsed / this._castDuration) * 100);
    }
    const fill = document.getElementById("cast-bar-fill");
    if (fill) fill.style.width = `${pct}%`;
  }

  /* ── Character Sheet ────────────────────────────────── */

  toggleCharSheet() {
    this.charSheetOpen = !this.charSheetOpen;
    this.el.charSheetPanel.classList.toggle("hidden", !this.charSheetOpen);
    if (this.charSheetOpen) this.renderCharSheet();
  }

  renderCharSheet() {
    const body = this.el.charSheetBody;
    const p = this.game.entities.player;
    body.textContent = "";

    const classNames = {};
    for (const [id, cls] of Object.entries(CLASSES)) classNames[id] = cls.name;

    const stats = [
      ["Name", p.name],
      ["Class", classNames[p.charClass] || p.charClass],
      ["Level", p.level],
      ["XP", `${p.xp} / ${p.xpToLevel}`],
      ["HP", `${Math.round(p.hp)} / ${p.maxHp}`],
      ["Mana", `${Math.round(p.mana)} / ${p.maxMana}`],
      ["Damage", p.damage || p.baseDamage],
      ["Attack Range", p.attackRange],
      ["Move Speed", p.moveSpeed],
      ["Gold", p.gold]
    ];

    for (const [label, value] of stats) {
      const row = document.createElement("div");
      row.className = "char-stat-row";

      const labelEl = document.createElement("span");
      labelEl.className = "char-stat-label";
      labelEl.textContent = label;

      const valueEl = document.createElement("span");
      valueEl.className = "char-stat-value";
      valueEl.textContent = value;

      row.append(labelEl, valueEl);
      body.append(row);
    }

    // Equipment summary
    const eqHeader = document.createElement("div");
    eqHeader.className = "char-stat-header";
    eqHeader.textContent = "Equipment";
    body.append(eqHeader);

    const slots = [
      ["Main Hand", p.equipment.mainHand],
      ["Off Hand", p.equipment.offHand],
      ["Helmet", p.equipment.helmet],
      ["Armor", p.equipment.armor],
      ["Pants", p.equipment.pants],
      ["Boots", p.equipment.boots],
      ["Ring 1", p.equipment.ring1],
      ["Ring 2", p.equipment.ring2],
      ["Amulet", p.equipment.amulet]
    ];

    for (const [slot, item] of slots) {
      const row = document.createElement("div");
      row.className = "char-stat-row";

      const labelEl = document.createElement("span");
      labelEl.className = "char-stat-label";
      labelEl.textContent = slot;

      const valueEl = document.createElement("span");
      valueEl.className = "char-stat-value" + (item ? "" : " empty");
      valueEl.textContent = item ? item.name : "Empty";

      row.append(labelEl, valueEl);
      body.append(row);
    }
  }

  /* ── Skills Window ──────────────────────────────────── */

  toggleSkills() {
    this.skillsOpen = !this.skillsOpen;
    this.el.skillsPanel.classList.toggle("hidden", !this.skillsOpen);
    if (this.skillsOpen) this.renderSkills();
  }

  renderSkills() {
    const body = this.el.skillsBody;
    const p = this.game.entities.player;
    body.textContent = "";

    const allSkills = this.game.data.skills || {};

    // Filter skills available to this class and level
    const skills = Object.values(allSkills).filter(s =>
      (!s.classes || s.classes.includes(p.charClass)) && p.level >= (s.levelReq || 1)
    );

    for (const skill of skills) {
      const card = document.createElement("div");
      card.className = "skill-card";
      card.dataset.dragSkill = skill.id;
      card.style.cursor = "grab";

      const header = document.createElement("div");
      header.className = "skill-header";

      const iconName = skill.icon || skill.id;
      const iconImg = this.game.sprites && this.game.sprites.get(`skills/${iconName}`);
      if (iconImg) {
        const img = document.createElement("img");
        img.src = iconImg.src;
        img.className = "skill-panel-icon";
        header.append(img);
      }

      const skillNameSpan = document.createElement("span");
      skillNameSpan.className = "skill-name";
      skillNameSpan.textContent = skill.name;

      const skillTypeSpan = document.createElement("span");
      skillTypeSpan.className = "skill-key";
      skillTypeSpan.textContent = `[${skill.type}]`;

      header.append(skillNameSpan, skillTypeSpan);

      const desc = document.createElement("div");
      desc.className = "skill-desc";
      desc.textContent = skill.description;

      const meta = document.createElement("div");
      meta.className = "skill-cooldown";
      const parts = [];
      if (skill.id === "attack") {
        parts.push(`CD: ${p.attackCooldown}s`);
      } else if (skill.cooldown) {
        parts.push(`CD: ${skill.cooldown}s`);
      }
      if (skill.manaCost) parts.push(`Mana: ${skill.manaCost}`);
      if (skill.range) parts.push(`Range: ${skill.range}`);
      if (skill.levelReq > 1) parts.push(`Lv ${skill.levelReq}`);
      meta.textContent = parts.join(" · ");

      card.append(header, desc, meta);
      body.append(card);
    }
  }

  /* ── Crafting Station UI ───────────────────────────── */

  openCraftingStation(skillId) {
    this._craftingSkill = skillId;
    this.craftingOpen = true;

    let panel = document.getElementById("crafting-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "crafting-panel";
      panel.className = "hud-card";
      panel.innerHTML = `
        <div class="panel-header">
          <span id="crafting-title">Crafting</span>
          <button class="panel-close" id="crafting-close-btn">X</button>
        </div>
        <div id="crafting-skill-info" class="crafting-skill-info"></div>
        <div id="crafting-progress" class="crafting-progress hidden">
          <div class="crafting-progress-label" id="crafting-progress-label"></div>
          <div class="crafting-progress-track">
            <div class="crafting-progress-fill" id="crafting-progress-fill"></div>
          </div>
        </div>
        <label class="crafting-continuous" id="crafting-continuous-label">
          <input type="checkbox" id="crafting-continuous-cb" /> Continuous
        </label>
        <div id="crafting-grid" class="crafting-grid"></div>
      `;
      document.getElementById("hud").appendChild(panel);
      document.getElementById("crafting-close-btn").addEventListener("click", () => this.closeCraftingStation());
      document.getElementById("crafting-continuous-cb").addEventListener("change", (e) => {
        this._craftContinuous = e.target.checked;
      });
      if (this.dragManager) this.dragManager.makeDraggable(panel);
    }
    panel.classList.remove("hidden");

    // Restore continuous toggle state
    const cb = document.getElementById("crafting-continuous-cb");
    if (cb) cb.checked = this._craftContinuous;

    const skillDef = this.game.data.gatheringSkills?.[skillId];
    document.getElementById("crafting-title").textContent = skillDef ? skillDef.name : "Crafting";

    this.renderCraftingPanel();
  }

  renderCraftingPanel() {
    const skillId = this._craftingSkill;
    if (!skillId) return;

    const recipes = this.game.data.recipes || {};
    const items = this.game.data.items || {};
    const player = this.game.entities.player;
    const playerSkill = player.gatheringSkills?.[skillId] || { level: 1, xp: 0 };
    const sprites = this.game.sprites;

    // Show skill level info
    const skillInfo = document.getElementById("crafting-skill-info");
    if (skillInfo) {
      const xpNeeded = Math.floor(50 * Math.pow(1.5, playerSkill.level - 1));
      skillInfo.textContent = `Level ${playerSkill.level}  ·  ${playerSkill.xp} / ${xpNeeded} XP`;
    }

    const grid = document.getElementById("crafting-grid");
    if (!grid) return;
    grid.textContent = "";

    // Filter recipes for this skill
    const skillRecipes = Object.values(recipes).filter(r => r.skill === skillId);
    skillRecipes.sort((a, b) => a.requiredLevel - b.requiredLevel);

    for (const recipe of skillRecipes) {
      const row = document.createElement("div");
      row.className = "crafting-item";

      const locked = playerSkill.level < recipe.requiredLevel;

      // Output icon
      const outDef = items[recipe.output.id];
      const icon = sprites && sprites.get(`icons/${outDef?.icon || recipe.output.id}`);
      if (icon) {
        const img = document.createElement("img");
        img.src = icon.src;
        img.className = "item-icon";
        img.width = 28;
        img.height = 28;
        row.append(img);
      }

      const info = document.createElement("div");
      info.className = "crafting-item-info";

      const nameLine = document.createElement("span");
      nameLine.className = "crafting-item-name";
      nameLine.textContent = recipe.name;
      if (locked) nameLine.style.color = "var(--text-muted)";

      // Input requirements line
      const inputLine = document.createElement("span");
      inputLine.className = "crafting-item-inputs";
      const inputParts = [];
      let canCraft = !locked;
      for (const [itemId, qtyNeeded] of Object.entries(recipe.input)) {
        let have = 0;
        for (const slot of player.inventorySlots) {
          if (slot && slot.id === itemId) have += (slot.qty || 1);
        }
        const tpl = items[itemId];
        const iName = tpl?.name || itemId;
        const enough = have >= qtyNeeded;
        if (!enough) canCraft = false;
        inputParts.push(`<span style="color:${enough ? "var(--text-main)" : "#cc4444"}">${have}/${qtyNeeded} ${iName}</span>`);
      }
      inputLine.innerHTML = inputParts.join(", ");

      info.append(nameLine, inputLine);
      row.append(info);

      // XP + level info
      const meta = document.createElement("span");
      meta.className = "crafting-item-meta";
      meta.textContent = locked ? `Lv ${recipe.requiredLevel}` : `+${recipe.xp} XP`;
      row.append(meta);

      // Craft button
      const craftBtn = document.createElement("button");
      craftBtn.textContent = locked ? "🔒" : "Craft";
      craftBtn.className = "btn-craft";
      const isCrafting = this.game.crafting.active;
      if (!canCraft || isCrafting) {
        craftBtn.disabled = true;
        craftBtn.classList.add("disabled");
      }
      craftBtn.addEventListener("click", () => {
        if (this.game.network && canCraft && !this.game.crafting.active) {
          this.game.startCrafting(recipe.id);
        }
      });
      row.append(craftBtn);

      if (outDef?.description) {
        row.title = outDef.description;
      }

      grid.append(row);
    }
  }

  closeCraftingStation() {
    this.craftingOpen = false;
    this._craftingSkill = null;
    if (this.game.crafting.active) this.game.stopCrafting();
    const panel = document.getElementById("crafting-panel");
    if (panel) panel.classList.add("hidden");
    if (!this.npcDialogOpen && !this.shopOpen && !this.bankOpen) this._interactNpc = null;
  }

  showCraftingBar(durationSec, label) {
    const container = document.getElementById("crafting-progress");
    if (!container) return;
    container.classList.remove("hidden");
    document.getElementById("crafting-progress-label").textContent = label;
    const fill = document.getElementById("crafting-progress-fill");
    if (fill) fill.style.width = "0%";
  }

  hideCraftingBar() {
    const container = document.getElementById("crafting-progress");
    if (container) container.classList.add("hidden");
  }

  updateCraftingBar() {
    if (!this.game.crafting.active) return;
    const { timer, duration } = this.game.crafting;
    const pct = Math.min(100, (timer / duration) * 100);
    const fill = document.getElementById("crafting-progress-fill");
    if (fill) fill.style.width = `${pct}%`;
  }

  /** Called from NetworkSystem when a craft succeeds — triggers continuous crafting if enabled */
  onCraftSuccess(recipeId) {
    if (this._craftContinuous && this.craftingOpen) {
      // Check if we still have resources for another craft
      const recipe = this.game.data.recipes?.[recipeId];
      if (recipe) {
        const player = this.game.entities.player;
        const items = this.game.data.items || {};
        let canCraft = true;
        const playerSkill = player.gatheringSkills?.[recipe.skill] || { level: 1 };
        if (playerSkill.level < recipe.requiredLevel) canCraft = false;
        for (const [itemId, qtyNeeded] of Object.entries(recipe.input)) {
          let have = 0;
          for (const slot of player.inventorySlots) {
            if (slot && slot.id === itemId) have += (slot.qty || 1);
          }
          if (have < qtyNeeded) canCraft = false;
        }
        if (canCraft) {
          this.game.startCrafting(recipeId);
          return;
        }
      }
    }
  }

  /* ── Gathering progress bar (on-screen) ────────────── */

  showGatherBar(durationSec, label) {
    let container = document.getElementById("gather-bar-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "gather-bar-container";
      container.className = "gather-bar-container";
      container.innerHTML = `
        <div class="gather-bar-label" id="gather-bar-label"></div>
        <div class="gather-bar-track">
          <div class="gather-bar-fill" id="gather-bar-fill"></div>
        </div>
      `;
      document.getElementById("hud")?.append(container);
    }
    container.classList.remove("hidden");
    document.getElementById("gather-bar-label").textContent = label;
    const fill = document.getElementById("gather-bar-fill");
    if (fill) fill.style.width = "0%";
  }

  hideGatherBar() {
    const container = document.getElementById("gather-bar-container");
    if (container) container.classList.add("hidden");
  }

  updateGatherBar() {
    if (!this.game.gathering.active) return;
    const { timer, cooldown } = this.game.gathering;
    const pct = Math.min(100, (timer / cooldown) * 100);
    const fill = document.getElementById("gather-bar-fill");
    if (fill) fill.style.width = `${pct}%`;
  }

  /* ── Player context menu (right-click)  ───────────── */

  showPlayerContextMenu(x, y, player) {
    this._closeContextMenu();

    const menu = document.createElement("div");
    menu.className = "item-context-menu player-context-menu";

    const header = document.createElement("div");
    header.className = "player-ctx-header";
    header.textContent = player.name;
    menu.append(header);

    const addOption = (label, callback) => {
      const opt = document.createElement("div");
      opt.className = "item-ctx-option";
      opt.textContent = label;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeContextMenu();
        callback();
      });
      menu.append(opt);
    };

    addOption("Whisper", () => {
      this.startWhisperTo(player.name);
    });

    addOption("Add Friend", () => {
      this.game.network?.sendFriendRequest(player.name);
    });

    addOption("Block", () => {
      this.game.network?.sendBlockPlayer(player.name);
    });

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    document.body.append(menu);

    // Clamp to viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;

    this._ctxMenu = menu;
  }

  startWhisperTo(name) {
    if (this.chatInput) {
      this.chatInput.value = `/w ${name} `;
      this.chatInput.focus();
    }
  }

  /* ── Professions panel ─────────────────────────────── */

  toggleProfessions() {
    this.professionsOpen = !this.professionsOpen;
    this.el.professionsPanel.classList.toggle("hidden", !this.professionsOpen);
    if (this.professionsOpen) this.renderProfessions();
  }

  renderProfessions() {
    const body = this.el.professionsBody;
    const p = this.game.entities.player;
    body.textContent = "";

    const skillDefs = this.game.data.gatheringSkills || {};
    const playerSkills = p.gatheringSkills || {};

    for (const [id, def] of Object.entries(skillDefs)) {
      const ps = playerSkills[id] || { level: 1, xp: 0 };
      const xpNeeded = Math.floor(50 * Math.pow(1.5, ps.level - 1));
      const pct = Math.min(100, (ps.xp / xpNeeded) * 100);

      const card = document.createElement("div");
      card.className = "profession-card";

      const header = document.createElement("div");
      header.className = "profession-header";

      const name = document.createElement("span");
      name.className = "profession-name";
      name.textContent = def.name;

      const level = document.createElement("span");
      level.className = "profession-level";
      level.textContent = `Level ${ps.level}`;

      header.append(name, level);

      const desc = document.createElement("div");
      desc.className = "profession-desc";
      desc.textContent = def.description;

      const barWrap = document.createElement("div");
      barWrap.className = "profession-xp-bar";

      const fill = document.createElement("div");
      fill.className = "profession-xp-fill";
      fill.style.width = `${pct}%`;

      barWrap.append(fill);

      const label = document.createElement("div");
      label.className = "profession-xp-label";
      label.textContent = `${ps.xp} / ${xpNeeded} XP`;

      card.append(header, desc, barWrap, label);
      body.append(card);
    }
  }

  /* ── Social Panel (Friends + Blocked) ─────────────── */

  toggleSocial() {
    this.socialOpen = !this.socialOpen;
    this.el.socialPanel.classList.toggle("hidden", !this.socialOpen);
    if (this.socialOpen) {
      this.game.network?.sendFriendListRequest();
      this.game.network?.sendBlockListRequest();
      this.renderSocialContent();
    }
  }

  renderSocialContent() {
    const body = this.el.socialBody;
    body.textContent = "";

    /* ── Tab bar ── */
    const tabs = document.createElement("div");
    tabs.className = "social-tabs";

    const friendsTab = document.createElement("button");
    friendsTab.className = `social-tab ${this._socialTab === "friends" ? "active" : ""}`;
    friendsTab.textContent = "Friends";
    friendsTab.addEventListener("click", () => {
      this._socialTab = "friends";
      this.renderSocialContent();
    });

    const blockedTab = document.createElement("button");
    blockedTab.className = `social-tab ${this._socialTab === "blocked" ? "active" : ""}`;
    blockedTab.textContent = "Blocked";
    blockedTab.addEventListener("click", () => {
      this._socialTab = "blocked";
      this.renderSocialContent();
    });

    tabs.append(friendsTab, blockedTab);
    body.append(tabs);

    if (this._socialTab === "friends") {
      this._renderFriendsTab(body);
    } else {
      this._renderBlockedTab(body);
    }
  }

  _renderFriendsTab(body) {
    /* ── Add friend input ── */
    const addRow = document.createElement("div");
    addRow.className = "friends-add-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "friends-add-input";
    input.placeholder = "Character name...";
    input.maxLength = 16;
    input.addEventListener("keydown", (e) => e.stopPropagation());
    input.addEventListener("keyup", (e) => e.stopPropagation());
    input.addEventListener("keypress", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const name = input.value.trim();
        if (name) {
          this.game.network?.sendFriendRequest(name);
          input.value = "";
        }
      }
    });

    const addBtn = document.createElement("button");
    addBtn.className = "friends-add-btn";
    addBtn.textContent = "Add";
    addBtn.addEventListener("click", () => {
      const name = input.value.trim();
      if (name) {
        this.game.network?.sendFriendRequest(name);
        input.value = "";
      }
    });

    addRow.append(input, addBtn);
    body.append(addRow);

    /* ── Categorize friends ── */
    const friends = this._friendsList || [];
    const accepted = friends.filter(f => f.status === "accepted");
    const pendingIn = friends.filter(f => f.status === "pending" && f.direction === "received");
    const pendingSent = friends.filter(f => f.status === "pending" && f.direction === "sent");

    /* ── Pending incoming requests ── */
    if (pendingIn.length > 0) {
      const header = document.createElement("div");
      header.className = "friends-section-header";
      header.textContent = `Pending Requests (${pendingIn.length})`;
      body.append(header);

      for (const f of pendingIn) {
        const row = document.createElement("div");
        row.className = "friend-row friend-pending";

        const name = document.createElement("span");
        name.className = "friend-name";
        name.textContent = f.username;

        const actions = document.createElement("span");
        actions.className = "friend-actions";

        const acceptBtn = document.createElement("button");
        acceptBtn.className = "friend-btn friend-accept-btn";
        acceptBtn.textContent = "✓";
        acceptBtn.title = "Accept";
        acceptBtn.addEventListener("click", () => {
          this.game.network?.sendFriendAccept(f.username);
        });

        const rejectBtn = document.createElement("button");
        rejectBtn.className = "friend-btn friend-reject-btn";
        rejectBtn.textContent = "✕";
        rejectBtn.title = "Reject";
        rejectBtn.addEventListener("click", () => {
          this.game.network?.sendFriendReject(f.username);
        });

        actions.append(acceptBtn, rejectBtn);
        row.append(name, actions);
        body.append(row);
      }
    }

    /* ── Accepted friends ── */
    const onlineFriends = accepted.filter(f => f.online).sort((a, b) => a.charName?.localeCompare(b.charName));
    const offlineFriends = accepted.filter(f => !f.online).sort((a, b) => a.username.localeCompare(b.username));

    if (accepted.length > 0 || pendingIn.length === 0) {
      const header = document.createElement("div");
      header.className = "friends-section-header";
      header.textContent = `Friends (${onlineFriends.length}/${accepted.length} online)`;
      body.append(header);
    }

    for (const f of [...onlineFriends, ...offlineFriends]) {
      const row = document.createElement("div");
      row.className = `friend-row ${f.online ? "friend-online" : "friend-offline"}`;

      const statusDot = document.createElement("span");
      statusDot.className = `friend-status-dot ${f.online ? "online" : "offline"}`;

      const info = document.createElement("span");
      info.className = "friend-info";

      const charName = document.createElement("span");
      charName.className = "friend-name";
      charName.textContent = f.online && f.charName ? f.charName : f.username;

      info.append(charName);

      if (f.online && f.charName) {
        const detail = document.createElement("span");
        detail.className = "friend-detail";
        detail.textContent = ` Lv.${f.charLevel} ${(f.charClass || "").charAt(0).toUpperCase() + (f.charClass || "").slice(1)}`;
        info.append(detail);
      }

      const actions = document.createElement("span");
      actions.className = "friend-actions";

      if (f.online && f.charName) {
        const whisperBtn = document.createElement("button");
        whisperBtn.className = "friend-btn friend-whisper-btn";
        whisperBtn.textContent = "💬";
        whisperBtn.title = "Whisper";
        whisperBtn.addEventListener("click", () => {
          this.startWhisperTo(f.charName);
        });
        actions.append(whisperBtn);
      }

      const removeBtn = document.createElement("button");
      removeBtn.className = "friend-btn friend-remove-btn";
      removeBtn.textContent = "✕";
      removeBtn.title = "Remove friend";
      removeBtn.addEventListener("click", () => {
        this.game.network?.sendFriendRemove(f.username);
      });

      actions.append(removeBtn);
      row.append(statusDot, info, actions);
      body.append(row);
    }

    /* ── Pending sent ── */
    if (pendingSent.length > 0) {
      const header = document.createElement("div");
      header.className = "friends-section-header";
      header.textContent = `Sent Requests (${pendingSent.length})`;
      body.append(header);

      for (const f of pendingSent) {
        const row = document.createElement("div");
        row.className = "friend-row friend-pending-sent";

        const name = document.createElement("span");
        name.className = "friend-name";
        name.textContent = f.username;

        const label = document.createElement("span");
        label.className = "friend-pending-label";
        label.textContent = "Pending...";

        row.append(name, label);
        body.append(row);
      }
    }

    if (friends.length === 0) {
      const empty = document.createElement("div");
      empty.className = "friends-empty";
      empty.textContent = "No friends yet. Add one above!";
      body.append(empty);
    }
  }

  _renderBlockedTab(body) {
    /* ── Block player input ── */
    const addRow = document.createElement("div");
    addRow.className = "friends-add-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "friends-add-input";
    input.placeholder = "Character name...";
    input.maxLength = 16;
    input.addEventListener("keydown", (e) => e.stopPropagation());
    input.addEventListener("keyup", (e) => e.stopPropagation());
    input.addEventListener("keypress", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const name = input.value.trim();
        if (name) {
          this.game.network?.sendBlockPlayer(name);
          input.value = "";
        }
      }
    });

    const blockBtn = document.createElement("button");
    blockBtn.className = "friends-add-btn";
    blockBtn.textContent = "Block";
    blockBtn.addEventListener("click", () => {
      const name = input.value.trim();
      if (name) {
        this.game.network?.sendBlockPlayer(name);
        input.value = "";
      }
    });

    addRow.append(input, blockBtn);
    body.append(addRow);

    /* ── Blocked list ── */
    const blocked = this._blockedList || [];

    if (blocked.length === 0) {
      const empty = document.createElement("div");
      empty.className = "friends-empty";
      empty.textContent = "No blocked players.";
      body.append(empty);
      return;
    }

    const header = document.createElement("div");
    header.className = "friends-section-header";
    header.textContent = `Blocked (${blocked.length})`;
    body.append(header);

    for (const b of blocked) {
      const row = document.createElement("div");
      row.className = "friend-row blocked-row";

      const name = document.createElement("span");
      name.className = "friend-name";
      name.textContent = b.blockedUsername;

      const actions = document.createElement("span");
      actions.className = "friend-actions";

      const unblockBtn = document.createElement("button");
      unblockBtn.className = "friend-btn friend-reject-btn";
      unblockBtn.textContent = "✕";
      unblockBtn.title = "Unblock";
      unblockBtn.addEventListener("click", () => {
        this.game.network?.sendUnblockPlayer(b.blockedUsername);
      });

      actions.append(unblockBtn);
      row.append(name, actions);
      body.append(row);
    }
  }
}