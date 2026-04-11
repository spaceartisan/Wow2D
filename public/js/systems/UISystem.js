import { DragManager } from "./DragManager.js";

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
      skillsBody: document.getElementById("skills-body")
    };

    this.inventoryOpen = false;
    this.equipmentOpen = false;
    this.npcDialogOpen = false;
    this.questLogOpen = false;
    this.charSheetOpen = false;
    this.skillsOpen = false;
    this.shopOpen = false;
    this._shopNpcId = null;
    this._shopItems = [];
    this._inventoryDirty = true;
    this._equipmentDirty = true;

    /* ── Chat state ────────────────────────────────────── */
    this.chatMessages = [];     // { channel, text, timestamp }
    this.activeChannel = "all"; // "all" | "world" | "whisper" | "system"
    this.maxChatMessages = 100;

    this.initPlayerDisplay();
    this.bindButtons();
    this.bindPanelCloses();
    this.bindChat();
    this.bindChatTabs();
    this.bindGameMenu();
    this.initDraggable();
  }

  destroy() {
    if (this.dragManager) {
      this.dragManager.destroy();
      this.dragManager = null;
    }
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
      "npc-dialog-panel"
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

    const classInitials = { warrior: "W", mage: "M", rogue: "R" };
    this.el.playerPortrait.textContent = classInitials[charData.charClass] || "A";
  }

  bindButtons() {
    // Action bar buttons (attack, heal)
    const actionBtns = document.querySelectorAll("#action-bar .action-btn");
    actionBtns.forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        if (action === "attack") {
          this.game.combat.useAttackAbility();
        } else if (action === "heal") {
          this.game.combat.useMinorHeal();
        }
      });
    });

    // Utility bar buttons (bag, gear, quests, char, skills)
    const utilBtns = document.querySelectorAll("#utility-bar .utility-btn");
    utilBtns.forEach((button) => {
      button.addEventListener("click", () => {
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
        }
      });
    });
  }

  bindPanelCloses() {
    document.querySelectorAll(".panel-close").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.close;
        if (target === "inventory") this.toggleInventory();
        if (target === "equipment") this.toggleEquipment();
        if (target === "npc-dialog") this.closeNpcDialog();
        if (target === "quest-log") this.toggleQuestLog();
        if (target === "char-sheet") this.toggleCharSheet();
        if (target === "skills") this.toggleSkills();
      });
    });
  }

  /* ── Chat system ────────────────────────────────────── */

  bindChat() {
    this.chatInput = document.getElementById("chat-input");
    if (!this.chatInput) return;

    this.chatInput.addEventListener("keydown", (e) => {
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
    this.chatInput.addEventListener("keyup", (e) => e.stopPropagation());
    this.chatInput.addEventListener("keypress", (e) => e.stopPropagation());
  }

  bindChatTabs() {
    const tabs = document.querySelectorAll(".chat-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
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
    this.addChatMessage("combat", text);
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
  }

  /* ── Game Menu ──────────────────────────────────────── */

  bindGameMenu() {
    const menuBtn = document.getElementById("btn-game-menu");
    const logoutBtn = document.getElementById("btn-game-logout");
    const charSelectBtn = document.getElementById("btn-game-charselect");

    if (menuBtn) {
      menuBtn.addEventListener("click", () => {
        this.el.gameMenuPanel.classList.toggle("hidden");
        this.game.audio.play("ui_click");
      });
    }

    if (charSelectBtn) {
      charSelectBtn.addEventListener("click", () => {
        this.el.gameMenuPanel.classList.add("hidden");
        this.game.logout();
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        this.el.gameMenuPanel.classList.add("hidden");
        this.game.logoutFull();
      });
    }

    // Sound controls
    const sfxSlider = document.getElementById("slider-sfx");
    const bgmSlider = document.getElementById("slider-bgm");
    const sfxLabel = document.getElementById("sfx-vol-label");
    const bgmLabel = document.getElementById("bgm-vol-label");
    const muteBtn = document.getElementById("btn-mute-toggle");

    if (sfxSlider) {
      sfxSlider.addEventListener("input", () => {
        const v = parseInt(sfxSlider.value, 10);
        sfxLabel.textContent = v;
        this.game.audio.setSfxVolume(v / 100);
      });
    }

    if (bgmSlider) {
      bgmSlider.addEventListener("input", () => {
        const v = parseInt(bgmSlider.value, 10);
        bgmLabel.textContent = v;
        this.game.audio.setBgmVolume(v / 100);
      });
    }

    if (muteBtn) {
      muteBtn.addEventListener("click", () => {
        const muted = this.game.audio.toggleMute();
        muteBtn.textContent = muted ? "Unmute" : "Mute";
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
      if (world.currentFloor > 0 && world.insideBuilding) {
        floorEl.textContent = `${world.insideBuilding.name} — Floor ${world.currentFloor + 1}`;
        floorEl.classList.remove("hidden");
      } else {
        floorEl.classList.add("hidden");
      }
    }

    this.updateTargetPanel();
    this.updateCastBar();

    // Only re-render inventory/equipment when dirty to avoid DOM thrashing
    if (this.inventoryOpen && this._inventoryDirty) {
      this.renderInventory();
      this._inventoryDirty = false;
    }
    if (this.equipmentOpen && this._equipmentDirty) {
      this.renderEquipment();
      this._equipmentDirty = false;
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
        return;
      }
      const ratio = target.hp / target.maxHp;
      this.el.targetPanel.classList.remove("hidden");
      this.el.targetName.textContent = target.name;
      this.el.targetHpFill.style.width = `${ratio * 100}%`;
      this.el.targetHpText.textContent = `${Math.round(target.hp)} / ${target.maxHp}`;
      if (this.el.targetLevel) this.el.targetLevel.textContent = target.level ? `Lv ${target.level}` : "";
      if (hpBar) hpBar.classList.remove("friendly");
      return;
    }

    // Player target
    if (combat.targetPlayerId) {
      const rp = this.game.entities.remotePlayers.find((p) => p.id === combat.targetPlayerId);
      if (!rp || rp.dead) {
        this.el.targetPanel.classList.add("hidden");
        if (hpBar) hpBar.classList.remove("friendly");
        return;
      }
      const ratio = rp.maxHp > 0 ? rp.hp / rp.maxHp : 1;
      this.el.targetPanel.classList.remove("hidden");
      this.el.targetName.textContent = rp.name;
      this.el.targetHpFill.style.width = `${ratio * 100}%`;
      this.el.targetHpText.textContent = `${Math.round(rp.hp)} / ${rp.maxHp}`;
      if (this.el.targetLevel) this.el.targetLevel.textContent = rp.level ? `Lv ${rp.level}` : "";
      if (hpBar) hpBar.classList.add("friendly");
      return;
    }

    this.el.targetPanel.classList.add("hidden");
    if (hpBar) hpBar.classList.remove("friendly");
  }

  renderInventory() {
    const slots = this.game.entities.player.inventorySlots;
    const sprites = this.game.sprites;
    this.el.inventoryGrid.textContent = "";

    slots.forEach((item, index) => {
      const slot = document.createElement("div");
      slot.className = "inventory-item";

      if (!item) {
        slot.textContent = "";
        this.el.inventoryGrid.append(slot);
        return;
      }

      slot.classList.add("has-item");

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

      const nameSpan = document.createElement("span");
      nameSpan.className = "item-name";
      nameSpan.textContent = item.name;
      slot.append(nameSpan);

      // Tooltip
      if (item.description) {
        slot.title = this._itemTooltipText(item);
      }

      // Action buttons
      const btnRow = document.createElement("div");
      btnRow.className = "item-btn-row";

      if (["weapon", "armor", "trinket"].includes(item.type)) {
        const equipButton = document.createElement("button");
        equipButton.textContent = "Equip";
        equipButton.addEventListener("click", () => {
          this.game.entities.equipItemAtIndex(index);
          if (this.game.network) this.game.network.sendEquipItem(index);
          this._inventoryDirty = true;
          this._equipmentDirty = true;
          this.renderInventory();
          this.renderEquipment();
        });
        btnRow.append(equipButton);
      }

      if (item.type === "consumable") {
        const useButton = document.createElement("button");
        useButton.textContent = "Use";
        useButton.addEventListener("click", () => {
          if (this.game.network) this.game.network.sendUseItem(index);
        });
        btnRow.append(useButton);
      }

      if (item.type === "hearthstone") {
        const useButton = document.createElement("button");
        useButton.textContent = "Use";
        useButton.addEventListener("click", () => {
          if (this.game.network) this.game.network.sendUseHearthstone();
        });
        btnRow.append(useButton);
      }

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

      slot.append(btnRow);
      this.el.inventoryGrid.append(slot);
    });
  }

  _itemTooltipText(item) {
    let tip = item.name;
    if (item.type === "weapon") tip += `\nAttack +${item.attackBonus}`;
    if (item.type === "armor") tip += `\nHP +${item.hpBonus}`;
    if (item.type === "trinket") tip += `\nMana +${item.manaBonus}`;
    if (item.type === "consumable") {
      if (item.effect === "healHp") tip += `\nRestores ${item.power} HP`;
      if (item.effect === "healMana") tip += `\nRestores ${item.power} Mana`;
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
      ["Weapon", equipment.weapon],
      ["Armor", equipment.armor],
      ["Trinket", equipment.trinket]
    ];

    rows.forEach(([label, item]) => {
      const row = document.createElement("div");
      row.className = "equip-slot";

      const labelEl = document.createElement("span");
      labelEl.className = "equip-slot-label";
      labelEl.textContent = label;

      if (item) {
        const icon = sprites && sprites.get(`icons/${item.icon || item.id}`);
        if (icon) {
          const img = document.createElement("img");
          img.src = icon.src;
          img.className = "item-icon";
          img.width = 24;
          img.height = 24;
          row.append(img);
        }
      }

      const valueEl = document.createElement("span");
      valueEl.className = "equip-slot-value" + (item ? "" : " empty");
      valueEl.textContent = item ? item.name : "Empty";

      if (item) {
        row.title = this._itemTooltipText(item);
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
      if (item.type === "weapon") desc.textContent = `Attack +${item.attackBonus}`;
      else if (item.type === "armor") desc.textContent = `HP +${item.hpBonus}`;
      else if (item.type === "trinket") desc.textContent = `Mana +${item.manaBonus}`;
      else if (item.type === "consumable") {
        desc.textContent = item.effect === "healHp" ? `Restores ${item.power} HP` : `Restores ${item.power} Mana`;
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

  showCastBar(durationSec, label) {
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
    document.getElementById("cast-bar-label").textContent = label;
    const fill = document.getElementById("cast-bar-fill");
    fill.style.width = "0%";

    this._castStart = performance.now();
    this._castDuration = durationSec * 1000;
    this._castActive = true;

    // Cancel button: clicking the cast bar cancels
    container.onclick = () => {
      if (this.game.network) this.game.network.sendCancelHearthstone();
    };
  }

  hideCastBar() {
    this._castActive = false;
    const container = document.getElementById("cast-bar-container");
    if (container) container.classList.add("hidden");
  }

  updateCastBar() {
    if (!this._castActive) return;
    const elapsed = performance.now() - this._castStart;
    const pct = Math.min(100, (elapsed / this._castDuration) * 100);
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

    const classNames = { warrior: "Warrior", mage: "Mage", rogue: "Rogue" };

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
      ["Weapon", p.equipment.weapon],
      ["Armor", p.equipment.armor],
      ["Trinket", p.equipment.trinket]
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

    const classSkills = {
      warrior: [
        { name: "Auto Attack", key: "1", desc: "Strike your target with your weapon.", cooldown: `${p.attackCooldown}s` },
        { name: "Minor Heal", key: "2", desc: "Heal yourself for a small amount. Costs 22 mana.", cooldown: "5.3s" }
      ],
      mage: [
        { name: "Auto Attack", key: "1", desc: "Strike your target with arcane force.", cooldown: `${p.attackCooldown}s` },
        { name: "Minor Heal", key: "2", desc: "Heal yourself for a small amount. Costs 22 mana.", cooldown: "5.3s" }
      ],
      rogue: [
        { name: "Auto Attack", key: "1", desc: "Strike your target with swift precision.", cooldown: `${p.attackCooldown}s` },
        { name: "Minor Heal", key: "2", desc: "Heal yourself for a small amount. Costs 22 mana.", cooldown: "5.3s" }
      ]
    };

    const skills = classSkills[p.charClass] || classSkills.warrior;

    for (const skill of skills) {
      const card = document.createElement("div");
      card.className = "skill-card";

      const header = document.createElement("div");
      header.className = "skill-header";

      const skillNameSpan = document.createElement("span");
      skillNameSpan.className = "skill-name";
      skillNameSpan.textContent = skill.name;

      const skillKeySpan = document.createElement("span");
      skillKeySpan.className = "skill-key";
      skillKeySpan.textContent = `[${skill.key}]`;

      header.append(skillNameSpan, skillKeySpan);

      const desc = document.createElement("div");
      desc.className = "skill-desc";
      desc.textContent = skill.desc;

      const cd = document.createElement("div");
      cd.className = "skill-cooldown";
      cd.textContent = `Cooldown: ${skill.cooldown}`;

      card.append(header, desc, cd);
      body.append(card);
    }
  }
}